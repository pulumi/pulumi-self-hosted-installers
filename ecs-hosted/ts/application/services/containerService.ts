import * as pulumi from "@pulumi/pulumi";
import * as ecs from "@pulumi/aws/ecs";
import * as ec2 from "@pulumi/aws/ec2";
import * as lb from "@pulumi/aws/lb";
import * as iam from "@pulumi/aws/iam";
import * as appautoscaling from "@pulumi/aws/appautoscaling";
import * as input from "@pulumi/aws/types/input";

import { ServiceArgs } from "./types";
import { generateSecretsManagerPolicy } from "../utils";
import { getIamPolicyArn } from "../../common/utils";
import { PulumiLoadBalancer } from "../networking/pulumiLoadBalanacer";

const namespace = "pulumi:containerService";
const launchType = "FARGATE";
const networkMode = "awsvpc";
/*
Reusable ComponentResource that creates majority of the infra needed to run a proper ECS Fargate Service
Created Service/Tasks will be wired up to a target group which is attached to our single ALB
*/

export class ContainerService extends pulumi.ComponentResource {

    public readonly cluster: ecs.Cluster;
    public readonly service: ecs.Service;
    public readonly securityGroup: ec2.SecurityGroup;
    public readonly targetGroup: lb.TargetGroup;

    private readonly baseName: string;
    private readonly baseOptions: pulumi.ComponentResourceOptions;
    private readonly baseArgs: ServiceArgs;

    constructor(name: string, args: ServiceArgs, opts?: pulumi.ComponentResourceOptions) {
        super(namespace, name, args, opts);

        this.baseName = name;
        this.baseOptions = pulumi.mergeOptions(opts, { parent: this });
        this.baseArgs = args;

        const { taskDefinitionArgs, pulumiLoadBalancer, listenerConditions } = args;

        // allow the caller to provide a cluster if they so choose; default is to create a separate cluster.
        if (args.cluster) {
            this.cluster = args.cluster;
        } else {
            this.cluster = new ecs.Cluster(`${name}-cluster`, {}, this.baseOptions);
        }

        // security group by default will allow all traffic out and ingress from ELB is only allowed
        this.securityGroup = new ec2.SecurityGroup(`${name}-service-sg`, {
            vpcId: args.vpcId,
            egress: [{
                fromPort: 0,
                toPort: 0,
                protocol: "-1",
                cidrBlocks: ["0.0.0.0/0"]
            }],
            ingress: [{
                fromPort: args.targetPort,
                toPort: args.targetPort,
                securityGroups: [pulumiLoadBalancer.securityGroup.id],
                protocol: "TCP"
            }]
        }, this.baseOptions);

        // execution role will be given to Docker Daemon & ECS Control Plane to interact with AWS services such as ECR, Cloudwatch, Secrets manager, ETC
        const executionRole = this.constructEcsRole(`${this.baseName}-execution`, args.taskDefinitionArgs.executionRolePolicyDocs);

        // provide an avenue for the caller to grant Secrets Manager access to a Secrets Manager prefix
        // this would be for secrets defined in the task's container definition
        if (args.secretsManagerPrefix && args.kmsServiceKeyId) {
            const doc = generateSecretsManagerPolicy(args.region, args.secretsManagerPrefix, args.kmsServiceKeyId, args.accountId)

            new iam.RolePolicy(`${this.baseName}-secrets-pol`, {
                role: executionRole,
                policy: doc
            }, this.baseOptions);
        }

        // task will is be given to the actual application. 
        // user code will utilize this for tasks like interacting with S3 buckets, Secrets Manager, etc
        const taskRole = this.constructEcsRole(`${this.baseName}-task`, args.taskDefinitionArgs.taskRolePolicyDocs);

        // task definition
        const taskDefinition = new ecs.TaskDefinition(`${name}-task-def`, {
            family: `${taskDefinitionArgs.containerName}-task`,
            networkMode: networkMode,
            requiresCompatibilities: [launchType],
            cpu: taskDefinitionArgs.cpu.toString(),
            memory: taskDefinitionArgs.memory.toString(),
            executionRoleArn: executionRole.arn, // ECR, Cloudwatch, Private registry, Secrets Manager access
            taskRoleArn: taskRole.arn, // whatever permissions our app needs to properly run/function
            containerDefinitions: args.taskDefinitionArgs.containerDefinitionArgs
        }, this.baseOptions);

        // ELB to Target group traffic does not support SSL without additional SSL certs and configuration, hence HTTP not HTTPS
        this.targetGroup = new lb.TargetGroup(`${name}-tg`, {
            vpcId: args.vpcId,
            protocol: "HTTP",
            port: args.targetPort,
            healthCheck: args.healthCheck,
            targetType: "ip",
        }, this.baseOptions);

        // reusing the http listener, attach our new target group to serve request from ELB -> ECS Service
        const httpsListenerRule = this.constructListener(`${name}-https`, pulumiLoadBalancer.httpsListener.arn, pulumiLoadBalancer, args.listenerConditions);
        const httpListenerRule = this.constructListener(`${name}-http`, pulumiLoadBalancer.httpListener.arn, pulumiLoadBalancer, args.listenerConditions);

        this.service = new ecs.Service(`${name}-service`, {
            cluster: this.cluster.id,
            desiredCount: taskDefinitionArgs.numberDesiredTasks,
            healthCheckGracePeriodSeconds: 60,
            loadBalancers: [{
                containerName: taskDefinitionArgs.containerName,
                containerPort: taskDefinitionArgs.containerPort,
                targetGroupArn: this.targetGroup.arn,
            }],
            launchType: launchType,
            networkConfiguration: {
                assignPublicIp: false,
                subnets: args.privateSubnetIds,
                securityGroups: [this.securityGroup.id]
            },
            taskDefinition: taskDefinition.arn,
            waitForSteadyState: false,
        }, pulumi.mergeOptions(this.baseOptions, {
            dependsOn: [
                httpListenerRule,
                httpsListenerRule,
            ]
        }));

        // monitor cpu and memory and scale ECS as needed
        const autoScaleTarget = new appautoscaling.Target(`${name}-autoscale-target`, {
            maxCapacity: 6,
            minCapacity: 1,
            resourceId: pulumi.interpolate`service/${this.cluster.name}/${this.service.name}`,
            scalableDimension: "ecs:service:DesiredCount",
            serviceNamespace: "ecs"
        }, this.baseOptions);

        this.applyScalingPolicy(`${name}-cpu`, "ECSServiceAverageCPUUtilization", autoScaleTarget);
        this.applyScalingPolicy(`${name}-memory`, "ECSServiceAverageMemoryUtilization", autoScaleTarget);
    }

