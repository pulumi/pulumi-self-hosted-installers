import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { config } from "../config";

export class Insights extends pulumi.ComponentResource {
    constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
        super("x:application:insights", name, {}, opts);

        (async () => {
            const callerIdentity = await aws.getCallerIdentity({});
            const openSearchDomain = new aws.opensearch.Domain(`${name}-opensearch`, {
                clusterConfig: {
                    instanceType: config.insights.openSearchInstanceType,
                    instanceCount: config.insights.openSearchInstanceCount,
                },
                ebsOptions: {
                    ebsEnabled: true,
                    volumeSize: config.insights.openSearchVolumeSize,
                },
                accessPolicies: JSON.stringify({
                    Version: "2012-10-17",
                    Statement: [
                        {
                            Effect: "Allow",
                            Principal: "*",
                            Action: "es:*",
                            Resource: pulumi.interpolate`arn:aws:es:${aws.config.region}:${(await callerIdentity).accountId}:domain/${name}-opensearch/*`,
                        },
                    ],
                }),
                vpcOptions: {
                    securityGroupIds: [config.endpointSecurityGroupId],
                    subnetIds: config.privateSubnetIds,
                },
            }, { parent: this });

            const openSearchDashboards = new aws.ecs.Service(`${name}-opensearch-dashboards`, {
                cluster: config.ecsClusterArn,
                taskDefinition: new aws.ecs.TaskDefinition(`${name}-opensearch-dashboards-task`, {
                    family: `${name}-opensearch-dashboards`,
                    containerDefinitions: JSON.stringify([{
                        name: "opensearch-dashboards",
                        image: "opensearchproject/opensearch-dashboards:2.11.1",
                        portMappings: [{ containerPort: 5601 }],
                        environment: [
                            { name: "OPENSEARCH_HOSTS", value: `["http://${openSearchDomain.endpoint}"]` },
                        ],
                    }]),
                    requiresCompatibilities: ["FARGATE"],
                    networkMode: "awsvpc",
                    cpu: "512",
                    memory: "1024",
                }).arn,
                desiredCount: 1,
                launchType: "FARGATE",
                networkConfiguration: {
                    subnets: config.privateSubnetIds,
                    securityGroups: [config.endpointSecurityGroupId],
                },
            }, { parent: this });
        })();
    }
}
