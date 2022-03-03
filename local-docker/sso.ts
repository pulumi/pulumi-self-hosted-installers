import { PrivateKey, SelfSignedCert } from "@pulumi/tls";
import { ComponentResource, ComponentResourceOptions } from "@pulumi/pulumi";

export interface SsoCertificateArgs {
    apiDomain: string,
}

export class SsoCertificate extends ComponentResource {
    public privateKey: PrivateKey;
    public cert: SelfSignedCert;

    constructor(name: string, args: SsoCertificateArgs, opts?: ComponentResourceOptions) {
        super("selfhosted:index:ssocertificate", name, opts);

        // We use currentYear to ensure the TLS certs are rotated at least once a year - https://github.com/pulumi/pulumi-tls/issues/39.
        const currentYear = new Date().getFullYear();
        this.privateKey = new PrivateKey(`${name}-sso-${currentYear}`, {
            algorithm: "RSA", rsaBits: 2048
        }, { parent: this });

        this.cert = new SelfSignedCert(`${name}-sso-${currentYear}`, {
            allowedUses: ["cert_signing"],
            keyAlgorithm: "RSA",
            privateKeyPem: this.privateKey.privateKeyPem,
            subjects: [
                { commonName: `${args.apiDomain}` }
            ],
            validityPeriodHours: (400 * 24)
        }, { parent: this });

    }
}
