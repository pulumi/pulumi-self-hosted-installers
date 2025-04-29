import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { config } from "./config";
import { SecretsCollection } from "./secrets";
import { SsoCertificate } from "./sso-cert";
import { EncryptionService } from "./encryptionService";

/**
 * Check pre-requisites.
 */
if (!config.apiDomain.startsWith("api.")) {
    throw new Error("Configuration value [apiDomain] must start with [api.].");
}
if (!config.consoleDomain.startsWith("app.")) {
    throw new Error("Configuration value [consoleDomain] must start with [app.].");
}

const commonName = "pulumi-selfhosted";

const apiName = "pulumi-api";
const apiAppLabel = { app: apiName };
const consoleName = "pulumi-console";
const consoleAppLabel = { app: consoleName };
const apiResources = { requests: { cpu: "2048m", memory: "1024Mi" } };
const consoleResources = { requests: { cpu: "1024m", memory: "512Mi" } };
const migrationResources = { requests: { cpu: "128m", memory: "128Mi" } };

const provider = new k8s.Provider("k8s-provider", {
  kubeconfig: config.kubeconfig,
});

const secrets = new SecretsCollection(`${commonName}-secrets`, {
  apiDomain: config.apiDomain,
  commonName: commonName,
  namespace: config.appNamespaceName,
  provider: provider,
  secretValues: {
    apiTlsCert: config.apiTlsCert,
    apiTlsKey: config.apiTlsKey,
    consoleTlsCert: config.consoleTlsCert,
    consoleTlsKey: config.consoleTlsKey,
    database: {
      host: config.database.host,
      connectionString: config.database.connectionString,
      login: config.database.login,
      password: config.database.password,
      serverName: config.database.serverName
    },
    storage: {
      accessKeyId: config.storageServiceAccountAccessKeyId,
      secretAccessKey: config.storageServiceAccountSecretAccessKey
    },
    licenseKey: config.licenseKey,
    smtpDetails: {
      smtpServer: config.smtpServer,
      smtpUsername: config.smtpUsername,
      smtpPassword: config.smtpPassword,
      smtpFromAddress: config.smtpFromAddress,
    },
    recaptcha: {
      secretKey: config.recaptchaSecretKey,
      siteKey: config.recaptchaSiteKey,
    },
    openSearch: {
      endpoint: config.openSearch.endpoint,
      username: config.openSearch.username,
      password: config.openSearch.password,
    },
  },
});

const ssoSecret = new SsoCertificate(`${commonName}-sso-certificate`, {
  apiDomain: config.apiDomain,
  namespace: config.appNamespaceName,
  provider: provider
});

const pulumiLocalKeySecret = new EncryptionService(`${commonName}-local-key`, {
  commonName: commonName,
  namespace: config.appNamespaceName,
  provider: provider
});

function generateEnvVarFromSecret(envVarName: string, secretName: pulumi.Output<string>, secretKey: string) : k8s.types.input.core.v1.EnvVar {
  return {
    name: envVarName,
    valueFrom: {
      secretKeyRef: {
        name: secretName,
        key: secretKey
      } 
    }
  }
}

