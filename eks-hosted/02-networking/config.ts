import * as pulumi from "@pulumi/pulumi";

const pulumiConfig = new pulumi.Config();

export const config = {
    baseName: pulumiConfig.require("baseName"), // should match the basename used for the 01-iam stack
    clusterName: pulumiConfig.require("eksClusterName"),
    networkCidrBlock: pulumiConfig.require("networkCidrBlock"),
    vpcId: pulumiConfig.get("vpcId"),
    // Optional: If bringing your own VPC - see Pulumi.README.yaml
    publicSubnetIds: pulumiConfig.getObject("publicSubnetIds"),
    privateSubnetIds: pulumiConfig.getObject("privateSubnetIds"),
};
