import { config } from "./config";

export const serviceAccountAccessKeyId = config.storageAccessKey;
export const storageServiceAccountSecretAccessKey = config.storageSecretKey;
export const storageCheckpointBucket = config.storageCheckpointBucket;
export const storagePolicyPackBucket = config.storagePolicyPackBucket;
export const dbHost = config.dbHost;
export const dbPort = config.dbPort;
export const dbConnectionString = `${dbHost}:${dbPort}`;
export const dbServerName = dbHost;
export const dbUsername = config.dbUsername;
export const dbUserPassword = config.dbUserPassword;
export const stackName1 = config.stackName;
