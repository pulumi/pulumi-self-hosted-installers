import * as pulumi from "@pulumi/pulumi";

const pulumiConfig = new pulumi.Config();

// Used to create the needed stack references
// The assumption is that all stacks are in the same organization and use the same stack name (e.g. dev or prod, etc)
const orgName = pulumi.getOrganization();
const stackName = pulumi.getStack();

// IAM stack values
const iamStackRef = new pulumi.StackReference(`${orgName}/selfhosted-01-iam/${stackName}`);
const instanceProfileName = iamStackRef.requireOutput("instanceProfileName");

// Networking Stack values
// Get the needed values from the networking stack.
const networkingStackRef = new pulumi.StackReference(`${orgName}/selfhosted-02-networking/${stackName}`);

// Get the networking values from the networking stack.
const vpcId = networkingStackRef.requireOutput("vpcId");
const dockerHostSubnetId = networkingStackRef.requireOutput("publicSubnetIds").apply(subnetIds => subnetIds[0] as string);

// Build the config object used by the code
export const config = {
    baseName: pulumiConfig.require("baseName"),

    // docker host settings
    dockerHostInstanceType: pulumiConfig.get("dockerHostInstanceType") || "t3.large",
    dockerHostPublicKey: pulumiConfig.require("dockerHostPublicKey"),
    dockerHostPrivateKey: pulumiConfig.require("dockerHostPrivateKey"),

    // IAM stack values
    instanceProfileName: instanceProfileName,

    // Networking stack values
    vpcId: vpcId,
    dockerHostSubnetId: dockerHostSubnetId

};
