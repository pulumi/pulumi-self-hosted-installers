import { config } from "./config";
import { configurePulumiSecretProvider } from "./secrets-management"
import * as k8s from "@pulumi/kubernetes";
import * as kx from "@pulumi/kubernetesx";
import * as tls from "@pulumi/tls";

export const k8sprovider = new k8s.Provider("provider", { kubeconfig: config.kubeconfig, deleteUnreachable: true });

///////////////
// K8s secrets used by the applications
// Configure secrets provider, the component the Pulumi Service uses to encrypt stack secrets.
export const secretsIntegration = configurePulumiSecretProvider(config, k8sprovider)

// Create a k8s Secret of the self-hosted Pulumi license.
export const licenseKeySecret = new kx.Secret("license-key", {
    metadata: { namespace: config.appsNamespaceName },
    stringData: { key: config.licenseKey }
}, { provider: k8sprovider });

// Create a Secret from the DB connection information.
export const dbConnSecret = new kx.Secret("aurora-db-conn",
    {
        metadata: { namespace: config.appsNamespaceName },
        stringData: {
            host: config.dbConn.apply(db => db.host),
            endpoint: config.dbConn.apply(db => `${db.host}:${db.port}`),
            username: config.dbConn.apply(db => db.username),
            password: config.dbConn.apply(db => db.password),
        },
    },
    { provider: k8sprovider },
);

// Capture the secrets related to SMTP integration.
export let smtpConfig = {}
if (config.smtpServer) {
    const smtpSecret = new kx.Secret("smtp-conn",
    {
        metadata: { namespace: config.appsNamespaceName },
        stringData: {
            server: config.smtpServer,
            username: config.smtpUsername || "undefined",
            password: config.smtpPassword || "undefined",
            genericsender: config.smtpGenericSender || "undefined"
        },

    }, { provider: k8sprovider })
    smtpConfig = {
        "SMTP_SERVER": smtpSecret.asEnvValue("server"),
        "SMTP_USERNAME": smtpSecret.asEnvValue("username"),
        "SMTP_PASSWORD": smtpSecret.asEnvValue("password"),
        "SMTP_GENERIC_SENDER": smtpSecret.asEnvValue("genericsender"),
    }
}

// Secrets for SSO support
const ssoPrivateKey = new tls.PrivateKey("ssoPrivateKey", { algorithm: "RSA", rsaBits: 2048 })
const ssoCert = new tls.SelfSignedCert("ssoCert", {
    allowedUses: ["cert_signing"],
    privateKeyPem: ssoPrivateKey.privateKeyPem,
    subject: {
        commonName: `api.${config.hostedZoneDomainSubdomain}.${config.hostedZoneDomainName}`,
    },
    validityPeriodHours: (365*24)
})
const samlSsoSecret = new kx.Secret("saml-sso",
{
    metadata: { namespace: config.appsNamespaceName },
    stringData: {
        pubkey: ssoCert.certPem,
        privatekey: ssoPrivateKey.privateKeyPem,
    },

}, { provider: k8sprovider })
export const samlSsoConfig = {
    "SAML_CERTIFICATE_PUBLIC_KEY": samlSsoSecret.asEnvValue("pubkey"),
    "SAML_CERTIFICATE_PRIVATE_KEY": samlSsoSecret.asEnvValue("privatekey"),
}

// Secrets for reCAPTCHA support
const recaptchaSecret = new kx.Secret("recaptcha", 
{
    metadata: { namespace: config.appsNamespaceName },
    stringData: {
        siteKey: config.recaptchaSiteKey,
        secretKey: config.recaptchaSecretKey
    },

}, { provider: k8sprovider })
export const recaptchaServiceConfig = {
    "RECAPTCHA_SECRET_KEY": recaptchaSecret.asEnvValue("secretKey"),
    "LOGIN_RECAPTCHA_SECRET_KEY": recaptchaSecret.asEnvValue("secretKey"),
}
export const recaptchaConsoleConfig = {
    "RECAPTCHA_SITE_KEY": recaptchaSecret.asEnvValue("siteKey"),
    "LOGIN_RECAPTCHA_SITE_KEY": recaptchaSecret.asEnvValue("siteKey"),
}

// Secrets for accessing OpenSearch domain
const openSearchPasswordSecret = new kx.Secret("opensearch-secrets", 
{
    metadata: { namespace: config.appsNamespaceName },
    stringData: {
        openSearchUser: config.openSearchUser,
        openSearchPassword: config.openSearchPassword

    },

}, { provider: k8sprovider })
export const openSearchConfig = {
    "PULUMI_SEARCH_PASSWORD": openSearchPasswordSecret.asEnvValue("openSearchPassword"),
    "PULUMI_SEARCH_USER": config.openSearchUser,
    "PULUMI_SEARCH_DOMAIN": config.openSearchEndpoint,
}

// Currently any non-empty value for the disable/hide email env variables will be treated as a "true"
// When https://github.com/pulumi/pulumi-service/issues/7898 is fixed, then a simple line like 
// "PULUMI_DISABLE_EMAIL_LOGIN": config.apiDisableEmailLogin
// can be used.
export const apiEmailLoginConfig = {
    "PULUMI_DISABLE_EMAIL_LOGIN": (config.apiDisableEmailLogin === "true" ? "true" : null),
    "PULUMI_DISABLE_EMAIL_SIGNUP": (config.apiDisableEmailSignup === "true" ? "true" : null),
}
export const consoleEmailLoginConfig = {
    "PULUMI_HIDE_EMAIL_LOGIN": (config.consoleHideEmailLogin === "true" ? "true" : null),
    "PULUMI_HIDE_EMAIL_SIGNUP": (config.consoleHideEmailSignup === "true" ? "true" : null),
}


// Capture the config and secrets related to GitHub integration.
export let githubConfig = {}
if (config.github_oauth_endpoint) {
    const githubSecret = new kx.Secret("github-conn",
    {
        metadata: { namespace: config.appsNamespaceName },
        stringData: {
            github_oauth_endpoint: config.github_oauth_endpoint,
            github_oauth_id: config.github_oauth_id || "",
            github_oauth_secret: config.github_oauth_secret || ""
        },

    }, { provider: k8sprovider })
    githubConfig = {
        "GITHUB_OAUTH_ENDPOINT": githubSecret.asEnvValue("github_oauth_endpoint"),
        "GITHUB_OAUTH_ID": githubSecret.asEnvValue("github_oauth_id"),
        "GITHUB_OAUTH_SECRET": githubSecret.asEnvValue("github_oauth_secret"),  
    }
}