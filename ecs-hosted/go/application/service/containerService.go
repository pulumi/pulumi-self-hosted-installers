package service

import (
	"encoding/json"
	"fmt"

	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/appautoscaling"
	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/ec2"
	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/ecs"
	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/iam"
	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/kms"
	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/lb"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/self-hosted/fully-managed-aws-ecs/application/network"
	"github.com/pulumi/self-hosted/fully-managed-aws-ecs/common"
)

/*
Base function for ECS Container Services
All reusable functionality between the API and UI (Console) are wrapped up in this function
ECS Cluster
ECS Service (and all IAM roles required)
ECS Tasks
EC2 Security group for Tasks
EC2 Target Group for Tasks and Attachment to LB Listener(s)
AutoScaling policies for CPU and Memory
*/
func NewContainerService(ctx *pulumi.Context, name string, args *ContainerServiceArgs, opts ...pulumi.ResourceOption) (*ContainerService, error) {
	var resource ContainerService

	err := ctx.RegisterComponentResource("pulumi:trafficManager", name, &resource, opts...)
	if err != nil {
		return nil, err
	}

	// create our parented options
	options := append(opts, pulumi.Parent(&resource))

	// allow the caller to provide a cluster if they so choose; default is to create a separate cluster.
	if args.Cluster != nil {
		resource.Cluster = args.Cluster
	} else {
		clusterName := fmt.Sprintf("%s-cluster", name)
		resource.Cluster, err = ecs.NewCluster(ctx, clusterName, &ecs.ClusterArgs{}, options...)
		if err != nil {
			return nil, err
		}
	}

	sgName := fmt.Sprintf("%s-service-sg", name)
	resource.SecurityGroup, err = ec2.NewSecurityGroup(ctx, sgName, &ec2.SecurityGroupArgs{
		VpcId: args.VpcId,
		Egress: ec2.SecurityGroupEgressArray{
			ec2.SecurityGroupEgressArgs{
				FromPort:   pulumi.Int(0),
				ToPort:     pulumi.Int(0),
				Protocol:   pulumi.String("-1"),
				CidrBlocks: pulumi.ToStringArray([]string{"0.0.0.0/0"}),
			},
		},
		Ingress: ec2.SecurityGroupIngressArray{
			ec2.SecurityGroupIngressArgs{
				FromPort:       pulumi.Int(args.TargetPort),
				ToPort:         pulumi.Int(args.TargetPort),
				Protocol:       pulumi.String("TCP"),
				SecurityGroups: pulumi.StringArray{args.PulumiLoadBalancer.SecurityGroup.ID()},
			},
		},
	}, options...)

	if err != nil {
		return nil, err
	}

	tgName := fmt.Sprintf("%s-tg", name)
	resource.TargetGroup, err = lb.NewTargetGroup(ctx, tgName, &lb.TargetGroupArgs{
		VpcId:       args.VpcId,
		Protocol:    pulumi.String("HTTP"),
		Port:        pulumi.Int(args.TargetPort),
		HealthCheck: args.HealthCheck,
		TargetType:  pulumi.String("ip"),
	}, options...)

	if err != nil {
		return nil, err
	}

	// execution role will be provided to ECS for things like pulling ECR images, sending Cloudwatch logs, etc
	// this is not the role that will be provided to the actual application
	executionRole, err := NewEcsRole(ctx, fmt.Sprintf("%s-exeuction", name), args.Region, args.TaskDefinitionArgs.ExecutionRolePolicyDocs, options...)
	if err != nil {
		return nil, err
	}

	if args.SecretsManagerPrefix != "" && args.KmsServiceKeyId != "" {
		secretsDoc, err := NewSecretsManagerPolicy(ctx, name, args.Region, args.SecretsManagerPrefix, args.KmsServiceKeyId, args.AccountId, options...)
		if err != nil {
			return nil, err
		}

		rName := fmt.Sprintf("%s-secrets-pol", name)
		_, err = iam.NewRolePolicy(ctx, rName, &iam.RolePolicyArgs{
			Role:   executionRole,
			Policy: secretsDoc,
		}, options...)

		if err != nil {
			return nil, err
		}
	}

	// task role is given to the actual application. User code will utilize this for tasks like interacting with S3 buckets, Secrets Manager, etc
	taskRole, err := NewEcsRole(ctx, fmt.Sprintf("%s-task", name), args.Region, args.TaskDefinitionArgs.TaskRolePolicyDocs, options...)
	if err != nil {
		return nil, err
	}

	taskDefinition, err := ecs.NewTaskDefinition(ctx, fmt.Sprintf("%s-task-def", name), &ecs.TaskDefinitionArgs{
		Family:                  pulumi.String(fmt.Sprintf("%s-task", args.TaskDefinitionArgs.ContainerName)),
		NetworkMode:             pulumi.String("awsvpc"),
		RequiresCompatibilities: pulumi.StringArray{pulumi.String("FARGATE")},
		Cpu:                     pulumi.String(fmt.Sprintf("%d", args.TaskDefinitionArgs.Cpu)),
		Memory:                  pulumi.String(fmt.Sprintf("%d", args.TaskDefinitionArgs.Memory)),
		ExecutionRoleArn:        executionRole.Arn,
		TaskRoleArn:             taskRole.Arn,
		ContainerDefinitions:    args.TaskDefinitionArgs.ContainerDefinitions,
	}, options...)

	if err != nil {
		return nil, err
	}

	listenerOpts := append(options, pulumi.DependsOn([]pulumi.Resource{args.PulumiLoadBalancer}))
	httpsListener, err := newLbListenerRule(ctx, fmt.Sprintf("%s-https-rule", name), args.PulumiLoadBalancer.HttpsListener.Arn, resource.TargetGroup.Arn, args.ListenerConditions, listenerOpts...)
	if err != nil {
		return nil, err
	}

	httpListener, err := newLbListenerRule(ctx, fmt.Sprintf("%s-http-rule", name), args.PulumiLoadBalancer.HttpListener.Arn, resource.TargetGroup.Arn, args.ListenerConditions, listenerOpts...)
	if err != nil {
		return nil, err
	}

	serviceOpts := append(options, pulumi.DependsOn([]pulumi.Resource{httpsListener, httpListener}))
	resource.Service, err = ecs.NewService(ctx, fmt.Sprintf("%s-service", name), &ecs.ServiceArgs{
		Cluster:                       resource.Cluster.ID(),
		DesiredCount:                  pulumi.Int(args.TaskDefinitionArgs.NumberDesiredTasks),
		HealthCheckGracePeriodSeconds: pulumi.Int(60),
		LoadBalancers: ecs.ServiceLoadBalancerArray{
			ecs.ServiceLoadBalancerArgs{
				ContainerName:  pulumi.String(args.TaskDefinitionArgs.ContainerName),
				ContainerPort:  pulumi.Int(args.TaskDefinitionArgs.ContainerPort),
				TargetGroupArn: resource.TargetGroup.Arn,
			},
		},
		LaunchType: pulumi.String("FARGATE"),
		NetworkConfiguration: ecs.ServiceNetworkConfigurationArgs{
			AssignPublicIp: pulumi.Bool(false),
			Subnets:        args.PrivateSubnetIds,
			SecurityGroups: pulumi.StringArray{resource.SecurityGroup.ID()},
		},
		TaskDefinition:     taskDefinition.Arn,
		WaitForSteadyState: pulumi.Bool(false),
	}, serviceOpts...)

	if err != nil {
		return nil, err
	}

	resourceId := pulumi.All(resource.Cluster.Name, resource.Service.Name).ApplyT(func(args []interface{}) string {
		return fmt.Sprintf("service/%s/%s", args[0], args[1])
	}).(pulumi.StringOutput)

	autoScaleTarget, err := appautoscaling.NewTarget(ctx, fmt.Sprintf("%s-autoscale-target", name), &appautoscaling.TargetArgs{
		MaxCapacity:       pulumi.Int(6),
		MinCapacity:       pulumi.Int(1),
		ResourceId:        resourceId,
		ScalableDimension: pulumi.String("ecs:service:DesiredCount"),
		ServiceNamespace:  pulumi.String("ecs"),
	}, options...)

	if err != nil {
		return nil, err
	}

	err = newScalingPolicy(ctx, fmt.Sprintf("%s-autoscaling-policy-cpu", name), autoScaleTarget, "ECSServiceAverageCPUUtilization")
	if err != nil {
		return nil, err
	}

	err = newScalingPolicy(ctx, fmt.Sprintf("%s-autoscaling-policy-memory", name), autoScaleTarget, "ECSServiceAverageMemoryUtilization")
	if err != nil {
		return nil, err
	}

	return &resource, nil
}

