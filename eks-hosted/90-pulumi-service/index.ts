import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import * as kx from "@pulumi/kubernetesx";
import { types } from "@pulumi/kubernetesx";
import * as pulumi from "@pulumi/pulumi";
import EnvMap = types.EnvMap;
import { config } from "./config";

// Set up the K8s secrets used by the applications.
import { k8sprovider, licenseKeySecret, dbConnSecret, smtpConfig, apiEmailLoginConfig, consoleEmailLoginConfig, samlSsoConfig, recaptchaServiceConfig, recaptchaConsoleConfig,  openSearchConfig, secretsIntegration, githubConfig } from "./k8s-secrets";

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

////////////
// Create Kubernetes namespace for the services.
// Since the 25-insights stack may have created the namespace, we need to check if the namespaces used by insights matches this one.
// If it does not, we need to create a new namespace.
// Once 25-insights is updated to use a different namespace, remove this check.
export const appsNamespaceName = config.appsNamespaceName;
config.openSearchNamespaceName.apply(openSearchNamespaceName => {
    if (appsNamespaceName != openSearchNamespaceName) {
        const appsNamespace = new k8s.core.v1.Namespace(appsNamespaceName, { metadata: { name: appsNamespaceName } }, { provider: k8sprovider, protect: true });
    }
})

const apiServiceAccount = new k8s.core.v1.ServiceAccount(apiName, {
    metadata: {
        namespace: config.appsNamespaceName,
        name: apiName,
    },
}, { provider: k8sprovider });


//////////////
// Environment variables for the API service.
const awsRegion = pulumi.output(aws.getRegion())
const serviceEnv = pulumi
    .all([config.checkpointsS3BucketName, config.policyPacksS3BucketName, config.eventsS3BucketName, config.escBucketName, awsRegion.name])
    .apply(([cBucket, pBucket, evBucket, eBucket, regionName]) => {
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
            "PULUMI_CHECKPOINT_BLOB_STORAGE_ENDPOINT": `s3://${cBucket}`,
            "PULUMI_POLICY_PACK_BLOB_STORAGE_ENDPOINT": `s3://${pBucket}`,
            "PULUMI_ENGINE_EVENTS_BLOB_STORAGE_ENDPOINT": `s3://${evBucket}`,
            "PULUMI_SERVICE_METADATA_BLOB_STORAGE_ENDPOINT": `s3://${eBucket}`,
            ...smtpConfig,
            ...samlSsoConfig,
            ...recaptchaServiceConfig,
            ...openSearchConfig,
            ...apiEmailLoginConfig,
            ...githubConfig,
        } as EnvMap;

        // Add env vars specific to managing secrets.
        envVars[secretsIntegration.envVarName] = secretsIntegration.envVarValue;

        return envVars;
    });

   
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
// const consoleResources = { requests: { cpu: "1024m", memory: "512Mi" } };
const consoleResources = { requests: { cpu: "512m", memory: "512Mi" } };

// Deploy the API service.
const apiPodBuilder = new kx.PodBuilder({
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
    serviceAccountName: apiServiceAccount.metadata.name,
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
}, { provider: k8sprovider, dependsOn: [apiServiceAccount] });
const apiService = apiDeployment.createService();
const serviceEndpoint = pulumi.interpolate`${apiSubdomainName}.${config.hostedZoneDomainSubdomain}.${config.hostedZoneDomainName}`;
export const serviceUrl = pulumi.interpolate`https://${serviceEndpoint}`;

///
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
            ...consoleEmailLoginConfig,
            ...githubConfig,
        },
        resources: consoleResources,
    }],
});
const consoleDeployment = new kx.Deployment(consoleName, {
    metadata: { namespace: config.appsNamespaceName },
    spec: consolePodBuilder.asDeploymentSpec({ replicas: consoleReplicas })
}, { provider: k8sprovider });
const consoleService = consoleDeployment.createService();
const consoleEndpoint = pulumi.interpolate`${consoleSubdomainName}.${config.hostedZoneDomainSubdomain}.${config.hostedZoneDomainName}`;
export const consoleURL = pulumi.interpolate`https://${consoleEndpoint}`;

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
    { provider: k8sprovider }
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
