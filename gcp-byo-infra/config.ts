import * as pulumi from "@pulumi/pulumi";

const stackConfig = new pulumi.Config();

const commonName = "pulumi-selfhosted";
const projectName = pulumi.getProject();
const stackName = pulumi.getStack();

const resourceNamePrefix = `${commonName}-${stackName}`;

const imageTag = stackConfig.require("imageTag");

export const config = {
    projectName,
    stackName,
    resourceNamePrefix,

    kubeconfig: stackConfig.requireSecret("kubeconfig"),
    serviceAccountName: stackConfig.require("serviceAccountName"),
    licenseKey: stackConfig.requireSecret("licenseKey"),
    database: {
        connectionString: stackConfig.require("dbConnectionString"),
        host: stackConfig.require("dbHost"),
        login: stackConfig.require("dbLogin"),
        password: stackConfig.requireSecret("dbPassword"),
        serverName: stackConfig.require("dbServerName")
    },
    migrationImageName: `pulumi/migrations:${imageTag}`,
    consoleImageName: `pulumi/console:${imageTag}`,
    serviceImageName: `pulumi/service:${imageTag}`,
    servicePort: 8080,
    consolePort: 3000,
    policyBlobName: stackConfig.require("policyBucketName"),
    checkpointBlobName: stackConfig.require("checkpointBucketName"),
    escBlobName: stackConfig.require("escBucketName"),
    storageServiceAccountAccessKeyId: stackConfig.require("serviceAccountAccessKeyId"),
    storageServiceAccountSecretAccessKey: stackConfig.require("serviceAccountSecretAccessKey"),
    apiDomain: stackConfig.require("apiDomain"),
    consoleDomain: stackConfig.require("consoleDomain"),
    apiTlsKey: stackConfig.requireSecret("apiTlsKey"),
    apiTlsCert: stackConfig.requireSecret("apiTlsCert"),
    consoleTlsKey: stackConfig.requireSecret("consoleTlsKey"),
    consoleTlsCert: stackConfig.requireSecret("consoleTlsCert"),
    smtpServer: stackConfig.get("smtpServer") || "",
    smtpUsername: stackConfig.get("smtpUsername") || "",
    smtpPassword: stackConfig.getSecret("smtpPassword") || "",
    smtpFromAddress: stackConfig.get("smtpFromAddress") || "message@pulumi.com",
    recaptchaSecretKey: stackConfig.getSecret("recaptchaSecretKey") || "",
    recaptchaSiteKey: stackConfig.get("recaptchaSiteKey") || "", 
    samlSsoEnabled: stackConfig.get("samlSsoEnabled") ?? "false",
    ingressAllowList: stackConfig.get("ingressAllowList") || "",
    encryptionKey: stackConfig.requireSecret("encryptionKey"),
};
