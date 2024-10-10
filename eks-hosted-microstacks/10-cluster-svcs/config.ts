import * as pulumi from "@pulumi/pulumi";

let pulumiConfig = new pulumi.Config();

const networkingStackName = pulumiConfig.get("networkingStackName");
let vpcId: string | pulumi.Output<string> | pulumi.Output<any>;

if (!networkingStackName) {
    // Then networking is being managed elsewhere and so user must provide related values
    vpcId = pulumiConfig.require("vpcId");

} else {
    // Get the needed values from the networking stack.
    const networkingStackRef = new pulumi.StackReference(networkingStackName);

    // Get the networking values from the networking stack.
    vpcId = networkingStackRef.requireOutput("vpcId");
}

// Get the cluster stack reference 
const clusterStackRef = new pulumi.StackReference(pulumiConfig.require("clusterStackName"));

export const config = {
    baseName: pulumiConfig.require("baseName"),
    // Cluster Infra values via stack reference
    clusterName: clusterStackRef.requireOutput("clusterName"),
    kubeconfig: clusterStackRef.requireOutput("kubeconfig"),
    nodeSecurityGroupId: clusterStackRef.requireOutput("nodeSecurityGroupId"),

    // VPC 
    vpcId: vpcId
};
