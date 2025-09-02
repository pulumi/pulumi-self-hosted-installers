import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as aws from "@pulumi/aws";
import { config } from "./config";
import { SecretsCollection } from "./secrets";
import { EncryptionService } from "./encryptionService";

const k8sprovider = new k8s.Provider("provider", { kubeconfig: config.kubeconfig, deleteUnreachable: true });

////////////
// Names and Naming conventions
const migrationsImage = `pulumi/migrations:${config.imageTag}`;
const apiImage = `pulumi/service:${config.imageTag}`;
const consoleImage = `pulumi/console:${config.imageTag}`;

const commonName = "pulumi-selfhosted";

const apiName = "pulumi-api";
const apiAppLabel = { app: apiName };
const apiSubdomainName = "api";
const serviceEndpoint = pulumi.interpolate`${apiSubdomainName}.${config.hostedZoneDomainSubdomain}.${config.hostedZoneDomainName}`;
export const serviceUrl = pulumi.interpolate`https://${serviceEndpoint}`;

const consoleName = "pulumi-console";
const consoleAppLabel = { app: consoleName };
const consoleSubdomainName = "app";
const consoleEndpoint = pulumi.interpolate`${consoleSubdomainName}.${config.hostedZoneDomainSubdomain}.${config.hostedZoneDomainName}`;
export const consoleURL = pulumi.interpolate`https://${consoleEndpoint}`;

const apiPort = 8080;
const consolePort = 3000;
const apiReplicas = config.apiReplicas;
const consoleReplicas = config.consoleReplicas;

////////////
// Create Kubernetes namespace for the services.
// Since the 25-insights stack may have created the namespace, we need to check if the namespaces used by insights matches this one.
// If it does not, we need to create a new namespace.
// Once 25-insights is updated to use a different namespace, remove this check.
export const appsNamespaceName = config.appsNamespaceName;
config.openSearchNamespaceName.apply(openSearchNamespaceName => {
    if (appsNamespaceName != openSearchNamespaceName) {
        const protectOptions = config.protectResources ? { provider: k8sprovider, protect: true } : { provider: k8sprovider };
        const appsNamespace = new k8s.core.v1.Namespace(appsNamespaceName, { metadata: { name: appsNamespaceName } }, protectOptions);
    }
})

////////////
// Create the k8s service account for the API service.
const apiServiceAccount = new k8s.core.v1.ServiceAccount(apiName, {
    metadata: {
        namespace: config.appsNamespaceName,
        name: apiName,
    },
}, { provider: k8sprovider });

////////////
// Create secrets collection to pass values to the API and Console.
const secrets = new SecretsCollection(`${commonName}-secrets`, {
    apiDomain: serviceEndpoint,
    commonName: commonName,
    namespace: appsNamespaceName,
    provider: k8sprovider,
    secretValues: {
      database: {
        host: config.dbConn.apply(db => db.host),
        port: config.dbConn.apply(db => db.port),
        username: config.dbConn.apply(db => db.username),
        password: config.dbConn.apply(db => db.password)
      },
      licenseKey: config.licenseKey,
      agGridLicenseKey: config.agGridLicenseKey,
      smtpDetails: {
        smtpServer: config.smtpServer,
        smtpUsername: config.smtpUsername,
        smtpPassword: config.smtpPassword,
        smtpGenericSender: config.smtpGenericSender,
      },
      recaptcha: {
        secretKey: config.recaptchaSecretKey,
        siteKey: config.recaptchaSiteKey,
      },
      openSearch: {
        domain: config.openSearchEndpoint,
        username: config.openSearchUser,
        password: config.openSearchPassword,
      },
      github: {
        oauthEndpoint: config.githubOauthEndpoint,
        oauthId: config.githubOauthId,
        oauthSecret: config.githubOauthSecret
      },
      samlSso: {
        certCommonName: serviceEndpoint
      }
    },
  });
  
  const pulumiEncryptionKey = new EncryptionService(`${commonName}-encryption-key`, {
    commonName: commonName,
    namespace: appsNamespaceName,
    awsKMSKeyArn: config.awsKMSKeyArn,
    encryptionKey: config.encryptionKey,
    provider: k8sprovider
  });

// Returns an EnvVar object that references a secret key.
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

