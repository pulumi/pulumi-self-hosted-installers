import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import {config} from "./config";
import {SecretsCollection} from "./secrets";
import {SsoCertificate} from "./sso-cert";
import {EncryptionService} from "./encryption-service";
import {createEnvValueFromSecret} from "./secret-utils";

/**
 * Check pre-requisites.
 */
if (!config.apiDomain.startsWith("api.")) {
    throw new Error("Configuration value [apiDomain] must start with [api.].")
}
if (!config.consoleDomain.startsWith("app.")) {
    throw new Error("Configuration value [consoleDomain] must start with [app.].")
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

const appsNamespace = new k8s.core.v1.Namespace(`${commonName}-apps`, {
  metadata: {
      name: `${commonName}-apps`,
  },
}, { provider });

const secrets = new SecretsCollection(`${commonName}-secrets`, {
  apiDomain: config.apiDomain,
  commonName: commonName,
  namespace: appsNamespace.metadata.name,
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
      password:config.database.password,
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
      secretKey: config.recaptchaSecretKey || "",
      siteKey: config.recaptchaSiteKey || ""
    }
  }
});

const ssoSecret = new SsoCertificate(`${commonName}-sso-certificate`, {
  apiDomain: config.apiDomain,
  namespace: appsNamespace.metadata.name,
  provider: provider
});

const pulumiLocalKeySecret = new EncryptionService(`${commonName}-local-key`, {
  commonName: commonName,
  namespace: appsNamespace.metadata.name,
  provider: provider
});

