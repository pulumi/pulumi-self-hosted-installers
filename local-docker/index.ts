import * as pulumi from "@pulumi/pulumi";
import * as docker from "@pulumi/docker";

// Run any prechecks before proceeding.
require("./prechecks");

import { SsoCertificate } from "./sso";
import { writeFileSync, createSha, } from "./utils";
import { config } from "./config";

/**
 * Directory and file paths.
 */
// TODO Allow for separate host path and container paths
const localKeysDataPath = `${config.dataPath}/localkeys`;
const nginxConfPath = `${config.dataPath}/nginx.conf`;

/**
 * Shared
 */

const servicesNetworkName = pulumi.output(docker.getNetwork({
	name: "pulumi-services",
}).then(() => {
    return docker.Network.get("pulumi-services", "pulumi-services").name;
}).catch(() => {
	return new docker.Network("pulumi-services", {
        name: "pulumi-services",
    }).name;
}));

/* 
* Docker provider
*/
const dockerProvider = new docker.Provider("docker", {
    registryAuth: [{
        username: config.imageRegistryUsername,
        password: config.imageRegistryAccessToken,
        address: config.imageRegistryAddress,
    }],
});

/**
 * Pulumi DB Migrations
 */
const serviceContainerDependencies = [];
if (config.disableDbMigrations == false) {
    const migrationsImage = new docker.RemoteImage("migrations", {
        name: config.migrationImageName,
        keepLocally: true,
    }, { provider: dockerProvider });

    const migrationsContainer = new docker.Container("migrations", {
        image: migrationsImage.latest,
        envs: [
            pulumi.interpolate`PULUMI_DATABASE_ENDPOINT=${config.dbHost}:${config.dbPort}`, // expects port - e.g. pulumi-db:3306
            pulumi.interpolate`PULUMI_DATABASE_PING_ENDPOINT=${config.dbHost}`, // expects NO port - e.g. pulumi-db

            "SKIP_CREATE_DB_USER=true",
            pulumi.interpolate`MYSQL_ROOT_USERNAME=${config.dbUsername}`,
            pulumi.interpolate`MYSQL_ROOT_PASSWORD=${config.dbUserPassword}`,
        ],
        restart: "no",
        networksAdvanced: [{
            name: servicesNetworkName,
        }]
    });
    serviceContainerDependencies.push(migrationsContainer);
}

/**
 * Pulumi Service (API)
 */
const encryptionKey = config.localKeysValue;
// Write encryption key to 'localkeys' file.
pulumi.log.info(`Writing localKeysValue from stack config to [${localKeysDataPath}].`);
writeFileSync(encryptionKey, localKeysDataPath);

const ssoCert = new SsoCertificate("service", {
    apiDomain: config.apiDomain,
});

const serviceImage = new docker.RemoteImage("service", {
    name: config.serviceImageName,
    keepLocally: true,
}, { provider: dockerProvider });

const serviceContainer = new docker.Container("service", {
    image: serviceImage.repoDigest,
    envs: [
        `PULUMI_ENTERPRISE=true`,
        pulumi.interpolate`PULUMI_LICENSE_KEY=${config.licenseData}`,

        `PULUMI_API_DOMAIN=${config.apiDomain}`,
        `PULUMI_CONSOLE_DOMAIN=${config.consoleDomain}`,

        `PULUMI_DATABASE_NAME=pulumi`,
        pulumi.interpolate`PULUMI_DATABASE_ENDPOINT=${config.dbHost}:${config.dbPort}`, // expects port - e.g. pulumi-db:3306
        pulumi.interpolate`PULUMI_DATABASE_USER_NAME=${config.dbUsername}`,
        pulumi.interpolate`PULUMI_DATABASE_USER_PASSWORD=${config.dbUserPassword}`,

        `AWS_REGION=us-east-1`, // value does not matter
        pulumi.interpolate`AWS_ACCESS_KEY_ID=${config.storageAccessKey}`,
        pulumi.interpolate`AWS_SECRET_ACCESS_KEY=${config.storageSecretKey}`,

        pulumi.interpolate`PULUMI_CHECKPOINT_BLOB_STORAGE_ENDPOINT=${config.storageCheckpointBucket}`,
        pulumi.interpolate`PULUMI_POLICY_PACK_BLOB_STORAGE_ENDPOINT=${config.storagePolicyPackBucket}`,

        pulumi.interpolate`PULUMI_LOCAL_KEYS=${localKeysDataPath}`,

        pulumi.interpolate`SAML_CERTIFICATE_PUBLIC_KEY=${ssoCert.cert.certPem}`,
        pulumi.interpolate`SAML_CERTIFICATE_PRIVATE_KEY=${ssoCert.privateKey.privateKeyPem}`,

        pulumi.interpolate`SMTP_SERVER=${config.smtpServer}`,
        pulumi.interpolate`SMTP_USERNAME=${config.smtpUsername}`,
        pulumi.interpolate`SMTP_PASSWORD=${config.smtpPassword}`,
        pulumi.interpolate`SMTP_GENERIC_SENDER=${config.smtpFromAddress}`,

        // Email identity config for self-service password reset.
        // The site (RECAPTCHA_SITE_KEY) key counterpart for this 
        // must be set in the `console` service below.
        pulumi.interpolate`RECAPTCHA_SECRET_KEY=${config.recaptchaSecretKey}`,
        pulumi.interpolate`LOGIN_RECAPTCHA_SECRET_KEY=${config.recaptchaSecretKey}`,
    ],
    networksAdvanced: [
        { name: servicesNetworkName, aliases: ["pulumi-api"] },
    ],
    ports: config.exposeContainerPorts ? [{ internal: 8080, external: 8080 }] : undefined,
    volumes: [
        { hostPath: localKeysDataPath, containerPath: localKeysDataPath, readOnly: true },
    ],
    healthcheck: {
        tests: ["CMD", "curl", "-f", "http://localhost:8080/api/status"],
        interval: "30s",
        timeout: "5s",
        retries: 3,
    },
    restart: "unless-stopped",
}, { dependsOn: [...serviceContainerDependencies] });

