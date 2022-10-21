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
	"github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/application/network"
	"github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/common"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
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

	resource.SecurityGroup, err = NewEscServiceSecurityGroup(ctx, name, args, options...)
	if err != nil {
		return nil, err
	}

	// execution role will be provided to ECS for things like pulling ECR images, sending Cloudwatch logs, etc
	// this is not the role that will be provided to the actual application
	executionRole, err := NewEcsRole(ctx, fmt.Sprintf("%s-exeuction", name), args.Region, args.TaskDefinitionArgs.ExecutionRolePolicyDocs, options...)
	if err != nil {
		return nil, err
	}

	// only API should need secrets manager
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

	// configure service to be target of N number of target groups
	// ALB and NLB
	var loadBalancerConfigs ecs.ServiceLoadBalancerArray
	for _, tg := range args.TargetGroups {
		loadBalancerConfigs = append(loadBalancerConfigs, ecs.ServiceLoadBalancerArgs{
			ContainerName:  pulumi.String(args.TaskDefinitionArgs.ContainerName),
			ContainerPort:  pulumi.Int(args.TaskDefinitionArgs.ContainerPort),
			TargetGroupArn: tg.Arn,
		})
	}

	resource.Service, err = ecs.NewService(ctx, fmt.Sprintf("%s-ecs", name), &ecs.ServiceArgs{
		Cluster:                       resource.Cluster.ID(),
		DesiredCount:                  pulumi.Int(args.TaskDefinitionArgs.NumberDesiredTasks),
		HealthCheckGracePeriodSeconds: pulumi.Int(60),
		LoadBalancers:                 loadBalancerConfigs,
		LaunchType:                    pulumi.String("FARGATE"),
		NetworkConfiguration: ecs.ServiceNetworkConfigurationArgs{
			AssignPublicIp: pulumi.Bool(false),
			Subnets:        args.PrivateSubnetIds,
			SecurityGroups: pulumi.StringArray{resource.SecurityGroup.ID()},
		},
		TaskDefinition:     taskDefinition.Arn,
		WaitForSteadyState: pulumi.Bool(true),
	}, options...)

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

	scalingOpts := append(options, pulumi.DeleteBeforeReplace(true))
	err = newScalingPolicy(ctx, fmt.Sprintf("%s-autoscaling-policy-cpu", name), autoScaleTarget, "ECSServiceAverageCPUUtilization", scalingOpts...)
	if err != nil {
		return nil, err
	}

	err = newScalingPolicy(ctx, fmt.Sprintf("%s-autoscaling-policy-memory", name), autoScaleTarget, "ECSServiceAverageMemoryUtilization", scalingOpts...)
	if err != nil {
		return nil, err
	}

	return &resource, nil
}

