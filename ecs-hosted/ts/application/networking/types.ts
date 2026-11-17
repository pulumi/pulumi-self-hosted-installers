import * as pulumi from "@pulumi/pulumi";
import * as s3 from "@pulumi/aws/s3";

export interface LoadBalancerArgs {
    accessLogsBucket?: s3.Bucket,
    accessLogsPrefix?: string,
    accountId: string,
    certificateArn: string,
    enableAccessLogs?: boolean,
    idleTimeout?: number,
    // true creates internal (VPC-only) load balancers in privateSubnetIds instead of publicSubnetIds
    internalLb?: boolean,
    privateSubnetIds?: string[],
    publicSubnetIds?: string[],
    region: string,
    vpcId: string,
    // ingress CIDRs for ports 80 and 443; undefined allows 0.0.0.0/0
    whiteListCidrBlocks: string[] | undefined
}