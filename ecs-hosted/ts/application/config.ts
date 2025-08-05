import * as pulumi from "@pulumi/pulumi";
import { getCallerIdentity } from "@pulumi/aws";
import { toLogType } from "./utils";
import { LogType } from "./logs/types";

export async function hydrateConfig() {
    const awsConfig = new pulumi.Config("aws");
    const region = awsConfig.require("region");
    const profile = awsConfig.get("profile");

    const stackConfig = new pulumi.Config();
    const projectName = pulumi.getProject();
    const stackName = pulumi.getStack();

    // enabling private LB and limiting egress will enforce strict egress limits on ECS services as well as provide an additional internal LB for the API service
    const enablePrivateLoadBalancerAndLimitEgress = stackConfig.getBoolean("enablePrivateLoadBalancerAndLimitEgress") || false;

    // we require these values to be present in configuration (aka already created in AWS account)
    const acmCertificateArn = stackConfig.require("acmCertificateArn");
    const kmsServiceKeyId = stackConfig.require("kmsServiceKeyId");
    const licenseKey = stackConfig.require("licenseKey");
    const imageTag = stackConfig.require("imageTag");

    // allows user defined prefix to be prepended to the images. eg- upstream/pulumi/service:image:tag
    const imagePrefix = stackConfig.get("imagePrefix");

    // if not present, we assume ECR repo is present in our "current" AWS account
    const ecrRepoAccountId = stackConfig.get("ecrRepoAccountId");

    // baseStack == infrastructure stack
    const baseStackReference = stackConfig.require("baseStackReference");
    const stackRef = new pulumi.StackReference(baseStackReference);

    // retrieve networking, database, and VPC output values from the infrastack
    const vpcId = stackRef.getOutput("vpcId");
    const publicSubnetIds = stackRef.getOutput("publicSubnetIds");
    const privateSubnetIds = stackRef.getOutput("privateSubnetIds");
    const isolatedSubnetIds = stackRef.getOutput("isolatedSubnetIds");

    const dbClusterEndpoint = stackRef.getOutput("dbClusterEndpoint");
    const dbName = stackRef.getOutput("dbName");
    const dbUsername = stackRef.getOutput("dbUsername");
    const dbPassword = stackRef.getOutput("dbPassword");
    const dbPort = stackRef.getOutput("dbPort");
    const dbSecurityGroupId = stackRef.getOutput("dbSecurityGroupId");

    const openSearchUser = stackRef.getOutput("opensearchUser");
    const openSearchPassword = stackRef.getOutput("opensearchPassword");
    const openSearchDomainName = stackRef.getOutput("opensearchDomainName");
    const openSearchEndpoint = stackRef.getOutput("opensearchEndpoint");

    // this SG protects the VPCEs created in the infrastructure stack
    const endpointSecurityGroupId = stackRef.getOutput("endpointSecurityGroupId");

    // prefix list is needed for private connection to s3 (fargate control plane)
    const prefixListId = stackRef.getOutput("s3EndpointPrefixId");

    // Captcha
    const recaptchaSiteKey = stackConfig.get("recaptchaSiteKey"); 
    const recaptchaSecretKey = stackConfig.get("recaptchaSecretKey");

    // check if saml config is enabled
    const samlEnabled = stackConfig.getBoolean("samlEnabled") || false;
    let samlCertPublicKey: pulumi.Output<string> | undefined;
    let samlCertPrivateKey: pulumi.Output<string> | undefined;
    let userProvidedSamlCerts = false;

    if (samlEnabled) {
        // allow user to provide their own SAML certs, if they choose
        const userProvidedPublicKey = stackConfig.get("samlCertPublicKey");
        const userProvidedPrivateKey = stackConfig.get("samlCertPrivateKey");
        if (userProvidedPublicKey && userProvidedPrivateKey) {
            userProvidedSamlCerts = true;
            samlCertPublicKey = pulumi.output(userProvidedPublicKey);
            samlCertPrivateKey = stackConfig.requireSecret("samlCertPrivateKey");
        }
    }

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
    const consoleDesiredNumberTasks = stackConfig.getNumber("consoleDesiredNumberTasks") || 1;
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
        profile,
        accountId: account.accountId,
        projectName,
        stackName,
        enablePrivateLoadBalancerAndLimitEgress,
        vpcId,
        privateSubnetIds,
        publicSubnetIds,
        isolatedSubnetIds,
        endpointSecurityGroupId,
        prefixListId,
        recaptchaSecretKey: pulumi.output(recaptchaSecretKey),
        recaptchaSiteKey,
        kmsServiceKeyId,
        ecrRepoAccountId,
        dockerHub: {
            imageTag,
            imagePrefix,
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
            apiDisableEmailLogin,
            apiDisableEmailSignup,
            apiExecuteMigrations: process.env.PULUMI_EXECUTE_MIGRATIONS ? 
                process.env.PULUMI_EXECUTE_MIGRATIONS.toLowerCase() === 'true' : true
        },
        console: {
            consoleDesiredNumberTasks,
            consoleTaskMemory,
            consoleTaskCpu,
            consoleContainerCpu,
            consoleContainerMemoryReservation,
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
        saml: {
            enabled: samlEnabled,
            userProvidedCerts: userProvidedSamlCerts,
            certPublicKey: samlCertPublicKey,
            certPrivateKey: samlCertPrivateKey
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