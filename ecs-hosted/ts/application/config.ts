import * as pulumi from "@pulumi/pulumi";
import { getCallerIdentity } from "@pulumi/aws";
import { toLogType } from "./utils";

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
    // const baseStackReference = new pulumi.StackReference(stackConfig.require("baseStackReference"));

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

    //const vpcId = pulumi.output(baseStackReference.requireOutputValue("vpcId")).apply(id => <string>id);
    // const privateSubnetIds = pulumi.output(baseStackReference.requireOutputValue("privateSubnetIds")).apply(ids => <string[]>ids);
    // const publicSubnetIds = pulumi.output(baseStackReference.requireOutputValue("publicSubnetIds")).apply(ids => <string[]>ids);
    // const isolatedSubnetIds = pulumi.output(baseStackReference.requireOutputValue("isolatedSubnetIds")).apply(ids => <string[]>ids);

    // Database
    // const dbClusterEndpoint = pulumi.output(baseStackReference.requireOutputValue("dbClusterEndpoint")).apply(endpoint => <string>endpoint);
    // const dbPort = pulumi.output(baseStackReference.requireOutputValue("dbPort")).apply(port => <number>port);
    // const dbName = pulumi.output(baseStackReference.requireOutputValue("dbName")).apply(name => <string>name);
    // const dbSecurityGroupId = pulumi.output(baseStackReference.requireOutputValue("dbSecurityGroupId")).apply(id => <string>id);
    // const dbUsername = pulumi.output(baseStackReference.requireOutputValue("dbUsername")).apply(username => <string>username);
    // const dbPassword = pulumi.output(baseStackReference.requireOutput("dbPassword")).apply(password => <string>password);

    // vpc endpoint security group
    const endpointSecurityGroupId = stackConfig.require("endpointSecurityGroupId");

    const recaptchaSiteKey = stackConfig.get("recaptchaSiteKey") ?? "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI";
    const recaptchaSecretKey = stackConfig.get("recaptchaSecretKey") ?? "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe";

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

    // Pulumi Insights (Resource Search)
    const openSearchUser = stackConfig.get("openSearchUser");
    const openSearchPassword = stackConfig.get("openSearchPassword");
    const openSearchEndpoint = stackConfig.get("openSearchEndpoint");
    const openSearchDomain = stackConfig.get("openSearchDomain");

    // logs
    const logType = toLogType(stackConfig.get("logType"));
    const logArgs: any = stackConfig.getObject("logArgs");

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
        resourceSearch: {
            user: openSearchUser,
            password: openSearchPassword,
            domain: openSearchDomain,
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

