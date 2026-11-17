import { config } from "./config";

export const serviceAccountAccessKeyId = config.storageAccessKey;
export const serviceAccountSecretAccessKey = config.storageSecretKey;
export const checkpointBucketConnectionString = config.storageCheckpointBucket;
export const policyBucketConnectionString = config.storagePolicyPackBucket;
// "" when not set, so existing stacks get no undefined-output warnings
export const registryPublicBucketConnectionString = config.storageRegistryPublicBucket ?? "";
export const registryPrivateBucketConnectionString = config.storageRegistryPrivateBucket ?? "";
export const dbHost = config.dbHost;
export const dbPort = config.dbPort;
export const dbConnectionString = `${dbHost}:${dbPort}`;
export const dbServerName = dbHost;
export const dbLogin = config.dbUsername;
export const dbPassword = config.dbUserPassword;
export const stackName1 = config.stackName;