// Build out the ECS Service security group that will take into context whether or not the services are operating in a private, limited environment (networking wise)
// will also take into account any ingress or egress rules passed as args, but will not check for duplicates/uniqueness.s
func NewEscServiceSecurityGroup(ctx *pulumi.Context, name string, args *ContainerServiceArgs, options ...pulumi.ResourceOption) (*ec2.SecurityGroup, error) {

	sgName := fmt.Sprintf("%s-service-sg", name)
	sgOptions := append(options, pulumi.DeleteBeforeReplace(true))
	sgIngress := ec2.SecurityGroupIngressArray{
		ec2.SecurityGroupIngressArgs{
			FromPort:       pulumi.Int(args.TargetPort),
			ToPort:         pulumi.Int(args.TargetPort),
			Protocol:       pulumi.String("TCP"),
			SecurityGroups: pulumi.StringArray{args.PulumiLoadBalancer.SecurityGroup.ID()},
			Description:    pulumi.String("Allows access from public external load balancer"),
		},
	}

	sgEgress := ec2.SecurityGroupEgressArray{
		ec2.SecurityGroupEgressArgs{
			FromPort:    pulumi.Int(0),
			ToPort:      pulumi.Int(0),
			Protocol:    pulumi.String("-1"),
			CidrBlocks:  pulumi.ToStringArray([]string{"0.0.0.0/0"}),
			Description: pulumi.String("Allows egress to all IP addresses"),
		},
	}

	sgArgs := &ec2.SecurityGroupArgs{
		VpcId: args.VpcId,
	}

	// If private LB is enabled we will need to allow VPC CIDR on ingress and egress for NLB to establish communicadtion
	// Egress on ECS Service SG will be locked down to just VPC cidr to restrict all internet egress
	if args.EnablePrivateLoadBalancerAndLimitEgress && args.PulumiInternalLoadBalancer != nil {
		sgIngress = ec2.SecurityGroupIngressArray{
			ec2.SecurityGroupIngressArgs{
				FromPort:       pulumi.Int(args.TargetPort),
				ToPort:         pulumi.Int(args.TargetPort),
				Protocol:       pulumi.String("TCP"),
				SecurityGroups: pulumi.StringArray{args.PulumiLoadBalancer.SecurityGroup.ID()},
				Description:    pulumi.String("Allows access from public external load balancer"),
			},
			ec2.SecurityGroupIngressArgs{
				FromPort:    pulumi.Int(args.TargetPort),
				ToPort:      pulumi.Int(args.TargetPort),
				Protocol:    pulumi.String("TCP"),
				CidrBlocks:  pulumi.StringArray{args.VpcCidrBlock},
				Description: pulumi.String("Allows access from VPC CIDR which includes private internal load balancer"),
			},
		}

		// routeable public internet access is denied
		// note, this could be routed to TGW/proxy if needed at some point in future
		sgEgress = ec2.SecurityGroupEgressArray{
			ec2.SecurityGroupEgressArgs{
				FromPort:    pulumi.Int(443),
				ToPort:      pulumi.Int(443),
				Protocol:    pulumi.String("TCP"),
				CidrBlocks:  pulumi.StringArray{args.VpcCidrBlock},
				Description: pulumi.String("Allow egress on 443 to entire VPC CIDR private netowrk"),
			},
			ec2.SecurityGroupEgressArgs{
				FromPort:    pulumi.Int(80),
				ToPort:      pulumi.Int(80),
				Protocol:    pulumi.String("TCP"),
				CidrBlocks:  pulumi.StringArray{args.VpcCidrBlock},
				Description: pulumi.String("Allow egress on 80 to entire VPC CIDR private netowrk"),
			},
			ec2.SecurityGroupEgressArgs{
				FromPort:       pulumi.Int(443),
				ToPort:         pulumi.Int(443),
				Protocol:       pulumi.String("TCP"),
				SecurityGroups: pulumi.StringArray{args.VpcEndpointSecurityGroupId},
				Description:    pulumi.String("Allow egress from ecs service to VPC Endpoint"),
			},
			ec2.SecurityGroupEgressArgs{
				FromPort:      pulumi.Int(443),
				ToPort:        pulumi.Int(443),
				Protocol:      pulumi.String("TCP"),
				PrefixListIds: pulumi.StringArray{args.PrefixListId},
				Description:   pulumi.String("Allow egress from ecs service to S3 VPC Endpoint"),
			},
		}
	}

	// add sg rules from args
	// note there is no safety check for unique rules
	if args.SecurityGroupIngressRules != nil {
		sgIngress = append(sgIngress, args.SecurityGroupIngressRules...)
	}

	if args.SecurityGroupEgressRules != nil {
		sgEgress = append(sgEgress, args.SecurityGroupEgressRules...)
	}

	sgArgs.Ingress = sgIngress
	sgArgs.Egress = sgEgress

	sg, err := ec2.NewSecurityGroup(ctx, sgName, sgArgs, sgOptions...)
	if err != nil {
		return nil, err
	}

	return sg, nil
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
func newScalingPolicy(ctx *pulumi.Context, name string, target *appautoscaling.Target, metric string, options ...pulumi.ResourceOption) error {
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
	}, options...)

	return err
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
	AccountId                               string
	CertificateArn                          string
	Cluster                                 *ecs.Cluster
	EnablePrivateLoadBalancerAndLimitEgress bool
	KmsServiceKeyId                         string
	PrefixListId                            pulumi.StringOutput
	PrivateSubnetIds                        pulumi.StringArrayOutput
	Profile                                 string
	Region                                  string
	SecretsManagerPrefix                    string
	VpcId                                   pulumi.StringOutput
	VpcCidrBlock                            pulumi.StringOutput
	VpcEndpointSecurityGroupId              pulumi.StringOutput
}

type ContainerServiceArgs struct {
	ContainerBaseArgs

	LoadBalancerArn            pulumi.StringOutput
	PulumiLoadBalancer         *network.PulumiLoadBalancer
	PulumiInternalLoadBalancer *network.PulumiInternalLoadBalancer
	SecurityGroupEgressRules   ec2.SecurityGroupEgressArray
	SecurityGroupIngressRules  ec2.SecurityGroupIngressArray
	TargetGroups               []*lb.TargetGroup
	TargetPort                 int
	TaskDefinitionArgs         *TaskDefinitionArgs
}

type ContainerService struct {
	pulumi.ResourceState

	Cluster       *ecs.Cluster
	SecurityGroup *ec2.SecurityGroup
	Service       *ecs.Service
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
