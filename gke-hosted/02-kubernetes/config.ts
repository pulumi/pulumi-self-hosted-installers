import * as pulumi from "@pulumi/pulumi";
import { Output } from "@pulumi/pulumi";

const stackConfig = new pulumi.Config();

const stackName1 = stackConfig.require("stackName1");
const infrastructureStack = new pulumi.StackReference(stackName1);

const projectName = pulumi.getProject();
const stackName = pulumi.getStack();

const commonName = stackConfig.get("commonName") || "pulumi-selfhosted";
const resourceNamePrefix = `${commonName}-${stackName}`;

const clusterVersion = stackConfig.get("clusterVersion") || "1.30";

export const config = {
  projectName,
  stackName,
  resourceNamePrefix,
  baseTags: {
    project: projectName,
    stack: stackName,
  },
  clusterVersion,
  networkName: <Output<string>>infrastructureStack.requireOutput("networkName"),
  serviceAccountName: <Output<string>>(
    infrastructureStack.requireOutput("serviceAccountName")
  ),
  
  // Cert-Manager and TLS configuration
  certManagerEmail: stackConfig.get("certManagerEmail") || "admin@example.com",
  gcpProject: stackConfig.get("gcpProject") || pulumi.getProject(),
  gcpServiceAccountSecretName: stackConfig.get("gcpServiceAccountSecretName"),
  
  // OpenSearch configuration
  enableOpenSearchTLS: stackConfig.getBoolean("enableOpenSearchTLS") ?? true,
  openSearchNamespace: stackConfig.get("openSearchNamespace") || "opensearch",
};
