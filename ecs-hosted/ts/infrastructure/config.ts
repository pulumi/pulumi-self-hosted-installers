import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export async function hydrateConfig() {

    const awsConfig = new pulumi.Config("aws");
    const region = awsConfig.require("region");
    
    const stackConfig = new pulumi.Config();
    const projectName = pulumi.getProject();
    const stackName = pulumi.getStack();

    const commonName = stackConfig.get("commonName") || "pulumiselfhosted";

    // Private (internal-only) mode, opt-in and off by default; same key as the application and dns stages. When true and
    // enableVpcEndpoints is true, the S3 gateway endpoint is associated with the private and isolated route tables and
    // KMS and CloudWatch Logs interface endpoints are added. publicSubnetIds becomes optional.
    const enablePrivateLoadBalancerAndLimitEgress = stackConfig.getBoolean("enablePrivateLoadBalancerAndLimitEgress") ?? false;

    // NOTE: We will assume all networking pieces are already created properly; this may change in the future to allow for networking to be created as part of this process.
    const vpcId = stackConfig.require("vpcId");
    // Not used by this stage; only passed through to the application stage, which needs it for internet-facing load
    // balancers. Optional in private mode, for a VPC without public subnets.
    const publicSubnetIds: string[] = enablePrivateLoadBalancerAndLimitEgress ?
        stackConfig.getObject<string[]>("publicSubnetIds") ?? [] :
        stackConfig.requireObject("publicSubnetIds");
    const privateSubnetIds: string[] = stackConfig.requireObject("privateSubnetIds");
    const isolatedSubnetIds: string[] = stackConfig.requireObject("isolatedSubnetIds");
    const numberDbReplicas = stackConfig.getNumber("numberDbReplicas") || 0;
    const dbInstanceType = stackConfig.get("dbInstanceType") || "db.t3.medium";
    const enableOpenSearch = stackConfig.getBoolean("enableOpenSearch") || false;
    const openSearchInstanceType = stackConfig.get("openSearchInstanceType") || "t3.medium.search";
    const openSearchInstanceCount = stackConfig.getNumber("openSearchInstanceCount") || 2;
    const openSearchDomainName = stackConfig.get("openSearchDomainName") || "pulumi";
    const openSearchDedicatedMasterCount = stackConfig.getNumber("openSearchDedicatedMasterCount") || 0;
    const enableVpcEndpoints = stackConfig.getBoolean("enableVpcEndpoints") ?? true;

    const callerId = await aws.getCallerIdentity();

    return  {
        region,
        accountId: callerId.accountId,
        projectName,
        commonName,
        enablePrivateLoadBalancerAndLimitEgress,
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
        enableVpcEndpoints,
        baseTags: {
            project: projectName,
            stack: stackName,
        },
    };
}

