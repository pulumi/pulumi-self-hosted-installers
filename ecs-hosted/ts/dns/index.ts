import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

import { ApplicationDns } from "./applicationDns";
import { config } from "./config";

const domain = pulumi
    .all([config.route53ZoneName, config.route53Subdomain])
    .apply(([zone, subdomain]) => {
        return subdomain && subdomain != "" ?
            `${subdomain}.${zone}` :
            zone;
    });


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