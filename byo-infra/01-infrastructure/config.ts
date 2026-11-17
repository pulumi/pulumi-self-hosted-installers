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
// optional: Pulumi Registry storage (PULUMI_REGISTRY_{PUBLIC,PRIVATE}_BLOB_STORAGE_ENDPOINT)
const storageRegistryPublicBucket = stackConfig.get("storageRegistryPublicBucket");
const storageRegistryPrivateBucket = stackConfig.get("storageRegistryPrivateBucket");
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
  storageRegistryPublicBucket,
  storageRegistryPrivateBucket,
  dbHost,
  dbPort,
  dbUsername,
  dbUserPassword 
};