////////////
// Deploy services
// Minimum System Requirements (per replica):
// API:     2048m cpu, 1024Mi ram
// Console: 1024m cpu, 512Mi ram
//
// Requirements based on actual service usage and guidelines:
// https://www.pulumi.com/docs/guides/self-hosted/api/
// https://www.pulumi.com/docs/guides/self-hosted/console/
const apiResources = { requests: { cpu: "2048m", memory: "1024Mi" } };
const migrationResources = { requests: { cpu: "128m", memory: "128Mi" } };
const consoleResources = { requests: { cpu: "512m", memory: "512Mi" } };

////////////
// Deploy the API (backend) service.
const apiDeployment = new k8s.apps.v1.Deployment(`${commonName}-${apiName}`, {
  metadata: {
    namespace: appsNamespaceName,
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
            image: migrationsImage,
            resources: migrationResources,
            env: [
              generateEnvVarFromSecret("PULUMI_DATABASE_ENDPOINT", secrets.DBConnSecret.metadata.name, "endpoint"),
              generateEnvVarFromSecret("MYSQL_ROOT_USERNAME", secrets.DBConnSecret.metadata.name, "username"),
              generateEnvVarFromSecret("MYSQL_ROOT_PASSWORD", secrets.DBConnSecret.metadata.name, "password"),
              generateEnvVarFromSecret("PULUMI_DATABASE_PING_ENDPOINT", secrets.DBConnSecret.metadata.name, "host"),
              {
                  name: "RUN_MIGRATIONS_EXTERNALLY",
                  value: "true"
              }
          ]
        }],
        volumes: pulumiEncryptionKey.pulumiLocalKeysVolumes,
        containers: [
          {
            name: apiName,
            image: apiImage,
            resources: apiResources,
            ports: [{ containerPort: apiPort, name: "http" }],
            volumeMounts: pulumiEncryptionKey.pulumiLocalKeysVolumeMounts,
            env: [
              pulumiEncryptionKey.encryptionServiceEnv,
              generateEnvVarFromSecret("PULUMI_LICENSE_KEY", secrets.LicenseKeySecret.metadata.name, "key"),
              generateEnvVarFromSecret("PULUMI_DATABASE_ENDPOINT", secrets.DBConnSecret.metadata.name, "endpoint"),
              generateEnvVarFromSecret("PULUMI_DATABASE_USER_NAME", secrets.DBConnSecret.metadata.name, "username"),
              generateEnvVarFromSecret("PULUMI_DATABASE_USER_PASSWORD", secrets.DBConnSecret.metadata.name, "password"),
              generateEnvVarFromSecret("SAML_CERTIFICATE_PUBLIC_KEY", secrets.SamlSsoSecret.metadata.name, "pubkey"),
              generateEnvVarFromSecret("SAML_CERTIFICATE_PRIVATE_KEY", secrets.SamlSsoSecret.metadata.name, "privatekey"),
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
                value: serviceEndpoint,
              },
              {
                name: "PULUMI_CONSOLE_DOMAIN",
                value: consoleEndpoint,
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
                value: pulumi.interpolate`s3://${config.policyPacksS3BucketName}`
              },
              {
                name: "PULUMI_CHECKPOINT_BLOB_STORAGE_ENDPOINT",
                value: pulumi.interpolate`s3://${config.checkpointsS3BucketName}`
              },
              {
                name: "PULUMI_SERVICE_METADATA_BLOB_STORAGE_ENDPOINT",
                value: pulumi.interpolate`s3://${config.escBucketName}`
              },
              {
                name: "PULUMI_ENGINE_EVENTS_BLOB_STORAGE_ENDPOINT", 
                value: pulumi.interpolate`s3://${config.eventsS3BucketName}`,
              }
            ],
          },
        ],
      },
    },
  },
}, { provider: k8sprovider });

const apiService = new k8s.core.v1.Service(`${commonName}-${apiName}`, {
  metadata: {
    name: `${apiName}-service`,
    namespace: appsNamespaceName,    },
  spec: {
    ports: [{ port: 80, targetPort: 8080, name: "api" }],
    selector: apiAppLabel,
  },
}, { provider: k8sprovider, parent: apiDeployment });


