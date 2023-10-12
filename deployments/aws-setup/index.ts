import * as awsx from "@pulumi/awsx";

const vpc = new awsx.ec2.Vpc("self-hosted-vpc", {
    cidrBlock: "10.0.0.0/16",
    numberOfAvailabilityZones: 2,
    subnetSpecs: [{
        type: awsx.ec2.SubnetType.Public,
        name: "public-subnet",
    },
{
    type: awsx.ec2.SubnetType.Private,
    name: "private-subnet"
}, 
{
    type: awsx.ec2.SubnetType.Isolated,
    name: "isolated-subnet"
}],
    tags: {
        name: "pk-vpc"
    },
    natGateways: {
        strategy: "Single"
    },
    enableDnsSupport: true,
    enableDnsHostnames: true
});

export const vpcId = vpc.vpcId
export const publicSubnets = vpc.publicSubnetIds
export const privateSubnets = vpc.privateSubnetIds
export const isolatedSubnets = vpc.isolatedSubnetIds
