import { Config, Output, StackReference, getProject, getStack } from "@pulumi/pulumi";

const stackConfig = new Config();

const stackName1 = stackConfig.require("stackName1");
const infrastructureStack = new StackReference(stackName1);

const projectName = getProject();
const stackName = getStack();

const commonName = "pulumi-selfhosted" || stackConfig.get("commonName");
const resourceNamePrefix = `${commonName}-${stackName}`;

export const config = {
    projectName,
    stackName,
    resourceNamePrefix,

    baseTags: {
        project: projectName,
        stack: stackName,
    },
    
    resourceGroupName: <Output<string>>infrastructureStack.requireOutput("resourceGroupName"),
    adGroupId: <Output<string>>infrastructureStack.requireOutput("adGroupId"),
    adApplicationId: <Output<string>>infrastructureStack.requireOutput("adApplicationId"),
    adApplicationSecret: <Output<string>>infrastructureStack.requireOutput("adApplicationSecret"),
    aksSubnetId: <Output<string>>infrastructureStack.requireOutput("aksSubnetId"),
};
