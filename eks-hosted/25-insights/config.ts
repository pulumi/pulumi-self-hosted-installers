import * as pulumi from "@pulumi/pulumi";

const pulumiConfig = new pulumi.Config();
const orgName = pulumi.getOrganization();
const stackName = pulumi.getStack();

// Build the config object used by the code
const baseName = pulumiConfig.require("baseName");

// OpenSearch now supports TLS certificates for cross-namespace communication
// Deploy in its own namespace for better security isolation
const opensearchNameSpace = pulumiConfig.get("opensearchNamespace") || "pulumi-insights"

const opensearchAdminPassword = pulumiConfig.requireSecret("opensearchPassword");

// IAM stack reference
const iamStackRef = new pulumi.StackReference(`${orgName}/selfhosted-01-iam/${stackName}`);
const eksServiceRoleName = iamStackRef.requireOutput("eksServiceRoleName");

// Cluster stack reference 
const clusterStackRef = new pulumi.StackReference(`${orgName}/selfhosted-05-ekscluster/${stackName}`);
const kubeconfig = clusterStackRef.requireOutput("kubeconfig");

// Cluster services stack reference for cert-manager
const clusterSvcsStackRef = new pulumi.StackReference(`${orgName}/selfhosted-10-clustersvcs/${stackName}`);

export const config = {
    baseName: baseName,
    namespace: pulumi.output(opensearchNameSpace),
    kubeconfig: kubeconfig,
    serviceAccount: eksServiceRoleName,
    initialAdminPassword: opensearchAdminPassword,
    
    // TLS and cert-manager configuration
    enableOpenSearchTLS: pulumiConfig.getBoolean("enableOpenSearchTLS") ?? true,
    certManagerIssuerName: clusterSvcsStackRef.requireOutput("route53IssuerName"),
    pulumiServiceNamespace: pulumiConfig.get("pulumiServiceNamespace") || "pulumi-service",
};
