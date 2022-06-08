import * as pulumi from "@pulumi/pulumi";

const stackConfig = new pulumi.Config();

const projectName = pulumi.getProject();
const stackName = pulumi.getStack();

const commonName = stackConfig.get("commonName") || "pulumiselfhosted";
const resourceNamePrefix = `${commonName}-${stackName}`;

const dbInstanceType = stackConfig.get("dbInstanceType") || "db-g1-small";
const dbUser = stackConfig.get("dbUser") || "pulumiadmin";

export const config = {
  projectName,
  stackName,
  resourceNamePrefix,
  dbInstanceType,
  dbUser,
  baseTags: {
    project: projectName,
    stack: stackName,
  },
};
