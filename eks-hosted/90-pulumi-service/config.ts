import * as pulumi from "@pulumi/pulumi";

const pulumiConfig = new pulumi.Config();

// Used to create the needed stack references
// The assumption is that all stacks are in the same organization and use the same stack name (e.g. dev or prod, etc)
const orgName = pulumi.getOrganization();
const stackName = pulumi.getStack();

// Stack references 
const iamStackRef = new pulumi.StackReference(`${orgName}/selfhosted-01-iam/${stackName}`);
const clusterStackRef = new pulumi.StackReference(`${orgName}/selfhosted-05-ekscluster/${stackName}`);
const clusterSvcsStackRef = new pulumi.StackReference(`${orgName}/selfhosted-10-cluster-services/${stackName}`);
const statePolicyStackRef = new pulumi.StackReference(`${orgName}/selfhosted-15-state-policies-mgmt/${stackName}`);
const dbStackRef = new pulumi.StackReference(`${orgName}/selfhosted-20-database/${stackName}`);
const insightsStackRef = new pulumi.StackReference(`${orgName}/selfhosted-25-insights/${stackName}`);
const escStackRef = new pulumi.StackReference(`${orgName}/selfhosted-30-esc/${stackName}`);

// Pulumi license key.
const licenseKey = pulumiConfig.requireSecret("licenseKey");
const agGridLicenseKey = pulumiConfig.getSecret("agGridLicenseKey");

// Check for encryption key or KMS key ARN.
const awsKMSKeyArn = pulumiConfig.get("awsKMSKeyArn");
const encryptionKey = pulumiConfig.get("encryptionKey");
if (!awsKMSKeyArn && !encryptionKey)  {
    throw new Error("Either an AWS KMS key ARN or a hard-coded encryptionKey must be provided. See Pulumi.README.yaml.");
}

export const config = {
    // Cluster
    kubeconfig: clusterStackRef.requireOutput("kubeconfig"),
    clusterName: clusterStackRef.requireOutput("clusterName"),
    nodeGroupInstanceType: clusterStackRef.requireOutput("nodeGroupInstanceType"),

    // Cluster Services
    albSecurityGroupId: clusterSvcsStackRef.requireOutput("albSecurityGroupId"),

    // state and policy and events buckets
    checkpointsS3BucketName: statePolicyStackRef.requireOutput("checkpointsS3BucketName"),
    policyPacksS3BucketName: statePolicyStackRef.requireOutput("policyPacksS3BucketName"),
    eventsS3BucketName: statePolicyStackRef.requireOutput("eventsS3BucketName"),
    
    // Database stack outputs
    dbConn: dbStackRef.requireOutput("dbConn"),

    // ESC infra
    escBucketName: escStackRef.requireOutput("escBucketName"),

    // EKS Instance role
    eksInstanceRoleName: iamStackRef.requireOutput("eksInstanceRoleName"),

    // DNS Hosted Zone and subdomain to operate on and use with ALB and ACM.
    hostedZoneDomainName: pulumiConfig.require("hostedZoneDomainName"),
    hostedZoneDomainSubdomain: pulumiConfig.require("hostedZoneDomainSubdomain"),

    // Pulumi services config
    appsNamespaceName: "pulumi-service",
    imageTag: pulumiConfig.require("imageTag"),
    licenseKey: licenseKey,
    agGridLicenseKey: agGridLicenseKey,
    apiReplicas: pulumiConfig.getNumber("apiReplicas") ?? 2,
    consoleReplicas: pulumiConfig.getNumber("consoleReplicas") ?? 2,
    
    // If no AWS KMS key ARN is provided, then a local encryption key must be provided.
    awsKMSKeyArn: awsKMSKeyArn,
    encryptionKey: encryptionKey,

    // SMTP Config
    smtpServer: pulumiConfig.get("smtpServer") ?? "",
    smtpUsername: pulumiConfig.get("smtpUsername") ?? "",
    smtpPassword: pulumiConfig.get("smtpPassword") ?? "",
    smtpGenericSender: pulumiConfig.get("smtpGenericSender") ?? "",

    // reCAPTCHA Config
    // If the config is not set, then recaptcha will be disabled.
    recaptchaSiteKey: pulumiConfig.get("recaptchaSiteKey") ?? "", 
    recaptchaSecretKey: pulumiConfig.get("recaptchaSecretKey") ?? "", 

    // Insights Config
    openSearchEndpoint: insightsStackRef.requireOutput("openSearchEndpoint"),
    openSearchUser: insightsStackRef.requireOutput("openSearchUser"),
    openSearchPassword: insightsStackRef.requireOutput("openSearchPassword"),
    openSearchNamespaceName: insightsStackRef.requireOutput("openSearchNamespaceName"),

    // SAML SSO Setting:
    samlSsoEnabled: pulumiConfig.get("samlSsoEnabled") ?? 'false',

    // Email Login Settings
    // Default to allowing email login
    consoleHideEmailSignup: pulumiConfig.get("consoleHideEmailSignup") ?? 'false',
    consoleHideEmailLogin: pulumiConfig.get("consoleHideEmailLogin") ?? 'false',
    apiDisableEmailSignup: pulumiConfig.get("apiDisableEmailSignup") ?? 'false',
    apiDisableEmailLogin: pulumiConfig.get("apiDisableEmailLogin") ?? 'false',

    // GITHUB related settings
    githubOauthEndpoint: pulumiConfig.get("github_oauth_endpoint") ?? "",
    githubOauthId: pulumiConfig.get("github_oauth_id") ?? "",
    githubOauthSecret: pulumiConfig.get("github_oauth_secret") ?? "",

};
