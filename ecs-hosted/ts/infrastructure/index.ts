import * as pulumi from "@pulumi/pulumi";
import * as ec2 from "@pulumi/aws/ec2";

import { config } from "./config";
import { Database } from "./database";

// network - we need:
// VPC, AZs, subnets (public and private)
// As of now, this should all be populated via config referencing previously created infrastructure.

// aurora database cluster
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
new ec2.VpcEndpoint(`${config.commonName}-s3-endpoint`, {
    vpcId: config.vpcId,
    serviceName: `com.amazonaws.${config.region}.s3`,
});

new ec2.VpcEndpoint(`${config.commonName}-ecr-dkr-endpoint`, {
    vpcId: config.vpcId,
    serviceName: `com.amazonaws.${config.region}.ecr.dkr`,
    vpcEndpointType: "Interface",
    privateDnsEnabled: true,
    securityGroupIds: [endpointSecurityGroup.id],
    subnetIds: config.publicSubnetIds
});

new ec2.VpcEndpoint(`${config.commonName}-ecr-api-endpoint`, {
    vpcId: config.vpcId,
    serviceName: `com.amazonaws.${config.region}.ecr.api`,
    vpcEndpointType: "Interface",
    privateDnsEnabled: true,
    securityGroupIds: [endpointSecurityGroup.id],
    subnetIds: config.publicSubnetIds
});

new ec2.VpcEndpoint(`${config.commonName}-secrets-manager-endpoint`, {
    vpcId: config.vpcId,
    serviceName: `com.amazonaws.${config.region}.secretsmanager`,
    vpcEndpointType: "Interface",
    privateDnsEnabled: true,
    securityGroupIds: [endpointSecurityGroup.id],
    subnetIds: config.publicSubnetIds
});

new ec2.VpcEndpoint(`${config.commonName}-cloudwatch-endpoint`, {
    vpcId: config.vpcId,
    serviceName: `com.amazonaws.${config.region}.logs`,
    vpcEndpointType: "Interface",
    privateDnsEnabled: true,
    securityGroupIds: [endpointSecurityGroup.id],
    subnetIds: config.publicSubnetIds
});

export const vpcId = pulumi.output(config.vpcId);
export const publicSubnetIds = pulumi.output(config.publicSubnetIds);
export const privateSubnetIds = pulumi.output(config.privateSubnetIds);
export const isolatedSubnetIds = pulumi.output(config.isolatedSubnetIds);
export const dbClusterEndpoint = database.dbClusterEndpoint;
export const dbPort = database.dbPort;
export const dbName  = database.dbName;
export const dbUsername = database.dbUsername;
export const dbPassword = pulumi.secret(database.dbPassword);
export const dbSecurityGroupId = database.dbSecurityGroupId;
export const endpointSecurityGroupId = endpointSecurityGroup.id;