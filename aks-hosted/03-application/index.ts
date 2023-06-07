import { interpolate, all, Input } from "@pulumi/pulumi";
import { Provider, core, apps, networking } from "@pulumi/kubernetes";
import { config } from "./config";
import { SecretsCollection } from "./secrets";
import { SsoCertificate } from "./sso-cert";

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

const provider = new Provider("k8s-provider", {
  kubeconfig: config.kubeconfig,
});

const appsNamespace = new core.v1.Namespace(`${commonName}-apps`, {
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
      connectionString: config.database.connectionString,
      login: config.database.login,
      password: config.database.password,
      serverName: config.database.serverName
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
      siteKey: config.recaptchaSiteKey
    }
  }
});

const ssoSecret = new SsoCertificate(`${commonName}-sso-certificate`, {
  apiDomain: config.apiDomain,
  namespace: appsNamespace.metadata.name,
  provider: provider
});

const apiPortName = "http";
const apiDeployment = new apps.v1.Deployment(`${commonName}-${apiName}`, {
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
              valueFrom: secrets.DBConnSecret.asEnvValue("host"),
            },
            {
              name: "MYSQL_ROOT_USERNAME",
              valueFrom: secrets.DBConnSecret.asEnvValue("username"),
            },
            {
              name: "MYSQL_ROOT_PASSWORD",
              valueFrom: secrets.DBConnSecret.asEnvValue("password"),
            },
            {
              name: "PULUMI_DATABASE_PING_ENDPOINT",
              valueFrom: secrets.DBConnSecret.asEnvValue("host"),
            },
            {
              name: "RUN_MIGRATIONS_EXTERNALLY",
              value: "true"
            }
          ]
        }],
        containers: [
          {
            name: apiName,
            image: config.serviceImageName,
            resources: apiResources,
            ports: [{ containerPort: config.servicePort, name: apiPortName }],
            env: [
              {
                name: "PULUMI_LICENSE_KEY",
                valueFrom: secrets.LicenseKeySecret.asEnvValue("key"),
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
                valueFrom: secrets.DBConnSecret.asEnvValue("host"),
              },
              {
                name: "PULUMI_DATABASE_USER_NAME",
                valueFrom: secrets.DBConnSecret.asEnvValue("username"),
              },
              {
                name: "PULUMI_DATABASE_USER_PASSWORD",
                valueFrom: secrets.DBConnSecret.asEnvValue("password"),
              },
              {
                name: "PULUMI_DATABASE_NAME",
                value: "pulumi",
              },
              {
                name: "SAML_CERTIFICATE_PUBLIC_KEY",
                valueFrom: ssoSecret.SamlSsoSecret.asEnvValue("pubkey")
              },
              {
                name: "SAML_CERTIFICATE_PRIVATE_KEY",
                valueFrom: ssoSecret.SamlSsoSecret.asEnvValue("privatekey")
              },
              {
                name: "AZURE_CLIENT_ID",
                value: config.clientId
              },
              {
                name: "AZURE_CLIENT_SECRET",
                value: config.clientSecret
              },
              {
                name: "AZURE_TENANT_ID",
                value: config.tenantId
              },
              {
                name: "AZURE_SUBSCRIPTION_ID",
                value: config.subscriptionId
              },
              {
                name: "AZURE_STORAGE_KEY",
                value: config.storageKey
              },
              {
                name: "PULUMI_POLICY_PACK_BLOB_STORAGE_ENDPOINT",
                value: interpolate`azblob://${config.policyBlobName}`
              },
              {
                name: "PULUMI_CHECKPOINT_BLOB_STORAGE_ENDPOINT",
                value: interpolate`azblob://${config.checkpointBlobName}`
              },
              {
                name: "AZURE_STORAGE_ACCOUNT",
                value: config.storageAccountName
              },
              {
                name: "PULUMI_AZURE_KV_URI",
                value: config.keyvaultUri
              },
              {
                name: "PULUMI_AZURE_KV_KEY_NAME",
                value: config.keyvaultKeyName
              },
              {
                name: "PULUMI_AZURE_KV_KEY_VERSION",
                value: config.keyvaultKeyVersion
              },
              {
                name: "SMTP_SERVER",
                valueFrom: secrets.SmtpSecret.asEnvValue("server"),
              },
              {
                name: "SMTP_USERNAME",
                valueFrom: secrets.SmtpSecret.asEnvValue("username"),
              },
              {
                name: "SMTP_PASSWORD",
                valueFrom: secrets.SmtpSecret.asEnvValue("password"),
              },
              {
                name: "SMTP_GENERIC_SENDER",
                valueFrom: secrets.SmtpSecret.asEnvValue("fromaddress")
              },
              {
                name: "RECAPTCHA_SECRET_KEY",
                valueFrom: secrets.RecaptchaSecret.asEnvValue("secretKey")
              },
              {
                name: "LOGIN_RECAPTCHA_SECRET_KEY",
                valueFrom: secrets.RecaptchaSecret.asEnvValue("secretKey")
              }
            ],
          },
        ],
      },
    },
  },
}, { provider });

