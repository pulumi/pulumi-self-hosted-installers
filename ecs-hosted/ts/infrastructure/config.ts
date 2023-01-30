import * as pulumi from "@pulumi/pulumi";

const awsConfig = new pulumi.Config("aws");
const region = awsConfig.require("region");

const stackConfig = new pulumi.Config();

const projectName = pulumi.getProject();
const stackName = pulumi.getStack();

const commonName = stackConfig.get("commonName") || "pulumiselfhosted";

// NOTE: We will assume all networking pieces are already created properly; this may change in the future to allow for networking to be created as part of this process.
const vpcId = stackConfig.require("vpcId");
const publicSubnetIds: string[] = stackConfig.requireObject("publicSubnetIds");
const privateSubnetIds: string[] = stackConfig.requireObject("privateSubnetIds");
const isolatedSubnetIds: string[] = stackConfig.requireObject("isolatedSubnetIds");
const numberDbReplicas = stackConfig.getNumber("numberDbReplicas") || 0;
const dbInstanceType = stackConfig.get("dbInstanceType") || "db.t3.medium";

export const config = {
    region,
    projectName,
    commonName,
    vpcId,
    numberDbReplicas,
    publicSubnetIds,
    privateSubnetIds,
    isolatedSubnetIds,
    dbInstanceType,
    baseTags: {
        project: projectName,
        stack: stackName,
    },
};
