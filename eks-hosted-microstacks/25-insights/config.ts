import * as pulumi from "@pulumi/pulumi";

const pulumiConfig = new pulumi.Config();
const awsConfig = new pulumi.Config("aws");

const orgName = pulumi.getOrganization();
const stackName = pulumi.getStack();

// Networking Stack reference
const networkingStackRef = new pulumi.StackReference(`${orgName}/selfhosted-02-networking/${stackName}`);

// Build the config object used by the code
const baseName = pulumiConfig.require("baseName");

export const config = {
    region: awsConfig.require("region"),
    baseName: baseName,
    enableOpenSearch: true,
    openSearchDomainName: `${baseName}-search`,
    openSearchInstanceType: pulumiConfig.require("openSearchInstanceType"),
    openSearchInstanceCount: pulumiConfig.requireNumber("openSearchInstanceCount"),
    openSearchDedicatedMasterCount: pulumiConfig.getNumber("openSearchDedicatedMasterCount") || 0,
    vpcId: networkingStackRef.requireOutput("vpcId").apply(vpcId => vpcId as string),
    privateSubnetIds: networkingStackRef.requireOutput("privateSubnetIds").apply(subnetIds => subnetIds as string[]),
};
