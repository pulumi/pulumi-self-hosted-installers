import * as pulumi from "@pulumi/pulumi";
import * as s3 from "@pulumi/aws/s3";

export interface LoadBalancerArgs {
    accessLogsBucket?: s3.Bucket,
    accessLogsPrefix?: string,
    accountId: pulumi.Output<string>,
    certificateArn: string,
    enableAccessLogs?: boolean,
    idleTimeout?: number,
    internalLb?: boolean,
    publicSubnetIds: pulumi.Output<string[]>,
    region: string,
    vpcId: pulumi.Output<string>,
    whiteListCidrBlocks: string[] | undefined
}