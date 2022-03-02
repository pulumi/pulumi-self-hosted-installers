import * as pulumi from "@pulumi/pulumi";

const stackConfig = new pulumi.Config();

const projectName = pulumi.getProject();
const stackName = pulumi.getStack();

const commonName = "pulumiselfhosted" || stackConfig.get("commonName");
const resourceNamePrefix = `${commonName}-${stackName}`;
const disableAutoNaming = stackConfig.getBoolean("disableAutoNaming");
const networkCidr = stackConfig.require("networkCidr");
const subnetCidr = stackConfig.require("subnetCidr");

export const config = {
  projectName,
  stackName,
  resourceNamePrefix,
  disableAutoNaming,
  networkCidr,
  subnetCidr,

  baseTags: {
    project: projectName,
    stack: stackName,
  },
};
