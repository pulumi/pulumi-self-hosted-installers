import * as pulumi from "@pulumi/pulumi";

// Used to create the needed stack references
// The assumption is that all stacks are in the same organization and use the same stack name (e.g. dev or prod, etc)
const orgName = pulumi.getOrganization();
const stackName = pulumi.getStack();

let pulumiConfig = new pulumi.Config();

// Networking Stack reference
const networkingStackRef = new pulumi.StackReference(`${orgName}/selfhosted-02-networking/${stackName}`);

// Cluster stack reference 
const clusterStackRef = new pulumi.StackReference(`${orgName}/selfhosted-05-ekscluster/${stackName}`);

export const config = {
    baseName: pulumiConfig.require("baseName"),
    // Cluster Infra values via stack reference
    clusterName: clusterStackRef.requireOutput("clusterName"),
    kubeconfig: clusterStackRef.requireOutput("kubeconfig"),
    nodeSecurityGroupId: clusterStackRef.requireOutput("nodeSecurityGroupId"),

    // VPC 
    vpcId: networkingStackRef.requireOutput("vpcId"),
    
    // Cert-Manager configuration
    certManagerEmail: pulumiConfig.get("certManagerEmail") || "admin@example.com",
    awsRegion: pulumiConfig.get("awsRegion") || "us-east-1",
    hostedZoneId: pulumiConfig.get("hostedZoneId"),
    certManagerIAMRoleArn: pulumiConfig.get("certManagerIAMRoleArn"),
};
