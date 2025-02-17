import {PrivateKey, SelfSignedCert} from "@pulumi/tls";
import * as k8s from "@pulumi/kubernetes";
import { Input, ComponentResource, ComponentResourceOptions } from "@pulumi/pulumi";

export interface SsoCertificateArgs {
    apiDomain: string,
    namespace: Input<string>,
}

export class SsoCertificate extends ComponentResource {
    public SamlSsoSecret: k8s.core.v1.Secret;
    constructor(name: string, args: SsoCertificateArgs, opts?: ComponentResourceOptions) { 
        super("x:kubernetes:ssocertificate", name, opts);

        const currentYear = new Date().getFullYear();
        
        // We use currentYear to ensure the TLS certs are rotated at least once a year.
        const ssoPrivateKey = new PrivateKey(`ssoPrivateKey-${currentYear}`, { 
            algorithm: "RSA", rsaBits: 2048 
        }, {parent: this});
        
        const ssoCert = new SelfSignedCert(`ssoCert-${currentYear}`, {
            allowedUses: ["cert_signing"],
            privateKeyPem: ssoPrivateKey.privateKeyPem,
            subject: {
                commonName: `${args.apiDomain}`
            },
            validityPeriodHours: (400*24)
        }, { parent: this })

        this.SamlSsoSecret = new k8s.core.v1.Secret("saml-sso",
        {
            metadata: { namespace: args.namespace },
            stringData: {
                pubkey: ssoCert.certPem,
                privatekey: ssoPrivateKey.privateKeyPem,
            },
        
        }, { parent: this })

        this.registerOutputs({
            SamlSsoSecret: this.SamlSsoSecret
        });
    }
}