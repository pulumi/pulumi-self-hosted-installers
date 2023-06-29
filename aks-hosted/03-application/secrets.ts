import { Provider } from "@pulumi/kubernetes";
import { Secret } from "@pulumi/kubernetesx";
import { Input, Output, ComponentResource, ComponentResourceOptions, interpolate } from "@pulumi/pulumi";

export interface SecretsCollectionArgs {
    namespace: Input<string>,
    commonName: string,
    provider: Provider,
    apiDomain: Input<string>
    secretValues: {
        licenseKey: Input<string>,
        apiTlsKey: Output<string> | undefined,
        apiTlsCert: Output<string> | undefined,
        consoleTlsKey: Output<string> | undefined,
        consoleTlsCert: Output<string> | undefined,
        database: {
            endpoint: Input<string>,
            login: Input<string>,
            password: Input<string>,
            serverName: Input<string>,
        },
        smtpDetails: {
            smtpServer: Input<string>,
            smtpUsername: Input<string>,
            smtpPassword: Input<string>,
            smtpFromAddress: Input<string>,
        },
        recaptcha: {
            secretKey: Input<string>,
            siteKey: Input<string>
        }
    }
}

export class SecretsCollection extends ComponentResource {
    LicenseKeySecret: Secret;
    ApiCertificateSecret: Secret | undefined;
    ConsoleCertificateSecret: Secret | undefined;
    DBConnSecret: Secret;
    SmtpSecret: Secret;
    RecaptchaSecret: Secret;
    constructor(name: string, args: SecretsCollectionArgs, opts?: ComponentResourceOptions) {
        super("x:kubernetes:secrets", name, opts);

        this.LicenseKeySecret = new Secret(`${args.commonName}-license-key`, {
            metadata: { namespace: args.namespace },
            stringData: { key: args.secretValues.licenseKey },
        }, { provider: args.provider, parent: this });

        // TODO: if cert-manager is enabled do not create api/console certs
        if (args.secretValues.apiTlsCert && args.secretValues.apiTlsKey) {
            this.ApiCertificateSecret = new Secret(`${args.commonName}-api-tls`, {
                metadata: {
                    namespace: args.namespace
                },
                data: {
                    "tls.key": args.secretValues.apiTlsKey.apply(it => Buffer.from(it).toString("base64")),
                    "tls.crt": args.secretValues.apiTlsCert.apply(it => Buffer.from(it).toString("base64")),
                },
            }, { provider: args.provider, parent: this });
        }

        if (args.secretValues.consoleTlsCert && args.secretValues.consoleTlsKey) {
            this.ConsoleCertificateSecret = new Secret(`${args.commonName}-console-tls`, {
                metadata: {
                    namespace: args.namespace
                },
                data: {
                    "tls.key": args.secretValues.consoleTlsKey.apply(it => Buffer.from(it).toString("base64")),
                    "tls.crt": args.secretValues.consoleTlsCert.apply(it => Buffer.from(it).toString("base64")),
                },
            }, { provider: args.provider, parent: this });
        }
        
        this.DBConnSecret = new Secret(`${args.commonName}-mysql-db-conn`, {
            metadata: {
                namespace: args.namespace,
            },
            stringData: {
                host: args.secretValues.database.endpoint,
                username: args.secretValues.database.login, // interpolate`${args.secretValues.database.login}@${args.secretValues.database.serverName}`,
                password: args.secretValues.database.password,
            },
        }, { provider: args.provider, parent: this });


        this.SmtpSecret = new Secret(`${args.commonName}-smtp-secret`, {
            metadata: {
                namespace: args.namespace,
            },
            stringData: {
                server: args.secretValues.smtpDetails.smtpServer,
                username: args.secretValues.smtpDetails.smtpUsername,
                password: args.secretValues.smtpDetails.smtpPassword,
                fromaddress: args.secretValues.smtpDetails.smtpFromAddress,
            }
        }, { provider: args.provider, parent: this });

        this.RecaptchaSecret = new Secret(`${args.commonName}-recaptcha-secret`, {
            metadata: {
                namespace: args.namespace
            },
            stringData: {
                secretKey: args.secretValues.recaptcha.secretKey,
                siteKey: args.secretValues.recaptcha.siteKey
            }
        }, { provider: args.provider, parent: this });

        this.registerOutputs({
            LicenseKeySecret: this.LicenseKeySecret,
            ApiCertificateSecret: this.ApiCertificateSecret,
            ConsoleCertificateSecret: this.ConsoleCertificateSecret,
            DBConnSecret: this.DBConnSecret,
            SmtpSecret: this.SmtpSecret,
            RecaptchaSecret: this.RecaptchaSecret
        })
    }
}
