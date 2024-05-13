package log

import (
	"encoding/json"

	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

type LogType int64

const (
	AwsLogType LogType = iota
)

func NewLogs(ctx *pulumi.Context, logType LogType, name string, region string, jsonArgs string, opts ...pulumi.ResourceOption) LogDriver {
	switch logType {
	case AwsLogType:
		ctx.Log.Debug("creating awslogs (cloudwatch) log configuration", nil)

		args := AwsArgs{}
		json.Unmarshal([]byte(jsonArgs), &args)
		args.Region = region

		logs, err := NewAwsLogs(ctx, name, &args, opts...)
		if err != nil {
			return nil
		}

		return logs
	}

	return nil
}

type LogDriver interface {
	GetConfiguration() map[string]any
}