// create an IAM role that ECS tasks are capable of assuming. rolePolicyDocs allows caller to inject additional policies as needed
func NewEcsRole(ctx *pulumi.Context, name string, region string, rolePolicyDocs pulumi.StringArray, options ...pulumi.ResourceOption) (*iam.Role, error) {
	roleName := fmt.Sprintf("%s-role", name)
	role, err := iam.NewRole(ctx, roleName, &iam.RoleArgs{
		AssumeRolePolicy: pulumi.String(`{
			"Version": "2012-10-17",
			"Statement": [{
				"Sid": "",
				"Effect": "Allow",
				"Principal": {
					"Service": "ecs-tasks.amazonaws.com"
				},
				"Action": "sts:AssumeRole"
			}]
		}`),
	}, options...)

	if err != nil {
		return nil, err
	}

	policyArn := common.GetIamPolicyArn(region, string(iam.ManagedPolicyAmazonECSTaskExecutionRolePolicy))

	rpaAttachName := fmt.Sprintf("%s-role-attachment", name)
	_, err = iam.NewRolePolicyAttachment(ctx, rpaAttachName, &iam.RolePolicyAttachmentArgs{
		Role:      role,
		PolicyArn: pulumi.String(policyArn),
	}, options...)

	if err != nil {
		return nil, err
	}

	if len(rolePolicyDocs) > 0 {
		for i := 0; i < len(rolePolicyDocs); i++ {
			r := fmt.Sprintf("%s-role-att-%d", name, i)
			_, err = iam.NewRolePolicy(ctx, r, &iam.RolePolicyArgs{
				Role:   role,
				Policy: rolePolicyDocs[i],
			}, options...)

			if err != nil {
				return nil, err
			}
		}
	}

	return role, nil
}

