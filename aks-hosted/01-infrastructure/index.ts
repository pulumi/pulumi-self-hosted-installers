import * as azure from "@pulumi/azure-native";
import * as ad from "./activedirectory";
import * as networking from "./network"
import * as storage from "./storage";
import * as db from "./database";
import * as key from "./keyStorage";
import { config } from "./config";

const resourceGroup = new azure.resources.ResourceGroup(`${config.resourceNamePrefix}-rg`, {
    resourceGroupName: config.disableAutoNaming ? `${config.resourceNamePrefix}-rg`: undefined,
    tags: config.baseTags,
}, {protect: true});

const adApplication = new ad.ActiveDirectoryApplication(`${config.resourceNamePrefix}`);

const network = new networking.Network(`${config.resourceNamePrefix}`, {
    resourceGroupName: resourceGroup.name,
    networkCidr: config.networkCidr,
    subnetCidr: config.subnetCidr,
    tags: config.baseTags,
});

const storageDetails = new storage.Storage(`${config.resourceNamePrefix}`, {
    resourceGroupName: resourceGroup.name,
    tags: config.baseTags,
});

const database = new db.Database(`${config.resourceNamePrefix}`, {
    resourceGroupName: resourceGroup.name,
    subnetId: network.subnetId,
    tags: config.baseTags,
});

const kv = new key.KeyStorage(`${config.resourceNamePrefix}`, {
    objectId: adApplication.PrincipalServerObjectId,
    tenantId: adApplication.TenantId,
    resourceGroupName: resourceGroup.name,
    tags: config.baseTags,
});

export const resourceGroupName = resourceGroup.name;
export const adGroupId = adApplication.GroupId;
export const adApplicationId = adApplication.ApplicationId;
export const adApplicationSecret = adApplication.ApplicationSecret
export const tenantId = adApplication.TenantId;
export const subscriptionId = adApplication.SubscriptionId;
export const networkSubnetId = network.subnetId;
export const storageAccountId = storageDetails.storageAccountId;
export const storagePrimaryKey = storageDetails.storageAccountKey1;
export const checkpointBlobId = storageDetails.checkpointBlobId;
export const policyBlobId = storageDetails.policyBlobId;
export const checkpointBlobName = storageDetails.checkpointBlobName;
export const policyBlobName = storageDetails.policyBlobName;
export const dbServerName = database.DatabaseServerName;
export const dbLogin = database.DatabaseLogin;
export const dbPassword = database.DatabasePassword;
export const dbConnectionString = database.DatabaseConnectionString;
export const storageAccountName = storageDetails.storageAccountName;
export const keyvaultUri = kv.KeyVaultUri;
export const keyvaultKeyName = kv.KeyName;
export const keyvaultKeyVersion = kv.KeyVersion;
export const stackName1 = config.stackName;
