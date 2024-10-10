import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { config } from "./config";

/// VPC and Related Networking Resources ///

export const clusterName =  config.clusterName // need to carry this through to later stacks.
const clusterNameTag = `kubernetes.io/cluster/${clusterName}`

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

export const vpcId = vpc.vpcId;
export const publicSubnetIds = vpc.publicSubnetIds;
export const privateSubnetIds = vpc.privateSubnetIds;



