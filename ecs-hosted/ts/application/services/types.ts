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
    accountId: string,
    cluster?: ecs.Cluster,
    kmsServiceKeyId?: string,
    privateSubnetIds: string[],
    region: string,
    secretsManagerPrefix?: string,
    vpcId: string,
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
    ecrRepoAccountId?: string | undefined,
    endpointSecurityGroupId: string,
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
        dbClusterEndpoint: string,
        dbPort: number,
        dbName: string,
        dbSecurityGroupId: string,
        dbUsername: string,
        dbPassword: string
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
    opensearch?: {
        user?: string,
        password?: string,
        domain?: string,
        endpoint?: string
    }
    checkPointbucket: s3.Bucket,
    policyPacksBucket: s3.Bucket,
    metadataBucket: s3.Bucket
}

export interface ConsoleServiceArgs extends ServiceBaseArgs {
    containerMemoryReservation?: number,
    containerCpu?: number,
    ecrRepoAccountId?: string | undefined,
    endpointSecurityGroupId: string,
    imageTag: string,
    logType?: LogType,
    logArgs?: any,
    numberDesiredTasks?: number,
    recaptchaSiteKey: string,
    agGridLicenseKey?: pulumi.Output<string>,
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
    metadataBucket: string,
    samlSsoPublicCert?: string | undefined,
    samlSsoPrivateCert?: string | undefined,
    openSearchUser?: string | undefined,
    openSearchEndpoint?: string | undefined,
}

export interface MigrationsArgs extends ServiceBaseArgs {
    ecrRepoAccountId?: string | undefined,
    database: {
        dbClusterEndpoint: string,
        dbPort: number,
        dbName: string,
        dbSecurityGroupId: string,
        dbUsername: string,
        dbPassword: string
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