////////////
// Deploy the Console (frontend) service.
const consoleDeployment = new k8s.apps.v1.Deployment(`${commonName}-${consoleName}`, {
  metadata: {
    namespace: appsNamespaceName,
    name: `${consoleName}-deployment`,
  },
  spec: {
    selector: { matchLabels: consoleAppLabel },
    replicas: 1,
    template: {
      metadata: { labels: consoleAppLabel },
      spec: {
        containers: [{
            image: consoleImage,
            name: consoleName,
            resources: consoleResources,
            ports: [{ containerPort: 3000, name: "http" }],
            env: [
              {
                name: "PULUMI_CONSOLE_DOMAIN",
                value: consoleEndpoint,
              },
              {
                name: "PULUMI_HOMEPAGE_DOMAIN",
                value: consoleEndpoint,
              },
              {
                name: "SAML_SSO_ENABLED",
                value: config.samlSsoEnabled
              },
              {
                name: "PULUMI_API",
                value: pulumi.interpolate`https://${serviceEndpoint}`,
              },
              {
                name: "PULUMI_API_INTERNAL_ENDPOINT",
                value: pulumi.interpolate`http://${apiService.metadata.name}.${appsNamespaceName}:80`
              },
              {
                name: "PULUMI_HIDE_EMAIL_LOGIN",
                value: config.consoleHideEmailLogin,
              },
              {
                name: "PULUMI_HIDE_EMAIL_SIGNUP", 
                value: config.consoleHideEmailSignup,
              },
              generateEnvVarFromSecret("RECAPTCHA_SITE_KEY", secrets.RecaptchaSecret.metadata.name, "siteKey"),
              generateEnvVarFromSecret("AG_GRID_LICENSE_KEY", secrets.AgGridLicenseKeySecret.metadata.name, "key"),
              generateEnvVarFromSecret("GITHUB_OAUTH_ENDPOINT", secrets.GithubSecret.metadata.name, "oauthEndpoint"),
              generateEnvVarFromSecret("GITHUB_OAUTH_ID", secrets.GithubSecret.metadata.name, "oauthId"),
              generateEnvVarFromSecret("GITHUB_OAUTH_SECRET", secrets.GithubSecret.metadata.name, "oauthSecret"),
          ]
        }]
      }
    }
  }
}, { provider: k8sprovider });

const consoleService = new k8s.core.v1.Service(`${commonName}-${consoleName}`, {
  metadata: {
    name: `${consoleName}-service`,
    namespace: appsNamespaceName,
  },
  spec: {
    ports: [{ port: 80, targetPort: 3000, name: "console" }],
    selector: consoleAppLabel,
  },
}, { provider: k8sprovider, parent: consoleDeployment });


// Create a PodDisruptionBudget on Pods to ensure availability during evictions
// by selecting a set of labels.
function createPodDisruptionBudget(
    name: string,
    minAvailable: pulumi.Input<string>,
    labels: pulumi.Input<any>,
    namespace: pulumi.Input<string>,
    provider: k8s.Provider,
): k8s.policy.v1.PodDisruptionBudget {
    return new k8s.policy.v1.PodDisruptionBudget(
        name,
        {
            metadata: { labels: labels, namespace: namespace, },
            spec: { minAvailable: minAvailable, selector: { matchLabels: labels }, },
        },
        { provider: k8sprovider },
    );
}

// Create PodDisruptionBudgets for the API and console deployments to ensure 2/3 of all replicas are always available during evictions.
createPodDisruptionBudget(apiName, "66%", apiDeployment.metadata.labels, config.appsNamespaceName, k8sprovider);
createPodDisruptionBudget(consoleName, "66%", consoleDeployment.metadata.labels, config.appsNamespaceName, k8sprovider);

////////////
// Create the wildcard TLS cert in ACM to use with the ALB on both the API and
// the console.
const certCertificate = new aws.acm.Certificate("cert", {
    domainName: `*.${config.hostedZoneDomainSubdomain}.${config.hostedZoneDomainName}`,
    subjectAlternativeNames: [`${config.hostedZoneDomainSubdomain}.${config.hostedZoneDomainName}`],
    validationMethod: "DNS",
});
const zone = aws.route53.getZoneOutput({
    name: `${config.hostedZoneDomainName}.`,
    privateZone: false
});

