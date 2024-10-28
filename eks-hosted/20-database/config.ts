import * as pulumi from "@pulumi/pulumi";

let pulumiConfig = new pulumi.Config();

// Used to create the needed stack references
// The assumption is that all stacks are in the same organization and use the same stack name (e.g. dev or prod, etc)
const orgName = pulumi.getOrganization();
const stackName = pulumi.getStack();

// IAM stack reference 
const iamStackRef = new pulumi.StackReference(`${orgName}/selfhosted-01-iam/${stackName}`);

// Networking Stack reference
const networkingStackRef = new pulumi.StackReference(`${orgName}/selfhosted-02-networking/${stackName}`);

// Cluster stack reference 
const clusterStackRef = new pulumi.StackReference(`${orgName}/selfhosted-05-ekscluster/${stackName}`);

export const config = {
    baseName: pulumiConfig.require("baseName"),
    dbReplicas: pulumiConfig.getNumber("dbrel") ?? 2,
    dbInstanceType: pulumiConfig.get("dbInstanceType") || "db.r5.large",

    // Cluster Infra values via stack reference
    nodeSecurityGroupId: clusterStackRef.requireOutput("nodeSecurityGroupId"),

    // IAM values
    databaseMonitoringRoleArn: iamStackRef.requireOutput("databaseMonitoringRoleArn"),

    // Networking values
    privateSubnetIds: networkingStackRef.requireOutput("privateSubnetIds"),
};

