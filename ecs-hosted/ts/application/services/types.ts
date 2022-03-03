import * as pulumi from "@pulumi/pulumi";
import * as ecs from "@pulumi/aws/ecs";
import * as s3 from "@pulumi/aws/s3";
import * as input from "@pulumi/aws/types/input";

import { LogDriver, LogType } from "../logs/types";
import { TrafficManager } from "../networking/trafficManager";
import { PulumiLoadBalancer } from "../networking/pulumiLoadBalanacer";

export interface ContainerDefinitionArgs {
    name: string,
    image: string,
    cpu: number,
    memory?: number,
    memoryReservation?: number,
    port: number,
    ulimit?: {
        hardLimit: number,
        softLimit: number,
        name: string
    },
    secrets?: pulumi.Output<any[]>,
    environment?: pulumi.Output<any[]>
    logDriver?: LogDriver
}

export interface TaskDefinitionArgs {
    containerDefinitionArgs: pulumi.Output<string>,
    cpu: number,
    memory: number,
    numberDesiredTasks: number,
    containerName: string,
    containerPort: number,
    executionRolePolicyDocs?: pulumi.Output<string>[],
    taskRolePolicyDocs?: pulumi.Output<string>[],
}

export interface ServiceBaseArgs {
    accountId: pulumi.Output<string>,
    cluster?: ecs.Cluster,
    kmsServiceKeyId?: string,
    privateSubnetIds: pulumi.Output<string[]>,
    region: string,
    secretsManagerPrefix?: string,
    vpcId: pulumi.Output<string>,
}

export interface ServiceArgs extends ServiceBaseArgs {
    healthCheck?: input.lb.TargetGroupHealthCheck,
    listenerConditions: input.lb.ListenerRuleCondition[],
    listenerPriority: number,
    pulumiLoadBalancer: PulumiLoadBalancer,
    targetPort: number
    taskDefinitionArgs: TaskDefinitionArgs,
}

export interface ApiServiceArgs extends ServiceBaseArgs {
    containerMemoryReservation?: number,
    containerCpu?: number,
    ecrRepoAccountId?: pulumi.Output<string | undefined>,
    endpointSecurityGroupId: pulumi.Output<string>,
    imageTag: string,
    licenseKey: string,
    logType?: LogType,
    logArgs?: any,
    numberDesiredTasks?: number,
    recaptchaSecretKey: pulumi.Output<string>,
    samlCertPublicKey?: pulumi.Output<string>,
    samlCertPrivateKey?: pulumi.Output<string>,
    taskMemory?: number,
    taskCpu?: number,
    trafficManager: TrafficManager,
    disableEmailSignup: boolean,
    disableEmailLogin: boolean,
    database: {
        dbClusterEndpoint: pulumi.Output<string>,
        dbPort: pulumi.Output<number>,
        dbName: pulumi.Output<string>,
        dbSecurityGroupId: pulumi.Output<string>,
        dbUsername: pulumi.Output<string>,
        dbPassword: pulumi.Output<string>
    },
    smtp?: {
        smtpServer?: string,
        smtpUsername?: string,
        smtpPassword?: pulumi.Output<string>,
        smtpGenericSender?: string
    },
    dns: {
        consoleUrl: string,
        apiUrl: string,
        rootDomain: string,
        whiteListCidrBlocks: string[] | undefined
    },
    checkPointbucket: s3.Bucket,
    policyPacksBucket: s3.Bucket
}

export interface ConsoleServiceArgs extends ServiceBaseArgs {
    containerMemoryReservation?: number,
    containerCpu?: number,
    ecrRepoAccountId?: pulumi.Output<string | undefined>,
    endpointSecurityGroupId: pulumi.Output<string>,
    imageTag: string,
    logType?: LogType,
    logArgs?: any,
    numberDesiredTasks?: number,
    recaptchaSiteKey: string,
    region: string,
    samlSsoEnabled: boolean,
    taskMemory?: number,
    taskCpu?: number,
    trafficManager: TrafficManager,
    hideEmailSignup: boolean,
    hideEmailLogin: boolean,
    dns: {
        consoleUrl: string,
        apiUrl: string,
        rootDomain: string,
        whiteListCidrBlocks: string[] | undefined
    },
}

export interface ApiServiceEnvironmentArgs {
    databaseEndpoint: string,
    databasePort: number,
    checkpointBucket: string,
    policyPackBucket: string,
    samlSsoPublicCert: string,
    samlSsoPrivateCert: string
}

export interface MigrationsArgs extends ServiceBaseArgs {
    ecrRepoAccountId?: pulumi.Output<string | undefined>,
    database: {
        dbClusterEndpoint: pulumi.Output<string>,
        dbPort: pulumi.Output<number>,
        dbName: pulumi.Output<string>,
        dbSecurityGroupId: pulumi.Output<string>,
        dbUsername: pulumi.Output<string>,
        dbPassword: pulumi.Output<string>
    },
    migrationsImageTag: string,
}

export interface SecretArgs {
    secrets: Secret[],
    prefix: string | undefined,
    kmsKeyId: string | undefined
}

export interface Secret {
    name: string,
    value: pulumi.Output<string> | undefined
}