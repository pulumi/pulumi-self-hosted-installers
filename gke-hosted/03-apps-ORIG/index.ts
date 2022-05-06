import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import * as kx from "@pulumi/kubernetesx";
import * as tls from "@pulumi/tls";
import { types } from "@pulumi/kubernetesx";
import * as pulumi from "@pulumi/pulumi";
import EnvMap = types.EnvMap;
import { config } from "./config";
import * as rbac from "./rbac";
import { configurePulumiSecretProvider } from "./secrets-management"

const migrationsImage = `pulumi/migrations:${config.imageTag}`;
const apiImage = `pulumi/service:${config.imageTag}`;
const consoleImage = `pulumi/console:${config.imageTag}`;

const apiName = "pulumi-api";
const apiSubdomainName = "api";
const consoleName = "pulumi-console";
const consoleSubdomainName = "app";
const apiPort = 8080;
const consolePort = 3000;
const apiReplicas = config.apiReplicas;
const consoleReplicas = config.consoleReplicas;

// Create a k8s provider to the cluster.
const provider = new k8s.Provider("provider", { kubeconfig: config.kubeconfig });
const k8sProvider = new k8s.Provider("gkeK8s", {
    kubeconfig: k8sConfig,
});


////// COPIED FROM ORIGINAL 01
const appsNamespace = new k8s.core.v1.Namespace("apps", undefined, { provider: k8sProvider });
export const appsNamespaceName = appsNamespace.metadata.name;

// Create a resource quota in the apps namespace.
//
// Given 2 replicas each for HA:
// API:     4096m cpu, 2048Mi ram
// Console: 2048m cpu, 1024Mi ram
//
// 2x the HA requirements to create capacity for rolling updates of replicas:
// API:     8192m cpu, 4096Mi ram
// Console: 4096m cpu, 2048Mi ram
//
// Totals:  12288m cpu, 6144Mi ram
const quotaAppsNamespace = new k8s.core.v1.ResourceQuota("apps", {
    metadata: {namespace: appsNamespaceName},
    spec: {
        hard: {
            cpu: "12288",
            memory: "6144Mi",
            pods: "20",
            resourcequotas: "1",
            services: "5",
        },
    }
},{
    provider: k8sProvider
});

///////////////////





// Configure secrets provider, the component the Pulumi Service uses to encrypt stack secrets.
const secretsIntegration = configurePulumiSecretProvider(config, provider)

// Create a k8s Secret of the self-hosted Pulumi license.
const licenseKeySecret = new kx.Secret("license-key", {
    metadata: { namespace: config.appsNamespaceName },
    stringData: { key: config.licenseKey }
}, { provider });

// Create a Secret from the DB connection information.
const dbConnSecret = new kx.Secret("aurora-db-conn",
    {
        metadata: { namespace: config.appsNamespaceName },
        stringData: {
            host: config.dbConn.apply(db => db.host),
            endpoint: config.dbConn.apply(db => `${db.host}:${db.port}`),
            username: config.dbConn.apply(db => db.username),
            password: config.dbConn.apply(db => db.password),
        },
    },
    { provider },
);

let smtpConfig = {}
if (config.smtpServer) {
    const smtpSecret = new kx.Secret("smtp-conn",
    {
        metadata: { namespace: config.appsNamespaceName },
        stringData: {
            server: config.smtpServer,
            username: config.smtpUsername,
            password: config.smtpPassword,
            genericsender: config.smtpGenericSender
        },

    }, { provider })
    smtpConfig = {
        "SMTP_SERVER": smtpSecret.asEnvValue("server"),
        "SMTP_USERNAME": smtpSecret.asEnvValue("username"),
        "SMTP_PASSWORD": smtpSecret.asEnvValue("password"),
        "SMTP_GENERIC_SENDER": smtpSecret.asEnvValue("genericsender"),
    }
}

