import * as pulumi from "@pulumi/pulumi";
import * as ec2 from "@pulumi/aws/ec2";
import * as input from "@pulumi/aws/types/input";
import * as kms from "@pulumi/aws/kms";

import { ContainerService } from "./containerService";
import { MigrationService } from "./migrationsService";
import { TaskDefinitionArgs, ApiServiceArgs, ApiServiceEnvironmentArgs } from "./types";
import { buildECRImageTag } from "../utils";
import { LogFactory } from "../logs/logFactory";
import { LogDriver, LogType } from "../logs/types";
import { Secrets } from "./secrets";
import { getIamPolicyArn } from "../../common/utils";

const namespace = "pulumi:apiService";
const apiPort = 8080;
const apiContainerName = "pulumi-service";

/*
Represents the base of the Pulumi API (service).
Comprised of an ECS Cluster/Service and all required pieces (tasks, containers, etc)
Tasks will need to be able to access S3 buckets, Aurora DB, Secrets Manager, and ECR repos
*/
export class ApiService extends pulumi.ComponentResource {

    public readonly apiService: ContainerService;

    private readonly baseArgs: ApiServiceArgs;
    private readonly options: pulumi.ComponentResourceOptions;
    private readonly apiImage: string;

    constructor(name: string, args: ApiServiceArgs, opts?: pulumi.ComponentResourceOptions) {
        super(namespace, name, args, opts);

        this.baseArgs = args;
        this.options = pulumi.mergeOptions(opts, { parent: this });
        this.apiImage = `pulumi/service:${args.imageTag}`;

        const { trafficManager } = this.baseArgs;

        // Specify the health check to be utilized with the Pulumi API (service)
        const healthCheck: input.lb.TargetGroupHealthCheck = {
            interval: 10,  // seconds
            path: "/api/status",
            port: apiPort.toString(),
            protocol: "HTTP",
            matcher: "200-299",
            timeout: 5,  // seconds
            healthyThreshold: 5,
            unhealthyThreshold: 2,
        };

        // listener conditions allow ALB to route appropriate traffic to Pulumi API vs Pulumi Console
        const listenerConditions = [
            {
                hostHeader: {
                    values: [args.dns.apiUrl, trafficManager.api.loadBalancer.dnsName]
                }
            },
            {
                pathPattern: {
                    values: ["/*"]
                }
            }
        ];

        const serviceSecrets = new Secrets("service-secrets", {
            prefix: this.baseArgs.secretsManagerPrefix,
            kmsKeyId: this.baseArgs.kmsServiceKeyId,
            secrets: [
                {
                    name: "SMTP_PASSWORD",
                    value: this.baseArgs.smtp?.smtpPassword
                },
                {
                    name: "RECAPTCHA_SECRET_KEY",
                    value: this.baseArgs.recaptchaSecretKey
                },
                {
                    name: "LOGIN_RECAPTCHA_SECRET_KEY",
                    value: this.baseArgs.recaptchaSecretKey
                },
                {
                    name: "SAML_CERTIFICATE_PRIVATE_KEY",
                    value: this.baseArgs.samlCertPrivateKey
                },
                {
                    name: "PULUMI_DATABASE_USER_NAME",
                    value: this.baseArgs.database.dbUsername
                },
                {
                    name: "PULUMI_DATABASE_USER_PASSWORD",
                    value: this.baseArgs.database.dbPassword
                }
            ]
        }, this.options);

        const taskArgs = this.constructTaskArgs(serviceSecrets);
        this.apiService = new ContainerService(`${name}-api`, {
            ...args,
            healthCheck: healthCheck,
            listenerPriority: 1,
            listenerConditions: listenerConditions,
            pulumiLoadBalancer: trafficManager.api,
            targetPort: apiPort,
            taskDefinitionArgs: taskArgs,
        }, this.options);

        const migrationService = new MigrationService(`${name}-migrations`, {
            ...args,
            migrationsImageTag: args.imageTag,
            database: args.database,
        }, this.options);

        // connection from api service to db is required
        // using SG ingress rules
        // TODO: infra stack outputs this ID
        const dbSecurityGroup = ec2.getSecurityGroupOutput({
            id: args.database.dbSecurityGroupId
        }, this.options);

        // allow access from api security group to db cluster
        new ec2.SecurityGroupRule(`${name}-api-to-db-rule`, {
            type: "ingress",
            securityGroupId: dbSecurityGroup.id,
            sourceSecurityGroupId: this.apiService.securityGroup.id,
            fromPort: 3306,
            toPort: 3306,
            protocol: "TCP"
        }, this.options);

        new ec2.SecurityGroupRule(`${name}-lb-to-api-rule`, {
            type: "egress",
            securityGroupId: trafficManager.api.securityGroup.id,
            sourceSecurityGroupId: this.apiService.securityGroup.id,
            fromPort: apiPort,
            toPort: apiPort,
            protocol: "TCP"
        }, this.options);

        new ec2.SecurityGroupRule(`${name}-migrations-to-db-rule`, {
            type: "ingress",
            securityGroupId: dbSecurityGroup.id,
            sourceSecurityGroupId: migrationService.securityGroup.id,
            fromPort: 3306,
            toPort: 3306,
            protocol: "TCP"
        }, this.options);
    }

