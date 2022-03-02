import * as pulumi from "@pulumi/pulumi";
import * as route53 from "@pulumi/aws/route53";

import { DnsRecordArgs } from "./types";

const namespace = "pulumi:DnsRecord";

export class ApplicationDns extends pulumi.ComponentResource {

    public readonly apiFqdn: pulumi.Output<string>;
    public readonly consoleFqdn: pulumi.Output<string>;

    constructor(name: string, args: DnsRecordArgs, opts?: pulumi.ComponentResourceOptions) {
        super(namespace, name, args, opts);

        const options = pulumi.mergeOptions(opts, { parent: this });

        // retrieve the hosted zone that will host our A records
        // zone should match the domain name.
        const zoneId = pulumi.output(route53.getZoneOutput({
            name: args.zoneName
        }, options)).apply(result => result.zoneId);

        const apiRecord = new route53.Record(`${name}-api-record`, {
            zoneId: zoneId,
            name: pulumi.interpolate `api.${args.domain}`,
            type: "A",
            aliases: [{
                name: args.apiLoadBalancerDnsName,
                zoneId: args.apiLoadBalancerZoneId,
                evaluateTargetHealth: true
            }]
        }, options);

        const consoleRecord = new route53.Record(`${name}-console-record`, {
            zoneId: zoneId,
            name: pulumi.interpolate `app.${args.domain}`,
            type: "A",
            aliases: [{
                name: args.consoleLoadBalancerDnsName,
                zoneId: args.consoleLoadBalancerZoneId,
                evaluateTargetHealth: true
            }]
        }, options);

        this.apiFqdn = apiRecord.fqdn;
        this.consoleFqdn = consoleRecord.fqdn;
    }
}