import * as pulumi from "@pulumi/pulumi";

const pulumiConfig = new pulumi.Config();

// IAM stack reference - if applicable
// If config not set for the iam stack reference, then require the applicable values to be provided
const iamStackName = pulumiConfig.get("iamStackName");
let eksInstanceRoleName: string | pulumi.Output<string>;
let instanceProfileName: string | pulumi.Output<string>;
let eksServiceRoleName: string | pulumi.Output<string>;
let ssoRoleArn: string | pulumi.Output<string>;

if (!iamStackName) {

    eksInstanceRoleName = pulumiConfig.require("eksInstanceRoleName");
    instanceProfileName = pulumiConfig.require("instanceProfileName");
    eksServiceRoleName = pulumiConfig.require("eksServiceRoleName");
    ssoRoleArn = pulumiConfig.requireSecret("ssoRoleArn");

} else {

    const iamStackRef = new pulumi.StackReference(iamStackName);
    eksInstanceRoleName = iamStackRef.requireOutput("eksInstanceRoleName");
    instanceProfileName = iamStackRef.requireOutput("instanceProfileName");
    eksServiceRoleName = iamStackRef.requireOutput("eksServiceRoleName");
    ssoRoleArn = iamStackRef.requireOutput("ssoRoleArn");

}


// Networking Stack reference - if applicable.
// If config not set for the networking stack reference, then require the applicable values to be provided
const networkingStackName = pulumiConfig.get("networkingStackName");
let vpcId: string | pulumi.Output<string>;
let publicSubnetIds: string[] | pulumi.Output<string>[] = [];
let privateSubnetIds: string[] | pulumi.Output<string>[] = [];
let clusterName: string | pulumi.Output<string>;

if (!networkingStackName) {
    // Get the provided cluster name
    clusterName =  pulumiConfig.require("clusterName");

    // Then networking is being managed elsewhere and so user must provide related values
    vpcId = pulumiConfig.require("vpcId");
    publicSubnetIds = pulumiConfig.requireObject("publicSubnetIds");
    privateSubnetIds = pulumiConfig.requireObject("privateSubnetIds");

} else {
    // Get the needed values from the networking stack.
    const networkingStackRef = new pulumi.StackReference(networkingStackName);

    // Get the cluster name used for the vpc tagging in the networking stack
    clusterName = networkingStackRef.requireOutput("clusterName");

    // Get the networking values from the networking stack.
    vpcId = networkingStackRef.requireOutput("vpcId");
    publicSubnetIds = networkingStackRef.requireOutput("publicSubnetIds");
    privateSubnetIds = networkingStackRef.requireOutput("privateSubnetIds");

}


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