// create a new scaling policy capable of scaling up and down via our target metric. Eg- cpu/memory/etc
func newScalingPolicy(ctx *pulumi.Context, name string, target *appautoscaling.Target, metric string) error {
	_, err := appautoscaling.NewPolicy(ctx, name, &appautoscaling.PolicyArgs{
		PolicyType:        pulumi.String("TargetTrackingScaling"),
		ResourceId:        target.ResourceId,
		ScalableDimension: target.ScalableDimension,
		ServiceNamespace:  target.ServiceNamespace,
		TargetTrackingScalingPolicyConfiguration: appautoscaling.PolicyTargetTrackingScalingPolicyConfigurationArgs{
			PredefinedMetricSpecification: appautoscaling.PolicyTargetTrackingScalingPolicyConfigurationPredefinedMetricSpecificationArgs{
				PredefinedMetricType: pulumi.String(metric),
			},
			TargetValue:      pulumi.Float64(65),
			ScaleInCooldown:  pulumi.Int(60),
			ScaleOutCooldown: pulumi.Int(60),
		},
	})

	return err
}

// attach listener rules to our respective Load Balancer Listener. Eg- all requests on "/path/blah"
func newLbListenerRule(ctx *pulumi.Context, name string, listenerArn pulumi.StringOutput, tgArn pulumi.StringOutput, conditions lb.ListenerRuleConditionArrayInput, options ...pulumi.ResourceOption) (*lb.ListenerRule, error) {
	listener, err := lb.NewListenerRule(ctx, name, &lb.ListenerRuleArgs{
		ListenerArn: listenerArn,
		Actions: lb.ListenerRuleActionArray{
			lb.ListenerRuleActionArgs{
				Type:           pulumi.String("forward"),
				TargetGroupArn: tgArn,
			},
		},
		Conditions: conditions,
	}, options...)

	if err != nil {
		return nil, err
	}

	return listener, nil
}

// IAM policy should allow ECS tasks to pull any Secret specified
func NewSecretsManagerPolicy(ctx *pulumi.Context, name string, region string, secretsPrefix string, kmsKeyId string, accountId string, options ...pulumi.ResourceOption) (pulumi.StringOutput, error) {
	key, err := kms.GetKey(ctx, fmt.Sprintf("%s-kms-key", name), pulumi.ID(kmsKeyId), nil, nil)
	if err != nil {
		return pulumi.StringOutput{}, err
	}

	return key.Arn.ApplyT(func(s string) (string, error) {
		secretsArn := common.GetIamPolicyArn(region, fmt.Sprintf("arn:aws:secretsmanager:%s:%s:secret:%s/*", region, accountId, secretsPrefix))
		doc, err := json.Marshal(map[string]interface{}{
			"Version": "2012-10-17",
			"Statement": []map[string]interface{}{
				{
					"Effect": "Allow",
					"Action": []string{
						"secretsmanager:GetSecretValue",
						"kms:Decrypt",
					},
					"Resource": []string{
						secretsArn,
						s,
					},
				},
			},
		})

		if err != nil {
			return "", err
		}

		return string(doc), nil
	}).(pulumi.StringOutput), nil
}

type ContainerBaseArgs struct {
	AccountId            string
	Profile              string
	Cluster              *ecs.Cluster
	KmsServiceKeyId      string
	PrivateSubnetIds     pulumi.StringArrayOutput
	Region               string
	SecretsManagerPrefix string
	VpcId                pulumi.StringOutput
}

type ContainerServiceArgs struct {
	ContainerBaseArgs

	HealthCheck        *lb.TargetGroupHealthCheckArgs
	ListenerConditions lb.ListenerRuleConditionArrayInput

	ListenerPriority   int
	PulumiLoadBalancer *network.PulumiLoadBalancer
	TargetPort         int
	TaskDefinitionArgs *TaskDefinitionArgs
}

type ContainerService struct {
	pulumi.ResourceState

	Cluster       *ecs.Cluster
	SecurityGroup *ec2.SecurityGroup
	Service       *ecs.Service
	TargetGroup   *lb.TargetGroup
}

type TaskDefinitionArgs struct {
	ContainerDefinitions    pulumi.StringOutput
	Cpu                     int
	Memory                  int
	NumberDesiredTasks      int
	ContainerName           string
	ContainerPort           int
	ExecutionRolePolicyDocs pulumi.StringArray
	TaskRolePolicyDocs      pulumi.StringArray
}

type SecretsArgs struct {
	Secrets  []Secret
	Prefix   string
	KmsKeyId string
}

type Secret struct {
	Name  string
	Value pulumi.StringOutput
}

type SecretsOutput struct {
	pulumi.ResourceState

	Secrets []map[string]interface{}
}

type SecretOut struct {
	Name      string
	ValueFrom pulumi.StringOutput
}