const apiDeployment = new k8s.apps.v1.Deployment(`${commonName}-${apiName}`, {
    metadata: {
      namespace: config.appNamespaceName,
      name: `${apiName}-deployment`,
    },
    spec: {
      selector: { matchLabels: apiAppLabel },
      replicas: 1,
      template: {
        metadata: { labels: apiAppLabel },
        spec: {
          initContainers: [{
              name: "pulumi-migration",
              image: config.migrationImageName,
              resources: migrationResources,
              env: [
                  generateEnvVarFromSecret("PULUMI_DATABASE_ENDPOINT", secrets.DBConnSecret.metadata.name, "connectionString"),
                  generateEnvVarFromSecret("MYSQL_ROOT_USERNAME", secrets.DBConnSecret.metadata.name, "username"),
                  generateEnvVarFromSecret("MYSQL_ROOT_PASSWORD", secrets.DBConnSecret.metadata.name, "password"),
                  generateEnvVarFromSecret("PULUMI_DATABASE_PING_ENDPOINT", secrets.DBConnSecret.metadata.name, "host"),
                  {
                      name: "RUN_MIGRATIONS_EXTERNALLY",
                      value: "true"
                  }
              ]
          }],
          volumes: [
            pulumiLocalKeySecret.pulumiLocalKeysVolumeSpec
          ],
          containers: [
            {
              name: apiName,
              image: config.serviceImageName,
              resources: apiResources,
              ports: [{ containerPort: config.servicePort, name: "http" }],
              volumeMounts: [
                pulumiLocalKeySecret.pulumiLocalKeysVolumeMountSpec
              ],
              env: [
                pulumiLocalKeySecret.encryptionServiceEnv,
                generateEnvVarFromSecret("PULUMI_LICENSE_KEY", secrets.LicenseKeySecret.metadata.name, "key"),
                generateEnvVarFromSecret("PULUMI_DATABASE_ENDPOINT", secrets.DBConnSecret.metadata.name, "connectionString"),
                generateEnvVarFromSecret("PULUMI_DATABASE_USER_NAME", secrets.DBConnSecret.metadata.name, "username"),
                generateEnvVarFromSecret("PULUMI_DATABASE_USER_PASSWORD", secrets.DBConnSecret.metadata.name, "password"),
                generateEnvVarFromSecret("SAML_CERTIFICATE_PUBLIC_KEY", ssoSecret.SamlSsoSecret.metadata.name, "pubkey"),
                generateEnvVarFromSecret("SAML_CERTIFICATE_PRIVATE_KEY", ssoSecret.SamlSsoSecret.metadata.name, "privatekey"),
                generateEnvVarFromSecret("AWS_ACCESS_KEY_ID", secrets.StorageSecret.metadata.name, "accessKeyId"),
                generateEnvVarFromSecret("AWS_SECRET_ACCESS_KEY", secrets.StorageSecret.metadata.name, "secretAccessKey"),
                generateEnvVarFromSecret("SMTP_SERVER", secrets.SmtpSecret.metadata.name, "server"),
                generateEnvVarFromSecret("SMTP_USERNAME", secrets.SmtpSecret.metadata.name, "username"),
                generateEnvVarFromSecret("SMTP_PASSWORD", secrets.SmtpSecret.metadata.name, "password"),
                generateEnvVarFromSecret("SMTP_GENERIC_SENDER", secrets.SmtpSecret.metadata.name, "fromaddress"),
                generateEnvVarFromSecret("RECAPTCHA_SECRET_KEY", secrets.RecaptchaSecret.metadata.name, "secretKey"),
                generateEnvVarFromSecret("PULUMI_SEARCH_PASSWORD", secrets.OpenSearchSecret.metadata.name, "password"),
                generateEnvVarFromSecret("PULUMI_SEARCH_USER", secrets.OpenSearchSecret.metadata.name, "username"),
                generateEnvVarFromSecret("PULUMI_SEARCH_DOMAIN", secrets.OpenSearchSecret.metadata.name, "endpoint"),
                {
                  name: "PULUMI_ENTERPRISE",
                  value: "true",
                },
                {
                  name: "PULUMI_API_DOMAIN",
                  value: config.apiDomain,
                },
                {
                  name: "PULUMI_CONSOLE_DOMAIN",
                  value: config.consoleDomain,
                },
                {
                  name: "PULUMI_DATABASE_NAME",
                  value: "pulumi",
                },
                {
                  name: "AWS_REGION",
                  value: "us-east-1" // this is a dummy value needed to appease the bucket access code.
                },
                {
                  name: "PULUMI_POLICY_PACK_BLOB_STORAGE_ENDPOINT",
                  value: pulumi.interpolate`s3://${config.policyBlobName}?endpoint=storage.googleapis.com:443&s3ForcePathStyle=true`
                },
                {
                  name: "PULUMI_CHECKPOINT_BLOB_STORAGE_ENDPOINT",
                  value: pulumi.interpolate`s3://${config.checkpointBlobName}?endpoint=storage.googleapis.com:443&s3ForcePathStyle=true`
                },
                {
                  name: "PULUMI_CHECKPOINT_BLOB_STORAGE_ENDPOINT_V2",
                  value: pulumi.interpolate`s3://${config.checkpointBlobNameV2}?endpoint=storage.googleapis.com:443&s3ForcePathStyle=true`
                },
                {
                  name: "PULUMI_SERVICE_METADATA_BLOB_STORAGE_ENDPOINT",
                  value: pulumi.interpolate`s3://${config.escBlobName}?endpoint=storage.googleapis.com:443&s3ForcePathStyle=true`
                }
              ],
            },
          ],
        },
      },
    },
  }, { provider });

  const apiService = new k8s.core.v1.Service(`${commonName}-${apiName}`, {
      metadata: {
        name: `${apiName}-service`,
        namespace: config.appNamespaceName,
      },
      spec: {
        ports: [{ port: 80, targetPort: config.servicePort, name: "http-port" }],
        selector: apiAppLabel,
      },
  }, { provider, parent: apiDeployment });

  const consoleDeployment = new k8s.apps.v1.Deployment(`${commonName}-${consoleName}`, {
    metadata: {
      namespace: config.appNamespaceName,
      name: `${consoleName}-deployment`,
    },
    spec: {
      selector: { matchLabels: consoleAppLabel },
      replicas: 1,
      template: {
        metadata: { labels: consoleAppLabel },
        spec: {
          containers: [{
              image: config.consoleImageName,
              name: consoleName,
              resources: consoleResources,
              ports: [{ containerPort: config.consolePort, name: "http" }],
              env: [
                {
                  name: "PULUMI_CONSOLE_DOMAIN",
                  value: config.consoleDomain
                },
                {
                  name: "PULUMI_HOMEPAGE_DOMAIN",
                  value: config.consoleDomain
                },
                {
                  name: "SAML_SSO_ENABLED",
                  value: config.samlSsoEnabled
                },
                {
                  name: "PULUMI_API",
                  value: pulumi.interpolate`https://${config.apiDomain}`
                },
                {
                  name: "PULUMI_API_INTERNAL_ENDPOINT",
                  value: pulumi.interpolate`http://${apiService.metadata.name}.${config.appNamespaceName}:80`
                },
                generateEnvVarFromSecret("RECAPTCHA_SITE_KEY", secrets.RecaptchaSecret.metadata.name, "siteKey"),
            ]
          }]
        }
      }
    }
  }, { provider });

