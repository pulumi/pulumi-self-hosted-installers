import { Config, StackReference, getStack, getProject, StackReferenceOutputDetails, Output } from "@pulumi/pulumi";

export const getConfig = async () => {
    const stackConfig = new Config();

    const commonName = stackConfig.get("commonName") || "pulumi-selfhosted" ;
    const projectName = getProject();
    const stackName = getStack();

    const resourceNamePrefix = `${commonName}-${stackName}`;

    const imageTag = stackConfig.require("imageTag");

    const stackName1 = stackConfig.require("stackName1");
    const stackName2 = stackConfig.require("stackName2");
    const certManagerEmail = stackConfig.get("certManagerEmail");

    const infrastructureStack = new StackReference(stackName1);
    const clusterStack = new StackReference(stackName2);

    // the below enableAzureDnsCertManagement will cause the legacy certs and keys to be ignored as well as
    // a cluster issuer and cert created using letsencrypt w/ DNs01 validation via Azure DNS
    const enableAzureDnsCertManagementValue = await clusterStack.getOutputDetails("disableAzureDnsCertManagement");
    const disableAzureDnsCertManagement = getValue<boolean>(enableAzureDnsCertManagementValue, false);

    const azureDnsZoneValue = await clusterStack.getOutputDetails("azureDnsZone");
    const azureDnsZone = getValue<string>(azureDnsZoneValue, "");

    const azureDnsZoneResourceGroupValue = await clusterStack.getOutputDetails("azureDnsZoneResourceGroup");
    const azureDnsZoneResourceGroup = getValue<string>(azureDnsZoneResourceGroupValue, "");

    const certManagerNamespaceValue = await clusterStack.getOutputDetails("certManagerNamespace");
    const certManagerNamespace = getValue<string>(certManagerNamespaceValue, "");

    const managedClientIdValue = await clusterStack.getOutputDetails("managedClientId");
    const managedClientId = getValue<string>(managedClientIdValue, "");

    // with the addition of cert-manager, we will treat the certs and keys from config as legacy and not required.
    let apiTlsCert: Output<string> | undefined;
    let apiTlsKey: Output<string> | undefined;
    let consoleTlsCert: Output<string> | undefined;
    let consoleTlsKey: Output<string> | undefined;
    if (disableAzureDnsCertManagement) {
        apiTlsKey = stackConfig.requireSecret("apiTlsKey");
        apiTlsCert = stackConfig.requireSecret("apiTlsCert");
        consoleTlsKey = stackConfig.requireSecret("consoleTlsKey");
        consoleTlsCert = stackConfig.requireSecret("consoleTlsCert");
    }

    return {
        projectName,
        stackName,
        resourceNamePrefix,
        kubeconfig: clusterStack.requireOutput("kubeconfig"),
        licenseKey: stackConfig.requireSecret("licenseKey"),
        agGridLicenseKey: stackConfig.getSecret("agGridLicenseKey") || "",
        database: {
            endpoint: infrastructureStack.requireOutput("dbEndpoint"),
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
        checkpointBlobIdV2: infrastructureStack.requireOutput("checkpointBlobIdV2"),
        checkpointBlobName: infrastructureStack.requireOutput("checkpointBlobName"),
        checkpointBlobNameV2: infrastructureStack.requireOutput("checkpointBlobNameV2"),
        escBlobId: infrastructureStack.requireOutput("escBlobId"),
        escBlobName: infrastructureStack.requireOutput("escBlobName"),
        storageAccountId: infrastructureStack.requireOutput("storageAccountId"),
        apiDomain: stackConfig.require("apiDomain"),
        consoleDomain: stackConfig.require("consoleDomain"),
        tenantId: infrastructureStack.requireOutput("tenantId"),
        subscriptionId: infrastructureStack.requireOutput("subscriptionId").apply(s => <string>s),
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
        recaptchaSecretKey: stackConfig.getSecret("recaptchaSecretKey") || "", 
        recaptchaSiteKey: stackConfig.get("recaptchaSiteKey") || "",
        samlEnabled: stackConfig.get("samlEnabled") || "false",
        ingressAllowList: stackConfig.get("ingressAllowList") || "",
        searchStorageClassName: stackConfig.get("searchStorageClassName") || "default",
        searchStorageSizeGB: stackConfig.getNumber("searchStorageSizeGB") || 4,
        apiTlsKey,
        apiTlsCert,
        consoleTlsKey,
        consoleTlsCert,
        disableAzureDnsCertManagement,
        azureDnsZone,
        azureDnsZoneResourceGroup,
        certManagerNamespace,
        managedClientId,
        certManagerEmail,
    };
};

function getValue<T>(input: StackReferenceOutputDetails, defaultValue: T): T {
    if (!input) {
        return defaultValue;
    }

    if (input.value) {
        return <T>input.value!;
    }

    if (input.secretValue) {
        return <T>input.secretValue!;
    }

    return defaultValue;
}