const certValidation = new aws.route53.Record("certValidation", {
    name: certCertificate.domainValidationOptions[0].resourceRecordName,
    records: [certCertificate.domainValidationOptions[0].resourceRecordValue],
    ttl: 60,
    type: certCertificate.domainValidationOptions[0].resourceRecordType,
    zoneId: zone.id,
});
const certCertificateValidation = new aws.acm.CertificateValidation("cert", {
    certificateArn: certCertificate.arn,
    validationRecordFqdns: [certValidation.fqdn],
});

//////////////
// Create the API and Console Ingress.
// Used with ALB, and external-dns.
const apiIngress = new k8s.networking.v1.Ingress(apiName,
    {
        metadata: {
            labels: { "app": "pulumi" },
            namespace: config.appsNamespaceName,
            annotations: {
                "kubernetes.io/ingress.class": "alb",
                "alb.ingress.kubernetes.io/target-type": "ip",
                "alb.ingress.kubernetes.io/scheme": "internet-facing",
                "alb.ingress.kubernetes.io/tags": "Project=pulumi-k8s-aws-cluster,Owner=pulumi",
                "alb.ingress.kubernetes.io/healthcheck-path": "/api/status",    // Required for the API but not the console since it does not have a health check.
                "alb.ingress.kubernetes.io/certificate-arn": certCertificateValidation.certificateArn,
                "alb.ingress.kubernetes.io/listen-ports": '[{"HTTP": 80}, {"HTTPS": 443}]',
                "alb.ingress.kubernetes.io/security-groups": config.albSecurityGroupId,
            },
        },
        spec: {
            rules: [
                {
                    host: `${apiSubdomainName}.${config.hostedZoneDomainSubdomain}.${config.hostedZoneDomainName}`,
                    http: {
                        paths: [
                            {
                                path: "/",
                                pathType: "Prefix",
                                backend: {
                                    service: {
                                        name: apiService.metadata.name,
                                        port: {
                                            name: "api",
                                        }
                                    }
                                }
                            },
                        ],
                    },
                },
            ]
        }
    },
    { provider: k8sprovider }
);

const consoleIngress = new k8s.networking.v1.Ingress(consoleName,
    {
        metadata: {
            labels: { "app": "pulumi" },
            namespace: config.appsNamespaceName,
            annotations: {
                "kubernetes.io/ingress.class": "alb",
                "alb.ingress.kubernetes.io/target-type": "ip",
                "alb.ingress.kubernetes.io/scheme": "internet-facing",
                "alb.ingress.kubernetes.io/tags": "Project=pulumi-k8s-aws-cluster,Owner=pulumi",
                "alb.ingress.kubernetes.io/certificate-arn": certCertificateValidation.certificateArn,
                "alb.ingress.kubernetes.io/listen-ports": '[{"HTTP": 80}, {"HTTPS": 443}]',
                "alb.ingress.kubernetes.io/security-groups": config.albSecurityGroupId,
            },
        },
        spec: {
            rules: [
                {
                    host: `${consoleSubdomainName}.${config.hostedZoneDomainSubdomain}.${config.hostedZoneDomainName}`,
                    http: {
                        paths: [
                            {
                                path: "/",
                                pathType: "Prefix",
                                backend: {
                                    service: {
                                        name: consoleService.metadata.name,
                                        port: {
                                            name: "console",
                                        }
                                    }
                                }
                            },
                        ],
                    },
                }
            ]
        }
    },
    { provider: k8sprovider }
);

export const serviceLoadbalancerDnsName = apiIngress.status.loadBalancer.ingress[0].hostname;
export const consoleLoadbalancerDnsName = consoleIngress.status.loadBalancer.ingress[0].hostname;   

////////////
// Create a Route53 record for the API and Console.
const zoneId = aws.route53.getZoneOutput({ name: config.hostedZoneDomainName}).zoneId

const consoleDnsRecord = new aws.route53.Record("consoleEndDnsRecord", {
  zoneId: zoneId,
  name: consoleEndpoint,
  type: "CNAME",
  ttl: 300,
  records: [ consoleLoadbalancerDnsName]
})

const serviceDnsRecord = new aws.route53.Record("serviceEndDnsRecord", {
  zoneId: zoneId,
  name: serviceEndpoint,
  type: "CNAME",
  ttl: 300,
  records: [ serviceLoadbalancerDnsName]
})

