package service

import (
	"fmt"

	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/ecs"
	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/iam"
	"github.com/pulumi/pulumi-aws/sdk/v6/go/aws/opensearch"
	"github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/application/config"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

func DeployOpenSearch(ctx *pulumi.Context, config *config.ConfigArgs, vpcId pulumi.StringOutput, subnetIds pulumi.StringArrayOutput, securityGroupId pulumi.StringOutput) error {
	// Create IAM role for OpenSearch
	opensearchRole, err := iam.NewRole(ctx, "opensearchRole", &iam.RoleArgs{
		AssumeRolePolicy: pulumi.String(`{
			"Version": "2012-10-17",
			"Statement": [
				{
					"Effect": "Allow",
					"Principal": {
						"Service": "es.amazonaws.com"
					},
					"Action": "sts:AssumeRole"
				}
			]
		}`),
	})
	if err != nil {
		return err
	}

	// Attach necessary policies to the role
	_, err = iam.NewRolePolicyAttachment(ctx, "opensearchRolePolicyAttachment", &iam.RolePolicyAttachmentArgs{
		Role:      opensearchRole.Name,
		PolicyArn: pulumi.String("arn:aws:iam::aws:policy/AmazonOpenSearchServiceFullAccess"),
	})
	if err != nil {
		return err
	}

	// Create OpenSearch domain
	opensearchDomain, err := opensearch.NewDomain(ctx, "opensearchDomain", &opensearch.DomainArgs{
		ClusterConfig: &opensearch.DomainClusterConfigArgs{
			InstanceType:  pulumi.String(config.OpenSearchInstanceType),
			InstanceCount: pulumi.Int(config.OpenSearchInstanceCount),
		},
		EbsOptions: &opensearch.DomainEbsOptionsArgs{
			EbsEnabled: pulumi.Bool(true),
			VolumeSize: pulumi.Int(config.OpenSearchVolumeSize),
		},
		AccessPolicies: pulumi.String(`{
			"Version": "2012-10-17",
			"Statement": [
				{
					"Effect": "Allow",
					"Principal": "*",
					"Action": "es:*",
					"Resource": "arn:aws:es:us-west-2:123456789012:domain/opensearchDomain/*"
				}
			]
		}`),
		VpcOptions: &opensearch.DomainVpcOptionsArgs{
			SecurityGroupIds: pulumi.StringArray{securityGroupId},
			SubnetIds:        subnetIds,
		},
	})
	if err != nil {
		return err
	}

	// Output the OpenSearch domain endpoint
	ctx.Export("opensearchDomainEndpoint", opensearchDomain.Endpoint)

	return nil
}

func DeployOpenSearchDashboards(ctx *pulumi.Context, config *config.ConfigArgs, opensearchDomainEndpoint pulumi.StringOutput, vpcId pulumi.StringOutput, subnetIds pulumi.StringArrayOutput, securityGroupId pulumi.StringOutput) error {
	// Create ECS cluster
	cluster, err := ecs.NewCluster(ctx, "opensearchDashboardsCluster", nil)
	if err != nil {
		return err
	}

	// Create ECS task definition
	taskDefinition, err := ecs.NewTaskDefinition(ctx, "opensearchDashboardsTask", &ecs.TaskDefinitionArgs{
		ContainerDefinitions: pulumi.String(fmt.Sprintf(`[
			{
				"name": "opensearch-dashboards",
				"image": "opensearchproject/opensearch-dashboards:latest",
				"memory": %d,
				"cpu": %d,
				"essential": true,
				"portMappings": [
					{
						"containerPort": 5601,
						"hostPort": 5601
					}
				],
				"environment": [
					{
						"name": "OPENSEARCH_HOSTS",
						"value": "%s"
					}
				]
			}
		]`, config.OpenSearchDashboardsMemory, config.OpenSearchDashboardsCpu, opensearchDomainEndpoint)),
		Family:      pulumi.String("opensearch-dashboards"),
		NetworkMode: pulumi.String("awsvpc"),
		RequiresCompatibilities: pulumi.StringArray{
			pulumi.String("FARGATE"),
		},
		Cpu:              pulumi.String("256"),
		Memory:           pulumi.String("512"),
		ExecutionRoleArn: pulumi.String("arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"),
	})
	if err != nil {
		return err
	}

	// Create ECS service
	_, err = ecs.NewService(ctx, "opensearchDashboardsService", &ecs.ServiceArgs{
		Cluster:        cluster.Arn,
		TaskDefinition: taskDefinition.Arn,
		DesiredCount:   pulumi.Int(1),
		NetworkConfiguration: &ecs.ServiceNetworkConfigurationArgs{
			Subnets:        subnetIds,
			SecurityGroups: pulumi.StringArray{securityGroupId},
		},
	})
	if err != nil {
		return err
	}

	return nil
}
