import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as aws from "@pulumi/aws";
import { SecretsCollection } from "./secrets";
import { EncryptionService } from "./encryptionService";
import * as random from "@pulumi/random";

interface DbConn {
  host: pulumi.Output<string>;
  port: pulumi.Output<string>;
  username: pulumi.Output<string>;
  password: pulumi.Output<string>;
}

export interface PulumiServiceOutputs {
  serviceUrl: pulumi.Output<string>;
  consoleURL: pulumi.Output<string>;
  appsNamespaceName: string;
  serviceLoadbalancerDnsName: pulumi.Output<string>;
  consoleLoadbalancerDnsName: pulumi.Output<string>;
}

export interface PulumiServiceArgs {
  // From EKS cluster stack
  kubeconfig: pulumi.Output<string>;
  clusterName: pulumi.Output<string>;
  nodeGroupInstanceType: string;
  // From cluster services stack
  albSecurityGroupId: pulumi.Output<string>;
  // From state policies stack
  checkpointsS3BucketName: pulumi.Output<string>;
  policyPacksS3BucketName: pulumi.Output<string>;
  eventsS3BucketName: pulumi.Output<string>;
  // From database stack
  dbConn: DbConn;
  dbPassword: pulumi.Output<string>;
  // From ESC stack
  escBucketName: pulumi.Output<string>;
  // From IAM stack
  eksInstanceRoleName: pulumi.Output<string>;
  // From insights stack
  openSearchEndpoint: string;
  openSearchUser: string;
  openSearchPassword: pulumi.Output<string>;
  openSearchNamespaceName: pulumi.Output<string>;
}

export class PulumiServiceResources extends pulumi.ComponentResource {
  public readonly serviceUrl: pulumi.Output<string>;
  public readonly consoleURL: pulumi.Output<string>;
  public readonly appsNamespaceName: string;
  public readonly serviceLoadbalancerDnsName: pulumi.Output<string>;
  public readonly consoleLoadbalancerDnsName: pulumi.Output<string>;

