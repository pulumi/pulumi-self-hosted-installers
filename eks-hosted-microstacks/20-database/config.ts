import * as pulumi from "@pulumi/pulumi";

let pulumiConfig = new pulumi.Config();

// Networking Stack reference - if applicable.
// If config not set for the networkign stack reference, then require subnet IDs to be provided
let privateSubnetIds: pulumi.Output<string>[] = [];
const networkingStackFullyQualifiedName = pulumiConfig.get("networkingStackFullyQualifiedName");
if (!networkingStackFullyQualifiedName) {
    // Then networking is being managed elsewhere and so user must provide subnet IDs.
    privateSubnetIds = pulumiConfig.requireObject("privateSubnetIds");
} else {
    // Get the private subnet Ids from the networking stack.
    const networkingStackRef = new pulumi.StackReference(networkingStackFullyQualifiedName);
    privateSubnetIds = networkingStackRef.requireOutput("privateSubnetIds");
}

export const config = {
    privateSubnetIds: privateSubnetIds,
    nodeSecurityGroupId: clusterStackRef.requireOutput("nodeSecurityGroupId"),

    // Cluster
    kubeconfig: clusterStackRef.requireOutput("kubeconfig"),
    clusterName: clusterStackRef.requireOutput("clusterName"),
    clusterSvcsNamespaceName: clusterStackRef.requireOutput("clusterSvcsNamespaceName"),
    appsNamespaceName: clusterStackRef.requireOutput("appsNamespaceName"),
    clusterOidcProviderArn: clusterStackRef.requireOutput("clusterOidcProviderArn"),
    clusterOidcProviderUrl: clusterStackRef.requireOutput("clusterOidcProviderUrl"),

    // RDS Cluster Instances
    dbReplicas: pulumiConfig.getNumber("dbReplicas") ?? 2,
    dbInstanceType: pulumiConfig.get("dbInstanceType") || "db.r4.xlarge",

    // DNS Hosted Zone to manage with external-dns and use with ALB, ACM.
    hostedZoneDomainName: pulumiConfig.require("hostedZoneDomainName"),
};
