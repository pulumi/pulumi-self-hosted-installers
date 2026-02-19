import { ComponentResource, ComponentResourceOptions, Output, Input } from "@pulumi/pulumi";
import { Provider, apiextensions, helm, core } from "@pulumi/kubernetes";

// Cloud provider types for DNS challenges
export type CloudProvider = "aws" | "azure" | "gcp";

// Base interface for all cert-manager deployments
export interface CertManagerBaseArgs {
    provider: Provider;
    certManagerNamespace?: string;
    issuerEmail?: string;
    letsEncryptUrl?: string; // defaults to production, set to staging for testing
}

// Interface for certificate issuance
export interface CertificateArgs {
    provider: Provider;
    domains: string[];
    certSecretName: string;
    namespaceName: Output<string>;
    issuerName: string;
    usages?: string[];
}

// Cloud-specific DNS challenge configurations
export interface AzureDNSChallengeArgs {
    subscriptionId: Output<string>;
    resourceGroupName: string;
    hostedZoneName: string;
    managedClientId: string;
}

export interface AWSRoute53ChallengeArgs {
    region?: string;
    hostedZoneId?: string;
    role?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
}

export interface GCPDNSChallengeArgs {
    project: string;
    serviceAccountSecretName?: string;
}

// Combined arguments for platform-specific cert-manager
export interface CertManagerArgs {
    provider: Provider;
    domains: string[];
    certSecretName: string;
    namespaceName: Output<string>;
    subscriptionId: Output<string>;
    resourceGroupName: string;
    hostedZoneName: string;
    managedClientId: string;
    issuerEmail?: string;
}

// Generic cert-manager installation component
export class CertManager extends ComponentResource {
    public readonly namespace: Output<string>;
    public readonly helmReleaseName: Output<string>;

    constructor(name: string, args: CertManagerBaseArgs, opts?: ComponentResourceOptions) {
        super("x:kubernetes:certManager", name, args, opts);

        const certManagerNamespace = args.certManagerNamespace || "cert-manager";

        // Create cert-manager namespace
        const namespace = new core.v1.Namespace(`${name}-namespace`, {
            metadata: {
                name: certManagerNamespace,
            },
        }, { provider: args.provider, parent: this });

        // Install cert-manager using Helm
        const certManagerHelm = new helm.v3.Release(`${name}-release`, {
            chart: "cert-manager",
            repositoryOpts: {
                repo: "https://charts.jetstack.io"
            },
            namespace: namespace.metadata.name,
            version: "1.16.2",
            values: {
                installCRDs: true,
                global: {
                    podSecurityPolicy: {
                        enabled: false
                    }
                },
                // Cloud-agnostic configuration
                serviceAccount: {
                    create: true,
                    name: "cert-manager"
                }
            }
        }, { provider: args.provider, parent: this });

        this.namespace = namespace.metadata.name;
        this.helmReleaseName = certManagerHelm.status.name;

        this.registerOutputs({
            namespace: this.namespace,
            helmReleaseName: this.helmReleaseName,
        });
    }
}

// Generic certificate component
export class Certificate extends ComponentResource {
    public readonly certificateName: Output<string>;

    constructor(name: string, args: CertificateArgs, opts?: ComponentResourceOptions) {
        super("x:kubernetes:certificate", name, args, opts);

        const certificate = new apiextensions.CustomResource(`${name}-cert`, {
            apiVersion: "cert-manager.io/v1",
            kind: "Certificate",
            metadata: {
                name: `${name}-certificate`,
                namespace: args.namespaceName
            },
            spec: {
                secretName: args.certSecretName,
                dnsNames: args.domains,
                issuerRef: {
                    name: args.issuerName,
                    kind: "ClusterIssuer"
                },
                usages: args.usages || [
                    "digital signature",
                    "key encipherment",
                    "server auth"
                ],
            }
        }, { provider: args.provider, parent: this });

        this.certificateName = certificate.metadata.name;
        this.registerOutputs({
            certificateName: this.certificateName
        });
    }
}

// Azure-specific ClusterIssuer
export class AzureDNSClusterIssuer extends ComponentResource {
    public readonly issuerName: Output<string>;

