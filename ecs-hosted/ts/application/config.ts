import * as pulumi from "@pulumi/pulumi";
import { toLogType } from "./utils";

const awsConfig = new pulumi.Config("aws");
const region = awsConfig.require("region");

const stackConfig = new pulumi.Config();
const projectName = pulumi.getProject();
const stackName = pulumi.getStack();

const acmCertificateArn = stackConfig.require("acmCertificateArn");
const kmsServiceKeyId = stackConfig.require("kmsServiceKeyId");
const licenseKey = stackConfig.require("licenseKey");

// NOTE: We will assume all networking pieces are already created properly; this may change in the future to allow for networking to be created as part of this process.
const baseStackReference = new pulumi.StackReference(stackConfig.require("baseStackReference"));

const vpcId = pulumi.output(baseStackReference.requireOutputValue("vpcId")).apply(id => <string>id);
const privateSubnetIds = pulumi.output(baseStackReference.requireOutputValue("privateSubnetIds")).apply(ids => <string[]>ids);
const publicSubnetIds = pulumi.output(baseStackReference.requireOutputValue("publicSubnetIds")).apply(ids => <string[]>ids);
const isolatedSubnetIds = pulumi.output(baseStackReference.requireOutputValue("isolatedSubnetIds")).apply(ids => <string[]>ids);

// Database
const dbClusterEndpoint = pulumi.output(baseStackReference.requireOutputValue("dbClusterEndpoint")).apply(endpoint => <string>endpoint);
const dbPort = pulumi.output(baseStackReference.requireOutputValue("dbPort")).apply(port => <number>port);
const dbName = pulumi.output(baseStackReference.requireOutputValue("dbName")).apply(name => <string>name);
const dbSecurityGroupId = pulumi.output(baseStackReference.requireOutputValue("dbSecurityGroupId")).apply(id => <string>id);
const dbUsername = pulumi.output(baseStackReference.requireOutputValue("dbUsername")).apply(username => <string>username);
const dbPassword = pulumi.output(baseStackReference.requireOutput("dbPassword")).apply(password => <string>password);

// vpc endpoint security group
const endpointSecurityGroupId = pulumi.output(baseStackReference.requireOutput("endpointSecurityGroupId")).apply(endpoint => <string>endpoint);

const recaptchaSiteKey = stackConfig.get("recaptchaSiteKey") ?? "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI";
const recaptchaSecretKey = stackConfig.get("recaptchaSecretKey") ?? "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe";

const samlCertPublicKey = stackConfig.getSecret("samlCertPublicKey");
const samlCertPrivateKey = stackConfig.getSecret("samlCertPrivateKey");

const ecrRepoAccountId = pulumi.output(stackConfig.get("ecrRepoAccountId"));
const imageTag = stackConfig.require("imageTag");

const route53ZoneName = stackConfig.require("route53ZoneName");
const route53Subdomain = stackConfig.get("route53Subdomain");

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

const logArgs = stackConfig.getObject("logArgs") || {};
const logType = stackConfig.require("logType");
const ecsClusterArn = stackConfig.require("ecsClusterArn");
const openSearchInstanceType = stackConfig.get("openSearchInstanceType") || "t3.medium.search";
const openSearchInstanceCount = stackConfig.getNumber("openSearchInstanceCount") || 2;
const openSearchVolumeSize = stackConfig.getNumber("openSearchVolumeSize") || 10;

export const config = {
    region,
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
    baseTags: {
        project: projectName,
        stack: stackName,
    },
    logs: {
        logArgs,
        logType
    },
    ecsClusterArn,
    insights: {
        openSearchInstanceType,
        openSearchInstanceCount,
        openSearchVolumeSize
    }
};
