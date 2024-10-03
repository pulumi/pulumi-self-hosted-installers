import * as pulumi from "@pulumi/pulumi";

export enum LogType {
    awslogs,
    awsfirelens,
    splunk
}

export interface LogDriver {
    logType: LogType,
    // TODO: this will need something other than a string array in the future. Name value collection?
    outputs: pulumi.Output<string[]>,
    getConfiguration(ids: pulumi.UnwrappedArray<string> | undefined): pulumi.Output<string>
}

