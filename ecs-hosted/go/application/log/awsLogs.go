package log

import (
	"fmt"
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/cloudwatch"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

func NewAwsLogs(ctx *pulumi.Context, name string, args *AwsArgs, opts ...pulumi.ResourceOption) (*AwsLogs, error) {
	lg, err := cloudwatch.NewLogGroup(ctx, fmt.Sprintf("awslogs-%s", name), &cloudwatch.LogGroupArgs{
		NamePrefix:      pulumi.String(fmt.Sprintf("cloudwatch-%s-logs", name)),
		RetentionInDays: pulumi.Int(args.RetentionDays),
	}, opts...)

	if err != nil {
		return nil, err
	}

	resource := AwsLogs{
		LogGroup: lg,
		Region:   args.Region,
		Outputs: map[string]any{
			"region":     args.Region,
			"logGroupId": lg.ID(),
		},
	}

	return &resource, nil
}

func (l AwsLogs) GetConfiguration() map[string]any {

	return map[string]any{
		"logDriver": "awslogs",
		"options": map[string]any{
			"awslogs-region":        l.Outputs["region"],
			"awslogs-group":         l.Outputs["logGroupId"],
			"awslogs-stream-prefix": "pulumi-api",
		},
	}
}

type AwsArgs struct {
	Region        string
	Name          string
	RetentionDays int
}

type AwsLogs struct {
	Region   string
	LogGroup *cloudwatch.LogGroup
	Outputs  map[string]any
}
