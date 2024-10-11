import * as pulumi from "@pulumi/pulumi";

let pulumiConfig = new pulumi.Config();

// IAM stack reference - if applicable
// If config not set for the iam stack reference, then require the applicable values to be provided
const iamStackName = pulumiConfig.get("iamStackName");
let databaseMonitoringRoleArn: string | pulumi.Output<string> | pulumi.Output<any>;

if (!iamStackName) {

    databaseMonitoringRoleArn = pulumiConfig.require("databaseMonitoringRoleArn");

} else {

    const iamStackRef = new pulumi.StackReference(iamStackName);
    databaseMonitoringRoleArn = iamStackRef.requireOutput("databaseMonitoringRoleArn");

}

// Networking Stack reference - if applicable.
// If config not set for the networking stack reference, then require the applicable values to be provided
const networkingStackName = pulumiConfig.get("networkingStackName");
let privateSubnetIds: string[] | pulumi.Output<string>[] | pulumi.Output<any>  = [];

if (!networkingStackName) {

    // Then networking is being managed elsewhere and so user must provide related values
    privateSubnetIds = pulumiConfig.requireObject("privateSubnetIds");

} else {
    // Get the needed values from the networking stack.
    const networkingStackRef = new pulumi.StackReference(networkingStackName);

    privateSubnetIds = networkingStackRef.requireOutput("privateSubnetIds");

}

// Get the cluster stack reference 
const clusterStackRef = new pulumi.StackReference(pulumiConfig.require("clusterStackName"));

export const config = {
    baseName: pulumiConfig.require("baseName"),
    dbReplicas: pulumiConfig.getNumber("dbrel") ?? 2,
    dbInstanceType: pulumiConfig.get("dbInstanceType") || "db.r5.large",

    // Cluster Infra values via stack reference
    nodeSecurityGroupId: clusterStackRef.requireOutput("nodeSecurityGroupId"),

    // IAM values
    databaseMonitoringRoleArn: databaseMonitoringRoleArn,

    // Networking values
    privateSubnetIds: privateSubnetIds,
};

