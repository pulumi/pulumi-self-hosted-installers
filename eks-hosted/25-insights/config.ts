import * as pulumi from "@pulumi/pulumi";

const pulumiConfig = new pulumi.Config();
const orgName = pulumi.getOrganization();
const stackName = pulumi.getStack();

// Build the config object used by the code
const baseName = pulumiConfig.require("baseName");

// NOTE: Ultimately, the opesearch cluster will go in a namespace named something like `pulumi-insights`.
// But for now, it is going into the same namespace that is used for the pulumi service to work around a challenge related to TLS certs.
// Once the certs code is in place, the namespace will be changed to `pulumi-insights` and the cluster deployed there.
// Since the opensearch cluster is not stateful/can be reindexed on demand, making this change later will not be a problem.
const opensearchNameSpace = "pulumi-service"

const opensearchAdminPassword = pulumiConfig.requireSecret("opensearchPassword");

// IAM stack reference
const iamStackRef = new pulumi.StackReference(`${orgName}/selfhosted-01-iam/${stackName}`);
const eksServiceRoleName = iamStackRef.requireOutput("eksServiceRoleName");

// Cluster stack reference 
const clusterStackRef = new pulumi.StackReference(`${orgName}/selfhosted-05-ekscluster/${stackName}`);
const kubeconfig = clusterStackRef.requireOutput("kubeconfig");

export const config = {
    baseName: baseName,
    namespace: pulumi.output(opensearchNameSpace),
    kubeconfig: kubeconfig,
    serviceAccount: eksServiceRoleName,
    intitialAdminPassword: opensearchAdminPassword,
};
