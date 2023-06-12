import * as pulumi from "@pulumi/pulumi";

const stackConfig = new pulumi.Config();
const projectName = pulumi.getProject();
const stackName = pulumi.getStack();

const commonName = "pulumiselfhosted" || stackConfig.get("commonName");
const resourceNamePrefix = `${commonName}-${stackName}`;
const disableAutoNaming = stackConfig.getBoolean("disableAutoNaming");
const subnetCidr = stackConfig.require("subnetCidr");
const networkCidr = stackConfig.get("networkCidr");

// if a user does elect to BYO vnet, they will be required to also supply the resource group name that houses the vnet
const vnetId = stackConfig.get("virtualNetworkId");

if (!networkCidr && !vnetId) {
  throw new Error("Either networkCidr or virtualNetworkId must be present");
}

let vnetResourceGroup = "";
if (vnetId) {
  vnetResourceGroup = stackConfig.require("virtualNetworkResourceGroup");
}

export const config = {
  projectName,
  stackName,
  resourceNamePrefix,
  disableAutoNaming,
  networkCidr,
  subnetCidr,
  vnetId,
  vnetResourceGroup,
  baseTags: {
    project: projectName,
    stack: stackName,
  },
};
