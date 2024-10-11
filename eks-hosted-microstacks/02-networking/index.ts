import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { config } from "./config";

export const clusterName =  config.clusterName // need to carry this through to later stacks.
const clusterNameTag = `kubernetes.io/cluster/${clusterName}`

// VPC and related resources
export let vpcId: string | pulumi.Output<string>;
export let publicSubnetIds: any | pulumi.Output<string>[];
export let privateSubnetIds: any | pulumi.Output<string>[];

// Use the provided VPC and subnets if they exist.
if (config.vpcId && config.publicSubnetIds && config.privateSubnetIds) {

    vpcId = config.vpcId;
    publicSubnetIds = config.publicSubnetIds;
    privateSubnetIds = config.privateSubnetIds;

} else { // Otherwise, create a new VPC and subnets

    const vpc = new awsx.ec2.Vpc(`${config.baseName}-vpc`,
        {
            cidrBlock: config.networkCidrBlock,
            numberOfAvailabilityZones: 3,
            subnetStrategy: awsx.ec2.SubnetAllocationStrategy.Auto,
            subnetSpecs: [
                // Any non-null value is valid.
                { type: "Public", tags: {"kubernetes.io/role/elb": "1", [clusterNameTag]:  "shared" }},
                { type: "Private", tags: {"kubernetes.io/role/internal-elb": "1"}},
            ],
                // tags: { [clusterNameTag]:  "shared" }
            tags: { "Name": `${config.baseName}-vpc`},
        },
        {
            transformations: [(args) => {
                if (args.type === "aws:ec2/vpc:Vpc" || args.type === "aws:ec2/subnet:Subnet") {
                    return {
                        props: args.props,
                        opts: pulumi.mergeOptions(args.opts, { ignoreChanges: ["tags"] })
                    }
                }
                return undefined;
            }],
        }
    );

    vpcId = vpc.vpcId;
    publicSubnetIds = vpc.publicSubnetIds;
    privateSubnetIds = vpc.privateSubnetIds;
}