    // Construct ECS Task Definition
    constructTaskArgs(serviceSecrets: Secrets): TaskDefinitionArgs {
        // TODO: we need to be aware of task vs container cpu/memory if more than 1 container will be present in task.
        //       Eg- using a sidecar pattern, fluent bit can ship logs to different locations, but now we have multiple consumers of resources. 
        const taskMemory = this.baseArgs.taskMemory ? this.baseArgs.taskMemory : 1024;
        const taskCpu = this.baseArgs.taskCpu ? this.baseArgs.taskCpu : 512;

        const containerMemoryReservation = this.baseArgs.containerMemoryReservation ? this.baseArgs.containerMemoryReservation : 384;
        const containerCpu = this.baseArgs.containerCpu ? this.baseArgs.containerCpu : taskCpu;

        // set the desired state (count of tasks) for our ECS service
        const desiredNumberTasks = this.baseArgs.numberDesiredTasks ? this.baseArgs.numberDesiredTasks : 3;

        // from configuration, build the type of logger requested by the caller; awslogs, awsfirelens, splunk...
        let logDriver: LogDriver | undefined;
        if (this.baseArgs.logType != undefined) {
            logDriver = new LogFactory().buildLogDriver(
                this.baseArgs.logType,
                "api-service",
                this.baseArgs.logArgs,
                this.options);
        }

        const accounts = {
            accountId: this.baseArgs.accountId,
            ecrRepoAccountId: this.baseArgs.ecrRepoAccountId
        };

        // JSON will be definition provided to ECS for API (service) containers
        // Fully qualified ECR tag will be built for `image` property below
        const containerDefinitions = pulumi
            .all([
                this.baseArgs.database,
                serviceSecrets.outputs,
                this.baseArgs.policyPacksBucket.bucket,
                this.baseArgs.checkPointbucket.bucket,
                accounts,
                this.baseArgs.samlCertPrivateKey,
                this.baseArgs.samlCertPublicKey,
                logDriver?.outputs])
            .apply(([
                database,
                secrets,
                policyBucket,
                checkpointBucket,
                accounts,
                samlPrivateKey,
                samlPublicKey,
                logOutputs]) => {

                const ecrAccountId = accounts.ecrRepoAccountId && accounts.ecrRepoAccountId !== "" ? accounts.ecrRepoAccountId : accounts.accountId;

                const def = JSON.stringify([{
                    name: apiContainerName,
                    image: buildECRImageTag(ecrAccountId, this.baseArgs.region, this.apiImage),
                    cpu: containerCpu,
                    memoryReservation: containerMemoryReservation,
                    ulimits: [{
                        softLimit: 100000,
                        hardLimit: 200000,
                        name: "nofile"
                    }],
                    portmappings: [{
                        containerPort: apiPort
                    }],
                    environment: this.constructEnvironmentVariables({
                        databaseEndpoint: database.dbClusterEndpoint,
                        databasePort: database.dbPort,
                        checkpointBucket: checkpointBucket,
                        policyPackBucket: policyBucket,
                        samlSsoPrivateCert: samlPrivateKey,
                        samlSsoPublicCert: samlPublicKey
                    }),
                    secrets: secrets,
                    logConfiguration: logDriver && {
                        logDriver: LogType[logDriver!.logType],
                        // http://docs.aws.amazon.com/AmazonECS/latest/developerguide/using_awslogs.html#w2ab1c21c21c13
                        options: logDriver?.getConfiguration(logOutputs)
                    },
                }]);

                return def;
            });

        // IAM policy doc will be given to ECS service to allow Pulumi API (service) to interact with S3 buckets
        const s3AccessPolicyDoc = pulumi
            .all([this.baseArgs.policyPacksBucket.bucket, this.baseArgs.checkPointbucket.bucket])
            .apply(([policyBucket, checkpointBucket]) => {

                const policyBucketArn = getIamPolicyArn(this.baseArgs.region, `arn:aws:s3:::${policyBucket}`);
                pulumi.log.debug(`construct policy bucket arn: ${policyBucketArn}`);

                const checkpointBucketArn = getIamPolicyArn(this.baseArgs.region, `arn:aws:s3:::${checkpointBucket}`);
                pulumi.log.debug(`constructed checkpoint bucket arn: ${checkpointBucketArn}`);

                return JSON.stringify({
                    Version: "2012-10-17",
                    Statement: [{
                        Effect: "Allow",
                        Action: ["s3:*"],
                        Resource: [
                            policyBucketArn,
                            `${policyBucketArn}/*`,
                            checkpointBucketArn,
                            `${checkpointBucketArn}/*`
                        ]
                    }]
                })
            });

        const kmsKey = kms.getKey({
            keyId: this.baseArgs.kmsServiceKeyId!
        });

        const kmsKeyPolicyDoc = pulumi
            .all([kmsKey])
            .apply(([kmsKey]) => {
                return JSON.stringify({
                    Version: "2012-10-17",
                    Statement: [{
                        Effect: "Allow",
                        Action: [
                            "kms:Decrypt",
                            "kms:GenerateDataKeyWithoutPlaintext"
                        ],
                        Resource: [
                            kmsKey.arn,
                        ]
                    }]
                })
            });

        // args will be given to the base container service to detail how Pulumi API (service) tasks should be constructed
        const taskArgs: TaskDefinitionArgs = {
            containerDefinitionArgs: containerDefinitions,
            taskRolePolicyDocs: [s3AccessPolicyDoc, kmsKeyPolicyDoc],
            numberDesiredTasks: desiredNumberTasks,
            cpu: taskCpu,
            memory: taskMemory,
            containerName: apiContainerName,
            containerPort: apiPort
        };

        return taskArgs;
    }

