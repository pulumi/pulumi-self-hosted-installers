import * as pulumi from "@pulumi/pulumi";
import { getCallerIdentity } from "@pulumi/aws";
import { toLogType } from "./utils";
import { LogType } from "./logs/types";

export async function hydrateConfig() {
    const awsConfig = new pulumi.Config("aws");
    const region = awsConfig.require("region");

    const stackConfig = new pulumi.Config();
    const projectName = pulumi.getProject();
    const stackName = pulumi.getStack();

    const acmCertificateArn = stackConfig.require("acmCertificateArn");
    const kmsServiceKeyId = stackConfig.require("kmsServiceKeyId");
    const licenseKey = stackConfig.require("licenseKey");

    // NOTE: We will assume all networking pieces are already created properly; this may change in the future to allow for networking to be created as part of this process.

    // Everything between vpcId and openSearchDomain was once retrieved via stack reference. This has been changed to retrieve all values directly from configuration, instead.
    // The reason for this is to allow for more flexibility as config values are non-outputty whereas stack references are outputs (Output<T>).
    // This pattern pairs very nicely with PulumI ESC and the use of stackConfig (environments).
    // If ESC is ommitted, once can still set the configuration values as needed prior to executing the `application` program.

    const vpcId = stackConfig.require("vpcId");
    const privateSubnetIds: string[] = stackConfig.requireObject("privateSubnetIds");
    const publicSubnetIds: string[] = stackConfig.requireObject("publicSubnetIds");
    const isolatedSubnetIds: string[] | undefined = stackConfig.getObject("isolatedSubnetIds");

    const dbClusterEndpoint = stackConfig.require("dbClusterEndpoint");
    const dbPort = stackConfig.requireNumber("dbPort");
    const dbName = stackConfig.require("dbName");
    const dbSecurityGroupId = stackConfig.require("dbSecurityGroupId");
    const dbUsername = stackConfig.require("dbUsername");
    const dbPassword = stackConfig.require("dbPassword");

    // vpc endpoint security group
    const endpointSecurityGroupId = stackConfig.require("endpointSecurityGroupId");

    // Pulumi Insights (Resource Search)
    const openSearchUser = stackConfig.get("opensearchUser");
    const openSearchPassword = stackConfig.get("opensearchPassword");
    const openSearchEndpoint = stackConfig.get("opensearchEndpoint");
    const openSearchDomainName = stackConfig.get("opensearchDomainName");

    const recaptchaSiteKey = stackConfig.get("recaptchaSiteKey"); 
    const recaptchaSecretKey = stackConfig.get("recaptchaSecretKey");

    const samlCertPublicKey = stackConfig.getSecret("samlCertPublicKey");
    const samlCertPrivateKey = stackConfig.getSecret("samlCertPrivateKey");

    const ecrRepoAccountId = stackConfig.get("ecrRepoAccountId");
    const imageTag = stackConfig.require("imageTag");

    const route53ZoneName = stackConfig.require("domainName");
    const route53Subdomain = stackConfig.get("subDomain") || "";

    // Load balancer
    // provide a list of valid cidr blocks will restrict LB access on both API and UI to those specific CIDRS
    // conversely, absence of this config value will allow all CIDRs aka 0.0.0.0/0
    const whiteListCidrBlocks: string[] | undefined = stackConfig.getObject("whiteListCidrBlocks");

    // Pulumi Api
    const apiDesiredNumberTasks = stackConfig.getNumber("apiDesiredNumberTasks") || 1;
    const apiTaskMemory = stackConfig.getNumber("apiTaskMemory");
    const apiTaskCpu = stackConfig.getNumber("apiTaskCpu");
    const apiContainerCpu = stackConfig.getNumber("apiContainerCpu");
    const apiContainerMemoryReservation = stackConfig.getNumber("apiContainerMemoryReservation");
    const apiDisableEmailLogin = stackConfig.getBoolean("apiDisableEmailLogin") || false;
    const apiDisableEmailSignup = stackConfig.getBoolean("apiDisableEmailSignUp") || false;

    // Pulumi Console
    const consoleDesiredNumberTasks = stackConfig.getNumber("consoleDesirecNumberTasks") || 1;
    const consoleTaskMemory = stackConfig.getNumber("consoleTaskMemory");
    const consoleTaskCpu = stackConfig.getNumber("consoleTaskCpu");
    const consoleContainerCpu = stackConfig.getNumber("consoleContainerCpu");
    const consoleContainerMemoryReservation = stackConfig.getNumber("consoleContainerMemoryReservation");
    const consoleHideEmailLogin = stackConfig.getBoolean("consoleHideEmailLogin") || false;
    const consoleHideEmailSignup = stackConfig.getBoolean("consoleHideEmailSignup") || false;

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
        vpcId,
        privateSubnetIds,
        publicSubnetIds,
        isolatedSubnetIds,
        endpointSecurityGroupId,
        recaptchaSecretKey: pulumi.output(recaptchaSecretKey),
        recaptchaSiteKey,
        kmsServiceKeyId,
        ecrRepoAccountId,
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
            apiDisableEmailSignup
        },
        console: {
            consoleDesiredNumberTasks,
            consoleTaskMemory,
            consoleTaskCpu,
            consoleContainerCpu,
            consoleContainerMemoryReservation,
            samlSsoEnabled: samlCertPrivateKey ? true : false,
            consoleHideEmailLogin,
            consoleHideEmailSignup
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