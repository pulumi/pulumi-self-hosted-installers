package service

import (
	"context"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ecs"
	"github.com/aws/aws-sdk-go-v2/service/ecs/types"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

func NewDatabaseMigrationTask(ctx *pulumi.Context, args *MigrationTaskArgs) error {

	cfg, err := config.LoadDefaultConfig(context.TODO(), config.WithRegion(args.ContainerBaseArgs.Region), config.WithSharedConfigProfile(args.ContainerBaseArgs.Profile))

	if err != nil {
		return err
	}

	client := ecs.NewFromConfig(cfg)

	err = tasksCurrentlyRunning(ctx, client, args.Cluster, args.TaskFamily)
	if err != nil {
		return err
	}

	taskArn, err := newMigrationTask(ctx, client, args.Cluster, args.TaskDefinitionArn, args.SgId, args.SubnetId)
	if err != nil {
		return err
	}

	err = waitForTask(ctx, client, args.Cluster, taskArn)
	if err != nil {
		return err
	}

	return nil
}

func tasksCurrentlyRunning(ctx *pulumi.Context, client *ecs.Client, clusterId string, taskFamily string) error {
	ctx.Log.Info(fmt.Sprintf("Checking for executing ECS tasks for family %s", taskFamily), nil)

	result, err := client.ListTasks(context.TODO(), &ecs.ListTasksInput{
		Cluster:       &clusterId,
		Family:        &taskFamily,
		DesiredStatus: "RUNNING",
	})

	if err != nil {
		return err
	}

	if result.TaskArns == nil || len(result.TaskArns) == 0 {
		ctx.Log.Info("No executing ECS tasks found in the RUNNING state. Migrations starting...", nil)
		return nil
	}

	return fmt.Errorf("at least one ECS task found in the running state. Task Arns: %s. Migrations exiting", result.TaskArns)
}

func newMigrationTask(ctx *pulumi.Context, client *ecs.Client, clusterId string, taskDefArn string, sgId string, subnetId string) (string, error) {
	startTime := time.Now().Unix()
	taskName := fmt.Sprintf("DBMigration-%d", startTime)

	ctx.Log.Info(fmt.Sprintf("Attempting to start ECS Task %s for DB migration", taskName), nil)

	result, err := client.RunTask(context.TODO(), &ecs.RunTaskInput{
		Cluster:        &clusterId,
		Count:          aws.Int32(1),
		Group:          &taskName,
		TaskDefinition: &taskDefArn,
		LaunchType:     "FARGATE",
		NetworkConfiguration: &types.NetworkConfiguration{
			AwsvpcConfiguration: &types.AwsVpcConfiguration{
				AssignPublicIp: "DISABLED",
				SecurityGroups: []string{sgId},
				Subnets:        []string{subnetId},
			},
		},
	})

	if err != nil {
		return "", err
	}

	if result.Tasks == nil || result.Tasks[0].TaskArn == nil {
		return "", fmt.Errorf("unabled to successfully start ECS DB migration task %s", taskName)
	}

	return *result.Tasks[0].TaskArn, nil
}

// Wait for Task to reach RUNNING and then STOPPED before we continue
// Finally interrogate exit code to ensure we successfully completed
func waitForTask(ctx *pulumi.Context, client *ecs.Client, clusterId string, taskArn string) error {

	ctx.Log.Info("Waiting for ECS task to start...", nil)

	_, err := waitForStatus(ctx, client, clusterId, taskArn, "RUNNING")
	if err != nil {
		return err
	}

	task, err := waitForStatus(ctx, client, clusterId, taskArn, "STOPPED")
	if err != nil {
		return err
	}

	exitCode := *task.Containers[0].ExitCode
	if exitCode != 0 {
		ctx.Log.Error("DB Migrations task exited with non-zero code. Check log group for details", nil)
		return fmt.Errorf("DB Migration task exited with non-zero code %d", exitCode)
	}

	return nil
}

func waitForStatus(ctx *pulumi.Context, client *ecs.Client, clusterId string, taskArn string, targetStatus string) (*types.Task, error) {
	// for a maximum of 100 tries (5 minutes), we will call ECS' api to retrieve the status of our task, every 6 seconds
	// if a TARGET STATUS is not retrieved we will return error
	for i := 0; i < 50; i++ {
		// implement waiter logic as waiters were removed from the go sdk
		result, err := client.DescribeTasks(context.TODO(), &ecs.DescribeTasksInput{
			Cluster: aws.String(clusterId),
			Tasks:   []string{*aws.String(taskArn)},
		})

		if err != nil {
			return nil, err
		}

		status := *result.Tasks[0].LastStatus
		if status == targetStatus {
			// return we hit our success case
			ctx.Log.Info(fmt.Sprintf("DB Migrations task successfully moved to %s status...", targetStatus), nil)
			return &result.Tasks[0], nil
		}

		// sleep for 6 seconds before next call
		time.Sleep(6 * time.Second)
	}

	return nil, fmt.Errorf("unable to successfully obtain a %s status from task %s", targetStatus, taskArn)
}

type MigrationTaskArgs struct {
	ContainerBaseArgs *ContainerBaseArgs
	Cluster           string
	SgId              string
	SubnetId          string
	TaskDefinitionArn string
	TaskFamily        string
}
