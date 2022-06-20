import * as pulumi from "@pulumi/pulumi";
import { Output } from "@pulumi/pulumi";

const stackConfig = new pulumi.Config();

const stackName1 = stackConfig.require("stackName1");
const infrastructureStack = new pulumi.StackReference(stackName1);

const projectName = pulumi.getProject();
const stackName = pulumi.getStack();

const commonName = "pulumi-selfhosted" || stackConfig.get("commonName");
const resourceNamePrefix = `${commonName}-${stackName}`;
const kubernetesVersion = "1.23.5" || stackConfig.get("kubernetesVersion");

export const config = {
    projectName,
    stackName,
    resourceNamePrefix,
    kubernetesVersion,

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
