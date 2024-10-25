import * as pulumi from "@pulumi/pulumi";
import * as ec2 from "@pulumi/aws/ec2";
import { Provider as AwsProvider, Region } from "@pulumi/aws";
import { Provider as RandomProvider } from "@pulumi/random";
import { Provider as TimeProvider } from "@pulumiverse/time";

import { hydrateConfig } from "./config";
import { Database } from "./database";
import { ResourceSearch } from "./resourceSearch";

// network - we need:
// VPC, AZs, subnets (public and private)
// As of now, this should all be populated via config referencing previously created infrastructure.
// aurora database cluster

export = async () => {
    const config = await hydrateConfig();
    const providers = createProviders(config.region);

    const database = new Database(`${config.commonName}-database`, {
        vpcId: config.vpcId,
        isolatedSubnetIds: config.isolatedSubnetIds,
        numberDbReplicas: config.numberDbReplicas,
        instanceType: config.dbInstanceType,
        region: config.region
    }, {
        providers
    });

    let endpointSgId: pulumi.Output<string> | undefined;
    let s3PrefixListId: pulumi.Output<string> | undefined;
    if (config.enableVpcEndpoints) {
        // retrieve the prefix id and export for downstream SGs to use
        const endpoints = createVpcEndpoints(config, providers.aws);
        endpointSgId = endpoints.endpointSecurityGroup.id;
        s3PrefixListId = endpoints.s3PrivatePrefixList.id;
    }

    const resourceSearch = new ResourceSearch(`${config.commonName}-ressearch`, {
        deployOpenSearch: config.enableOpenSearch,
        accountId: config.accountId,
        region: config.region,
        domainNname: config.openSearchDomainName,
        instanceType: config.openSearchInstanceType,
        instanceCount: config.openSearchInstanceCount,
        vpcId: config.vpcId,
        subnetIds: config.privateSubnetIds,
        dedicatedMasterCount: config.openSearchDedicatedMasterCount
    }, {
        providers
    });

    return {
        vpcId: pulumi.output(config.vpcId),
        publicSubnetIds: pulumi.output(config.publicSubnetIds),
        privateSubnetIds: pulumi.output(config.privateSubnetIds),
        isolatedSubnetIds: pulumi.output(config.isolatedSubnetIds),
        dbClusterEndpoint: database.dbClusterEndpoint,
        dbPort: database.dbPort,
        dbName: database.dbName,
        dbUsername: database.dbUsername,
        dbPassword: pulumi.secret(database.dbPassword),
        dbSecurityGroupId: database.dbSecurityGroupId,
        endpointSecurityGroupId: endpointSgId,
        s3EndpointPrefixId: s3PrefixListId,
        opensearchDomainName: resourceSearch.domainName,
        opensearchEndpoint: resourceSearch.endpoint,
        opensearchUser: resourceSearch.user,
        opensearchPassword: resourceSearch.password,
    };
}

function createEndpoint(args: EndpointArgs): ec2.VpcEndpoint {
    const { name, serviceName, vpcId, securityGroupId, subnetIds, endpointType, options } = args;

    const endpoinArgs = endpointType == "Gateway" ? {
        vpcId: vpcId,
        serviceName: serviceName,
        vpcEndpointType: endpointType,
    } : {
        vpcId: vpcId,
        serviceName: serviceName,
        vpcEndpointType: endpointType!,
        privateDnsEnabled: true,
        securityGroupIds: [securityGroupId!],
        subnetIds: subnetIds
    }

    return new ec2.VpcEndpoint(name, endpoinArgs, options);
}

function createProviders(region: string) {
    return {
        aws: new AwsProvider("aws", {
            region: <Region>region
        }),
        random: new RandomProvider("random"),
        time: new TimeProvider("time")
    };
}

function createVpcEndpoints(config: any, awsProvider: AwsProvider) {
    // if needed, ingress can be narrowed down to ECS services, although all traffic should originate from within our VPC
    const endpointSecurityGroup = new ec2.SecurityGroup(`${config.commonName}-endpoint-sg`, {
        vpcId: config.vpcId,
        ingress: [{
            protocol: "-1",
            fromPort: 0,
            toPort: 0,
            cidrBlocks: ["0.0.0.0/0"]
        }]
    }, {
        provider: awsProvider
    });

    const s3Endpoint = createEndpoint({
        name: `${config.commonName}-s3-endpoint`,
        serviceName: `com.amazonaws.${config.region}.s3`,
        endpointType: "Gateway",
        vpcId: config.vpcId,
        options: {
            provider: awsProvider
        }
    });

    // retrieve the prefix id and export for downstream SGs to use
    const s3PrivatePrefixList = ec2.getPrefixListOutput({
        prefixListId: s3Endpoint.prefixListId,
    });

    const endpointArgs = {
        vpcId: config.vpcId,
        securityGroupId: endpointSecurityGroup.id,
        subnetIds: config.privateSubnetIds,
        endpointType: "Interface",
        options: {
            provider: awsProvider
        }
    };

    createEndpoint({
        ...endpointArgs,
        name: `${config.commonName}-ecr-dkr-endpoint`,
        serviceName: `com.amazonaws.${config.region}.ecr.dkr`
    });

    createEndpoint({
        ...endpointArgs,
        name: `${config.commonName}-ecr-api-endpoint`,
        serviceName: `com.amazonaws.${config.region}.ecr.api`
    });

    createEndpoint({
        ...endpointArgs,
        name: `${config.commonName}-secrets-manager-endpoint`,
        serviceName: `com.amazonaws.${config.region}.secretsmanager`
    });

    createEndpoint({
        ...endpointArgs,
        name: `${config.commonName}-ssm-endpoint`,
        serviceName: `com.amazonaws.${config.region}.ssm`,
    });

    return {
        s3PrivatePrefixList,
        endpointSecurityGroup
    }
}

interface EndpointArgs {
    name: string;
    serviceName: string;
    vpcId: string;
    securityGroupId?: pulumi.Output<string>;
    subnetIds?: string[];
    endpointType?: string;
    options: pulumi.ResourceOptions
}