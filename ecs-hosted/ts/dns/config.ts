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

const route53Subdomain = stackConfig.require("route53Subdomain");

// Private mode: the records go into a Route 53 private hosted zone and point at the internal ALBs.
const enablePrivateLoadBalancerAndLimitEgress = stackConfig.getBoolean("enablePrivateLoadBalancerAndLimitEgress") ?? false;
// Optional, private mode only: picks the private hosted zone associated with this VPC when several share the zone name.
const vpcId = stackConfig.get("vpcId");
// Create no records, for DNS managed outside Route 53. The stack then outputs the load balancer DNS names to CNAME to.
const skipDnsRecords = stackConfig.getBoolean("skipDnsRecords") ?? false;

export const config = {
    region,
    enablePrivateLoadBalancerAndLimitEgress,
    vpcId,
    skipDnsRecords,
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