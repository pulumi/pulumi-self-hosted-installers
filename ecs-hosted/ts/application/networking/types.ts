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
    publicSubnetIds: string[],
    region: string,
    vpcId: string,
    whiteListCidrBlocks: string[] | undefined
}