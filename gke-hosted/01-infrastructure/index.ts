import * as networking from "./network";
import * as serviceaccount from "./serviceAccount";
import * as storage from "./storage";
import * as db from "./database";
import { config } from "./config";

const storageDetails = new storage.Storage(config.resourceNamePrefix, {
    enableRegistryBuckets: config.enableRegistryBuckets,
    tags: config.baseTags,
});

const sa = new serviceaccount.ServiceAccount(config.resourceNamePrefix, {
    tags: config.baseTags,
    checkpointBucketName: storageDetails.checkpointBucketName,
    policyBucketName: storageDetails.policyBucketName,
    escBucketName: storageDetails.escBucketName,
    registryPublicBucketName: storageDetails.registryPublicBucketName,
    registryPrivateBucketName: storageDetails.registryPrivateBucketName,
});

const network = new networking.Network(config.resourceNamePrefix, {
    tags: config.baseTags,
});

const database = new db.Database(config.resourceNamePrefix, {
    vpcId: network.networkId,
    dbInstanceType: config.dbInstanceType,
    dbUser: config.dbUser,
    enableGeneralLog: config.dbEnableGeneralLog,
    backupRetentionDays: config.dbBackupRetentionDays,
    maintenanceDay: config.dbMaintenanceDay,
    maintenanceHour: config.dbMaintenanceHour,
    tags: config.baseTags,
});

export const checkpointBucketId = storageDetails.checkpointBucketId;
export const policyBucketId = storageDetails.policyBucketId;
export const checkpointBucketName = storageDetails.checkpointBucketName;
export const policyBucketName = storageDetails.policyBucketName;
export const escBucketName = storageDetails.escBucketName;
// "" when enableRegistryBuckets is off, so existing stacks get no undefined-output warnings
export const registryPublicBucketName = storageDetails.registryPublicBucketName ?? "";
export const registryPrivateBucketName = storageDetails.registryPrivateBucketName ?? "";
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