    constructor(name: string, args: CertManagerBaseArgs & AzureDNSChallengeArgs, opts?: ComponentResourceOptions) {
        super("x:kubernetes:azureDNSClusterIssuer", name, args, opts);

        const letsEncryptUrl = args.letsEncryptUrl || "https://acme-v02.api.letsencrypt.org/directory";

        const acmeSpec = args.issuerEmail ?
            {
                server: letsEncryptUrl,
                email: args.issuerEmail,
                privateKeySecretRef: {
                    name: "acme-issuer-azure"
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
                    name: "acme-issuer-azure"
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
                name: `${name}-azure-dns-issuer`
            },
            spec: {
                acme: acmeSpec
            }
        }, { provider: args.provider, parent: this });

        this.issuerName = issuer.metadata.name;
        this.registerOutputs({
            issuerName: this.issuerName
        });
    }
}

// AWS Route53-specific ClusterIssuer
export class AWSRoute53ClusterIssuer extends ComponentResource {
    public readonly issuerName: Output<string>;

    constructor(name: string, args: CertManagerBaseArgs & AWSRoute53ChallengeArgs, opts?: ComponentResourceOptions) {
        super("x:kubernetes:awsRoute53ClusterIssuer", name, args, opts);

        const letsEncryptUrl = args.letsEncryptUrl || "https://acme-v02.api.letsencrypt.org/directory";

        const route53Solver: any = {
            dns01: {
                route53: {
                    region: args.region || "us-east-1"
                }
            }
        };

        // Add hosted zone if specified
        if (args.hostedZoneId) {
            route53Solver.dns01.route53.hostedZoneID = args.hostedZoneId;
        }

        // Add IAM role if specified (for IRSA)
        if (args.role) {
            route53Solver.dns01.route53.role = args.role;
        }

        // Add access keys if specified (for explicit credentials)
        if (args.accessKeyId && args.secretAccessKey) {
            route53Solver.dns01.route53.accessKeyID = args.accessKeyId;
            route53Solver.dns01.route53.secretAccessKeySecretRef = {
                name: "route53-credentials",
                key: "secret-access-key"
            };
        }

        const acmeSpec = {
            server: letsEncryptUrl,
            email: args.issuerEmail,
            privateKeySecretRef: {
                name: "acme-issuer-aws"
            },
            solvers: [route53Solver]
        };

        const issuer = new apiextensions.CustomResource(`${name}-issuer`, {
            apiVersion: "cert-manager.io/v1",
            kind: "ClusterIssuer",
            metadata: {
                name: `${name}-aws-route53-issuer`
            },
            spec: {
                acme: acmeSpec
            }
        }, { provider: args.provider, parent: this });

        this.issuerName = issuer.metadata.name;
        this.registerOutputs({
            issuerName: this.issuerName
        });
    }
}

// GCP DNS-specific ClusterIssuer
export class GCPDNSClusterIssuer extends ComponentResource {
    public readonly issuerName: Output<string>;

    constructor(name: string, args: CertManagerBaseArgs & GCPDNSChallengeArgs, opts?: ComponentResourceOptions) {
        super("x:kubernetes:gcpDNSClusterIssuer", name, args, opts);

        const letsEncryptUrl = args.letsEncryptUrl || "https://acme-v02.api.letsencrypt.org/directory";

        const cloudDNSSolver: any = {
            dns01: {
                cloudDNS: {
                    project: args.project
                }
            }
        };

        // Add service account secret if specified
        if (args.serviceAccountSecretName) {
            cloudDNSSolver.dns01.cloudDNS.serviceAccountSecretRef = {
                name: args.serviceAccountSecretName,
                key: "key.json"
            };
        }

        const acmeSpec = {
            server: letsEncryptUrl,
            email: args.issuerEmail,
            privateKeySecretRef: {
                name: "acme-issuer-gcp"
            },
            solvers: [cloudDNSSolver]
        };

        const issuer = new apiextensions.CustomResource(`${name}-issuer`, {
            apiVersion: "cert-manager.io/v1",
            kind: "ClusterIssuer",
            metadata: {
                name: `${name}-gcp-dns-issuer`
            },
            spec: {
                acme: acmeSpec
            }
        }, { provider: args.provider, parent: this });

        this.issuerName = issuer.metadata.name;
        this.registerOutputs({
            issuerName: this.issuerName
        });
    }
}

// Legacy Azure-specific cert-manager deployment for backward compatibility
export class CertManagerDeployment extends ComponentResource {
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
                name: `${name}-cluster-issuer`
            },
            spec: {
                acme: acmeSpec
            }
        }, { provider: args.provider, parent: this });

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
        }, { provider: args.provider, parent: this });
    }
}