import * as pulumi from "@pulumi/pulumi";

const stackConfig = new pulumi.Config();

const commonName = "pulumi-selfhosted" || stackConfig.get("commonName");
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
    openSearch: {
        username: clusterStack.requireOutput("openSearchUsername"),
        password: clusterStack.requireOutput("openSearchPassword"),
        endpoint: clusterStack.requireOutput("openSearchEndpoint")
    },
    licenseKey: stackConfig.requireSecret("licenseKey"),
    database: {
        connectionString: infrastructureStack.requireOutput("dbConnectionString"),
        host: infrastructureStack.requireOutput("dbHost"),
        login: infrastructureStack.requireOutput("dbLogin"),
        password: infrastructureStack.requireOutput("dbPassword"),
        serverName: infrastructureStack.requireOutput("dbServerName")
    },
    appNamespaceName: clusterStack.requireOutput("appNamespace"),
    migrationImageName: `pulumi/migrations:${imageTag}`,
    consoleImageName: `pulumi/console:${imageTag}`,
    serviceImageName: `pulumi/service:${imageTag}`,
    servicePort: 8080,
    consolePort: 3000,
    policyBlobId: infrastructureStack.requireOutput("policyBucketId"),
    policyBlobName: infrastructureStack.requireOutput("policyBucketName"),
    checkpointBlobId: infrastructureStack.requireOutput("checkpointBucketId"),
    checkpointBlobName: infrastructureStack.requireOutput("checkpointBucketName"),
    escBlobName: infrastructureStack.requireOutput("escBucketName"),
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
    samlSsoEnabled: stackConfig.get("samlSsoEnabled") ?? "false",
    ingressAllowList: stackConfig.get("ingressAllowList") || "",
};