    applyScalingPolicy(name: string, metric: string, target: appautoscaling.Target) {
        new appautoscaling.Policy(`${name}-autoscaling-policy`, {
            policyType: "TargetTrackingScaling",
            resourceId: target.resourceId,
            scalableDimension: target.scalableDimension,
            serviceNamespace: target.serviceNamespace,
            targetTrackingScalingPolicyConfiguration: {
                predefinedMetricSpecification: {
                    predefinedMetricType: metric
                },
                targetValue: 65, // %
                scaleInCooldown: 60, // seconds
                scaleOutCooldown: 60 // seconds
            }
        }, this.baseOptions);
    }

    constructListener(name: string, listenerArn: pulumi.Output<string>, pulumiLoadBalancer: PulumiLoadBalancer, listenerConditions: input.lb.ListenerRuleCondition[] ): lb.ListenerRule {
        const listener = new lb.ListenerRule(`${name}-rule`, {
            listenerArn: listenerArn,
            actions: [{
                type: "forward",
                targetGroupArn: this.targetGroup.arn
            }],
            conditions: listenerConditions
        }, pulumi.mergeOptions(this.baseOptions, {
            dependsOn: [
                pulumiLoadBalancer
            ]
        }));

        return listener;
    }

    // Create a IAM role to be used as task role or execution role for ECS Tasks
    constructEcsRole(name: string, rolePolicies: pulumi.Output<string>[] | undefined): iam.Role {
        const role = new iam.Role(`${name}-role`, {
            assumeRolePolicy: iam.assumeRolePolicyForPrincipal({ Service: "ecs-tasks.amazonaws.com" })
        }, this.baseOptions);

        const ecsPolicyArn = getIamPolicyArn(this.baseArgs.region, iam.ManagedPolicy.AmazonECSTaskExecutionRolePolicy);
        pulumi.log.debug(`construct ecs task role policy arn: ${ecsPolicyArn}`);

        new iam.RolePolicyAttachment(`${name}-role-attachment`, {
            role: role,
            policyArn: ecsPolicyArn
        }, this.baseOptions);

        // attach any additional policy arns the caller has provided.
        // this could be things like specific ECR repos, Secrets manager stuff, s3, etc
        if (rolePolicies) {
            for (let i = 0; i < rolePolicies.length; i++) {
                new iam.RolePolicy(`${name}-role-att-${i}`, {
                    role: role,
                    policy: rolePolicies[i]
                }, this.baseOptions)
            }
        }

        return role;
    }
}