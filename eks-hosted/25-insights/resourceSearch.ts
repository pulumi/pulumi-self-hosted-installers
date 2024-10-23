import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as time from "@pulumiverse/time";
import * as random from "@pulumi/random";

export interface ResourceSearchArgs {
    domainNname: string;
    deployOpenSearch: boolean;
    instanceType: string;
    instanceCount: number;
    vpcId: pulumi.Output<string>;
    subnetIds: pulumi.Output<string[]>; 
    dedicatedMasterCount?: number;
}

const namespace = "pulumi:openSearch";

export class ResourceSearch extends pulumi.ComponentResource {

    public readonly user: pulumi.Output<string> | undefined;
    public readonly password: pulumi.Output<string> | undefined;
    public readonly endpoint: pulumi.Output<string> | undefined;
    public readonly domain: pulumi.Output<string> | undefined;

    constructor(name: string, args: ResourceSearchArgs, opts?: pulumi.ComponentResourceOptions) {
        super(namespace, name, args, opts);

        if (!args.deployOpenSearch) {
            return;
        }

        // instance counts cannot be less than the amount of subnets provided
        validateNetworkConfiguration(args.subnetIds, args.instanceCount);

        const options = { parent: this };
        const openSearchOptions = pulumi.mergeOptions(options, {
            deleteBeforeReplace: true,
            customTimeouts: {
                create: "5h",
            }
        });

        const un = "admin";
        const pw = new random.RandomPassword(`${name}-pw`, {
            length: 16,
        }, options);

        const offset = new time.Offset(`${name}-maintenancealert`, {
            offsetDays: 7
        }, options);

        const sg = new aws.ec2.SecurityGroup(name, {
            vpcId: args.vpcId,
            ingress: [{
                protocol: "tcp",
                fromPort: 443,
                toPort: 443,
                cidrBlocks: ["0.0.0.0/0"],
            }]
        }, options);

        const lg = createLogGroup(name, options);

        const autoTuneOptions = args.instanceType.startsWith("t2") || args.instanceType.startsWith("t3") ?
            undefined : {
                desiredState: "ENABLED",
                rollbackOnDisable: "NO_ROLLBACK",
                maintenanceSchedules: [{
                    startAt: offset.rfc3339,
                    cronExpressionForRecurrence: "cron(0 18 ? * MON-FRI *)",
                    duration: {
                        unit: "HOURS",
                        value: 1,
                    }
                }],
            };

        const domain = new aws.opensearch.Domain("pulumi-res-search", {
            domainName: name,
            engineVersion: "OpenSearch_2.13",
            clusterConfig: {
                instanceType: args.instanceType,
                instanceCount: args.instanceCount,
                dedicatedMasterEnabled: args.dedicatedMasterCount !== undefined && args.dedicatedMasterCount > 0,
                zoneAwarenessEnabled: args.subnetIds.apply(subnetIds => subnetIds.length > 1),
                zoneAwarenessConfig: {
                    availabilityZoneCount: args.subnetIds.apply(subnetIds => subnetIds.length)
                },
            },
            ebsOptions: {
                ebsEnabled: true,
                volumeSize: 10,
                volumeType: "gp2",
            },
            vpcOptions: {
                subnetIds: args.subnetIds,
                securityGroupIds: [sg.id],
            },
            encryptAtRest: {
                enabled: true,
            },
            nodeToNodeEncryption: {
                enabled: true,
            },
            domainEndpointOptions: {
                enforceHttps: true,
                tlsSecurityPolicy: "Policy-Min-TLS-1-2-2019-07",
            },
            advancedSecurityOptions: {
                enabled: true,
                internalUserDatabaseEnabled: true,
                masterUserOptions: {
                    masterUserName: un,
                    masterUserPassword: pw.result,
                },
            },
            autoTuneOptions: autoTuneOptions,
            logPublishingOptions: [
                {
                    cloudwatchLogGroupArn: lg.arn,
                    logType: "INDEX_SLOW_LOGS",
                },
                {
                    cloudwatchLogGroupArn: lg.arn,
                    logType: "SEARCH_SLOW_LOGS",
                },
                {
                    cloudwatchLogGroupArn: lg.arn,
                    logType: "ES_APPLICATION_LOGS",
                },
                {
                    cloudwatchLogGroupArn: lg.arn,
                    logType: "AUDIT_LOGS",
                },
            ],
        }, openSearchOptions);

        this.user = pulumi.output(un);
        this.password = pw.result;
        this.domain = domain.endpoint;
        this.endpoint = pulumi.interpolate`https://${domain.endpoint}`;
    }
}

function validateNetworkConfiguration(subnetIds: pulumi.Output<string[]>, instanceCount: number) {
    subnetIds.apply(subnetIds => {
        if (subnetIds.length > instanceCount) {
            throw new Error("number of subnets must be less than or equal to the number of instances");
        }
    })
}

function createLogGroup(name: string, opts: pulumi.ComponentResourceOptions) {
    const lg = new aws.cloudwatch.LogGroup(name, {}, opts);

    new aws.cloudwatch.LogResourcePolicy(`${name}-search-log-policy`, {
        policyName: pulumi.interpolate`${name}-search-log-policy`,
        policyDocument: pulumi.jsonStringify({
            Version: "2012-10-17",
            Statement: [{
                Effect: "Allow",
                Principal: {
                    Service: "es.amazonaws.com",
                },
                Action: [
                    "logs:PutLogEvents",
                    "logs:PutLogEventsBatch",
                    "logs:CreateLogStream"
                ],
                Resource: "arn:aws:logs:*",
            }],
        }),
    }, opts);

    return lg;
}