import { authorization, resources } from "@pulumi/azure-native";
import * as ad from "./activedirectory";
import * as networking from "./network"
import * as storage from "./storage";
import * as db from "./database";
import * as key from "./keyStorage";
import { config } from "./config";
import { output } from "@pulumi/pulumi";

export = async () => {

    // retrieve informatino about our currently deployment user (principal)
    const azureClientConfig = await authorization.getClientConfig();

    // although this RG may not house the vnet, it will house all the remaining resources we create
    const resourceGroup = new resources.ResourceGroup(`${config.resourceNamePrefix}-rg`, {
        resourceGroupName: config.disableAutoNaming ? `${config.resourceNamePrefix}-rg` : undefined,
        tags: config.baseTags,
    }, { protect: true });

    const adApplication = new ad.ActiveDirectoryApplication(config.resourceNamePrefix, {
        userId: azureClientConfig.objectId,
    });

    const vnetResourceGroupName = config.vnetResourceGroup && config.vnetResourceGroup != "" ?
        output(config.vnetResourceGroup) :
        resourceGroup.name;

    const network = new networking.Network(config.resourceNamePrefix, {
        resourceGroupName: vnetResourceGroupName,
        networkCidr: config.networkCidr,
        subnetCidr: config.subnetCidr,
        dbSubnetCidr: config.dbSubnetCidr,
        vnetName: config.vnetName,
        tags: config.baseTags,
    });

    const storageDetails = new storage.Storage(config.resourceNamePrefix, {
        resourceGroupName: resourceGroup.name,
        tags: config.baseTags,
    });

    // AKS and MySQL DB will be located in different subnets
    const database = new db.Database(config.resourceNamePrefix, {
        resourceGroupName: resourceGroup.name,
        dbSubnetId: network.dbSubnetId,
        aksSubnetId: network.subnetId,
        vnetId: network.vnetId,
        tags: config.baseTags,
    });

    const kv = new key.KeyStorage(config.resourceNamePrefix, {
        objectId: adApplication.PrincipalServerObjectId,
        tenantId: azureClientConfig.tenantId,
        resourceGroupName: resourceGroup.name,
        tags: config.baseTags,
    });

    // our aks cluster will use this SP and it needs to be able to perform actions on subnets
    // to place nodes appropriately into our snets
    // requires Network Contributor role: https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles#network-contributor
    new authorization.RoleAssignment(`${config.resourceNamePrefix}-roleassign-snet`, {
        roleDefinitionId: "/providers/Microsoft.Authorization/roleDefinitions/4d97b98b-1d4f-4787-a291-c67834d212e7", 
        scope: network.vnetId,
        principalId: adApplication.PrincipalServerObjectId,
        principalType: "ServicePrincipal",
    });

    return {
        resourceGroupName: resourceGroup.name,
        adGroupId: adApplication.GroupId,
        adApplicationId: adApplication.ApplicationId,
        adApplicationSecret: adApplication.ApplicationSecret,
        tenantId: azureClientConfig.tenantId,
        subscriptionId: azureClientConfig.subscriptionId,
        networkSubnetId: network.subnetId,
        storageAccountId: storageDetails.storageAccountId,
        storagePrimaryKey: storageDetails.storageAccountKey1,
        checkpointBlobId: storageDetails.checkpointBlobId,
        policyBlobId: storageDetails.policyBlobId,
        escBlobId: storageDetails.escBlobId,
        checkpointBlobName: storageDetails.checkpointBlobName,
        policyBlobName: storageDetails.policyBlobName,
        escBlobName: storageDetails.escBlobName,
        storageAccountName: storageDetails.storageAccountName,
        dbServerName: database.DatabaseServerName,
        dbLogin: database.DatabaseLogin,
        dbPassword: database.DatabasePassword,
        dbEndpoint: database.DatabaseEndpoint,
        keyvaultUri: kv.KeyVaultUri,
        keyvaultKeyName: kv.KeyName,
        keyvaultKeyVersion: kv.KeyVersion,
        stackName1: config.stackName,
        baseTags: config.baseTags
    };
};