const ssoPrivateKey = new tls.PrivateKey("ssoPrivateKey", { algorithm: "RSA", rsaBits: 2048 })
const ssoCert = new tls.SelfSignedCert("ssoCert", {
    allowedUses: ["cert_signing"],
    privateKeyPem: ssoPrivateKey.privateKeyPem,
    subjects: [
        {commonName: `api.${config.hostedZoneDomainSubdomain}.${config.hostedZoneDomainName}`}
    ],
    validityPeriodHours: (365*24)
})
const samlSsoSecret = new kx.Secret("saml-sso",
{
    metadata: { namespace: config.appsNamespaceName },
    stringData: {
        pubkey: ssoCert.certPem,
        privatekey: ssoPrivateKey.privateKeyPem,
    },

}, { provider })
const samlSsoConfig = {
    "SAML_CERTIFICATE_PUBLIC_KEY": samlSsoSecret.asEnvValue("pubkey"),
    "SAML_CERTIFICATE_PRIVATE_KEY": samlSsoSecret.asEnvValue("privatekey"),
}

const recaptchaSecret = new kx.Secret("recaptcha", 
{
    metadata: { namespace: config.appsNamespaceName },
    stringData: {
        siteKey: config.recaptchaSiteKey,
        secretKey: config.recaptchaSecretKey
    },

}, { provider })
const recaptchaServiceConfig = {
    "RECAPTCHA_SECRET_KEY": recaptchaSecret.asEnvValue("secretKey"),
    "LOGIN_RECAPTCHA_SECRET_KEY": recaptchaSecret.asEnvValue("secretKey"),
}
const recaptchaConsoleConfig = {
    "RECAPTCHA_SITE_KEY": recaptchaSecret.asEnvValue("siteKey"),
    "LOGIN_RECAPTCHA_SITE_KEY": recaptchaSecret.asEnvValue("siteKey"),
}

// Currently any non-empty value for the disable/hide email env variables will be treated as a "true"
// When https://github.com/pulumi/pulumi-service/issues/7898 is fixed, then a simple line like 
// "PULUMI_DISABLE_EMAIL_LOGIN": config.apiDisableEmailLogin
// can be used.
const apiEmailLoginConfig = {
    "PULUMI_DISABLE_EMAIL_LOGIN": (config.apiDisableEmailLogin === "true" ? "true" : null),
    "PULUMI_DISABLE_EMAIL_SIGNUP": (config.apiDisableEmailSignup === "true" ? "true" : null),
}
const consoleEmailLoginConfig = {
    "PULUMI_HIDE_EMAIL_LOGIN": (config.consoleHideEmailLogin === "true" ? "true" : null),
    "PULUMI_HIDE_EMAIL_SIGNUP": (config.consoleHideEmailSignup === "true" ? "true" : null),
}

// Create S3 Buckets for the service checkpoints and policy packs.
const checkpointsBucket = new aws.s3.Bucket(`pulumi-checkpoints`, {}, { protect: true});
const policyPacksBucket = new aws.s3.Bucket(`pulumi-policypacks`, {}, { protect: true});
export const checkpointsS3BucketName = checkpointsBucket.id;
export const policyPacksS3BucketName = policyPacksBucket.id;

// Environment variables for the API service.
const awsRegion = pulumi.output(aws.getRegion())
const serviceEnv = pulumi
    .all([checkpointsS3BucketName, policyPacksS3BucketName, awsRegion.name])
    .apply(([cBucket, pBucket, regionName]) => {
        const envVars = {
            "AWS_REGION": regionName,
            "PULUMI_LICENSE_KEY": licenseKeySecret.asEnvValue("key"),
            "PULUMI_ENTERPRISE": "true",
            "PULUMI_API_DOMAIN": `${apiSubdomainName}.${config.hostedZoneDomainSubdomain}.${config.hostedZoneDomainName}`,
            "PULUMI_CONSOLE_DOMAIN": `${consoleSubdomainName}.${config.hostedZoneDomainSubdomain}.${config.hostedZoneDomainName}`,
            "PULUMI_DATABASE_ENDPOINT": dbConnSecret.asEnvValue("endpoint"),
            "MYSQL_ROOT_USERNAME": dbConnSecret.asEnvValue("username"),
            "MYSQL_ROOT_PASSWORD": dbConnSecret.asEnvValue("password"),
            "PULUMI_DATABASE_NAME": "pulumi",
            "PULUMI_OBJECTS_BUCKET": cBucket,
            "PULUMI_POLICY_PACK_BUCKET": pBucket,
            ...smtpConfig,
            ...samlSsoConfig,
            ...recaptchaServiceConfig,
            ...apiEmailLoginConfig,
        } as EnvMap;



        // Add env vars specific to managing secrets.
        envVars[secretsIntegration.envVarName] = secretsIntegration.envVarValue;

        return envVars;
    });

