import { Config, Output, StackReference, getProject, getStack } from "@pulumi/pulumi";

const stackConfig = new Config();

const stackName1 = stackConfig.require("stackName1");
const infrastructureStack = new StackReference(stackName1);

const projectName = getProject();
const stackName = getStack();

const commonName = "pulumi-selfhosted" || stackConfig.get("commonName");
const resourceNamePrefix = `${commonName}-${stackName}`;

// if enabled, this boolean controls whether or not cert-manager will be deployed and managed identity created for workloads to assume
// while this is the preferred way of managing certs, it is not required
const enableAzureDnsCertManagement = stackConfig.getBoolean("enableAzureDnsCertManagement") || false;
let azureDnsZoneName = undefined;
let azureDnsZoneResourceGroup = undefined;
if (enableAzureDnsCertManagement) {
    azureDnsZoneName = stackConfig.require("azureDnsZoneName");
    azureDnsZoneResourceGroup = stackConfig.require("azureDnsZoneResourceGroup");
}

export const config = {
    projectName,
    stackName,
    resourceNamePrefix,
    enableAzureDnsCertManagement,
    azureDnsZoneName,
    azureDnsZoneResourceGroup,
    baseTags: {
        project: projectName,
        stack: stackName,
    },
    resourceGroupName: <Output<string>>infrastructureStack.requireOutput("resourceGroupName"),
    adGroupId: <Output<string>>infrastructureStack.requireOutput("adGroupId"),
    adApplicationId: <Output<string>>infrastructureStack.requireOutput("adApplicationId"),
    adApplicationSecret: <Output<string>>infrastructureStack.requireOutput("adApplicationSecret"),
    subnetId: <Output<string>>infrastructureStack.requireOutput("networkSubnetId"),
};
