import {ComponentResource, ComponentResourceOptions, Output, all} from "@pulumi/pulumi";
import {Provider, apiextensions} from "@pulumi/kubernetes";

export interface CertManagerArgs {
    provider: Provider,
    domains: string[],
    certSecretName: string,
    namespaceName: Output<string>;
    subscriptionId: Output<string>;
    resourceGroupName: string;
    hostedZoneName: string;
    managedClientId: string;
    issuerEmail?: string;
}

export class CertManagerDeployment extends ComponentResource {
    public readonly Issuer: Output<string>;

    constructor(name: string, args: CertManagerArgs, opts?: ComponentResourceOptions) {
        super("x:kubernetes:certManagerDeployment", name, args, opts);

         const letsEncryptUrl = "https://acme-v02.api.letsencrypt.org/directory";
        // FOR TESTING:
        // const letsEncryptUrl = "https://acme-staging-v02.api.letsencrypt.org/directory";
        const acmeSpec = args.issuerEmail ?
            {
                server: letsEncryptUrl,
                email: args.issuerEmail,
                privateKeySecretRef: {
                    name: "acme-issuer"
                },
                solvers: [{
                    dns01: {
                        azureDNS: {
                            resourceGroupName: args.resourceGroupName,
                            subscriptionID: args.subscriptionId,
                            hostedZoneName: args.hostedZoneName,
                            environment: "AzurePublicCloud",
                            managedIdentity: {
                                clientID: args.managedClientId,
                            },
                        }
                    }
                }]
            } :
            {
                server: letsEncryptUrl,
                privateKeySecretRef: {
                    name: "acme-issuer"
                },
                solvers: [{
                    dns01: {
                        azureDNS: {
                            resourceGroupName: args.resourceGroupName,
                            subscriptionID: args.subscriptionId,
                            hostedZoneName: args.hostedZoneName,
                            environment: "AzurePublicCloud",
                            managedIdentity: {
                                clientID: args.managedClientId,
                            },
                        }
                    }
                }]
            };

        const issuer = new apiextensions.CustomResource(`${name}-issuer`, {
            apiVersion: "cert-manager.io/v1",
            kind: "ClusterIssuer",
            metadata: {
                namespace: args.namespaceName
            },
            spec: {
                acme: acmeSpec
            }
        }, {provider: args.provider, parent: this});
        this.Issuer = issuer.metadata.name;

        new apiextensions.CustomResource(`${name}-cert`, {
            apiVersion: "cert-manager.io/v1",
            kind: "Certificate",
            metadata: {
                namespace: args.namespaceName
            },
            spec: {
                secretName: args.certSecretName,
                dnsNames: args.domains,
                issuerRef: {
                    name: issuer.metadata.name,
                    kind: "ClusterIssuer"
                },
                usages: [
                    "digital signature",
                    "key encipherment",
                    "server auth"
                ],
            }
        }, {provider: args.provider, parent: this});

        this.registerOutputs({
            Issuer: this.Issuer
        });
    }


}
