import * as pulumi from "@pulumi/pulumi";

const stackConfig = new pulumi.Config();
const projectName = pulumi.getProject();
const stackName = pulumi.getStack();

const commonName = "pulumiselfhosted" || stackConfig.get("commonName");
const resourceNamePrefix = `${commonName}-${stackName}`;
const disableAutoNaming = stackConfig.getBoolean("disableAutoNaming");

// opt-in: blob containers for Pulumi Registry artifacts (PULUMI_REGISTRY_{PUBLIC,PRIVATE}_BLOB_STORAGE_ENDPOINT)
const enableRegistryBuckets = stackConfig.getBoolean("enableRegistryBuckets") ?? false;

// subnet for AKS cluster
const subnetCidr = stackConfig.require("subnetCidr");

// dedicated subnet (delegated) for MySQL databases
const dbSubnetCidr = stackConfig.require("dbSubnetCidr");
const networkCidr = stackConfig.get("networkCidr");

// if a user does elect to BYO vnet, they will be required to also supply the resource group name that houses the vnet
const vnetName = stackConfig.get("virtualNetworkName");

if (!networkCidr && !vnetName) {
  throw new Error("Either networkCidr or virtualNetworkName must be present");
}

let vnetResourceGroup = "";
if (vnetName) {
  vnetResourceGroup = stackConfig.require("virtualNetworkResourceGroup");
}

export const config = {
  projectName,
  stackName,
  resourceNamePrefix,
  disableAutoNaming,
  enableRegistryBuckets,
  networkCidr,
  subnetCidr,
  dbSubnetCidr,
  vnetName,
  vnetResourceGroup,
  baseTags: {
    project: projectName,
    stack: stackName,
  },
};
