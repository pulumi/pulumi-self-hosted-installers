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

const appDns = new ApplicationDns("pulumi-dns", {
    region: config.region,
    zoneName: config.route53ZoneName,
    domain: domain,
    apiLoadBalancerDnsName: config.apiLoadBalancerDnsName,
    apiLoadBalancerZoneId: config.apiLoadBalancerZoneId,
    consoleLoadBalancerDnsName: config.consoleLoadBalancerDnsName,
    consoleLoadBalancerZoneId: config.consoleLoadBalancerZoneId
});

export const apiUrl = appDns.apiFqdn;
export const consoleUrl = appDns.consoleFqdn;