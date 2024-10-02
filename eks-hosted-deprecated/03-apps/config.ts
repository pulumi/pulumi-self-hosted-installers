import * as pulumi from "@pulumi/pulumi";

const pulumiConfig = new pulumi.Config();

// Existing Pulumi stack reference in the format:
// <organization>/<project>/<stack> e.g. "myUser/myProject/dev"
const clusterStackRef = new pulumi.StackReference(pulumiConfig.require("clusterStackRef"));
const clusterSvcsStackRef = new pulumi.StackReference(pulumiConfig.require("clusterSvcsStackRef"));

// Pulumi license key.
const licenseKey = pulumiConfig.requireSecret("licenseKey");

const defaultRecaptchaSiteKey = "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"
const defaultRecaptchaSecretKey = "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe"

export const config = {
    // Cluster
    kubeconfig: clusterStackRef.requireOutput("kubeconfig"),
    clusterName: clusterStackRef.requireOutput("clusterName"),
    clusterSvcsNamespaceName: clusterStackRef.requireOutput("clusterSvcsNamespaceName"),
    appsNamespaceName: clusterStackRef.requireOutput("appsNamespaceName"),
    nodeGroupInstanceType: clusterStackRef.requireOutput("nodeGroupInstanceType"),
    albSecurityGroupId: clusterStackRef.requireOutput("albSecurityGroupId"),
    clusterOidcProviderArn: clusterStackRef.requireOutput("clusterOidcProviderArn"),
    clusterOidcProviderUrl: clusterStackRef.requireOutput("clusterOidcProviderUrl"),

    // DNS Hosted Zone and subdomain to operate on and use with ALB and ACM.
    hostedZoneDomainName: pulumiConfig.require("hostedZoneDomainName"),
    hostedZoneDomainSubdomain: pulumiConfig.require("hostedZoneDomainSubdomain"),

    // Self-hosted Pulumi
    imageTag: pulumiConfig.require("imageTag"),
    licenseKey: licenseKey,
    dbConn: clusterSvcsStackRef.requireOutput("dbConn"),
    awsKMSKeyArn: pulumiConfig.get("KMSKey"),

    apiReplicas: pulumiConfig.getNumber("apiReplicas") ?? 2,
    consoleReplicas: pulumiConfig.getNumber("consoleReplicas") ?? 2,

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
