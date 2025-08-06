import * as pulumi from "@pulumi/pulumi";
import * as lb from "@pulumi/aws/lb";

import { LoadBalancerArgs } from "./types";

const namespace = "pulumi:internalLoadBalancer";

export class PulumiInternalLoadBalancer extends pulumi.ComponentResource {

    public readonly loadBalancer: lb.LoadBalancer;

    private readonly baseOptions: pulumi.ComponentResourceOptions;

    constructor(name: string, args: LoadBalancerArgs, opts?: pulumi.ComponentResourceOptions) {
        super(namespace, name, args, opts);

        this.baseOptions = pulumi.mergeOptions(opts, { parent: this, deleteBeforeReplace: true });

        const idleTimeout = args.idleTimeout ? args.idleTimeout : 120;

        this.loadBalancer = new lb.LoadBalancer(`${name}-lb`, {
            loadBalancerType: "network",
            internal: true,
            subnets: args.privateSubnetIds,
            idleTimeout: idleTimeout,
            ipAddressType: "ipv4",
        }, this.baseOptions);
    }

    createListener(name: string, tgArn: pulumi.Output<string>, certArn?: string, opts?: pulumi.ResourceOption[]): lb.Listener {
        const listenerArgs: lb.ListenerArgs = {
            loadBalancerArn: this.loadBalancer.arn,
            port: 80,
            protocol: "TCP",
            defaultActions: [{
                targetGroupArn: tgArn,
                type: "forward",
            }],
        };

        if (certArn) {
            listenerArgs.certificateArn = certArn;
            listenerArgs.sslPolicy = "ELBSecurityPolicy-TLS-1-2-2017-01";
            listenerArgs.protocol = "TLS";
            listenerArgs.port = 443;
        }

        const listOpts = pulumi.mergeOptions(this.baseOptions, { deleteBeforeReplace: true }, ...(opts || []));
        
        return new lb.Listener(`${name}-listener`, listenerArgs, listOpts);
    }
}