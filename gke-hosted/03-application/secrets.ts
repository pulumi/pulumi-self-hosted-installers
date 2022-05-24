import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as kx from "@pulumi/kubernetesx";
import { Input, Output, ComponentResource, ComponentResourceOptions } from "@pulumi/pulumi";

export interface SecretsCollectionArgs {
    namespace: Input<string>,
    commonName: string,
    provider: k8s.Provider,
    apiDomain: Input<string>
    secretValues: {
        licenseKey: Input<string>,
        apiTlsKey: Output<string>,
        apiTlsCert: Output<string>,
        consoleTlsKey: Output<string>,
        consoleTlsCert: Output<string>,
        database: {
            host: Input<string>,
            connectionString: Input<string>,
            login: Input<string>,
            password: Input<string>,
            serverName: Input<string>,
        },
        storage: {
            accessKeyId: Input<string>,
            secretAccessKey: Input<string>,
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
    LicenseKeySecret: kx.Secret;
    ApiCertificateSecret: kx.Secret;
    ConsoleCertificateSecret: kx.Secret;
    DBConnSecret: kx.Secret;
    StorageSecret: kx.Secret;
    SmtpSecret: kx.Secret;
    RecaptchaSecret: kx.Secret;
    constructor(name: string, args: SecretsCollectionArgs, opts?: ComponentResourceOptions) {
        super("x:kubernetes:secrets", name, opts);

        this.LicenseKeySecret = new kx.Secret(`${args.commonName}-license-key`, {
            metadata: { namespace: args.namespace },
            stringData: { key: args.secretValues.licenseKey },
        }, { provider: args.provider, parent: this });

        this.ApiCertificateSecret = new kx.Secret(`${args.commonName}-api-tls`, {
            metadata: {
                namespace: args.namespace
            },
            data: {
                "tls.key": args.secretValues.apiTlsKey.apply(it=>Buffer.from(it).toString("base64")),
                "tls.crt": args.secretValues.apiTlsCert.apply(it=>Buffer.from(it).toString("base64")),
            },
        }, { provider: args.provider, parent: this });

        this.ConsoleCertificateSecret = new kx.Secret(`${args.commonName}-console-tls`, {
            metadata: {
                namespace: args.namespace
            },
            data: {
                "tls.key": args.secretValues.consoleTlsKey.apply(it=>Buffer.from(it).toString("base64")),
                "tls.crt": args.secretValues.consoleTlsCert.apply(it=>Buffer.from(it).toString("base64")),
            },
        }, { provider: args.provider, parent: this });
        
        this.DBConnSecret = new kx.Secret(`${args.commonName}-mysql-db-conn`, {
            metadata: {
                namespace: args.namespace,
            },
            stringData: {
              host: args.secretValues.database.host,
              connectionString: args.secretValues.database.connectionString,
              username: pulumi.interpolate`${args.secretValues.database.login}@${args.secretValues.database.serverName}`,
              password: args.secretValues.database.password,
            },
          }, { provider: args.provider, parent: this });

        this.StorageSecret = new kx.Secret(`${args.commonName}-storage-secret`, {
            metadata: {
                namespace: args.namespace,
            },
            stringData: {
                accessKeyId: args.secretValues.storage.accessKeyId,
                secretAccessKey: args.secretValues.storage.secretAccessKey,
            }
          }, { provider: args.provider, parent: this });

        this.SmtpSecret = new kx.Secret(`${args.commonName}-smtp-secret`, {
            metadata: {
                namespace: args.namespace,
            },
            stringData: {
                server: args.secretValues.smtpDetails.smtpServer,
                username: args.secretValues.smtpDetails.smtpUsername,
                password: args.secretValues.smtpDetails.smtpPassword,
                fromaddress: args.secretValues.smtpDetails.smtpFromAddress,
            }
        }, {provider: args.provider, parent: this});

        this.RecaptchaSecret = new kx.Secret(`${args.commonName}-recaptcha-secret`, {
            metadata: {
                namespace: args.namespace
            },
            stringData: {
                secretKey: args.secretValues.recaptcha.secretKey,
                siteKey: args.secretValues.recaptcha.siteKey
            }
        }, {provider: args.provider, parent: this});
    
        this.registerOutputs({
            LicenseKeySecret: this.LicenseKeySecret,
            ApiCertificateSecret: this.ApiCertificateSecret,
            ConsoleCertificateSecret: this.ConsoleCertificateSecret,
            DBConnSecret: this.DBConnSecret,
            StorageSecret: this.StorageSecret,
            SmtpSecret: this.SmtpSecret,
            RecaptchaSecret: this.RecaptchaSecret
        })
    }
}
