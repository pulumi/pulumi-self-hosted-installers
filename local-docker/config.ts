import * as pulumi from "@pulumi/pulumi";

const stackConfig = new pulumi.Config();

const imageTag = stackConfig.require("imageTag");

/**
 * Data path values
 */
let dataPath = stackConfig.get("dataPath");
if (dataPath == undefined) {
    dataPath = `${require('os').homedir()}/pulumi-ee/data`;
}
if (!require("fs").existsSync(dataPath)) {
    pulumi.log.info(`Data path [${dataPath}] does not exist. This directory must exist on the local host before proceeding. Exiting...`);
    process.exit(1);
}
pulumi.log.info(`Using data path [${dataPath}] for host and in-container paths.`);

/**
 * Domain values - e.g. `api.` and `app.`.
 */
const defaultDomain = "localhost";
const apiDomain = stackConfig.get("apiDomain") || defaultDomain;
const consoleDomain = stackConfig.get("consoleDomain") || defaultDomain;
if (apiDomain !== "localhost" && !apiDomain.startsWith("api.")) {
    throw new Error("Configuration value [apiDomain] must start with [api.].")
}
if (consoleDomain !== "localhost" && !consoleDomain.startsWith("app.")) {
    throw new Error("Configuration value [consoleDomain] must start with [app.].")
}

/**
 * Certificates and NGINX
 */
const disableNginxProxy = stackConfig.getBoolean("disableNginxProxy") || false;
const exposeContainerPorts = stackConfig.getBoolean("exposeContainerPorts");

let apiTlsKey, apiTlsCert, consoleTlsKey, consoleTlsCert;
if (disableNginxProxy == false) {
    apiTlsKey = stackConfig.requireSecret("apiTlsKey");
    apiTlsCert = stackConfig.requireSecret("apiTlsCert");
    consoleTlsKey = stackConfig.requireSecret("consoleTlsKey");
    consoleTlsCert = stackConfig.requireSecret("consoleTlsCert");
}

/**
 * Container images
 */
const DEFAULT_IMAGE_REGISTRY = "registry-1.docker.io";
const imageRegistryAddress = stackConfig.get("imageRegistryAddress") || DEFAULT_IMAGE_REGISTRY;
const imageRegistryUsername = stackConfig.get("imageRegistryUsername");
const imageRegistryAccessToken = stackConfig.getSecret("imageRegistryAccessToken");

let imageAddressPrefix = "";
if (imageRegistryAddress !== DEFAULT_IMAGE_REGISTRY) {
    imageAddressPrefix = `${imageRegistryAddress}/`;
}

/**
 * Recaptcha - used for protecting "reset password".
 * See https://bit.ly/3gTbFiH for details about default keys.
 */
const defaultRecaptchaSiteKey = "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI";
const defaultRecaptchaSecretKey = "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe";

export const config = {
    dataPath,
    licenseData: stackConfig.requireSecret("licenseKey"),

    imageRegistryUsername,
    imageRegistryAccessToken,
    imageRegistryAddress,

    migrationImageName: pulumi.interpolate`${imageAddressPrefix}pulumi/migrations:${imageTag}`,
    consoleImageName: pulumi.interpolate`${imageAddressPrefix}pulumi/console:${imageTag}`,
    serviceImageName: pulumi.interpolate`${imageAddressPrefix}pulumi/service:${imageTag}`,

    nginxImageName: pulumi.interpolate`${imageAddressPrefix}nginx:stable-alpine`,

    apiDomain,
    consoleDomain,

    apiEndpoint: `https://${apiDomain}`,
    consoleEndpoint: `https://${consoleDomain}`,

    dbHost: stackConfig.require("dbHost"),
    dbPort: stackConfig.get("dbPort") || 3306,
    dbUsername: stackConfig.require("dbUsername"),
    dbUserPassword: stackConfig.requireSecret("dbUserPassword"),
    disableDbMigrations: stackConfig.getBoolean("disableDbMigrations") || false,

    localKeysValue: stackConfig.requireSecret("localKeysValue"),

    storageAccessKey: stackConfig.require("storageAccessKey"),
    storageSecretKey: stackConfig.requireSecret("storageSecretKey"),
    storageCheckpointBucket: stackConfig.require("storageCheckpointBucket"),
    storagePolicyPackBucket: stackConfig.require("storagePolicyPackBucket"),

    disableNginxProxy,
    exposeContainerPorts,

    apiTlsKey,
    apiTlsCert,
    consoleTlsKey,
    consoleTlsCert,

    samlSsoEnabled: stackConfig.getBoolean("samlSsoEnabled") || false,

    smtpServer: stackConfig.get("smtpServer") || "",
    smtpUsername: stackConfig.get("smtpUsername") || "",
    smtpPassword: stackConfig.getSecret("smtpPassword") || "",
    smtpFromAddress: stackConfig.get("smtpFromAddress") || "message@pulumi.com",

    recaptchaSecretKey: stackConfig.getSecret("recaptchaSecretKey") ?? defaultRecaptchaSecretKey,
    recaptchaSiteKey: stackConfig.get("recaptchaSiteKey") ?? defaultRecaptchaSiteKey,
};
