import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { config } from "../config";

const openSearchDomain = new aws.opensearch.Domain(config.openSearchDomainName, {
    clusterConfig: {
        instanceType: config.openSearchInstanceType,
        instanceCount: config.openSearchInstanceCount,
    },
    ebsOptions: {
        ebsEnabled: true,
        volumeSize: 10,
        volumeType: "gp2",
    },
    domainEndpointOptions: {
        enforceHttps: true,
    },
    nodeToNodeEncryption: {
        enabled: true,
    },
    encryptAtRest: {
        enabled: true,
    },
    tags: {
        Name: config.openSearchDomainName,
    },
});

export const openSearchEndpoint = openSearchDomain.endpoint;
