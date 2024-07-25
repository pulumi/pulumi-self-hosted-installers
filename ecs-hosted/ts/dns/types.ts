import * as pulumi from "@pulumi/pulumi";

export interface DnsRecordArgs {
    region: string,
    zoneName: string,
    domain: string,
    consoleLoadBalancerDnsName: string,
    consoleLoadBalancerZoneId: string, 
    apiLoadBalancerDnsName: string,
    apiLoadBalancerZoneId: string
}