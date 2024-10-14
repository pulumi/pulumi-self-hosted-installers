import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { config } from "./config";

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
                { type: "Public"},
                { type: "Private"},
            ],
                // tags: { [clusterNameTag]:  "shared" }
            tags: { "Name": `${config.baseName}-vpc`},
        },
    );

    vpcId = vpc.vpcId;
    publicSubnetIds = vpc.publicSubnetIds;
    privateSubnetIds = vpc.privateSubnetIds;
}



