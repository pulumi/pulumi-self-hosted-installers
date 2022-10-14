import * as pulumi from "@pulumi/pulumi";

const stackConfig = new pulumi.Config();

const projectName = pulumi.getProject();
const stackName = pulumi.getStack();

const commonName = stackConfig.get("commonName") || "pulumiselfhosted";
const resourceNamePrefix = `${commonName}-${stackName}`;

const storageAccessKey = stackConfig.require("storageAccessKey");
const storageSecretKey = stackConfig.requireSecret("storageSecretKey"); 
const storageCheckpointBucket = stackConfig.require("storageCheckpointBucket");
const storagePolicyPackBucket = stackConfig.require("storagePolicyPackBucket");
const dbHost = stackConfig.require("dbHost");
const dbPort = stackConfig.getNumber("dbPort") || 3306;
const dbUsername = stackConfig.require("dbUsername");
const dbUserPassword = stackConfig.requireSecret("dbUserPassword");

export const config = {
  projectName,
  stackName,
  resourceNamePrefix,
  storageAccessKey, 
  storageSecretKey,
  storageCheckpointBucket,
  storagePolicyPackBucket,
  dbHost,
  dbPort,
  dbUsername,
  dbUserPassword 
};