const apiService = new core.v1.Service(`${commonName}-${apiName}`, {
  metadata: {
    name: `${apiName}-service`,
    namespace: appsNamespace.metadata.name,
  },
  spec: {
    ports: [{ port: 80, targetPort: config.servicePort, name: apiPortName }],
    selector: apiAppLabel,
  },
}, { provider, parent: apiDeployment });

const apiServiceEndpoint = core.v1.Endpoints.get("apiServiceEndpoints", apiService.id, { provider })
const apiServiceEndpointAddress = apiServiceEndpoint.subsets[0].addresses[0].ip;
const apiServiceEndpointPort = apiServiceEndpoint.subsets[0].ports[0].port;

const consolePortName = "http-port";
const consoleDeployment = new apps.v1.Deployment(`${commonName}-${consoleName}`, {
  metadata: {
    namespace: appsNamespace.metadata.name,
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
          ports: [{ containerPort: config.consolePort, name: consolePortName }],
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
              value: config.samlEnabled
            },
            {
              name: "PULUMI_API",
              value: interpolate`https://${config.apiDomain}`
            },
            {
              name: "PULUMI_API_INTERNAL_ENDPOINT",
              value: interpolate`http://${apiServiceEndpointAddress}:${apiServiceEndpointPort}`
            },
            {
              name: "RECAPTCHA_SITE_KEY",
              valueFrom: secrets.RecaptchaSecret.asEnvValue("siteKey")
            },
            {
              name: "LOGIN_RECAPTCHA_SITE_KEY",
              valueFrom: secrets.RecaptchaSecret.asEnvValue("siteKey")
            }
          ]
        }]
      }
    }
  }
}, { provider });

const consoleService = new core.v1.Service(`${commonName}-${consoleName}`, {
  metadata: {
    name: `${consoleName}-service`,
    namespace: appsNamespace.metadata.name,
  },
  spec: {
    ports: [{ port: 80, targetPort: config.consolePort, name: consolePortName }],
    selector: consoleAppLabel,
  },
}, { provider, parent: consoleDeployment });

let ingressAnnotations: Input<{
  [key: string]: Input<string>;
}> = {
  "nginx.ingress.kubernetes.io/proxy-body-size": "50m",
};

if(config.ingressAllowList.length > 0) {
  ingressAnnotations["nginx.ingress.kubernetes.io/whitelist-source-range"] = config.ingressAllowList;
}

new networking.v1.Ingress(`${commonName}-ingress`, {
  metadata: {
    name: "pulumi-service-ingress",
    namespace: appsNamespace.metadata.name,
    annotations: ingressAnnotations,
  },
  spec: {
    ingressClassName: "nginx",
    defaultBackend: {
      service: {
        name: consoleService.metadata.name,
        port: {
          number: 80
        }
      }
    },
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
          paths: [
            {
              path: "/",
              pathType: "Prefix",
              backend: {
                service: {
                  name: apiService.metadata.name,
                  port: {
                    name: apiPortName,
                  }
                }
              }
            }
          ]
        }
      },
      {
        host: config.consoleDomain,
        http: {
          paths: [
            {
              path: "/",
              pathType: "Prefix",
              backend: {
                service: {
                  name: consoleService.metadata.name,
                  port: {
                    name: consolePortName,
                  }
                }
              }
            }
          ]
        }
      }
    ]
  }
}, { provider: provider });

export const consoleUrl = interpolate`https://${config.consoleDomain}`;
export const apiUrl = interpolate`https://${config.apiDomain}`;
export const namespace = appsNamespace.metadata.name;
