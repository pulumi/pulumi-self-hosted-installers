import { Config, Output, StackReference, getProject, getStack } from "@pulumi/pulumi";

const stackConfig = new Config();

const stackName1 = stackConfig.require("stackName1");
const infrastructureStack = new StackReference(stackName1);

const projectName = getProject();
const stackName = getStack();

const commonName = stackConfig.get("commonName") ||"pulumi-selfhosted"; 
const resourceNamePrefix = `${commonName}-${stackName}`;

// if enabled, this boolean controls whether or not cert-manager will be deployed and managed identity created for workloads to assume
// while this is the preferred way of managing certs, it is not required
const disableAzureDnsCertManagement = stackConfig.getBoolean("disableAzureDnsCertManagement") || false;
let azureDnsZoneName = undefined;
let azureDnsZoneResourceGroup = undefined;
if (!disableAzureDnsCertManagement) {
    azureDnsZoneName = stackConfig.require("azureDnsZoneName");
    azureDnsZoneResourceGroup = stackConfig.require("azureDnsZoneResourceGroupName");
}

const privateIpAddress = stackConfig.get("privateIpAddress");

export const config = {
    projectName,
    stackName,
    resourceNamePrefix,
    disableAzureDnsCertManagement,
    azureDnsZoneName,
    azureDnsZoneResourceGroup,
    privateIpAddress,
    enablePrivateLoadBalancer: privateIpAddress != undefined,
    baseTags: {
        project: projectName,
        stack: stackName,
    },
    resourceGroupName: <Output<string>>infrastructureStack.requireOutput("resourceGroupName"),
    subnetId: <Output<string>>infrastructureStack.requireOutput("networkSubnetId"),
    adGroupId: <Output<string>>infrastructureStack.requireOutput("adGroupId"),
    adApplicationId: <Output<string>>infrastructureStack.requireOutput("adApplicationId"),
    adApplicationSecret: <Output<string>>infrastructureStack.requireOutput("adApplicationSecret"),
};
