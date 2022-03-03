import * as pulumi from "@pulumi/pulumi";
import * as s3 from "@pulumi/aws/s3";
import * as iam from "@pulumi/aws/iam";
import { getServiceAccount } from "@pulumi/aws/elb";

import { PulumiLoadBalancer } from "./pulumiLoadBalanacer";
import { LoadBalancerArgs } from "./types";
import { getIamPolicyArn } from "../../common/utils";

const namespace = "pulumi:trafficManager";

export class TrafficManager extends pulumi.ComponentResource {

    public readonly api: PulumiLoadBalancer;
    public readonly console: PulumiLoadBalancer;

    constructor(name: string, args: LoadBalancerArgs, opts?: pulumi.ComponentResourceOptions) {
        super(namespace, name, args, opts);

        const baseOptions = pulumi.mergeOptions(opts, { parent: this });

        // If access logs are enabled, create the bucket where they'll go.
        let accessLogsBucket: s3.Bucket | undefined;
        const prefix = "pulumi-elb";
        if (args.enableAccessLogs) {
            accessLogsBucket = this.createAccessLogBucket(args.region, name, prefix, args.accountId, baseOptions);
        }

        const apiLoadBalancerArgs: LoadBalancerArgs = {
            ...args,
            accessLogsBucket: accessLogsBucket,
            accessLogsPrefix: "nlb-api"
        };

        const consoleLoadBalancerArgs: LoadBalancerArgs = {
            ...args,
            accessLogsBucket: accessLogsBucket,
            accessLogsPrefix: "nlb-console"
        };

        this.api = new PulumiLoadBalancer(`${name}-api-lb`, apiLoadBalancerArgs, baseOptions);
        this.console = new PulumiLoadBalancer(`${name}-console-lb`, consoleLoadBalancerArgs, baseOptions);
    }

    createAccessLogBucket(region: string,name: string, prefix: string, accountId: pulumi.Output<string>, options: pulumi.ComponentResourceOptions): s3.Bucket {

        const accessLogsBucket = new s3.Bucket(`${name}-access-logs`, {}, pulumi.mergeOptions(options, { protect: true }));
        const serviceAccount = getServiceAccount();

        const policy = pulumi
            .all([accessLogsBucket.id, serviceAccount, accountId])
            .apply(([accessLogsBucketId, serviceAccount, accountId]) => {
                const accessBucketArn = getIamPolicyArn(region, `arn:aws:s3:::${accessLogsBucketId}/${prefix}/AWSLogs/${accountId}/*`);
                pulumi.log.debug(`constructed access bucket arn: ${accessBucketArn}`);

                const policy: iam.PolicyDocument = {
                    Version: "2012-10-17",
                    Statement: [
                        {
                            Effect: "Allow",
                            Principal: { AWS: serviceAccount.arn },
                            Action: "s3:PutObject",
                            Resource: accessBucketArn,
                        },
                    ],
                };

                return JSON.stringify(policy);
            });

        new s3.BucketPolicy("accessLogsBucketPolicy", {
            bucket: accessLogsBucket.id,
            policy: policy,
        }, options);

        return accessLogsBucket;
    }
}