const consoleService = new k8s.core.v1.Service(`${commonName}-${consoleName}`, {
    metadata: {
      name: `${consoleName}-service`,
      namespace: config.appNamespaceName,
    },
    spec: {
      ports: [{ port: 80, targetPort: config.consolePort, name: "http-port" }],
      selector: consoleAppLabel,
    },
  }, { provider, parent: consoleDeployment });

  let ingressAnnotations: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }> = {
    "nginx.ingress.kubernetes.io/ssl-redirect": "true",
    "nginx.ingress.kubernetes.io/proxy-body-size": "50m",
  };

if (config.ingressAllowList.length > 0) {
  ingressAnnotations["nginx.ingress.kubernetes.io/whitelist-source-range"] = config.ingressAllowList;
}

const ingress = new k8s.networking.v1.Ingress(`${commonName}-ingress`, {
    kind: "Ingress",
    metadata: {
      name: "pulumi-service-ingress",
      namespace: config.appNamespaceName,
      annotations: ingressAnnotations,
    },
    spec: {
      ingressClassName: "nginx",
      tls: [
        {
          hosts: [config.consoleDomain],
          secretName: secrets.ConsoleCertificateSecret.metadata.name,
        },
        {
          hosts: [config.apiDomain],
          secretName: secrets.ApiCertificateSecret.metadata.name,
        }
      ],
      rules: [
        {
          host: config.apiDomain,
          http: {
            paths: [{
                pathType: "Prefix",
                path: "/",
                backend: {
                  service: {
                    name: apiService.metadata.name,
                    port: {
                      number: 80,
                    }
                  }
                }
            }],
          },
        },
        {
          host: config.consoleDomain,
          http: {
            paths: [{
                pathType: "Prefix",
                path: "/",
                backend: {
                  service: {
                    name: consoleService.metadata.name,
                    port: {
                      number: 80
                    }
                  }
                }
            }]
          }
        }
      ],
    },
  }, { provider, dependsOn: [apiService, consoleService] });

export const consoleUrl = pulumi.interpolate`https://${config.consoleDomain}`;
export const apiUrl = pulumi.interpolate`https://${config.apiDomain}`;
export const namespace = config.appNamespaceName;
