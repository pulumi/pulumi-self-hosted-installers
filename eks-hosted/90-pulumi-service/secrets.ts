import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as tls from "@pulumi/tls";
import { Input, Output, ComponentResource, ComponentResourceOptions } from "@pulumi/pulumi";

export interface SecretsCollectionArgs {
    namespace: Input<string>,
    commonName: string,
    provider: k8s.Provider,
    apiDomain: Input<string>
    secretValues: {
        licenseKey: Input<string>,
        database: {
            host: Input<string>,
            port: Input<string>,
            username: Input<string>,
            password: Input<string>,
        },
        smtpDetails: {
            smtpServer: Input<string>,
            smtpUsername: Input<string>,
            smtpPassword: Input<string>,
            smtpGenericSender: Input<string>,
        },
        recaptcha: {
            secretKey: Input<string>,
            siteKey: Input<string>
        },
        openSearch: {
            username: Input<string>,
            password: Input<string>,
            domain: Input<string>,
        },
        github: {  
            oauthEndpoint: Input<string>,
            oauthId: Input<string>,
            oauthSecret: Input<string>,
        },
        samlSso: {
            certCommonName: Input<string>,

        };

    }
}

export class SecretsCollection extends ComponentResource {
    LicenseKeySecret: k8s.core.v1.Secret;
    ApiCertificateSecret: k8s.core.v1.Secret;
    ConsoleCertificateSecret: k8s.core.v1.Secret;
    DBConnSecret: k8s.core.v1.Secret;
    StorageSecret: k8s.core.v1.Secret;
    SmtpSecret: k8s.core.v1.Secret;
    RecaptchaSecret: k8s.core.v1.Secret;
    OpenSearchSecret: k8s.core.v1.Secret;
    GithubSecret: k8s.core.v1.Secret;
    SamlSsoSecret: k8s.core.v1.Secret;
    constructor(name: string, args: SecretsCollectionArgs, opts?: ComponentResourceOptions) {
        super("x:kubernetes:secrets", name, opts);

        this.LicenseKeySecret = new k8s.core.v1.Secret(`${args.commonName}-license-key`, {
            metadata: { namespace: args.namespace },
            stringData: { key: args.secretValues.licenseKey },
        }, { provider: args.provider, parent: this });

        this.DBConnSecret = new k8s.core.v1.Secret(`${args.commonName}-mysql-db-conn`, {
            metadata: {
                namespace: args.namespace,
            },
            stringData: {
              host: args.secretValues.database.host,
              endpoint: pulumi.interpolate`${args.secretValues.database.host}:${args.secretValues.database.port}`,
              username: args.secretValues.database.username,
              password: args.secretValues.database.password,
            },
        }, { provider: args.provider, parent: this });

        this.SmtpSecret = new k8s.core.v1.Secret(`${args.commonName}-smtp-secret`, {
            metadata: {
                namespace: args.namespace,
            },
            stringData: {
                server: args.secretValues.smtpDetails.smtpServer,
                username: args.secretValues.smtpDetails.smtpUsername,
                password: args.secretValues.smtpDetails.smtpPassword,
                fromaddress: args.secretValues.smtpDetails.smtpGenericSender,
            }
        }, { provider: args.provider, parent: this });

        this.RecaptchaSecret = new k8s.core.v1.Secret(`${args.commonName}-recaptcha-secret`, {
            metadata: {
                namespace: args.namespace
            },
            stringData: {
                secretKey: args.secretValues.recaptcha.secretKey,
                siteKey: args.secretValues.recaptcha.siteKey
            }
        }, { provider: args.provider, parent: this });

        this.OpenSearchSecret = new k8s.core.v1.Secret(`${args.commonName}-opensearch-secrets`, {
            metadata: {
                namespace: args.namespace,
            },
            stringData: {
              username: args.secretValues.openSearch.username,
              password: args.secretValues.openSearch.password,
              endpoint: args.secretValues.openSearch.domain,
            },
        }, {provider: args.provider, parent: this});

        this.GithubSecret = new k8s.core.v1.Secret(`${args.commonName}-github-secrets`, {
            metadata: {
                namespace: args.namespace,
            },
            stringData: {
                oauthEndpoint: args.secretValues.github.oauthEndpoint,
                oauthId: args.secretValues.github.oauthId,
                oauthSecret: args.secretValues.github.oauthSecret,
            },
        }, {provider: args.provider, parent: this});


        // SSO related secrets 
        const ssoPrivateKey = new tls.PrivateKey("ssoPrivateKey", { algorithm: "RSA", rsaBits: 2048 })
        const ssoCert = new tls.SelfSignedCert("ssoCert", {
            allowedUses: ["cert_signing"],
            privateKeyPem: ssoPrivateKey.privateKeyPem,
            subject: {
                commonName: args.secretValues.samlSso.certCommonName
            },
            validityPeriodHours: (365*24)
        })
        this.SamlSsoSecret = new k8s.core.v1.Secret(`${args.commonName}-saml-secrets`, {
            metadata: {
                namespace: args.namespace,
            },
            stringData: {
                pubkey: ssoCert.certPem,
                privatekey: ssoPrivateKey.privateKeyPem,
            },
        }, {provider: args.provider, parent: this});

        this.registerOutputs({
            LicenseKeySecret: this.LicenseKeySecret,
            DBConnSecret: this.DBConnSecret,
            StorageSecret: this.StorageSecret,
            SmtpSecret: this.SmtpSecret,
            RecaptchaSecret: this.RecaptchaSecret,
            OpenSearchSecret: this.OpenSearchSecret,
            GithubSecret: this.GithubSecret,
            SamlSsoSecret: this.SamlSsoSecret,
        });
    }
}
