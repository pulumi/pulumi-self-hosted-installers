import * as pulumi from "@pulumi/pulumi";

const awsConfig = new pulumi.Config("aws");
const region = awsConfig.require("region");

const stackConfig = new pulumi.Config();
const projectName = pulumi.getProject();
const stackName = pulumi.getStack();

// retrieve the application stack to grab info for our loadBalancers
// const appStack = new pulumi.StackReference(stackConfig.require("appStackReference"));
const route53ZoneName = stackConfig.require("route53ZoneName");
const apiLoadBalancerDnsName = stackConfig.require("apiLoadBalancerDnsName");
const apiLoadBalancerZoneId = stackConfig.require("apiLoadBalancerZoneId");
const consoleLoadBalancerDnsName = stackConfig.require("consoleLoadBalancerDnsName");
const consoleLoadBalancerZoneId = stackConfig.require("consoleLoadBalancerZoneId");

const route53Subdomain = stackConfig.get("route53Subdomain");

export const config = {
    region,
    route53ZoneName,
    route53Subdomain,
    apiLoadBalancerDnsName,
    apiLoadBalancerZoneId,
    consoleLoadBalancerDnsName,
    consoleLoadBalancerZoneId,
    baseTags: {
        projectName,
        stackName
    }
};