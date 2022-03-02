import * as pulumi from "@pulumi/pulumi";
import * as cloudwatch from "@pulumi/aws/cloudwatch";
import { LogDriver, LogType } from "./types";

export interface AwsLogsArgs {
    retentionInDays?: number,
    name: string,
    region: string
}

const namespace = "pulumi:cloudwatch-aws-logs";

/*
ComponentResource built to create AWS Cloudwatch Log Group
*/
export class AwsLogs extends pulumi.ComponentResource implements LogDriver {
    public logType: LogType = LogType.awslogs;
    public readonly logGroup: cloudwatch.LogGroup;

    // Allow concrete implementation to register output values that can be resolved (applied) through the interface
    public outputs: pulumi.Output<string[]>;
    private readonly args: AwsLogsArgs;

    constructor(name: string, args: AwsLogsArgs, opts?: pulumi.ComponentResourceOptions) {
        super(namespace, name, opts);

        this.args = args;

        this.logGroup = new cloudwatch.LogGroup(`${name}-cw-lg`, {
            name: `${args.name}-${name}-logs`,
            retentionInDays: args.retentionInDays ? args.retentionInDays! : 7
        }, opts);

        this.outputs = pulumi.output([this.logGroup.id]);
    }

    // return specific "configuration" for this types logs
    getConfiguration(ids: string[]): any {
        return {
            "awslogs-region": this.args.region,
            "awslogs-group": ids[0],
            "awslogs-stream-prefix": "awslogs-pulumi",
        };
    }
}