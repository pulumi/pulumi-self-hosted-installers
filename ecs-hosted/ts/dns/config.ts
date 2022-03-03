import * as pulumi from "@pulumi/pulumi";

const awsConfig = new pulumi.Config("aws");
const region = awsConfig.require("region");

const stackConfig = new pulumi.Config();
const projectName = pulumi.getProject();
const stackName = pulumi.getStack();

// retrieve the application stack to grab info for our loadBalancers
const appStack = new pulumi.StackReference(stackConfig.require("appStackReference"));
const route53ZoneName = pulumi.output(appStack.requireOutputValue("route53ZoneName")).apply(r => <string>r);
const apiLoadBalancerDnsName = pulumi.output(appStack.requireOutputValue("apiLoadBalancerDnsName")).apply(r => <string>r);
const apiLoadBalancerZoneId = pulumi.output(appStack.requireOutputValue("apiLoadBalancerZoneId")).apply(r => <string>r);
const consoleLoadBalancerDnsName = pulumi.output(appStack.requireOutputValue("consoleLoadBalancerDnsName")).apply(r => <string>r);
const consoleLoadBalancerZoneId = pulumi.output(appStack.requireOutputValue("consoleLoadBalancerZoneId")).apply(r => <string>r);

const route53Subdomain = pulumi.output(appStack.getOutputValue("route53Subdomain")).apply(r => r ? <string>r : undefined);

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