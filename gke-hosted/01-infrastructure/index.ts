import * as networking from "./network"
import * as serviceaccount from "./service-account";
import * as storage from "./storage";
import * as db from "./database";
import { config } from "./config";

const sa = new serviceaccount.ServiceAccount(`${config.resourceNamePrefix}`)

const network = new networking.Network(`${config.resourceNamePrefix}`, {
    tags: config.baseTags,
});

const storageDetails = new storage.Storage(`${config.resourceNamePrefix}`, {
    tags: config.baseTags,
});

const database = new db.Database(`${config.resourceNamePrefix}`, {
    dbInstanceType: config.dbInstanceType,
    dbUser: config.dbUser,
    tags: config.baseTags,
});

export const checkpointBucketId = storageDetails.checkpointBucketId;
export const policyBucketId = storageDetails.policyBucketId;
export const checkpointBucketName = storageDetails.checkpointBucketName;
export const policyBucketName = storageDetails.policyBucketName;
export const serviceAccountName = sa.serviceAccountName;
export const serviceAccountAccessKeyId = sa.serviceAccountAccessKeyId;
export const serviceAccountSecretAccessKey = sa.serviceAccountSecretAccessKey;
export const dbServerName = database.DatabaseServerName;
export const dbLogin = database.DatabaseLogin;
export const dbPassword = database.DatabasePassword;
export const dbConnectionString = database.DatabaseConnectionString;
export const dbHost = database.DatabaseHost;
export const stackName1 = config.stackName;
export const networkName = network.networkName;
