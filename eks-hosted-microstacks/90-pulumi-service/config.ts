import * as pulumi from "@pulumi/pulumi";

const pulumiConfig = new pulumi.Config();

// Stack references 
const clusterStackRef = new pulumi.StackReference(pulumiConfig.require("clusterStackName"));
const clusterSvcsStackRef = new pulumi.StackReference(pulumiConfig.require("clusterSvcsStackName"));
const dbStackRef = new pulumi.StackReference(pulumiConfig.require("dbStackName"));
const statePolicyStackRef = new pulumi.StackReference(pulumiConfig.require("statePolicyStackName"));

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

    // state and policy buckets
    checkpointsS3BucketName: statePolicyStackRef.requireOutput("checkpointsS3BucketName"),
    policyPacksS3BucketName: statePolicyStackRef.requireOutput("policyPacksS3BucketName"),
    
    // Database stack outputs
    dbConn: dbStackRef.requireOutput("dbConn"),

    // DNS Hosted Zone and subdomain to operate on and use with ALB and ACM.
    hostedZoneDomainName: pulumiConfig.require("hostedZoneDomainName"),
    hostedZoneDomainSubdomain: pulumiConfig.require("hostedZoneDomainSubdomain"),

    // Pulumi services config
    appsNamespaceName: "pulumi-service",
    imageTag: pulumiConfig.require("imageTag"),
    licenseKey: licenseKey,
    apiReplicas: pulumiConfig.getNumber("apiReplicas") ?? 2,
    consoleReplicas: pulumiConfig.getNumber("consoleReplicas") ?? 2,
    awsKMSKeyArn: pulumiConfig.get("KMSKey"),

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

    // SAML SSO Setting:
    samlSsoEnabled: pulumiConfig.get("samlSsoEnabled") ?? 'false',

    // Email Login Settings
    // Default to allowing email login
    consoleHideEmailSignup: pulumiConfig.get("consoleHideEmailSignup") ?? 'false',
    consoleHideEmailLogin: pulumiConfig.get("consoleHideEmailLogin") ?? 'false',
    apiDisableEmailSignup: pulumiConfig.get("apiDisableEmailSignup") ?? 'false',
    apiDisableEmailLogin: pulumiConfig.get("apiDisableEmailLogin") ?? 'false',

};