// Create IAM and ServiceAccount for S3 access.
const s3Role = rbac.createIAM(apiName, config.appsNamespaceName,
    config.clusterOidcProviderArn, config.clusterOidcProviderUrl);
const serviceAccount = rbac.createServiceAccount(apiName,
    provider, s3Role.arn, config.appsNamespaceName);
const serviceAccountName = serviceAccount.metadata.name;

// Minimum System Requirements (per replica):
// API:     2048m cpu, 1024Mi ram
// Console: 1024m cpu, 512Mi ram
//
// Requirements based on actual service usage and guidelines:
// https://www.pulumi.com/docs/guides/self-hosted/api/
// https://www.pulumi.com/docs/guides/self-hosted/console/
const apiResources = { requests: { cpu: "2048m", memory: "1024Mi" } };
const migrationResources = { requests: { cpu: "128m", memory: "128Mi" } };
const consoleResources = { requests: { cpu: "1024m", memory: "512Mi" } };

// Deploy the API service.
export const apiPodBuilder = new kx.PodBuilder({
    affinity: {
        // Target the Pods to run on nodes that match the labels for the node
        // selector.
        nodeAffinity: {
            requiredDuringSchedulingIgnoredDuringExecution: {
                nodeSelectorTerms: [
                    {
                        matchExpressions: [
                            {
                                key: "beta.kubernetes.io/instance-type",
                                operator: "In",
                                values: [config.nodeGroupInstanceType],
                            },
                        ],
                    },
                ],
            },
        },
        // Don't co-locate running Pods with matching labels on the same node,
        // and spread them per the node hostname.
        podAntiAffinity: {
            requiredDuringSchedulingIgnoredDuringExecution: [
                {
                    topologyKey: "kubernetes.io/hostname",
                    labelSelector: {
                        matchExpressions: [
                            {
                                key: "app",
                                operator: "In",
                                values: ["service"], // based on labels: {app: service} auto set by PodBuilder that uses the container image name.
                            },
                        ],
                    },
                },
            ],
        },
    },
    // Define the Pod tolerations of the tainted Nodes to target.
    tolerations: [
        {
            key: "self-hosted-pulumi",
            value: "true",
            effect: "NoSchedule",
        },
    ],
    serviceAccountName: serviceAccountName,
    // TODO: simplify this logic once initContainer support is added to kx (https://github.com/pulumi/pulumi-kubernetesx/issues/53)
    initContainers: [{
        name: "migration",
        image: migrationsImage,
        env: [
            {
                name: "PULUMI_DATABASE_ENDPOINT",
                valueFrom: dbConnSecret.asEnvValue("endpoint"),
            },
            {
                name: "MYSQL_ROOT_USERNAME",
                valueFrom: dbConnSecret.asEnvValue("username"),
            },
            {
                name: "MYSQL_ROOT_PASSWORD",
                valueFrom: dbConnSecret.asEnvValue("password"),
            },
            {
                name: "PULUMI_DATABASE_PING_ENDPOINT",
                valueFrom: dbConnSecret.asEnvValue("host"),
            }
        ],
        resources: migrationResources,
    }],
    containers: [{
        image: apiImage,
        ports: { api: apiPort },
        env: serviceEnv,
        volumeMounts: [
            // Add any files/volumes needed for managing secrets.
            ...secretsIntegration.mountPoint,
        ],
        resources: apiResources,
    }],
});
const apiDeployment = new kx.Deployment(apiName, {
    metadata: { namespace: config.appsNamespaceName },
    spec: apiPodBuilder.asDeploymentSpec({ replicas: apiReplicas }),
}, { provider });
const apiService = apiDeployment.createService();
export const serviceEndpoint = pulumi.interpolate`https://${apiSubdomainName}.${config.hostedZoneDomainSubdomain}.${config.hostedZoneDomainName}`;

