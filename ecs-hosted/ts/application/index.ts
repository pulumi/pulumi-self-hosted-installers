import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import { hydrateConfig } from "./config";
import { ApiService } from "./services/apiService";
import { ConsoleService } from "./services/consoleService";
import { TrafficManager } from "./networking/trafficManager";

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

    // Create infra related to handling traffic
    // ALB, HTTP & HTTPS listeners, empty target group, and ALB access logs if configuration says so
    const trafficManager = new TrafficManager("pulumi-tm", {
        accountId: config.accountId,
        certificateArn: config.dns.acmCertificateArn,
        publicSubnetIds: config.publicSubnetIds,
        region: config.region,
        vpcId: config.vpcId,
        whiteListCidrBlocks: config.dns.whiteListCidrBlocks
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
        policyPacksBucket: policyPacksBucket,
        privateSubnetIds: config.privateSubnetIds,
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
        apiLoadBalancerDnsName: trafficManager.api.loadBalancer.dnsName,
        apiLoadBalancerZoneId: trafficManager.api.loadBalancer.zoneId,
        consoleLoadBalancerDnsName: trafficManager.console.loadBalancer.dnsName,
        consoleLoadBalancerZoneId: trafficManager.console.loadBalancer.zoneId,
        route53ZoneName: config.dns.route53ZoneName,
        route53Subdomain: config.dns.route53Subdomain,
    }
}

