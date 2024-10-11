import * as pulumi from "@pulumi/pulumi";

const pulumiConfig = new pulumi.Config();

// Used to create the needed stack references
// The assumption is that all stacks are in the same organization and use the same stack name (e.g. dev or prod, etc)
const orgName = pulumi.getOrganization();
const stackName = pulumi.getStack();

// IAM stack values
const iamStackRef = new pulumi.StackReference(`${orgName}/selfhosted-01-iam/${stackName}`);
const eksInstanceRoleName = iamStackRef.requireOutput("eksInstanceRoleName");
const instanceProfileName = iamStackRef.requireOutput("instanceProfileName");
const eksServiceRoleName = iamStackRef.requireOutput("eksServiceRoleName");
const ssoRoleArn = iamStackRef.requireOutput("ssoRoleArn");

// Networking Stack values
// Get the needed values from the networking stack.
const networkingStackRef = new pulumi.StackReference(`${orgName}/selfhosted-02-networking/${stackName}`);

// Get the cluster name used for the vpc tagging in the networking stack
const clusterName = networkingStackRef.requireOutput("clusterName");

// Get the networking values from the networking stack.
const vpcId = networkingStackRef.requireOutput("vpcId");
const publicSubnetIds = networkingStackRef.requireOutput("publicSubnetIds");
const privateSubnetIds = networkingStackRef.requireOutput("privateSubnetIds");


// Build the config object used by the code
export const config = {
    baseName: pulumiConfig.require("baseName"),
    clusterVersion: pulumiConfig.get("clusterVersion") || "1.30", 

    /**
     * EKS Node Group
     */
    standardNodeGroupInstanceType: pulumiConfig.get("standardNodeGroupInstanceType") || "t3.xlarge",
    standardNodeGroupDesiredCapacity: pulumiConfig.getNumber("standardNodeGroupDesiredCapacity") ?? 2,
    standardNodeGroupMinSize: pulumiConfig.getNumber("standardNodeGroupMinSize") ?? 2,
    standardNodeGroupMaxSize: pulumiConfig.getNumber("standardNodeGroupMaxSize") ?? 5,

    pulumiNodeGroupInstanceType: pulumiConfig.get("pulumiNodeGroupInstanceType") || "t3.xlarge",
    pulumiNodeGroupDesiredCapacity: pulumiConfig.getNumber("pulumiNodeGroupDesiredCapacity") ?? 3,
    pulumiNodeGroupMinSize: pulumiConfig.getNumber("pulumiNodeGroupMinSize") ?? 3,
    pulumiNodeGroupMaxSize: pulumiConfig.getNumber("pulumiNodeGroupMaxSize") ?? 5,

    // IAM stack values
    eksInstanceRoleName: eksInstanceRoleName,
    instanceProfileName: instanceProfileName,
    eksServiceRoleName: eksServiceRoleName,
    ssoRoleArn: ssoRoleArn,

    // Networking stack values
    clusterName: clusterName,
    vpcId: vpcId,
    publicSubnetIds: publicSubnetIds,
    privateSubnetIds: privateSubnetIds,

};
