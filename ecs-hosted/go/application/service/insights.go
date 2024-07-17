package service

import (
	// "fmt"

	// "github.com/pulumi/pulumi-aws/sdk/v6/go/aws/ecs"
	"github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/application/config"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

func DeployOpenSearchDashboards(ctx *pulumi.Context, config *config.ConfigArgs, opensearchDomainEndpoint pulumi.StringOutput, vpcId pulumi.StringOutput, subnetIds pulumi.StringArrayOutput, securityGroupId pulumi.StringOutput) error {
	// Create ECS cluster
	// cluster, err := ecs.NewCluster(ctx, "opensearchDashboardsCluster", nil)
	// if err != nil {
	// 	return err
	// }

	// // Create ECS task definition
	// taskDefinition, err := ecs.NewTaskDefinition(ctx, "opensearchDashboardsTask", &ecs.TaskDefinitionArgs{
	// 	ContainerDefinitions: opensearchDomainEndpoint.ApplyT(func(endpoint string) string {
	// 		return fmt.Sprintf(`[
	// 			{
	// 				"name": "opensearch-dashboards",
	// 				"image": "opensearchproject/opensearch-dashboards:latest",
	// 				"memory": %d,
	// 				"cpu": %d,
	// 				"essential": true,
	// 				"portMappings": [
	// 					{
	// 						"containerPort": 5601,
	// 						"hostPort": 5601
	// 					}
	// 				],
	// 				"environment": [
	// 					{
	// 						"name": "OPENSEARCH_HOSTS",
	// 						"value": "%s"
	// 					}
	// 				]
	// 			}
	// 		]`, config.OpenSearchDashboardsMemory, config.OpenSearchDashboardsCpu, endpoint)
	// 	}).(pulumi.StringOutput),
	// 	Family:      pulumi.String("opensearch-dashboards"),
	// 	NetworkMode: pulumi.String("awsvpc"),
	// 	RequiresCompatibilities: pulumi.StringArray{
	// 		pulumi.String("FARGATE"),
	// 	},
	// 	Cpu:              pulumi.String("256"),
	// 	Memory:           pulumi.String("512"),
	// 	ExecutionRoleArn: pulumi.String("arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"),
	// })
	// if err != nil {
	// 	return err
	// }

	// // Create ECS service
	// _, err = ecs.NewService(ctx, "opensearchDashboardsService", &ecs.ServiceArgs{
	// 	Cluster:        cluster.Arn,
	// 	TaskDefinition: taskDefinition.Arn,
	// 	DesiredCount:   pulumi.Int(1),
	// 	NetworkConfiguration: &ecs.ServiceNetworkConfigurationArgs{
	// 		Subnets:        subnetIds,
	// 		SecurityGroups: pulumi.StringArray{securityGroupId},
	// 	},
	// })
	// if err != nil {
	// 	return err
	// }

	return nil
}
