import * as pulumi from "@pulumi/pulumi";
import * as s3 from "@pulumi/aws/s3";

export interface LoadBalancerArgs {
    accessLogsBucket?: s3.Bucket,
    accessLogsPrefix?: string,
    accountId: string,
    certificateArn: string,
    enableAccessLogs?: boolean,
    idleTimeout?: number,
    // true creates internal (VPC-only) load balancers; subnetIds must then be private subnets
    internalLb?: boolean,
    // public subnets for internet-facing load balancers, private subnets for internal ones
    subnetIds: string[],
    region: string,
    vpcId: string,
    // ingress CIDRs for ports 80 and 443; undefined allows 0.0.0.0/0
    whiteListCidrBlocks: string[] | undefined
}