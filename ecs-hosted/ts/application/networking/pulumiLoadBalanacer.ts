import * as pulumi from "@pulumi/pulumi";
import * as lb from "@pulumi/aws/lb";
import * as ec2 from "@pulumi/aws/ec2";

import { LoadBalancerArgs } from "./types";

const namespace = "pulumi:loadBalancer";

export class PulumiLoadBalancer extends pulumi.ComponentResource {

    public readonly loadBalancer: lb.LoadBalancer;
    public readonly httpsListener: lb.Listener;
    public readonly httpListener: lb.Listener;
    public readonly securityGroup: ec2.SecurityGroup;

    private readonly baseOptions: pulumi.ComponentResourceOptions;

    constructor(name: string, args: LoadBalancerArgs, opts?: pulumi.ComponentResourceOptions) {
        super(namespace, name, args, opts);

        this.baseOptions = pulumi.mergeOptions(opts, { parent: this });

        const internalLb = args.internalLb ? args.internalLb : false;
        const idleTimeout = args.idleTimeout ? args.idleTimeout : 120;
        const prefix = "nlb";

        const ingressCidrBlocks = args.whiteListCidrBlocks ? args.whiteListCidrBlocks : ["0.0.0.0/0"];

        this.securityGroup = new ec2.SecurityGroup(`${name}-lb-sg`, {
            description: "ELB Security Group",
            vpcId: args.vpcId,
            ingress: [
                {
                    fromPort: 80,
                    toPort: 80,
                    protocol: "TCP",
                    cidrBlocks: ingressCidrBlocks
                },
                {
                    fromPort: 443,
                    toPort: 443,
                    protocol: "TCP",
                    cidrBlocks: ingressCidrBlocks
                }
            ],
        }, this.baseOptions);

        this.loadBalancer = new lb.LoadBalancer(`${name}-lb`, {
            loadBalancerType: "application",
            internal: internalLb,
            securityGroups: [this.securityGroup.id],
            subnets: args.publicSubnetIds,
            idleTimeout: idleTimeout,
            accessLogs: args.accessLogsBucket && {
                enabled: true,
                bucket: args.accessLogsBucket.id,
                prefix: prefix
            }
        }, pulumi.mergeOptions(this.baseOptions, { dependsOn: args.accessLogsBucket ? [args.accessLogsBucket] : [] }));

        const emptyTargetGroup = new lb.TargetGroup(`${name}-tg`, {
            port: 80,
            protocol: "HTTP",
            vpcId: args.vpcId
        }, this.baseOptions);

        this.httpListener = new lb.Listener(`${name}-http-listener`, {
            loadBalancerArn: this.loadBalancer.arn,
            port: 80,
            protocol: "HTTP",
            defaultActions: [{
                targetGroupArn: emptyTargetGroup.arn,
                type: "fixed-response",
                fixedResponse: {
                    statusCode: "204",
                    contentType: "text/plain"
                }
            }]
        }, this.baseOptions);

        this.httpsListener = new lb.Listener(`${name}-https-listener`, {
            loadBalancerArn: this.loadBalancer.arn,
            port: 443,
            protocol: "HTTPS",
            certificateArn: args.certificateArn,
            // Require the use of SSL/TLS v1.2 or higher to connect.
            sslPolicy: "ELBSecurityPolicy-TLS-1-2-2017-01",
            defaultActions: [{
                targetGroupArn: emptyTargetGroup.arn,
                type: "fixed-response",
                fixedResponse: {
                    statusCode: "204",
                    contentType: "text/plain",
                },
            }],
        }, this.baseOptions);
    }
}