const apiDeployment = new k8s.apps.v1.Deployment(`${commonName}-${apiName}`, {
    metadata: {
      namespace: appsNamespace.metadata.name,
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
                  {
                      name: "PULUMI_DATABASE_ENDPOINT",
                      valueFrom: createEnvValueFromSecret(secrets.DBConnSecret, "connectionString"),
                  },
                  {
                      name: "MYSQL_ROOT_USERNAME",
                      valueFrom: createEnvValueFromSecret(secrets.DBConnSecret, "username"),
                  },
                  {
                      name: "MYSQL_ROOT_PASSWORD",
                      valueFrom: createEnvValueFromSecret(secrets.DBConnSecret, "password"),
                  },
                  {
                      name: "PULUMI_DATABASE_PING_ENDPOINT",
                      valueFrom: createEnvValueFromSecret(secrets.DBConnSecret, "host"),
                  },
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
                {
                  name: "PULUMI_LICENSE_KEY",
                  valueFrom: createEnvValueFromSecret(secrets.LicenseKeySecret, "key"),
                },
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
                  name: "PULUMI_DATABASE_ENDPOINT",
                  valueFrom: createEnvValueFromSecret(secrets.DBConnSecret, "connectionString"),
                },
                {
                  name: "PULUMI_DATABASE_USER_NAME",
                  valueFrom: createEnvValueFromSecret(secrets.DBConnSecret, "username"),
                },
                {
                  name: "PULUMI_DATABASE_USER_PASSWORD",
                  valueFrom: createEnvValueFromSecret(secrets.DBConnSecret, "password"),
                },
                {
                  name: "PULUMI_DATABASE_NAME",
                  value: "pulumi",
                },
                {
                  name: "SAML_CERTIFICATE_PUBLIC_KEY",
                  valueFrom: createEnvValueFromSecret(ssoSecret.SamlSsoSecret, "pubkey")
                },
                {
                  name: "SAML_CERTIFICATE_PRIVATE_KEY",
                  valueFrom: createEnvValueFromSecret(ssoSecret.SamlSsoSecret, "privatekey")
                },
                {
                  name: "AWS_REGION",
                  value: "us-east-1" // this is a dummy value needed to appease the bucket access code.
                },
                {
                  name: "AWS_ACCESS_KEY_ID",
                  valueFrom: createEnvValueFromSecret(secrets.StorageSecret, "accessKeyId")
                },
                {
                  name: "AWS_SECRET_ACCESS_KEY",
                  valueFrom: createEnvValueFromSecret(secrets.StorageSecret, "secretAccessKey")
                },
                {
                  name: "PULUMI_POLICY_PACK_BLOB_STORAGE_ENDPOINT",
                  value: config.policyBucketConnectionString
                },
                {
                  name: "PULUMI_CHECKPOINT_BLOB_STORAGE_ENDPOINT",
                  value: config.checkpointBucketConnectionString 
                },
                {
                  name: "SMTP_SERVER",
                  valueFrom: createEnvValueFromSecret(secrets.SmtpSecret, "server"),
                },
                {
                  name: "SMTP_USERNAME",
                  valueFrom: createEnvValueFromSecret(secrets.SmtpSecret, "username"),
                },
                {
                  name: "SMTP_PASSWORD",
                  valueFrom: createEnvValueFromSecret(secrets.SmtpSecret, "password"),
                },
                {
                  name: "SMTP_GENERIC_SENDER",
                  valueFrom: createEnvValueFromSecret(secrets.SmtpSecret, "fromaddress")
                },
                {
                  name: "RECAPTCHA_SECRET_KEY",
                  valueFrom: createEnvValueFromSecret(secrets.RecaptchaSecret, "secretKey")
                }
              ],
            },
          ],
        },
      },
    },
  }, {provider});

  const apiService = new k8s.core.v1.Service(`${commonName}-${apiName}`, {
      metadata: {
        name: `${apiName}-service`,
        namespace: appsNamespace.metadata.name,
      },
      spec: {
        ports: [{ port: 80, targetPort: config.servicePort, name: "http-port" }],
        selector: apiAppLabel,
      },
  }, { provider, parent: apiDeployment });

  const apiServiceEndpoint = k8s.core.v1.Endpoints.get("apiServiceEndpoints", apiService.id, {provider})
  const apiServiceEndpointAddress = apiServiceEndpoint.subsets[0].addresses[0].ip
  const apiServiceEndpointPort = apiServiceEndpoint.subsets[0].ports[0].port

  const consoleDeployment = new k8s.apps.v1.Deployment(`${commonName}-${consoleName}`, {
    metadata: {
      namespace: appsNamespace.metadata.name,
      name: `${consoleName}-deployment`,
    },
    spec: {
      selector: {matchLabels: consoleAppLabel},
      replicas: 1,
      template: {
        metadata: {labels: consoleAppLabel},
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
                  value: pulumi.interpolate`http://${apiServiceEndpointAddress}:${apiServiceEndpointPort}`
                },
                {
                  name: "RECAPTCHA_SITE_KEY",
                  valueFrom: createEnvValueFromSecret(secrets.RecaptchaSecret, "siteKey")
                }
            ]
          }]
        }
      }
    }
  }, {provider});
  
  const consoleService = new k8s.core.v1.Service(`${commonName}-${consoleName}`, {
    metadata: {
      name: `${consoleName}-service`,
      namespace: appsNamespace.metadata.name,
    },
    spec: {
      ports: [{ port: 80, targetPort: config.consolePort, name: "http-port" }],
      selector: consoleAppLabel,
    },
  }, { provider, parent: consoleDeployment });

  const ingress = new k8s.networking.v1.Ingress(`${commonName}-ingress`, {
    kind: "Ingress",
    metadata: {
      name: "pulumi-service-ingress",
      namespace: appsNamespace.metadata.name,
      annotations: {
        "nginx.ingress.kubernetes.io/ssl-redirect": "true"
      }
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
  }, {provider, dependsOn: [apiService, consoleService]});

export const consoleUrl = pulumi.interpolate`https://${config.consoleDomain}`;
export const apiUrl = pulumi.interpolate`https://${config.apiDomain}`;
export const namespace = appsNamespace.metadata.name;
