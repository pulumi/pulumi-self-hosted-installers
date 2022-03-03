import * as pulumi from "@pulumi/pulumi";

export interface DnsRecordArgs {
    region: string,
    zoneName: pulumi.Output<string>,
    domain: pulumi.Output<string>,
    consoleLoadBalancerDnsName: pulumi.Output<string>,
    consoleLoadBalancerZoneId: pulumi.Output<string>, 
    apiLoadBalancerDnsName: pulumi.Output<string>,
    apiLoadBalancerZoneId: pulumi.Output<string>
}