import * as pulumi from "@pulumi/pulumi";
import * as s3 from "@pulumi/aws/s3";

export interface LoadBalancerArgs {
    accessLogsBucket?: s3.Bucket,
    accessLogsPrefix?: string,
    accountId: string,
    certificateArn: string,
    enableAccessLogs?: boolean,
    idleTimeout?: number,
    internalLb?: boolean,
    publicSubnetIds: string[] | pulumi.Output<string[]>,
    privateSubnetIds?: string[] | pulumi.Output<string[]>,
    region: string,
    vpcId: string | pulumi.Output<string>,
    whiteListCidrBlocks: string[] | undefined
}