  constructor(
    name: string,
    args: PulumiServiceArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("eks-self-hosted:index:PulumiService", name, {}, opts);

    const config = new pulumi.Config();

    // Get existing database info from config
    const dbPassword = config.getSecret("dbPassword");

    // Validate required args
    if (
      !args.kubeconfig ||
      !args.clusterName ||
      !args.albSecurityGroupId ||
      !args.checkpointsS3BucketName ||
      !args.policyPacksS3BucketName ||
      !args.eventsS3BucketName ||
      !args.dbConn ||
      !args.escBucketName ||
      !args.eksInstanceRoleName
    ) {
      throw new Error("Missing required arguments from dependent stacks");
    }

    // Pulumi license key
    const licenseKey = config.requireSecret("licenseKey");

    // Check for encryption key or KMS key ARN
    const awsKMSKeyArn = config.get("awsKMSKeyArn");
    const encryptionKey = config.get("encryptionKey");
    if (!awsKMSKeyArn && !encryptionKey) {
      throw new Error(
        "Either an AWS KMS key ARN or a hard-coded encryptionKey must be provided. See Pulumi.README.yaml."
      );
    }

    // DNS Hosted Zone and subdomain
    const hostedZoneDomainName = config.require("hostedZoneDomainName");
    const hostedZoneDomainSubdomain = config.require(
      "hostedZoneDomainSubdomain"
    );

    // Pulumi services config
    this.appsNamespaceName = "pulumi-service";
    const imageTag = config.require("imageTag");
    const apiReplicas = config.getNumber("apiReplicas") ?? 2;
    const consoleReplicas = config.getNumber("consoleReplicas") ?? 2;

    // SMTP Config
    const smtpServer = config.get("smtpServer") ?? "";
    const smtpUsername = config.get("smtpUsername") ?? "";
    const smtpPassword = config.get("smtpPassword") ?? "";
    const smtpGenericSender = config.get("smtpGenericSender") ?? "";

    // reCAPTCHA Config
    const recaptchaSiteKey = config.get("recaptchaSiteKey") ?? "";
    const recaptchaSecretKey = config.get("recaptchaSecretKey") ?? "";

    // SAML SSO Setting
    const samlSsoEnabled = config.get("samlSsoEnabled") ?? "false";

    // Email Login Settings
    const consoleHideEmailSignup =
      config.get("consoleHideEmailSignup") ?? "false";
    const consoleHideEmailLogin =
      config.get("consoleHideEmailLogin") ?? "false";
    const apiDisableEmailSignup =
      config.get("apiDisableEmailSignup") ?? "false";
    const apiDisableEmailLogin = config.get("apiDisableEmailLogin") ?? "false";

    // GITHUB related settings
    const githubOauthEndpoint = config.get("github_oauth_endpoint") ?? "";
    const githubOauthId = config.get("github_oauth_id") ?? "";
    const githubOauthSecret = config.get("github_oauth_secret") ?? "";

    const k8sprovider = new k8s.Provider(
      "provider",
      {
        kubeconfig: args.kubeconfig,
        deleteUnreachable: true,
      },
      { parent: this }
    );

    ////////////
    // Names and Naming conventions
    const migrationsImage = `pulumi/migrations:${imageTag}`;
    const apiImage = `pulumi/service:${imageTag}`;
    const consoleImage = `pulumi/console:${imageTag}`;

    const commonName = "pulumi-selfhosted";

    const apiName = "pulumi-api";
    const apiAppLabel = { app: apiName };
    const apiSubdomainName = "api";
    const serviceEndpoint = pulumi.interpolate`${apiSubdomainName}.${hostedZoneDomainSubdomain}.${hostedZoneDomainName}`;
    this.serviceUrl = pulumi.interpolate`https://${serviceEndpoint}`;

    const consoleName = "pulumi-console";
    const consoleAppLabel = { app: consoleName };
    const consoleSubdomainName = "app";
    const consoleEndpoint = pulumi.interpolate`${consoleSubdomainName}.${hostedZoneDomainSubdomain}.${hostedZoneDomainName}`;
    this.consoleURL = pulumi.interpolate`https://${consoleEndpoint}`;

    const apiPort = 8080;
    const consolePort = 3000;

    ////////////
    // Create Kubernetes namespace for the services.
    // Since the 25-insights stack may have created the namespace, we need to check if the namespaces used by insights matches this one.
    // If it does not, we need to create a new namespace.
    // Once 25-insights is updated to use a different namespace, remove this check.
    args.openSearchNamespaceName.apply((openSearchNamespaceName) => {
      if (this.appsNamespaceName != openSearchNamespaceName) {
        const appsNamespace = new k8s.core.v1.Namespace(
          this.appsNamespaceName,
          {
            metadata: { name: this.appsNamespaceName },
          },
          { provider: k8sprovider, protect: true, parent: this }
        );
      }
    });

    ////////////
    // Create the k8s service account for the API service.
    const apiServiceAccount = new k8s.core.v1.ServiceAccount(
      apiName,
      {
        metadata: {
          namespace: this.appsNamespaceName,
          name: apiName,
        },
      },
      { provider: k8sprovider, parent: this }
    );

    ////////////
    // Create secrets collection to pass values to the API and Console.
    const secrets = new SecretsCollection(
      `${commonName}-secrets`,
      {
        apiDomain: serviceEndpoint,
        commonName: commonName,
        namespace: this.appsNamespaceName,
        provider: k8sprovider,
        secretValues: {
          database: {
            host: args.dbConn.host,
            port: args.dbConn.port,
            username: args.dbConn.username,
            password: args.dbPassword,
          },
          licenseKey: licenseKey,
          smtpDetails: {
            smtpServer: smtpServer,
            smtpUsername: smtpUsername,
            smtpPassword: smtpPassword,
            smtpGenericSender: smtpGenericSender,
          },
          recaptcha: {
            secretKey: recaptchaSecretKey,
            siteKey: recaptchaSiteKey,
          },
          openSearch: {
            domain: args.openSearchEndpoint,
            username: args.openSearchUser,
            password: args.openSearchPassword,
          },
          github: {
            oauthEndpoint: githubOauthEndpoint,
            oauthId: githubOauthId,
            oauthSecret: githubOauthSecret,
          },
          samlSso: {
            certCommonName: serviceEndpoint,
          },
        },
      },
      { parent: this }
    );

    const pulumiEncryptionKey = new EncryptionService(
      `${commonName}-encryption-key`,
      {
        commonName: commonName,
        namespace: this.appsNamespaceName,
        awsKMSKeyArn: awsKMSKeyArn,
        encryptionKey: encryptionKey,
        provider: k8sprovider,
      },
      { parent: this }
    );

    // Returns an EnvVar object that references a secret key.
    function generateEnvVarFromSecret(
      envVarName: string,
      secretName: pulumi.Output<string>,
      secretKey: string
    ): k8s.types.input.core.v1.EnvVar {
      return {
        name: envVarName,
        valueFrom: {
          secretKeyRef: {
            name: secretName,
            key: secretKey,
          },
        },
      };
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
    const apiDeployment = new k8s.apps.v1.Deployment(
      `${commonName}-${apiName}`,
      {
        metadata: {
          namespace: this.appsNamespaceName,
          name: `${apiName}-deployment`,
        },
        spec: {
          selector: { matchLabels: apiAppLabel },
          replicas: 1,
          template: {
            metadata: { labels: apiAppLabel },
            spec: {
              initContainers: [
                {
                  name: "pulumi-migration",
                  image: migrationsImage,
                  resources: migrationResources,
                  env: [
                    generateEnvVarFromSecret(
                      "PULUMI_DATABASE_ENDPOINT",
                      secrets.DBConnSecret.metadata.name,
                      "endpoint"
                    ),
                    generateEnvVarFromSecret(
                      "MYSQL_ROOT_USERNAME",
                      secrets.DBConnSecret.metadata.name,
                      "username"
                    ),
                    generateEnvVarFromSecret(
                      "MYSQL_ROOT_PASSWORD",
                      secrets.DBConnSecret.metadata.name,
                      "password"
                    ),
                    generateEnvVarFromSecret(
                      "PULUMI_DATABASE_PING_ENDPOINT",
                      secrets.DBConnSecret.metadata.name,
                      "host"
                    ),
                    {
                      name: "RUN_MIGRATIONS_EXTERNALLY",
                      value: "true",
                    },
                  ],
                },
              ],
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
                    generateEnvVarFromSecret(
                      "PULUMI_LICENSE_KEY",
                      secrets.LicenseKeySecret.metadata.name,
                      "key"
                    ),
                    generateEnvVarFromSecret(
                      "PULUMI_DATABASE_ENDPOINT",
                      secrets.DBConnSecret.metadata.name,
                      "endpoint"
                    ),
                    generateEnvVarFromSecret(
                      "PULUMI_DATABASE_USER_NAME",
                      secrets.DBConnSecret.metadata.name,
                      "username"
                    ),
                    generateEnvVarFromSecret(
                      "PULUMI_DATABASE_USER_PASSWORD",
                      secrets.DBConnSecret.metadata.name,
                      "password"
                    ),
                    generateEnvVarFromSecret(
                      "SAML_CERTIFICATE_PUBLIC_KEY",
                      secrets.SamlSsoSecret.metadata.name,
                      "pubkey"
                    ),
                    generateEnvVarFromSecret(
                      "SAML_CERTIFICATE_PRIVATE_KEY",
                      secrets.SamlSsoSecret.metadata.name,
                      "privatekey"
                    ),
                    generateEnvVarFromSecret(
                      "SMTP_SERVER",
                      secrets.SmtpSecret.metadata.name,
                      "server"
                    ),
                    generateEnvVarFromSecret(
                      "SMTP_USERNAME",
                      secrets.SmtpSecret.metadata.name,
                      "username"
                    ),
                    generateEnvVarFromSecret(
                      "SMTP_PASSWORD",
                      secrets.SmtpSecret.metadata.name,
                      "password"
                    ),
                    generateEnvVarFromSecret(
                      "SMTP_GENERIC_SENDER",
                      secrets.SmtpSecret.metadata.name,
                      "fromaddress"
                    ),
                    generateEnvVarFromSecret(
                      "RECAPTCHA_SECRET_KEY",
                      secrets.RecaptchaSecret.metadata.name,
                      "secretKey"
                    ),
                    generateEnvVarFromSecret(
                      "PULUMI_SEARCH_PASSWORD",
                      secrets.OpenSearchSecret.metadata.name,
                      "password"
                    ),
                    generateEnvVarFromSecret(
                      "PULUMI_SEARCH_USER",
                      secrets.OpenSearchSecret.metadata.name,
                      "username"
                    ),
                    generateEnvVarFromSecret(
                      "PULUMI_SEARCH_DOMAIN",
                      secrets.OpenSearchSecret.metadata.name,
                      "endpoint"
                    ),
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
                      value: "us-east-1", // this is a dummy value needed to appease the bucket access code.
                    },
                    {
                      name: "PULUMI_POLICY_PACK_BLOB_STORAGE_ENDPOINT",
                      value: pulumi.interpolate`s3://${args.policyPacksS3BucketName}`,
                    },
                    {
                      name: "PULUMI_CHECKPOINT_BLOB_STORAGE_ENDPOINT",
                      value: pulumi.interpolate`s3://${args.checkpointsS3BucketName}`,
                    },
                    {
                      name: "PULUMI_SERVICE_METADATA_BLOB_STORAGE_ENDPOINT",
                      value: pulumi.interpolate`s3://${args.escBucketName}`,
                    },
                    {
                      name: "PULUMI_ENGINE_EVENTS_BLOB_STORAGE_ENDPOINT",
                      value: pulumi.interpolate`s3://${args.eventsS3BucketName}`,
                    },
                  ],
                },
              ],
            },
          },
        },
      },
      { provider: k8sprovider, parent: this }
    );

    const apiService = new k8s.core.v1.Service(
      `${commonName}-${apiName}`,
      {
        metadata: {
          name: `${apiName}-service`,
          namespace: this.appsNamespaceName,
        },
        spec: {
          ports: [{ port: 80, targetPort: 8080, name: "api" }],
          selector: apiAppLabel,
        },
      },
      { provider: k8sprovider, parent: this }
    );

    ////////////
    // Deploy the Console (frontend) service.
    const consoleDeployment = new k8s.apps.v1.Deployment(
      `${commonName}-${consoleName}`,
      {
        metadata: {
          namespace: this.appsNamespaceName,
          name: `${consoleName}-deployment`,
        },
        spec: {
          selector: { matchLabels: consoleAppLabel },
          replicas: 1,
          template: {
            metadata: { labels: consoleAppLabel },
            spec: {
              containers: [
                {
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
                      value: samlSsoEnabled,
                    },
                    {
                      name: "PULUMI_API",
                      value: pulumi.interpolate`https://${serviceEndpoint}`,
                    },
                    {
                      name: "PULUMI_API_INTERNAL_ENDPOINT",
                      value: pulumi.interpolate`http://${apiService.metadata.name}.${this.appsNamespaceName}:80`,
                    },
                    {
                      name: "PULUMI_HIDE_EMAIL_LOGIN",
                      value: consoleHideEmailLogin,
                    },
                    {
                      name: "PULUMI_HIDE_EMAIL_SIGNUP",
                      value: consoleHideEmailSignup,
                    },
                    generateEnvVarFromSecret(
                      "RECAPTCHA_SITE_KEY",
                      secrets.RecaptchaSecret.metadata.name,
                      "siteKey"
                    ),
                    generateEnvVarFromSecret(
                      "GITHUB_OAUTH_ENDPOINT",
                      secrets.GithubSecret.metadata.name,
                      "oauthEndpoint"
                    ),
                    generateEnvVarFromSecret(
                      "GITHUB_OAUTH_ID",
                      secrets.GithubSecret.metadata.name,
                      "oauthId"
                    ),
                    generateEnvVarFromSecret(
                      "GITHUB_OAUTH_SECRET",
                      secrets.GithubSecret.metadata.name,
                      "oauthSecret"
                    ),
                  ],
                },
              ],
            },
          },
        },
      },
      { provider: k8sprovider, parent: this }
    );

    const consoleService = new k8s.core.v1.Service(
      `${commonName}-${consoleName}`,
      {
        metadata: {
          name: `${consoleName}-service`,
          namespace: this.appsNamespaceName,
        },
        spec: {
          ports: [{ port: 80, targetPort: 3000, name: "console" }],
          selector: consoleAppLabel,
        },
      },
      { provider: k8sprovider, parent: consoleDeployment }
    );

    // Create a PodDisruptionBudget on Pods to ensure availability during evictions
    // by selecting a set of labels.
    const createPodDisruptionBudget = (
      name: string,
      minAvailable: pulumi.Input<string>,
      labels: pulumi.Input<any>,
      namespace: pulumi.Input<string>,
      provider: k8s.Provider
    ): k8s.policy.v1.PodDisruptionBudget => {
      return new k8s.policy.v1.PodDisruptionBudget(
        name,
        {
          metadata: { labels: labels, namespace: namespace },
          spec: {
            minAvailable: minAvailable,
            selector: { matchLabels: labels },
          },
        },
        { provider: provider, parent: this }
      );
    };

    // Create PodDisruptionBudgets for the API and console deployments to ensure 2/3 of all replicas are always available during evictions.
    createPodDisruptionBudget(
      apiName,
      "66%",
      apiDeployment.metadata.labels,
      this.appsNamespaceName,
      k8sprovider
    );
    createPodDisruptionBudget(
      consoleName,
      "66%",
      consoleDeployment.metadata.labels,
      this.appsNamespaceName,
      k8sprovider
    );

    ////////////
    // Create the wildcard TLS cert in ACM to use with the ALB on both the API and
    // the console.
    const certCertificate = new aws.acm.Certificate(
      "cert",
      {
        domainName: `*.${hostedZoneDomainSubdomain}.${hostedZoneDomainName}`,
        subjectAlternativeNames: [
          `${hostedZoneDomainSubdomain}.${hostedZoneDomainName}`,
        ],
        validationMethod: "DNS",
      },
      { parent: this }
    );
    const zone = aws.route53.getZoneOutput({
      name: `${hostedZoneDomainName}.`,
      privateZone: false,
    });

    const certValidation = new aws.route53.Record(
      "certValidation",
      {
        name: certCertificate.domainValidationOptions[0].resourceRecordName,
        records: [
          certCertificate.domainValidationOptions[0].resourceRecordValue,
        ],
        ttl: 60,
        type: certCertificate.domainValidationOptions[0].resourceRecordType,
        zoneId: zone.id,
      },
      { parent: this }
    );
    const certCertificateValidation = new aws.acm.CertificateValidation(
      "cert",
      {
        certificateArn: certCertificate.arn,
        validationRecordFqdns: [certValidation.fqdn],
      },
      { parent: this }
    );

    //////////////
    // Create the API and Console Ingress.
    // Used with ALB, and external-dns.
    const apiIngress = new k8s.networking.v1.Ingress(
      apiName,
      {
        metadata: {
          labels: { app: "pulumi" },
          namespace: this.appsNamespaceName,
          annotations: {
            "kubernetes.io/ingress.class": "alb",
            "alb.ingress.kubernetes.io/target-type": "ip",
            "alb.ingress.kubernetes.io/scheme": "internet-facing",
            "alb.ingress.kubernetes.io/tags":
              "Project=pulumi-k8s-aws-cluster,Owner=pulumi",
            "alb.ingress.kubernetes.io/healthcheck-path": "/api/status", // Required for the API but not the console since it does not have a health check.
            "alb.ingress.kubernetes.io/certificate-arn":
              certCertificateValidation.certificateArn,
            "alb.ingress.kubernetes.io/listen-ports":
              '[{"HTTP": 80}, {"HTTPS": 443}]',
            "alb.ingress.kubernetes.io/security-groups":
              args.albSecurityGroupId,
          },
        },
        spec: {
          rules: [
            {
              host: `${apiSubdomainName}.${hostedZoneDomainSubdomain}.${hostedZoneDomainName}`,
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
                        },
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      { provider: k8sprovider }
    );

    const consoleIngress = new k8s.networking.v1.Ingress(
      consoleName,
      {
        metadata: {
          labels: { app: "pulumi" },
          namespace: this.appsNamespaceName,
          annotations: {
            "kubernetes.io/ingress.class": "alb",
            "alb.ingress.kubernetes.io/target-type": "ip",
            "alb.ingress.kubernetes.io/scheme": "internet-facing",
            "alb.ingress.kubernetes.io/tags":
              "Project=pulumi-k8s-aws-cluster,Owner=pulumi",
            "alb.ingress.kubernetes.io/certificate-arn":
              certCertificateValidation.certificateArn,
            "alb.ingress.kubernetes.io/listen-ports":
              '[{"HTTP": 80}, {"HTTPS": 443}]',
            "alb.ingress.kubernetes.io/security-groups":
              args.albSecurityGroupId,
          },
        },
        spec: {
          rules: [
            {
              host: `${consoleSubdomainName}.${hostedZoneDomainSubdomain}.${hostedZoneDomainName}`,
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
                        },
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      { provider: k8sprovider }
    );

    this.serviceLoadbalancerDnsName =
      apiIngress.status.loadBalancer.ingress[0].hostname;
    this.consoleLoadbalancerDnsName =
      consoleIngress.status.loadBalancer.ingress[0].hostname;

    ////////////
    // Create a Route53 record for the API and Console.
    const zoneId = aws.route53.getZoneOutput({
      name: hostedZoneDomainName,
    }).zoneId;

    const consoleDnsRecord = new aws.route53.Record(
      "consoleEndDnsRecord",
      {
        zoneId: zoneId,
        name: consoleEndpoint,
        type: "CNAME",
        ttl: 300,
        records: [this.consoleLoadbalancerDnsName],
      },
      { parent: this }
    );

    const serviceDnsRecord = new aws.route53.Record(
      "serviceEndDnsRecord",
      {
        zoneId: zoneId,
        name: serviceEndpoint,
        type: "CNAME",
        ttl: 300,
        records: [this.serviceLoadbalancerDnsName],
      },
      { parent: this }
    );

    this.registerOutputs({
      serviceUrl: this.serviceUrl,
      consoleURL: this.consoleURL,
      appsNamespaceName: this.appsNamespaceName,
      serviceLoadbalancerDnsName: this.serviceLoadbalancerDnsName,
      consoleLoadbalancerDnsName: this.consoleLoadbalancerDnsName,
    });
  }
}
