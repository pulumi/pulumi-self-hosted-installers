import * as pulumi from "@pulumi/pulumi";
import * as ec2 from "@pulumi/aws/ec2";
import * as input from "@pulumi/aws/types/input";

/*
Network facts used by private mode (enablePrivateLoadBalancerAndLimitEgress).
In private mode the ECS tasks get no 0.0.0.0/0 egress. Everything they talk to has to be inside the VPC
(interface endpoints, internal load balancers, OpenSearch, an HTTP proxy) or be S3 through the gateway endpoint.
*/
export interface PrivateNetwork {
    // all IPv4 CIDR blocks associated with the VPC, primary first
    vpcCidrBlocks: string[];
    // AWS-managed prefix list of the S3 gateway endpoint (com.amazonaws.<region>.s3)
    s3PrefixListId: pulumi.Input<string>;
}

export interface EgressOptions {
    // adds MySQL egress to the Aurora security group
    dbSecurityGroupId?: string;
}

// Looks up the VPC CIDR blocks and, unless provided, the S3 prefix list. The prefix list exists per region whether or
// not this installer created the S3 gateway endpoint, so customer-provided endpoints work too.
export async function lookupPrivateNetwork(vpcId: string, region: string, s3PrefixListId?: string): Promise<PrivateNetwork> {
    const vpc = await ec2.getVpc({ id: vpcId });
    const vpcCidrBlocks = [...new Set([
        vpc.cidrBlock,
        ...(vpc.cidrBlockAssociations ?? []).map(association => association.cidrBlock),
    ])];

    const prefixListId = s3PrefixListId && s3PrefixListId !== "" ?
        s3PrefixListId :
        (await ec2.getPrefixList({ name: `com.amazonaws.${region}.s3` })).id;

    return {
        vpcCidrBlocks,
        s3PrefixListId: prefixListId,
    };
}

// Security group egress for ECS tasks in private mode: HTTP(S) to the VPC, HTTPS to S3, and optionally MySQL to Aurora.
export function privateEgressRules(network: PrivateNetwork, options: EgressOptions = {}): input.ec2.SecurityGroupEgress[] {
    const rules: input.ec2.SecurityGroupEgress[] = [
        {
            description: "HTTPS to the VPC: interface endpoints, internal load balancers, OpenSearch, proxy",
            protocol: "tcp",
            fromPort: 443,
            toPort: 443,
            cidrBlocks: network.vpcCidrBlocks,
        },
        {
            description: "HTTP to the VPC: internal load balancers, proxy",
            protocol: "tcp",
            fromPort: 80,
            toPort: 80,
            cidrBlocks: network.vpcCidrBlocks,
        },
        {
            description: "HTTPS to S3 through the gateway endpoint",
            protocol: "tcp",
            fromPort: 443,
            toPort: 443,
            prefixListIds: [network.s3PrefixListId],
        },
    ];

    if (options.dbSecurityGroupId) {
        rules.push({
            description: "MySQL to Aurora",
            protocol: "tcp",
            fromPort: 3306,
            toPort: 3306,
            securityGroups: [options.dbSecurityGroupId],
        });
    }

    return rules;
}
