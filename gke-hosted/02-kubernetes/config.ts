import * as pulumi from "@pulumi/pulumi";
import { Output } from "@pulumi/pulumi";

const stackConfig = new pulumi.Config();

const stackName1 = stackConfig.require("stackName1");
const infrastructureStack = new pulumi.StackReference(stackName1);

const projectName = pulumi.getProject();
const stackName = pulumi.getStack();

const commonName = stackConfig.get("commonName") || "pulumi-selfhosted";
const resourceNamePrefix = `${commonName}-${stackName}`;

const releaseChannel = stackConfig.get("releaseChannel") || "REGULAR";

export const config = {
  projectName,
  stackName,
  resourceNamePrefix,
  baseTags: {
    project: projectName,
    stack: stackName,
  },
  releaseChannel,
  networkName: <Output<string>>infrastructureStack.requireOutput("networkName"),
  serviceAccountName: <Output<string>>(
    infrastructureStack.requireOutput("serviceAccountName")
  ),
};