/**
 * Pulumi Console
 */
const consoleImage = new docker.RemoteImage("console", {
    name: config.consoleImageName,
    keepLocally: true,
}, { provider: dockerProvider });
const consoleContainer = new docker.Container("console", {
    image: consoleImage.repoDigest,
    envs: [
        `PULUMI_ENTERPRISE=true`,
        pulumi.interpolate`SAML_SSO_ENABLED=${config.samlSsoEnabled}`,

        pulumi.interpolate`PULUMI_API=${config.apiEndpoint}`,
        pulumi.interpolate`PULUMI_API_INTERNAL_ENDPOINT=http://${serviceContainer.name}:8080`,

        `CONSOLE_DOMAIN=${config.consoleEndpoint}`,
        `HOMEPAGE_DOMAIN=${config.consoleEndpoint}`,

        // Email identity config for self-service password reset.
        // The site (RECAPTCHA_SECRET_KEY) key counterpart for this 
        // must be set in the `api` service.
        pulumi.interpolate`RECAPTCHA_SITE_KEY=${config.recaptchaSiteKey}`,
        pulumi.interpolate`LOGIN_RECAPTCHA_SITE_KEY=${config.recaptchaSiteKey}`,
    ],
    networksAdvanced: [
        { name: servicesNetworkName },
    ],
    ports: config.exposeContainerPorts ? [{ internal: 3000, external: 3000 }] : undefined,
    restart: "unless-stopped",
});

/**
 * Nginx proxy
 */
if (config.disableNginxProxy == false) {
    pulumi.log.info(`Writing (multiple) TLS certificates from stack config to [${config.dataPath}].`);
    const pulumiApiCertName = "pulumi-api.pem";
    writeFileSync(config.apiTlsCert!, `${config.dataPath}/${pulumiApiCertName}`);
    const pulumiApiKeyName = "pulumi-api.key";
    writeFileSync(config.apiTlsKey!, `${config.dataPath}/${pulumiApiKeyName}`);
    const pulumiConsoleCertName = "pulumi-console.pem";
    writeFileSync(config.consoleTlsCert!, `${config.dataPath}/${pulumiConsoleCertName}`);
    const pulumiConsoleKeyName = "pulumi-console.key";
    writeFileSync(config.consoleTlsKey!, `${config.dataPath}/${pulumiConsoleKeyName}`);

    const nginxConfig = pulumi.interpolate`
# redirect http to https
server {
    listen      80 default_server;
    server_name _;
    return      301 https://$host$request_uri;
}

# proxy api requests
server {
    listen              443 ssl;
    server_name         ${config.apiDomain};

    ssl_certificate     ${pulumiApiCertName};
    ssl_certificate_key ${pulumiApiKeyName};
    ssl_protocols       TLSv1.2;

    location / {
        proxy_pass http://${serviceContainer.name}:8080;
    }
}

# proxy console requests
server {
    listen              443 ssl;
    server_name         ${config.consoleDomain};

    ssl_certificate     ${pulumiConsoleCertName};
    ssl_certificate_key ${pulumiConsoleKeyName};
    ssl_protocols       TLSv1.2;

    location / {
       proxy_pass http://${consoleContainer.name}:3000;
    }
}
`;
    pulumi.log.info(`Writing ngninx config to [${nginxConfPath}].`);
    writeFileSync(nginxConfig, nginxConfPath);

    const nginxImage = new docker.RemoteImage("nginx", {
        name: config.nginxImageName,
        keepLocally: true,
    }, { provider: dockerProvider });
    const nginxContainer = new docker.Container("nginx", {
        image: nginxImage.repoDigest,
        networksAdvanced: [
            { name: servicesNetworkName },
        ],
        envs: [
            // force the container to update when the config content changes
            pulumi.interpolate`PULUMI_NGINX_CONFIG_SHA=${createSha(nginxConfig)}`,
        ],
        ports: [
            { internal: 80, external: 80 },
            { internal: 443, external: 443 },
        ],
        volumes: [
            { hostPath: nginxConfPath, containerPath: "/etc/nginx/conf.d/pulumi-proxy.conf", readOnly: true, },
            { hostPath: `${config.dataPath}/${pulumiApiCertName}`, containerPath: `/etc/nginx/${pulumiApiCertName}`, readOnly: true, },
            { hostPath: `${config.dataPath}/${pulumiApiKeyName}`, containerPath: `/etc/nginx/${pulumiApiKeyName}`, readOnly: true, },
            { hostPath: `${config.dataPath}/${pulumiConsoleCertName}`, containerPath: `/etc/nginx/${pulumiConsoleCertName}`, readOnly: true, },
            { hostPath: `${config.dataPath}/${pulumiConsoleKeyName}`, containerPath: `/etc/nginx/${pulumiConsoleKeyName}`, readOnly: true, },
        ],
    }, { dependsOn: [serviceContainer, consoleContainer,] });
}
/**
 * Outputs
 */
export const dataPath = config.dataPath;
export const apiEndpoint = config.apiEndpoint;
export const consoleEndpoint = config.consoleEndpoint;
