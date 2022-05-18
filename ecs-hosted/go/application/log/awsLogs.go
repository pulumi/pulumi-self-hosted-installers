package log

import (
	"fmt"
	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/cloudwatch"
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
		Outputs: map[string]interface{}{
			"region":     args.Region,
			"logGroupId": lg.ID(),
		},
	}

	return &resource, nil
}

func (l AwsLogs) GetConfiguration() map[string]interface{} {

	return map[string]interface{}{
		"logDriver": "awslogs",
		"options": map[string]interface{}{
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
	Outputs  map[string]interface{}
}
