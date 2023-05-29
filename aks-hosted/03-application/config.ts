import { Config, StackReference, getStack, getProject } from "@pulumi/pulumi";

const stackConfig = new Config();

const commonName = "pulumi-selfhosted" || stackConfig.get("commonName");
const projectName = getProject();
const stackName = getStack();

const resourceNamePrefix = `${commonName}-${stackName}`;

const imageTag = stackConfig.require("imageTag");

const stackName1 = stackConfig.require("stackName1");
const stackName2 = stackConfig.require("stackName2");

const infrastructureStack = new StackReference(stackName1);
const clusterStack = new StackReference(stackName2);

const defaultRecaptchaSiteKey = "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"
const defaultRecaptchaSecretKey = "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe"

export const config = {
    projectName,
    stackName,
    resourceNamePrefix,

    kubeconfig: clusterStack.requireOutput("kubeconfig"),
    licenseKey: stackConfig.requireSecret("licenseKey"),
    database: {
        connectionString: infrastructureStack.requireOutput("dbConnectionString"),
        login: infrastructureStack.requireOutput("dbLogin"),
        password: infrastructureStack.requireOutput("dbPassword"),
        serverName: infrastructureStack.requireOutput("dbServerName")
    },
    migrationImageName: `pulumi/migrations:${imageTag}`,
    consoleImageName: `pulumi/console:${imageTag}`,
    serviceImageName: `pulumi/service:${imageTag}`,
    servicePort: 8080,
    consolePort: 3000,
    policyBlobId: infrastructureStack.requireOutput("policyBlobId"),
    policyBlobName: infrastructureStack.requireOutput("policyBlobName"),
    checkpointBlobId: infrastructureStack.requireOutput("checkpointBlobId"),
    checkpointBlobName: infrastructureStack.requireOutput("checkpointBlobName"),
    storageAccountId: infrastructureStack.requireOutput("storageAccountId"),
    apiDomain: stackConfig.require("apiDomain"),
    consoleDomain: stackConfig.require("consoleDomain"),
    apiTlsKey: stackConfig.requireSecret("apiTlsKey"),
    apiTlsCert: stackConfig.requireSecret("apiTlsCert"),
    consoleTlsKey: stackConfig.requireSecret("consoleTlsKey"),
    consoleTlsCert: stackConfig.requireSecret("consoleTlsCert"),
    tenantId: infrastructureStack.requireOutput("tenantId"),
    subscriptionId: infrastructureStack.requireOutput("subscriptionId"),
    clientId: infrastructureStack.requireOutput("adApplicationId"),
    clientSecret: infrastructureStack.requireOutput("adApplicationSecret"),
    storageKey: infrastructureStack.requireOutput("storagePrimaryKey"),
    storageAccountName: infrastructureStack.requireOutput("storageAccountName"),
    keyvaultKeyName: infrastructureStack.requireOutput("keyvaultKeyName"),
    keyvaultKeyVersion: infrastructureStack.requireOutput("keyvaultKeyVersion"),
    keyvaultUri: infrastructureStack.requireOutput("keyvaultUri"),
    smtpServer: stackConfig.get("smtpServer") || "",
    smtpUsername: stackConfig.get("smtpUsername") || "",
    smtpPassword: stackConfig.getSecret("smtpPassword") || "",
    smtpFromAddress: stackConfig.get("smtpFromAddress") || "message@pulumi.com",
    recaptchaSecretKey: stackConfig.getSecret("recaptchaSecretKey") ?? defaultRecaptchaSecretKey,
    recaptchaSiteKey: stackConfig.get("recaptchaSiteKey") ?? defaultRecaptchaSiteKey,
    samlEnabled: stackConfig.get("samlEnabled") || "false",
};
