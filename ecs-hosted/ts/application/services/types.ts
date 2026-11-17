import * as pulumi from "@pulumi/pulumi";
import * as ecs from "@pulumi/aws/ecs";
import * as s3 from "@pulumi/aws/s3";
import * as input from "@pulumi/aws/types/input";

import { LogDriver, LogType } from "../logs/types";
import { OidcKeySets } from "../oidcKeys";
import { TrafficManager } from "../networking/trafficManager";
import { PulumiLoadBalancer } from "../networking/pulumiLoadBalanacer";
import { PrivateNetwork } from "../networking/privateNetwork";
import { ProxySettings } from "../networking/proxy";

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
    // ECR pull-through cache: repository prefix in front of pulumi/<image> (normalized, ends with "/"), and whether the
    // execution roles may import images through the cache
    ecrPullThroughCacheImport?: boolean,
    imagePrefix?: string,
    kmsServiceKeyId?: string,
    // set in private mode (enablePrivateLoadBalancerAndLimitEgress); restricts task egress to the VPC and S3
    privateNetwork?: PrivateNetwork,
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
    // egress rules of the service security group; undefined allows all egress (0.0.0.0/0)
    securityGroupEgress?: input.ec2.SecurityGroupEgress[],
    targetPort: number
    taskDefinitionArgs: TaskDefinitionArgs,
}

export interface ApiServiceArgs extends ServiceBaseArgs {
    containerMemoryReservation?: number,
    containerCpu?: number,
    ecrRepoAccountId?: string | undefined,
    endpointSecurityGroupId?: string,
    imageTag: string,
    licenseKey: string,
    logType?: LogType,
    logArgs?: any,
    numberDesiredTasks?: number,
    oidcKeySets: OidcKeySets,
    // optional outbound HTTP proxy (HTTPS_PROXY, HTTP_PROXY, NO_PROXY)
    proxy?: ProxySettings,
    recaptchaSecretKey: pulumi.Output<string> | undefined,
    samlCertPublicKey?: pulumi.Output<string>,
    samlCertPrivateKey?: pulumi.Output<string>,
    taskMemory?: number,
    taskCpu?: number,
    trafficManager: TrafficManager,
    disableEmailSignup: boolean,
    disableEmailLogin: boolean,
    engineEventsSchemaV2: boolean,
    engineEventsLegacyWrite: boolean,
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
    metadataBucket: s3.Bucket,
    // opt-in buckets (enableEngineEventsBucket, enableRegistryBuckets)
    engineEventsBucket?: s3.Bucket,
    registryPublicBucket?: s3.Bucket,
    registryPrivateBucket?: s3.Bucket,
}

export interface ConsoleServiceArgs extends ServiceBaseArgs {
    containerMemoryReservation?: number,
    containerCpu?: number,
    ecrRepoAccountId?: string | undefined,
    endpointSecurityGroupId?: string,
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
    // *_BLOB_STORAGE_ENDPOINT variables of the opt-in buckets
    optionalBlobStorage?: { name: string, value: string }[],
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