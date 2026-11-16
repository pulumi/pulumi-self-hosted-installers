import * as pulumi from "@pulumi/pulumi";
import { ApplicationDns } from "./applicationDns";
import { config } from "./config";

const domain = config.route53Subdomain && config.route53Subdomain != "" ?
    `${config.route53Subdomain}.${config.route53ZoneName}` :
    config.route53ZoneName;

// const domain = pulumi
//     .all([config.route53ZoneName, config.route53Subdomain])
//     .apply(([zone, subdomain]) => {
//         return subdomain && subdomain != "" ?
//             `${subdomain}.${zone}` :
//             zone;
//     });

// skipDnsRecords: DNS is managed outside Route 53; no zone lookup, no records
const appDns = config.skipDnsRecords ? undefined : new ApplicationDns("pulumi-dns", {
    region: config.region,
    zoneName: config.route53ZoneName,
    privateZone: config.enablePrivateLoadBalancerAndLimitEgress,
    vpcId: config.vpcId,
    domain: domain,
    apiLoadBalancerDnsName: config.apiLoadBalancerDnsName,
    apiLoadBalancerZoneId: config.apiLoadBalancerZoneId,
    consoleLoadBalancerDnsName: config.consoleLoadBalancerDnsName,
    consoleLoadBalancerZoneId: config.consoleLoadBalancerZoneId
});

// Stack outputs. Built as an object so the skipDnsRecords-only outputs are absent, not undefined, otherwise.
export = appDns ? {
    apiUrl: pulumi.interpolate`https://${appDns.apiFqdn}`,
    consoleUrl: pulumi.interpolate`https://${appDns.consoleFqdn}`,
} : {
    apiUrl: `https://api.${domain}`,
    consoleUrl: `https://app.${domain}`,
    // point CNAME records for api.<domain> and app.<domain> at these load balancer DNS names
    apiLoadBalancerDnsName: config.apiLoadBalancerDnsName,
    consoleLoadBalancerDnsName: config.consoleLoadBalancerDnsName,
};