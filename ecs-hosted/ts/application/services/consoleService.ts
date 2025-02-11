import * as pulumi from "@pulumi/pulumi";
import { ec2 } from "@pulumi/aws/";
import { input } from "@pulumi/aws/types";

import { ContainerService } from "./containerService";
import { TaskDefinitionArgs, ConsoleServiceArgs } from "./types";
import { buildECRImageTag } from "../utils";
import { LogType, LogDriver } from "../logs/types";
import { LogFactory } from "../logs/logFactory";

const namespace = "pulumi:consoleService";
const consolePort = 3000;
const consoleContainerName = "pulumi-console";

/*
Represents the base of the Pulumi Console.
Comprised of an ECS Cluster/Service and all required pieces (tasks, containers, etc)
Tasks DO NOT need access to Aurora DB and should NOT access S3 buckets
*/
export class ConsoleService extends pulumi.ComponentResource {

    private readonly consoleService: ContainerService;
    private readonly baseArgs: ConsoleServiceArgs;
    private readonly options: pulumi.ComponentResourceOptions;
    private readonly consoleImage: string;

    constructor(name: string, args: ConsoleServiceArgs, opts?: pulumi.ComponentResourceOptions) {
        super(namespace, name, args, opts);

        this.baseArgs = args;
        this.options = pulumi.mergeOptions(opts, { parent: this });
        this.consoleImage = `pulumi/console:${this.baseArgs.imageTag}`;

        const { trafficManager } = args;

        // specify the health check to be utilized with Pulumi Console
        const healthCheck: input.lb.TargetGroupHealthCheck = {
            interval: 10,  // seconds
            path: "/",
            protocol: "HTTP",
            matcher: "200-299",
            timeout: 5,  // seconds
            healthyThreshold: 5,
            unhealthyThreshold: 2,
        };

        // listener conditions allow ALB to route appropriate traffic to Pulumi Console
        // traffic should match app.pulumi.whatever as well as pulumi.whatever
        const listenerConditions = [
            {
                hostHeader: {
                    values: [
                        args.dns.consoleUrl, 
                        trafficManager.console.loadBalancer.dnsName, 
                        this.baseArgs.dns.rootDomain
                    ]
                }
            },
            {
                pathPattern: {
                    values: ["/*"]
                }
            }
        ];

        // Pulumi Console should never communicate directly with Pulumi API. Traffic should always route through ALB (public)
        const taskArgs = this.constructTaskArgs();
        this.consoleService = new ContainerService(`${name}`, {
            region: args.region,
            accountId: args.accountId,
            cluster: args.cluster,
            healthCheck: healthCheck,
            listenerConditions: listenerConditions,
            listenerPriority: 1,
            privateSubnetIds: args.privateSubnetIds,
            pulumiLoadBalancer: trafficManager.console,
            targetPort: consolePort,
            taskDefinitionArgs: taskArgs,
            vpcId: args.vpcId,
        }, this.options);

        new ec2.SecurityGroupRule(`${name}-lb-to-console-rule`, {
            type: "egress",
            securityGroupId: trafficManager.console.securityGroup.id,
            sourceSecurityGroupId: this.consoleService.securityGroup.id,
            fromPort: 3000,
            toPort: 3000,
            protocol: "TCP"
        }, this.options);
    }

