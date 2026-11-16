import * as pulumi from "@pulumi/pulumi";

export interface DnsRecordArgs {
    region: string,
    zoneName: string,
    // look up a private hosted zone instead of a public one
    privateZone?: boolean,
    // private zones only: the VPC the zone is associated with
    vpcId?: string,
    domain: string,
    consoleLoadBalancerDnsName: string,
    consoleLoadBalancerZoneId: string, 
    apiLoadBalancerDnsName: string,
    apiLoadBalancerZoneId: string
}