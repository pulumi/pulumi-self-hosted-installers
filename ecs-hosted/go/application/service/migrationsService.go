package service

import (
	"encoding/json"
	"fmt"
	"log"

	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/cloudwatch"
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/ec2"
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/ecs"
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/iam"
	"github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/infrastructure/application/config"
	"github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/infrastructure/application/utils"
	"github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/infrastructure/common"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

const cpu = 256
const memoryReservation = 512

func NewMigrationsService(ctx *pulumi.Context, name string, args *MigrationsContainerServiceArgs, opts ...pulumi.ResourceOption) (*MigrationsContainerService, error) {
	var resource MigrationsContainerService

	// create our parented options
	options := append(opts, pulumi.Parent(&resource))

	err := ctx.RegisterComponentResource("pulumi:dbMigrations", name, &resource, opts...)
	if err != nil {
		return nil, err
	}

	role, err := NewEcsRole(ctx, fmt.Sprintf("%s-role", name), args.Region, nil, options...)
	if err != nil {
		return nil, err
	}

	policyArn := common.GetIamPolicyArn(args.Region, string(iam.ManagedPolicyAmazonECSTaskExecutionRolePolicy))

	_, err = iam.NewRolePolicyAttachment(ctx, fmt.Sprintf("%s-task-role-pol", name), &iam.RolePolicyAttachmentArgs{
		Role:      role,
		PolicyArn: pulumi.String(policyArn),
	}, options...)

	if err != nil {
		return nil, err
	}

	doc, err := NewSecretsManagerPolicy(ctx, name, args.Region, args.SecretsManagerPrefix, args.KmsServiceKeyId, args.AccountId, options...)
	if err != nil {
		return nil, err
	}

	_, err = iam.NewRolePolicy(ctx, fmt.Sprintf("%s-secret-pol", name), &iam.RolePolicyArgs{
		Role:   role,
		Policy: doc,
	})

	if err != nil {
		return nil, err
	}

	egress := args.SecurityGroupEgressRules

	if args.EnablePrivateLoadBalancerAndLimitEgress {
		egress = append(egress, ec2.SecurityGroupEgressArgs{
			FromPort:       pulumi.Int(443),
			ToPort:         pulumi.Int(443),
			Protocol:       pulumi.String("TCP"),
			SecurityGroups: pulumi.StringArray{args.VpcEndpointSecurityGroupId},
			Description:    pulumi.String("Allow egress from ecs service to VPC Endpoint"),
		}, ec2.SecurityGroupEgressArgs{
			FromPort:      pulumi.Int(443),
			ToPort:        pulumi.Int(443),
			Protocol:      pulumi.String("TCP"),
			PrefixListIds: pulumi.StringArray{args.PrefixListId},
			Description:   pulumi.String("Allow egress from ecs service to S3 VPC Endpoint"),
		})
	} else {
		egress = append(egress, ec2.SecurityGroupEgressArgs{
			FromPort:    pulumi.Int(0),
			ToPort:      pulumi.Int(0),
			Protocol:    pulumi.String("-1"),
			CidrBlocks:  pulumi.ToStringArray([]string{"0.0.0.0/0"}),
			Description: pulumi.String("Allows egress to all IP addresses"),
		})
	}

	resource.SecurityGroup, err = ec2.NewSecurityGroup(ctx, fmt.Sprintf("%s-sg", name), &ec2.SecurityGroupArgs{
		VpcId:  args.VpcId,
		Egress: egress,
	}, options...)

	if err != nil {
		return nil, err
	}

	cluster, err := ecs.NewCluster(ctx, fmt.Sprintf("%s-cluster", name), &ecs.ClusterArgs{}, options...)
	if err != nil {
		return nil, err
	}

	ecrAccountId := args.AccountId
	if args.EcrRepoAccountId != "" {
		ecrAccountId = args.EcrRepoAccountId
	}

	imageName := fmt.Sprintf("pulumi/migrations:%s", args.ImageTag)
	fullQualifiedImage := utils.NewEcrImageTag(ecrAccountId, args.Region, imageName, args.ImagePrefix)

	containerDef, err := newContainerDefinitions(ctx, "migrations-task", args, fullQualifiedImage, options...)
	if err != nil {
		return nil, err
	}

	taskDefinition, err := ecs.NewTaskDefinition(ctx, fmt.Sprintf("%s-task-def", name), &ecs.TaskDefinitionArgs{
		Family:                  pulumi.String("pulumi-migration-task"),
		NetworkMode:             pulumi.String("awsvpc"),
		Cpu:                     pulumi.String(fmt.Sprintf("%d", cpu)),
		Memory:                  pulumi.String(fmt.Sprintf("%d", memoryReservation)),
		RequiresCompatibilities: pulumi.StringArray{pulumi.String("FARGATE")},
		ExecutionRoleArn:        role.Arn,
		ContainerDefinitions:    containerDef,
	}, options...)

	if err != nil {
		return nil, err
	}

	sgOptions := append(options, pulumi.DeleteBeforeReplace(true))
	_, err = ec2.NewSecurityGroupRule(ctx, fmt.Sprintf("%s-migrations-to-db-rule", name), &ec2.SecurityGroupRuleArgs{
		Type:                  pulumi.String("ingress"),
		SecurityGroupId:       args.DatabaseArgs.SecurityGroupId,
		SourceSecurityGroupId: resource.SecurityGroup.ID(),
		FromPort:              pulumi.Int(3306),
		ToPort:                pulumi.Int(3306),
		Protocol:              pulumi.String("TCP"),
	}, sgOptions...)

	if err != nil {
		return nil, err
	}

	if ctx.DryRun() {
		ctx.Log.Info("Skipping database migration task on Pulumi Preview", nil)
		return nil, nil
	}

	if !args.ExecuteMigrations {
		ctx.Log.Info("Skipping database migration based on PULUMI_EXECUTE_MIGRATIONS env var set to 'false'", nil)
		return nil, nil
	}

	_ = pulumi.All(
		cluster.ID(),
		resource.SecurityGroup.ID(),
		args.PrivateSubnetIds,
		taskDefinition.Arn,
		taskDefinition.Family,
	).ApplyT(func(applyArgs []any) string {
		clusterId := applyArgs[0].(pulumi.ID)
		sgId := applyArgs[1].(pulumi.ID)
		privateSubnets := applyArgs[2].([]string)
		taskDefArn := applyArgs[3].(string)
		taskDefFamily := applyArgs[4].(string)

		err := NewDatabaseMigrationTask(ctx, &MigrationTaskArgs{
			ContainerBaseArgs: &args.ContainerBaseArgs,
			Cluster:           string(clusterId),
			SgId:              string(sgId),
			SubnetId:          privateSubnets[0],
			TaskDefinitionArn: taskDefArn,
			TaskFamily:        taskDefFamily,
		})

		if err != nil {
			log.Fatal(err)
		}

		return ""
	}).(pulumi.StringOutput)

	if err != nil {
		return nil, err
	}

	return &resource, nil
}

func newContainerDefinitions(ctx *pulumi.Context, name string, args *MigrationsContainerServiceArgs, image string, options ...pulumi.ResourceOption) (pulumi.StringOutput, error) {
	logGroup, err := cloudwatch.NewLogGroup(ctx, fmt.Sprintf("%s-log-group", name), &cloudwatch.LogGroupArgs{
		NamePrefix:      pulumi.String(fmt.Sprintf("%s-pulumi-migration-logs", name)),
		RetentionInDays: pulumi.Int(1),
	}, options...)

	if err != nil {
		return pulumi.StringOutput{}, err
	}

	secrets, err := NewSecrets(ctx, fmt.Sprintf("%s-secrets", name), &SecretsArgs{
		Prefix:   args.SecretsManagerPrefix,
		KmsKeyId: args.KmsServiceKeyId,
		Secrets: []Secret{
			{
				Name:  "MYSQL_ROOT_USERNAME",
				Value: args.DatabaseArgs.Username,
			},
			{
				Name:  "MYSQL_ROOT_PASSWORD",
				Value: args.DatabaseArgs.Password,
			},
		},
	}, options...)

	if err != nil {
		return pulumi.StringOutput{}, err
	}

	taskDef, _ := pulumi.All(
		args.DatabaseArgs.ClusterEndpoint,
		args.DatabaseArgs.Port,
		secrets.Secrets,
		logGroup.ID()).ApplyT(func(applyArgs []any) (string, error) {

		dbClusterEndpoint := applyArgs[0].(string)
		dbPort := applyArgs[1].(int)
		secretsOutput := applyArgs[2].([]map[string]any)
		logId := applyArgs[3].(pulumi.ID)

		containerJson, err := json.Marshal([]any{
			map[string]any{
				"name":              "pulumi-migration",
				"image":             image,
				"cpu":               cpu,
				"memoryReservation": memoryReservation,
				"environment": []map[string]any{
					CreateEnvVar("SKIP_CREATE_DB_USER", "true"),
					CreateEnvVar("PULUMI_DATABASE_ENDPOINT", fmt.Sprintf("%s:%d", dbClusterEndpoint, dbPort)),
					CreateEnvVar("PULUMI_DATABASE_PING_ENDPOINT", dbClusterEndpoint),
				},
				"secrets": secretsOutput,
				"logConfiguration": map[string]any{
					"logDriver": "awslogs",
					"options": map[string]any{
						"awslogs-region":        args.Region,
						"awslogs-group":         logId,
						"awslogs-stream-prefix": "pulumi-api",
					},
				},
			},
		})

		if err != nil {
			return "", nil
		}

		return string(containerJson), nil
	}).(pulumi.StringOutput)

	return taskDef, nil
}

type MigrationsContainerServiceArgs struct {
	ContainerBaseArgs

	DatabaseArgs             *config.DatabaseArgs
	EcrRepoAccountId         string
	ExecuteMigrations        bool
	ImageTag                 string
	ImagePrefix              string
	SecurityGroupEgressRules ec2.SecurityGroupEgressArray
}

type MigrationsContainerService struct {
	pulumi.ResourceState

	SecurityGroup *ec2.SecurityGroup
}
