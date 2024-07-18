import * as pulumi from "@pulumi/pulumi";
import * as ec2 from "@pulumi/aws/ec2";

import { hydrateConfig } from "./config";
import { Database } from "./database";
import { ResourceSearch } from "./resourceSearch";
import { updateEnvironment } from "../common/utils";

// network - we need:
// VPC, AZs, subnets (public and private)
// As of now, this should all be populated via config referencing previously created infrastructure.
// aurora database cluster

export = async () => {
    const config = await hydrateConfig();
    const database = new Database(`${config.commonName}-database`, {
        vpcId: config.vpcId,
        isolatedSubnetIds: config.isolatedSubnetIds,
        numberDbReplicas: config.numberDbReplicas,
        instanceType: config.dbInstanceType,
        region: config.region
    });

    // if needed, ingress can be narrowed down to ECS services, although all traffic should originate from within our VPC
    const endpointSecurityGroup = new ec2.SecurityGroup(`${config.commonName}-endpoint-sg`, {
        vpcId: config.vpcId,
        ingress: [{
            protocol: "-1",
            fromPort: 0,
            toPort: 0,
            cidrBlocks: ["0.0.0.0/0"]
        }]
    });

    // mount these endpoints to our VPC (Private Link) to allow services within our VPC to access AWS Managed Services without traversing public internet
    let prefixId: pulumi.Output<string>;
    try {
        const existingEndpoint = await ec2.getVpcEndpoint({
            vpcId: config.vpcId,
            serviceName: `com.amazonaws.${config.region}.s3`,
            filters: [{
                name: "vpc-endpoint-type",
                values: ["Gateway"]
            }]
        });

        pulumi.log.info(`VPC Endpoint ${config.commonName}-s3-endpoint already exists. Skipping creation.`);

        prefixId = pulumi.output(existingEndpoint.prefixListId);
    }  catch { 
        const s3Endpoint = new ec2.VpcEndpoint(`${config.commonName}-s3-endpoint`, {
            vpcId: config.vpcId,
            serviceName: `com.amazonaws.${config.region}.s3`,
        });

        prefixId = s3Endpoint.prefixListId;
    }

    // retrieve the prefix id and export for downstream SGs to use
    const s3PrivatePrefixList = ec2.getPrefixListOutput({
        prefixListId: prefixId,
    });

    await createEndpointIfNotExists(`${config.commonName}-ecr-dkr-endpoint`, `com.amazonaws.${config.region}.ecr.dkr`, config.vpcId, endpointSecurityGroup.id, config.privateSubnetIds);
    await createEndpointIfNotExists(`${config.commonName}-ecr-api-endpoint`, `com.amazonaws.${config.region}.ecr.api`, config.vpcId, endpointSecurityGroup.id, config.privateSubnetIds);
    await createEndpointIfNotExists(`${config.commonName}-secrets-manager-endpoint`, `com.amazonaws.${config.region}.secretsmanager`, config.vpcId, endpointSecurityGroup.id, config.privateSubnetIds);
    await createEndpointIfNotExists(`${config.commonName}-ssm-endpoint`, `com.amazonaws.${config.region}.ssm`, config.vpcId, endpointSecurityGroup.id, config.privateSubnetIds);

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
    });

    
    const outputs = {
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
        endpointSecurityGroupId: endpointSecurityGroup.id,
        s3EndpointPrefixId: s3PrivatePrefixList.id,
        opensearchDomain: resourceSearch.domain,
        opensearchEndpoint: resourceSearch.endpoint,
        opensearchUser: resourceSearch.user,
        opensearchPassword: resourceSearch.password,
    };

    return outputs;
}

async function createEndpointIfNotExists(name: string, serviceName: string, vpcId: string, securityGroupId: pulumi.Output<string>, subnetIds: string[]) {
    try {
        const endpoint = await ec2.getVpcEndpoint({
            vpcId: vpcId,
            serviceName: serviceName
        });

        if (endpoint) {
            pulumi.log.info(`VPC Endpoint ${name} already exists. Skipping creation.`);
            return;
        }
    } catch { }

    new ec2.VpcEndpoint(name, {
        vpcId: vpcId,
        serviceName: serviceName,
        vpcEndpointType: "Interface",
        privateDnsEnabled: true,
        securityGroupIds: [securityGroupId],
        subnetIds: subnetIds
    });
}