    // Complete list of environment variables that each ECS task of Pulumi API (service) will inherit
    constructEnvironmentVariables(args: ApiServiceEnvironmentArgs): any[] {

        const {
            dns,
            region,
            kmsServiceKeyId,
            smtp,
            licenseKey,
            disableEmailSignup,
            disableEmailLogin
        } = this.baseArgs;

        return [
            {
                name: "PULUMI_LICENSE_KEY",
                value: licenseKey
            },
            {
                name: "PULUMI_ENTERPRISE",
                value: "true"
            },
            {
                name: "PULUMI_DATABASE_ENDPOINT",
                value: `${args.databaseEndpoint}:${args.databasePort}`,
            },
            {
                name: "PULUMI_DATABASE_PING_ENDPOINT",
                value: args.databaseEndpoint
            },
            {
                name: "PULUMI_DATABASE_NAME",
                value: "pulumi",
            },
            {
                name: "PULUMI_API_DOMAIN",
                value: dns.apiUrl,
            },
            {
                name: "PULUMI_CONSOLE_DOMAIN",
                value: dns.consoleUrl,
            },
            {
                name: "PULUMI_OBJECTS_BUCKET",
                value: args.checkpointBucket,
            },
            {
                name: "PULUMI_POLICY_PACK_BUCKET",
                value: args.policyPackBucket,
            },
            {
                name: "PULUMI_KMS_KEY",
                value: kmsServiceKeyId,
            },
            {
                name: "AWS_REGION",
                value: region,
            },
            {
                name: "PULUMI_DISABLE_EMAIL_LOGIN",
                value: disableEmailLogin ? String(disableEmailLogin) : ""
            },
            {
                name: "PULUMI_DISABLE_EMAIL_SIGNUP",
                value: disableEmailSignup ? String(disableEmailSignup) : ""
            },
            {
                name: "SMTP_USERNAME",
                value: smtp?.smtpUsername ?? ""
            },
            {
                name: "SMTP_SERVER",
                value: smtp?.smtpServer ?? "",
            },
            {
                name: "SMTP_GENERIC_SENDER",
                value: smtp?.smtpGenericSender ?? "",
            },
            {
                name: "SAML_CERTIFICATE_PUBLIC_KEY",
                value: args.samlSsoPublicCert ?? ""
            },
        ];
    }
}