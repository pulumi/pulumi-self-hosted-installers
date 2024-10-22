import * as pulumi from "@pulumi/pulumi";
import { eventsS3BucketName } from "../15-state-policies-mgmt";
import { openSearchNamespaceName } from "../25-insights";

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

// Used to test reCAPTCHA in development or as defaults if not set in config.
const defaultRecaptchaSiteKey = "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"
const defaultRecaptchaSecretKey = "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe"

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
    apiReplicas: pulumiConfig.getNumber("apiReplicas") ?? 2,
    consoleReplicas: pulumiConfig.getNumber("consoleReplicas") ?? 2,
    
    // One of these two needs to be set. See Pulumi.README.yaml for more information.
    awsKMSKeyArn: pulumiConfig.get("awsKMSKeyArn"),
    encryptionKey: pulumiConfig.get("encryptionKey"),

    // SMTP Config
    smtpServer: pulumiConfig.get("smtpServer"),
    smtpUsername: pulumiConfig.get("smtpUsername"),
    smtpPassword: pulumiConfig.get("smtpPassword"),
    smtpGenericSender: pulumiConfig.get("smtpGenericSender"),

    // reCAPTCHA Config
    // Uses test values if not set in config.
    // See https://developers.google.com/recaptcha/docs/faq#id-like-to-run-automated-tests-with-recaptcha.-what-should-i-do
    recaptchaSiteKey: pulumiConfig.get("recaptchaSiteKey") ?? defaultRecaptchaSiteKey,
    recaptchaSecretKey: pulumiConfig.get("recaptchaSecretKey") ?? defaultRecaptchaSecretKey,

    // Insights Config
    openSearchEndpoint: insightsStackRef.requireOutput("openSearchEndpoint"),
    openSearchUser: insightsStackRef.requireOutput("openSearchUser"),
    openSearchPassword: insightsStackRef.requireOutput("openSearchPassword"),

    // SAML SSO Setting:
    samlSsoEnabled: pulumiConfig.get("samlSsoEnabled") ?? 'false',

    // Email Login Settings
    // Default to allowing email login
    consoleHideEmailSignup: pulumiConfig.get("consoleHideEmailSignup") ?? 'false',
    consoleHideEmailLogin: pulumiConfig.get("consoleHideEmailLogin") ?? 'false',
    apiDisableEmailSignup: pulumiConfig.get("apiDisableEmailSignup") ?? 'false',
    apiDisableEmailLogin: pulumiConfig.get("apiDisableEmailLogin") ?? 'false',

};
