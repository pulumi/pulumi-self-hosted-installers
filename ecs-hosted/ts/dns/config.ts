import * as pulumi from "@pulumi/pulumi";
import { getCallerIdentity } from "@pulumi/aws";

const awsConfig = new pulumi.Config("aws");
const region = awsConfig.require("region");
const profile = awsConfig.get("profile");

const stackConfig = new pulumi.Config();
const projectName = pulumi.getProject();
const stackName = pulumi.getStack();

const enablePrivateLoadBalancerAndLimitEgress = stackConfig.getBoolean("enablePrivateLoadBalancerAndLimitEgress") || false;

// retrieve the application stack to grab info for our loadBalancers
const appStackReference = stackConfig.require("appStackReference");
const appStack = new pulumi.StackReference(appStackReference);

const route53ZoneName = appStack.getOutput("route53ZoneName");
const route53Subdomain = appStack.getOutput("route53Subdomain");
const publicLoadBalancerDnsName = appStack.getOutput("publicLoadBalancerDnsName");
const publicLoadBalancerZoneId = appStack.getOutput("publicLoadBalancerZoneId");
const internalLoadBalancerDnsName = appStack.getOutput("internalLoadBalancerDnsName");
const internalLoadBalancerZoneId = appStack.getOutput("internalLoadBalancerZoneId");

export const config = {
    region,
    profile,
    projectName,
    stackName,
    enablePrivateLoadBalancerAndLimitEgress,
    route53ZoneName,
    route53Subdomain,
    publicLoadBalancerDnsName,
    publicLoadBalancerZoneId,
    internalLoadBalancerDnsName,
    internalLoadBalancerZoneId,
    baseTags: {
        projectName,
        stackName
    }
};