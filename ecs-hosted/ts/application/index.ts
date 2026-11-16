import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import { hydrateConfig } from "./config";
import { ApiService } from "./services/apiService";
import { ConsoleService } from "./services/consoleService";
import { TrafficManager } from "./networking/trafficManager";
import { createOidcKeySets } from "./oidcKeys";
import { lookupPrivateNetwork, lookupVpcCidrBlocks } from "./networking/privateNetwork";
import { buildProxySettings } from "./networking/proxy";

/*
Entry point to creating all application related infrastructure.
Besides S3 buckets, all resources will be created underneath Component Resources
*/

export = async () => {
    const config = await hydrateConfig();

    // Create S3 Buckets for the service checkpoints and policy packs.
    // Pulumi API (service) needs to be able to read/write to these buckets via IAM policy
    const checkpointsBucket = new aws.s3.Bucket(`pulumi-checkpoints`, {}, { protect: true });
    const policyPacksBucket = new aws.s3.Bucket(`pulumi-policypacks`, {}, { protect: true });
    const metadataBucket= new aws.s3.Bucket(`pulumi-service-metadata`, {}, { protect: true });

    // Private mode: VPC CIDR blocks and the S3 prefix list for the internal ALBs and the restricted task egress
    const privateNetwork = config.enablePrivateLoadBalancerAndLimitEgress ?
        await lookupPrivateNetwork(config.vpcId, config.region, config.s3EndpointPrefixId) :
        undefined;

    // Create infra related to handling traffic
    // ALB, HTTP & HTTPS listeners, empty target group, and ALB access logs if configuration says so
    // In private mode both ALBs are internal, sit in the private subnets and only accept the VPC CIDR blocks by default
    const trafficManager = new TrafficManager("pulumi-tm", {
        accountId: config.accountId,
        certificateArn: config.dns.acmCertificateArn,
        publicSubnetIds: config.publicSubnetIds,
        // only set in private mode, so the component inputs are unchanged otherwise
        ...(privateNetwork ? { internalLb: true, privateSubnetIds: config.privateSubnetIds } : {}),
        region: config.region,
        vpcId: config.vpcId,
        whiteListCidrBlocks: config.dns.whiteListCidrBlocks ?? privateNetwork?.vpcCidrBlocks
    });

    let apiUrl = `api.${config.dns.route53Subdomain}.${config.dns.route53ZoneName}`;
    let consoleUrl = `app.${config.dns.route53Subdomain}.${config.dns.route53ZoneName}`;
    let domain = `${config.dns.route53Subdomain}.${config.dns.route53ZoneName}`;

    // remove our empty subdomin
    if (!config.dns.route53Subdomain || config.dns.route53Subdomain === "") {
        apiUrl = `api.${config.dns.route53ZoneName}`;
        consoleUrl = `app.${config.dns.route53ZoneName}`;
        domain = `${config.dns.route53ZoneName}`;
    }

    const secretsPrefix = `${pulumi.getProject()}/${pulumi.getStack()}`;

    // Optional outbound proxy for the API; NO_PROXY needs the VPC CIDR blocks even outside private mode
    const proxy = config.proxy.httpsProxy ? buildProxySettings({
        httpsProxy: config.proxy.httpsProxy,
        extraNoProxy: config.proxy.noProxy,
        region: config.region,
        vpcCidrBlocks: privateNetwork?.vpcCidrBlocks ?? await lookupVpcCidrBlocks(config.vpcId),
        dbClusterEndpoint: config.database.dbClusterEndpoint,
        openSearchEndpoint: config.opensearch.endpoint,
        apiHost: apiUrl,
        consoleHost: consoleUrl,
    }) : undefined;

    // Signing keys for the API's two OIDC issuers.
    const oidcKeySets = createOidcKeySets();

    // Entry point to Pulumi API (service)
    // ECS Cluster/Service and all required infra will be created and attached to the LoadBalancer created above, via listneners and target groups
    new ApiService("pulumi-service", {
        accountId: config.accountId,
        containerCpu: config.api.apiContainerCpu,
        checkPointbucket: checkpointsBucket,
        containerMemoryReservation: config.api.apiContainerMemoryReservation,
        database: config.database,
        disableEmailLogin: config.api.apiDisableEmailLogin,
        disableEmailSignup: config.api.apiDisableEmailSignup,
        engineEventsSchemaV2: config.api.apiEngineEventsSchemaV2,
        engineEventsLegacyWrite: config.api.apiEngineEventsLegacyWrite,
        ecrRepoAccountId: config.ecrRepoAccountId,
        dns: {
            apiUrl: apiUrl,
            consoleUrl: consoleUrl,
            rootDomain: `$${config.dns.route53Subdomain}.${config.dns.route53ZoneName}`,
            whiteListCidrBlocks: config.dns.whiteListCidrBlocks
        },
        opensearch: {
            domain: config.opensearch.domain,
            endpoint: config.opensearch.endpoint,
            password: config.opensearch.password,
            user: config.opensearch.user
        },
        endpointSecurityGroupId: config.endpointSecurityGroupId,
        imageTag: config.dockerHub.imageTag,
        kmsServiceKeyId: config.kmsServiceKeyId,
        licenseKey: config.api.licenseKey,
        logArgs: config.logs.logArgs,
        logType: config.logs.logType,
        metadataBucket: metadataBucket,
        numberDesiredTasks: config.api.apiDesiredNumberTasks,
        oidcKeySets: oidcKeySets,
        policyPacksBucket: policyPacksBucket,
        privateNetwork: privateNetwork,
        privateSubnetIds: config.privateSubnetIds,
        proxy: proxy,
        recaptchaSecretKey: config.recaptchaSecretKey,
        region: config.region,
        samlCertPrivateKey: config.api.samlCertPrivateKey,
        samlCertPublicKey: config.api.samlCertPublicKey,
        secretsManagerPrefix: secretsPrefix,
        smtp: config.smtp,
        taskMemory: config.api.apiTaskMemory,
        taskCpu: config.api.apiTaskCpu,
        trafficManager: trafficManager,
        vpcId: config.vpcId,
    });

    // Entry point to Pulumi Console
    // ECS Cluster/Service and all required infra will be created and attached to the LoadBalancer created above, via listneners and target groups
    new ConsoleService("pulumi-console", {
        accountId: config.accountId,
        containerMemoryReservation: config.console.consoleContainerMemoryReservation,
        containerCpu: config.console.consoleContainerCpu,
        dns: {
            apiUrl: apiUrl,
            consoleUrl: consoleUrl,
            rootDomain: config.dns.route53ZoneName,
            whiteListCidrBlocks: config.dns.whiteListCidrBlocks
        },
        ecrRepoAccountId: config.ecrRepoAccountId,
        endpointSecurityGroupId: config.endpointSecurityGroupId,
        imageTag: config.dockerHub.imageTag,
        hideEmailLogin: config.console.consoleHideEmailLogin,
        hideEmailSignup: config.console.consoleHideEmailSignup,
        kmsServiceKeyId: config.kmsServiceKeyId,
        logArgs: config.logs.logArgs,
        logType: config.logs.logType,
        numberDesiredTasks: config.console.consoleDesiredNumberTasks,
        privateNetwork: privateNetwork,
        privateSubnetIds: config.privateSubnetIds,
        recaptchaSiteKey: config.recaptchaSiteKey,
        agGridLicenseKey: config.console.agGridLicenseKey,
        region: config.region,
        samlSsoEnabled: config.console.samlSsoEnabled,
        secretsManagerPrefix: secretsPrefix,
        taskCpu: config.console.consoleTaskCpu,
        taskMemory: config.console.consoleTaskMemory,
        trafficManager: trafficManager,
        vpcId: config.vpcId,
    });

    return {
        checkpointsS3BucketName: checkpointsBucket.id,
        policyPacksS3BucketName: policyPacksBucket.id,
        metadataS3BucketName: metadataBucket.id,

        // the DNS project will use all these outputs to create A records
        // in private mode these are the internal ALBs
        apiLoadBalancerDnsName: trafficManager.api.loadBalancer.dnsName,
        apiLoadBalancerZoneId: trafficManager.api.loadBalancer.zoneId,
        consoleLoadBalancerDnsName: trafficManager.console.loadBalancer.dnsName,
        consoleLoadBalancerZoneId: trafficManager.console.loadBalancer.zoneId,
        route53ZoneName: config.dns.route53ZoneName,
        route53Subdomain: config.dns.route53Subdomain,
    }
}

