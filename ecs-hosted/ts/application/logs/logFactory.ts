import * as pulumi from "@pulumi/pulumi";
import { AwsLogs, AwsLogsArgs } from "./awsLogs";
import { LogDriver, LogType } from "./types";

// Factory class to build a particular type of log driver that will be used downstream in ECS
export class LogFactory {
    buildLogDriver(type: LogType, name: string, args: any, opts?: pulumi.ComponentResourceOptions): LogDriver {
        switch (type) {
            case LogType.awslogs:
                return new AwsLogs(name, <AwsLogsArgs>args, opts);

            case LogType.splunk:
                throw new Error("Not implemented");

            case LogType.awsfirelens:
                throw new Error("Not implemented");
        }
    }
}