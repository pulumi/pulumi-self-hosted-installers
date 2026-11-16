import * as pulumi from "@pulumi/pulumi";
import { getCallerIdentity } from "@pulumi/aws";
import { normalizeImagePrefix, toLogType } from "./utils";
import { LogType } from "./logs/types";
import { parseProxyUrl } from "./networking/proxy";

export async function hydrateConfig() {
    const awsConfig = new pulumi.Config("aws");
    const region = awsConfig.require("region");

    const stackConfig = new pulumi.Config();
    const projectName = pulumi.getProject();
    const stackName = pulumi.getStack();

    const acmCertificateArn = stackConfig.require("acmCertificateArn");
    const kmsServiceKeyId = stackConfig.require("kmsServiceKeyId");
    const licenseKey = stackConfig.require("licenseKey");
    const agGridLicenseKey = stackConfig.getSecret("agGridLicenseKey");

    // NOTE: We will assume all networking pieces are already created properly; this may change in the future to allow for networking to be created as part of this process.

    // Everything between vpcId and openSearchDomain was once retrieved via stack reference. This has been changed to retrieve all values directly from configuration, instead.
    // The reason for this is to allow for more flexibility as config values are non-outputty whereas stack references are outputs (Output<T>).
    // This pattern pairs very nicely with PulumI ESC and the use of stackConfig (environments).
    // If ESC is ommitted, once can still set the configuration values as needed prior to executing the `application` program.

    // Private mode: both load balancers are internal and live in the private subnets, ALB ingress defaults to the VPC
    // CIDR blocks, and the ECS tasks get no 0.0.0.0/0 egress. See "Private (internal-only) deployment" in the README.
    const enablePrivateLoadBalancerAndLimitEgress = stackConfig.getBoolean("enablePrivateLoadBalancerAndLimitEgress") ?? false;

    const vpcId = stackConfig.require("vpcId");
    const privateSubnetIds: string[] = stackConfig.requireObject("privateSubnetIds");
    // only internet-facing load balancers use the public subnets
    const publicSubnetIds: string[] | undefined = enablePrivateLoadBalancerAndLimitEgress ?
        stackConfig.getObject("publicSubnetIds") :
        stackConfig.requireObject("publicSubnetIds");
    const isolatedSubnetIds: string[] | undefined = stackConfig.getObject("isolatedSubnetIds");

    const dbClusterEndpoint = stackConfig.require("dbClusterEndpoint");
    const dbPort = stackConfig.requireNumber("dbPort");
    const dbName = stackConfig.require("dbName");
    const dbSecurityGroupId = stackConfig.require("dbSecurityGroupId");
    const dbUsername = stackConfig.require("dbUsername");
    const dbPassword = stackConfig.require("dbPassword");

    // vpc endpoint security group; not read by the program. Optional in private mode, where the infrastructure stage may run
    // with enableVpcEndpoints=false and export none.
    const endpointSecurityGroupId: string | undefined = enablePrivateLoadBalancerAndLimitEgress ?
        stackConfig.get("endpointSecurityGroupId") :
        stackConfig.require("endpointSecurityGroupId");

    // S3 gateway endpoint prefix list (infrastructure output s3EndpointPrefixId). Only used in private mode; looked up
    // by name (com.amazonaws.<region>.s3) when not set.
    const s3EndpointPrefixId = stackConfig.get("s3EndpointPrefixId");

    // Pulumi Insights (Resource Search)
    const openSearchUser = stackConfig.get("opensearchUser");
    const openSearchPassword = stackConfig.get("opensearchPassword");
    const openSearchEndpoint = stackConfig.get("opensearchEndpoint");
    const openSearchDomainName = stackConfig.get("opensearchDomainName");

    // Optional, as in eks-hosted and the Go implementation. Not `require`: an empty
    // value reaches Secrets Manager as an empty SecretString, which it rejects.
    const recaptchaSiteKey = stackConfig.get("recaptchaSiteKey") ?? "";
    const recaptchaSecretKey = stackConfig.getSecret("recaptchaSecretKey");

    const samlCertPublicKey = stackConfig.getSecret("samlCertPublicKey");
    const samlCertPrivateKey = stackConfig.getSecret("samlCertPrivateKey");

    const ecrRepoAccountId = stackConfig.get("ecrRepoAccountId");
    const imageTag = stackConfig.require("imageTag");

    // Optional repository prefix in front of pulumi/<image>, eg- "docker-hub" for an ECR pull-through cache rule with that
    // prefix: <account>.dkr.ecr.<region>.amazonaws.com/docker-hub/pulumi/service:<tag>. A trailing "/" is added if missing.
    const imagePrefix = normalizeImagePrefix(stackConfig.get("imagePrefix"));
    // Opt-in: lets the task execution roles import images through the pull-through cache on first pull
    // (ecr:BatchImportUpstreamImage and ecr:CreateRepository on <imagePrefix>pulumi/*). undefined rather than false when
    // off, so the component inputs stay as they were.
    const ecrPullThroughCacheImport = stackConfig.getBoolean("ecrPullThroughCacheImport") || undefined;
    if (ecrPullThroughCacheImport && !imagePrefix) {
        throw new Error("ecrPullThroughCacheImport requires imagePrefix, the prefix of the ECR pull-through cache rule");
    }

    const route53ZoneName = stackConfig.require("domainName");
    const route53Subdomain = stackConfig.get("subDomain") || "";

    // Load balancer
    // provide a list of valid cidr blocks will restrict LB access on both API and UI to those specific CIDRS
    // conversely, absence of this config value will allow all CIDRs aka 0.0.0.0/0, or the VPC CIDR blocks in private mode
    const whiteListCidrBlocks: string[] | undefined = stackConfig.getObject("whiteListCidrBlocks");

    // Pulumi Api
    const apiDesiredNumberTasks = stackConfig.getNumber("apiDesiredNumberTasks") || 1;
    const apiTaskMemory = stackConfig.getNumber("apiTaskMemory");
    const apiTaskCpu = stackConfig.getNumber("apiTaskCpu");
    const apiContainerCpu = stackConfig.getNumber("apiContainerCpu");
    const apiContainerMemoryReservation = stackConfig.getNumber("apiContainerMemoryReservation");
    const apiDisableEmailLogin = stackConfig.getBoolean("apiDisableEmailLogin") || false;
    const apiDisableEmailSignup = stackConfig.getBoolean("apiDisableEmailSignUp") || false;
    const apiEngineEventsSchemaV2 = stackConfig.getBoolean("apiEngineEventsSchemaV2") ?? true;
    const apiEngineEventsLegacyWrite = stackConfig.getBoolean("apiEngineEventsLegacyWrite") ?? false;

    // Opt-in S3 buckets, default false and recommended for new installs:
    // engine events (PULUMI_ENGINE_EVENTS_BLOB_STORAGE_ENDPOINT), keeps large engine events out of MySQL
    const enableEngineEventsBucket = stackConfig.getBoolean("enableEngineEventsBucket") ?? false;
    // registry artifacts (PULUMI_REGISTRY_PUBLIC_BLOB_STORAGE_ENDPOINT and PULUMI_REGISTRY_PRIVATE_BLOB_STORAGE_ENDPOINT)
    const enableRegistryBuckets = stackConfig.getBoolean("enableRegistryBuckets") ?? false;

    // Pulumi Console
    // consoleDesirecNumberTasks is the historical misspelled key, still read so existing stacks keep working.
    // `||` as before, so 0 still means the default.
    const consoleDesiredNumberTasks = stackConfig.getNumber("consoleDesiredNumberTasks") ||
        stackConfig.getNumber("consoleDesirecNumberTasks") || 1;
    const consoleTaskMemory = stackConfig.getNumber("consoleTaskMemory");
    const consoleTaskCpu = stackConfig.getNumber("consoleTaskCpu");
    const consoleContainerCpu = stackConfig.getNumber("consoleContainerCpu");
    const consoleContainerMemoryReservation = stackConfig.getNumber("consoleContainerMemoryReservation");
    const consoleHideEmailLogin = stackConfig.getBoolean("consoleHideEmailLogin") || false;
    const consoleHideEmailSignup = stackConfig.getBoolean("consoleHideEmailSignup") || false;

    // Optional HTTP proxy for the API's outbound internet calls, eg- an OIDC issuer's JWKS. Sets HTTPS_PROXY and HTTP_PROXY
    // on the API container. NO_PROXY always lists the VPC CIDR blocks, ECS metadata, the S3/KMS/Secrets Manager endpoints,
    // the database, OpenSearch and the api/app hostnames; noProxy (a list) adds entries.
    const httpsProxy = parseProxyUrl(stackConfig.get("httpsProxy"));
    const noProxy: string[] = stackConfig.getObject<string[]>("noProxy") ?? [];

    // SMTP settings
    const smtpServer = stackConfig.get("smtpServer");
    const smtpUsername = stackConfig.get("smtpUsername");
    const smtpPassword = stackConfig.getSecret("smtpPassword");
    const smtpGenericSender = stackConfig.get("smtpGenericSender");

    
    // logs
    let logType = toLogType(stackConfig.get("logType"));
    let logArgs: any = stackConfig.getObject("logArgs");

    if (!logType) {
        logType = LogType.awslogs;
        logArgs ={
            retentionInDays: 7,
            region,
            name: `${projectName}-${stackName}`
        }
    }

    // retrieve the present AWS Account ID for use by other components
    const account = await getCallerIdentity();

    if (logArgs) {
        // enrich with region just in case
        logArgs["region"] = region;
    }

    return {
        region,
        accountId: account.accountId,
        enablePrivateLoadBalancerAndLimitEgress,
        vpcId,
        privateSubnetIds,
        publicSubnetIds,
        isolatedSubnetIds,
        endpointSecurityGroupId,
        s3EndpointPrefixId,
        proxy: {
            httpsProxy,
            noProxy
        },
        recaptchaSecretKey: recaptchaSecretKey,
        recaptchaSiteKey: recaptchaSiteKey,
        kmsServiceKeyId,
        ecrRepoAccountId,
        imagePrefix,
        ecrPullThroughCacheImport,
        enableEngineEventsBucket,
        enableRegistryBuckets,
        dockerHub: {
            imageTag,
        },
        dns: {
            route53ZoneName,
            route53Subdomain,
            acmCertificateArn,
            whiteListCidrBlocks
        },
        api: {
            apiDesiredNumberTasks,
            apiTaskMemory,
            apiTaskCpu,
            apiContainerCpu,
            apiContainerMemoryReservation,
            licenseKey,
            samlCertPrivateKey,
            samlCertPublicKey,
            apiDisableEmailLogin,
            apiDisableEmailSignup,
            apiEngineEventsSchemaV2,
            apiEngineEventsLegacyWrite
        },
        console: {
            consoleDesiredNumberTasks,
            consoleTaskMemory,
            consoleTaskCpu,
            consoleContainerCpu,
            consoleContainerMemoryReservation,
            samlSsoEnabled: samlCertPrivateKey ? true : false,
            consoleHideEmailLogin,
            consoleHideEmailSignup,
            agGridLicenseKey
        },
        database: {
            dbClusterEndpoint,
            dbName,
            dbPort,
            dbSecurityGroupId,
            dbUsername,
            dbPassword
        },
        smtp: {
            smtpServer,
            smtpUsername,
            smtpPassword,
            smtpGenericSender
        },
        opensearch: {
            user: openSearchUser,
            password: openSearchPassword,
            domain: openSearchDomainName,
            endpoint: openSearchEndpoint
        },
        baseTags: {
            project: projectName,
            stack: stackName,
        },
        logs: {
            logArgs,
            logType
        }
    };
}