    constructTaskArgs(): TaskDefinitionArgs {
        // TODO: we need to be aware of task vs container cpu/memory if more than 1 container will be present in task.
        //       Eg- using a sidecar pattern, fluent bit can ship logs to different locations, but now we have multiple consumers of resources. 
        const taskMemory = this.baseArgs.taskMemory ? this.baseArgs.taskMemory : 512;
        const taskCpu = this.baseArgs.taskCpu ? this.baseArgs.taskCpu : 256;
        
        const containerMemoryReservation = this.baseArgs.containerMemoryReservation ? this.baseArgs.containerMemoryReservation : 128;
        const containerCpu = this.baseArgs.containerCpu ? this.baseArgs.containerCpu : taskCpu;

        // set the desired state (count of tasks) for our ECS service
        const desiredNumberTasks = this.baseArgs.numberDesiredTasks ? this.baseArgs.numberDesiredTasks : 3;

        // from configuration, build the type of logger requested by the caller; awslogs, awsfirelens, splunk...
        let logDriver: LogDriver | undefined;
        if (this.baseArgs.logType != undefined) {

            logDriver = new LogFactory().buildLogDriver(
                this.baseArgs.logType,
                "console",
                this.baseArgs.logArgs,
                this.options);
        }

        // JSON will be definition provided to ECS for Console containers
        // Fully qualified ECR tag will be built for `image` property below
        const containerDefinitions = pulumi
            .all([
                this.baseArgs.accountId, 
                logDriver?.outputs, 
                this.baseArgs.trafficManager.console.loadBalancer.dnsName, 
                this.baseArgs.ecrRepoAccountId])
            .apply(([
                accountId, 
                logOutputs, 
                loadBalancerUrl, 
                ecrRepoAccountId]) => {

                const ecrAccountId = ecrRepoAccountId && ecrRepoAccountId !== "" ? ecrRepoAccountId : accountId;

                return JSON.stringify([{
                    name: consoleContainerName,
                    image: buildECRImageTag(ecrAccountId, this.baseArgs.region, this.consoleImage),
                    cpu: containerCpu,
                    memoryReservation: containerMemoryReservation,
                    portmappings: [{
                        containerPort: consolePort
                    }],
                    environment: this.constructEnvironmentVariables(loadBalancerUrl),
                    secret: [],
                    logConfiguration: logDriver && {
                        logDriver: LogType[logDriver!.logType],
                        // http://docs.aws.amazon.com/AmazonECS/latest/developerguide/using_awslogs.html#w2ab1c21c21c13
                        options: logDriver?.getConfiguration(logOutputs)
                    },
                }]);
            });

        // args will be given to the base container service to detail how Pulumi API (service) tasks should be constructed
        const taskArgs: TaskDefinitionArgs = {
            containerDefinitionArgs: containerDefinitions,
            numberDesiredTasks: desiredNumberTasks,
            cpu: taskCpu,
            memory: taskMemory,
            containerName: consoleContainerName,
            containerPort: consolePort
        };

        return taskArgs;
    }

    // Complete list of environment variables that each ECS task of Pulumi API (service) will inherit
    constructEnvironmentVariables(loadBalancerUrl: string): any[] {

        const {
            dns,
            region,
            recaptchaSiteKey,
            samlSsoEnabled,
            hideEmailSignup,
            hideEmailLogin
        } = this.baseArgs;

        return [
            {
                name: "PULUMI_API",
                value: `https://${dns.apiUrl}`
            },
            {
                name: "PULUMI_CONSOLE_DOMAIN",
                value: dns.consoleUrl,
            },
            {
                name: "PULUMI_HOMEPAGE_DOMAIN",
                value: this.baseArgs.dns.consoleUrl,
            },
            {
                name: "AWS_REGION",
                value: region
            },
            { 
                // enabling SSO requires that an org already be created and configured to use a SSO provider
                // https://github.com/pulumi/pulumi-service/pull/7953
                name: "SAML_SSO_ENABLED",
                value: samlSsoEnabled ? String(samlSsoEnabled) : ""
            },
            {
                name: "RECAPTCHA_SITE_KEY",
                value: recaptchaSiteKey
            },
            {
                // https://github.com/pulumi/pulumi-service/pull/7953
                name: "PULUMI_HIDE_EMAIL_LOGIN",
                value: hideEmailLogin ? String(hideEmailLogin) : ""
            },
            {
                // https://github.com/pulumi/pulumi-service/pull/7953
                name: "PULUMI_HIDE_EMAIL_SIGNUP",
                value: hideEmailSignup ? String(hideEmailSignup) : ""
            }
        ]
    }
}