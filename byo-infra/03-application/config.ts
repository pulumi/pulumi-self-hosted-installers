import * as pulumi from "@pulumi/pulumi";

const stackConfig = new pulumi.Config();

const commonName = stackConfig.get("commonName") || "pulumi-selfhosted";
const projectName = pulumi.getProject();
const stackName = pulumi.getStack();

const resourceNamePrefix = `${commonName}-${stackName}`;

const imageTag = stackConfig.require("imageTag");

const stackName1 = stackConfig.require("stackName1");
const stackName2 = stackConfig.require("stackName2");

const infrastructureStack = new pulumi.StackReference(stackName1);
const clusterStack = new pulumi.StackReference(stackName2);

export const config = {
    projectName,
    stackName,
    resourceNamePrefix,

    kubeconfig: clusterStack.requireOutput("kubeconfig"),
    licenseKey: stackConfig.requireSecret("licenseKey"),
    agGridLicenseKey: stackConfig.getSecret("agGridLicenseKey"),
    database: {
        connectionString: infrastructureStack.requireOutput("dbConnectionString"),
        host: infrastructureStack.requireOutput("dbHost"),
        login: infrastructureStack.requireOutput("dbLogin"),
        password: infrastructureStack.requireOutput("dbPassword"),
        serverName: infrastructureStack.requireOutput("dbServerName")
    },
    migrationImageName: `pulumi/migrations:${imageTag}`,
    consoleImageName: `pulumi/console:${imageTag}`,
    serviceImageName: `pulumi/service:${imageTag}`,
    servicePort: 8080,
    consolePort: 3000,
    // policyBlobId: infrastructureStack.requireOutput("policyBucketId"),
    policyBucketConnectionString: infrastructureStack.requireOutput("policyBucketConnectionString"),
    // checkpointBlobId: infrastructureStack.requireOutput("checkpointBucketId"),
    checkpointBucketConnectionString: infrastructureStack.requireOutput("checkpointBucketConnectionString"),
    storageServiceAccountAccessKeyId: infrastructureStack.requireOutput("serviceAccountAccessKeyId"),
    storageServiceAccountSecretAccessKey: infrastructureStack.requireOutput("serviceAccountSecretAccessKey"),
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
    recaptchaSecretKey: stackConfig.getSecret("recaptchaSecretKey"),
    recaptchaSiteKey: stackConfig.get("recaptchaSiteKey"),
    samlSsoEnabled: stackConfig.get("samlSsoEnabled") ?? "false"
};