// Deploy the Console.
const consolePodBuilder = new kx.PodBuilder({
    affinity: {
        // Target the Pods to run on nodes that match the labels for the node selector.
        nodeAffinity: {
            requiredDuringSchedulingIgnoredDuringExecution: {
                nodeSelectorTerms: [
                    {
                        matchExpressions: [
                            {
                                key: "beta.kubernetes.io/instance-type",
                                operator: "In",
                                values: [config.nodeGroupInstanceType],
                            },
                        ],
                    },
                ],
            },
        },
        // Don't co-locate running Pods with matching labels on the same node,
        // and spread them per the node hostname.
        podAntiAffinity: {
            requiredDuringSchedulingIgnoredDuringExecution: [
                {
                    topologyKey: "kubernetes.io/hostname",
                    labelSelector: {
                        matchExpressions: [
                            {
                                key: "app",
                                operator: "In",
                                values: ["console"], // based on labels: {app: console} auto set by PodBuilder that uses the container image name.
                            },
                        ],
                    },
                },
            ],
        },
    },
    // Define the Pod tolerations of the tainted Nodes to target.
    tolerations: [
        {
            key: "self-hosted-pulumi",
            value: "true",
            effect: "NoSchedule",
        },
    ],
    containers: [{
        image: consoleImage,
        ports: { console: consolePort },
        env: {
            "PULUMI_CONSOLE_DOMAIN": `${consoleSubdomainName}.${config.hostedZoneDomainSubdomain}.${config.hostedZoneDomainName}`,
            "PULUMI_HOMEPAGE_DOMAIN": `${consoleSubdomainName}.${config.hostedZoneDomainSubdomain}.${config.hostedZoneDomainName}`,
            "PULUMI_API": `https://${apiSubdomainName}.${config.hostedZoneDomainSubdomain}.${config.hostedZoneDomainName}`,
            "PULUMI_API_INTERNAL_ENDPOINT": pulumi.interpolate`http://${apiService.metadata.name}:${apiPort}`,
            "SAML_SSO_ENABLED": `${config.samlSsoEnabled}`,
            ...recaptchaConsoleConfig,
            ...consoleEmailLoginConfig
        },
        resources: consoleResources,
    }],
});
const consoleDeployment = new kx.Deployment(consoleName, {
    metadata: { namespace: config.appsNamespaceName },
    spec: consolePodBuilder.asDeploymentSpec({ replicas: consoleReplicas })
}, { provider });
const consoleService = consoleDeployment.createService();
export const consoleEndpoint = pulumi.interpolate`https://${consoleSubdomainName}.${config.hostedZoneDomainSubdomain}.${config.hostedZoneDomainName}`;

// Create a PodDisruptionBudget on Pods to ensure availability during evictions
// by selecting a set of labels.
function createPodDisruptionBudget(
    name: string,
    minAvailable: pulumi.Input<string>,
    labels: pulumi.Input<any>,
    namespace: pulumi.Input<string>,
    provider: k8s.Provider,
): k8s.policy.v1beta1.PodDisruptionBudget {
    return new k8s.policy.v1beta1.PodDisruptionBudget(
        name,
        {
            metadata: { labels: labels, namespace: namespace, },
            spec: { minAvailable: minAvailable, selector: { matchLabels: labels }, },
        },
        { provider: provider },
    );
}

// Create PodDisruptionBudgets for the API and console deployments to ensure 2/3 of all replicas are always available during evictions.
createPodDisruptionBudget(apiName, "66%", apiDeployment.metadata.labels, config.appsNamespaceName, provider);
createPodDisruptionBudget(consoleName, "66%", consoleDeployment.metadata.labels, config.appsNamespaceName, provider);

// Create the wildcard TLS cert in ACM to use with the ALB on both the API and
// the console.
const certCertificate = new aws.acm.Certificate("cert", {
    domainName: `*.${config.hostedZoneDomainSubdomain}.${config.hostedZoneDomainName}`,
    subjectAlternativeNames: [`${config.hostedZoneDomainSubdomain}.${config.hostedZoneDomainName}`],
    validationMethod: "DNS",
});
const zone = pulumi.output(aws.route53.getZone({
    name: `${config.hostedZoneDomainName}.`,
    privateZone: false,
}));
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

// Create the API and Console Ingress.
// Used with ALB, and external-dns.
const apiIngress = new k8s.networking.v1.Ingress(apiName,
    {
        metadata: {
            labels: { "app": "pulumi" },
            namespace: config.appsNamespaceName,
            // Annotations: https://git.io/JvMAx
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
    { provider }
);

const consoleIngress = new k8s.networking.v1.Ingress(consoleName,
    {
        metadata: {
            labels: { "app": "pulumi" },
            namespace: config.appsNamespaceName,
            // Annotations: https://git.io/JITxH
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
    { provider }
);
