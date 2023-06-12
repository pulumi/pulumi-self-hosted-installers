import { resources } from "@pulumi/azure-native";
import * as ad from "./activedirectory";
import * as networking from "./network"
import * as storage from "./storage";
import * as db from "./database";
import * as key from "./keyStorage";
import { config } from "./config";
import { output } from "@pulumi/pulumi";

export = async () => {
    // although this RG may not house the vnet, it will house all the remaining resources we create
    const resourceGroup = new resources.ResourceGroup(`${config.resourceNamePrefix}-rg`, {
        resourceGroupName: config.disableAutoNaming ? `${config.resourceNamePrefix}-rg` : undefined,
        tags: config.baseTags,
    }, { protect: true });
    
    const adApplication = new ad.ActiveDirectoryApplication(`${config.resourceNamePrefix}`);
    
    // this will allow users to bring their own (BYO) virtual network, although we will still create a subnet
    const vnetResourceGroupName = config.vnetResourceGroup && config.vnetResourceGroup != "" ? 
        output(config.vnetResourceGroup) : 
        resourceGroup.name;

    const network = new networking.Network(`${config.resourceNamePrefix}`, {
        resourceGroupName: vnetResourceGroupName,
        networkCidr: config.networkCidr,
        subnetCidr: config.subnetCidr,
        vnetId: config.vnetId,
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

    return {
        resourceGroupName: resourceGroup.name,
        adGroupId: adApplication.GroupId,
        adApplicationId: adApplication.ApplicationId,
        adApplicationSecret: adApplication.ApplicationSecret,
        tenantId: adApplication.TenantId,
        subscriptionId: adApplication.SubscriptionId,
        networkSubnetId: network.subnetId,
        storageAccountId: storageDetails.storageAccountId,
        storagePrimaryKey: storageDetails.storageAccountKey1,
        checkpointBlobId: storageDetails.checkpointBlobId,
        policyBlobId: storageDetails.policyBlobId,
        checkpointBlobName: storageDetails.checkpointBlobName,
        policyBlobName: storageDetails.policyBlobName,
        storageAccountName: storageDetails.storageAccountName,
        dbServerName: database.DatabaseServerName,
        dbLogin: database.DatabaseLogin,
        dbPassword: database.DatabasePassword,
        dbConnectionString: database.DatabaseConnectionString,
        keyvaultUri: kv.KeyVaultUri,
        keyvaultKeyName: kv.KeyName,
        keyvaultKeyVersion: kv.KeyVersion,
        stackName1: config.stackName,
        baseTags: config.baseTags
    };
};