import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export async function hydrateConfig() {

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
    const enableOpenSearch = stackConfig.getBoolean("enableOpenSearch") || false;
    const openSearchInstanceType = stackConfig.get("openSearchInstanceType") || "t3.medium.search";
    const openSearchInstanceCount = stackConfig.getNumber("openSearchInstanceCount") || 2;
    const openSearchDomainName = stackConfig.get("openSearchDomainName") || "pulumi";
    const openSearchDedicatedMasterCount = stackConfig.getNumber("openSearchDedicatedMasterCount") || 0;

    const callerId = await aws.getCallerIdentity();

    return  {
        region,
        accountId: callerId.accountId,
        projectName,
        commonName,
        vpcId,
        numberDbReplicas,
        publicSubnetIds,
        privateSubnetIds,
        isolatedSubnetIds,
        dbInstanceType,
        enableOpenSearch,
        openSearchInstanceType,
        openSearchInstanceCount,
        openSearchDomainName,
        openSearchDedicatedMasterCount,
        baseTags: {
            project: projectName,
            stack: stackName,
        },
    };
}

