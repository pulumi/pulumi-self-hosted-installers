import * as pulumi from "@pulumi/pulumi";
import { ComponentResource, ComponentResourceOptions, Output, Input } from "@pulumi/pulumi";
import { Provider, apiextensions } from "@pulumi/kubernetes";

export interface OpenSearchCertificatesArgs {
    provider: Provider;
    namespace: Output<string>;
    issuerName: string;
    certificateSecretName?: string;
    adminCertificateSecretName?: string;
    domains?: string[];
}

export class OpenSearchCertificates extends ComponentResource {
    public readonly certificateSecretName: Output<string>;
    public readonly adminCertificateSecretName: Output<string>;

    constructor(name: string, args: OpenSearchCertificatesArgs, opts?: ComponentResourceOptions) {
        super("x:kubernetes:openSearchCertificates", name, args, opts);

        const certSecretName = args.certificateSecretName || "opensearch-certificates";
        const adminCertSecretName = args.adminCertificateSecretName || "opensearch-admin-certificates";

        // Generate DNS names for OpenSearch service
        const defaultDomains = [
            // Internal cluster DNS names for cross-namespace access
            args.namespace.apply(ns => `opensearch-cluster-master.${ns}.svc.cluster.local`),
            args.namespace.apply(ns => `opensearch-cluster-master.${ns}.svc`),
            args.namespace.apply(ns => `opensearch.${ns}.svc.cluster.local`),
            args.namespace.apply(ns => `opensearch.${ns}.svc`),
            // Short names for same-namespace access
            "opensearch-cluster-master",
            "opensearch",
            // Headless service names for StatefulSet pods
            args.namespace.apply(ns => `opensearch-headless.${ns}.svc.cluster.local`),
            args.namespace.apply(ns => `opensearch-headless.${ns}.svc`),
            // Individual pod names for transport layer
            args.namespace.apply(ns => `opensearch-0.opensearch-headless.${ns}.svc.cluster.local`),
            args.namespace.apply(ns => `opensearch-1.opensearch-headless.${ns}.svc.cluster.local`),
            args.namespace.apply(ns => `opensearch-2.opensearch-headless.${ns}.svc.cluster.local`),
        ];

        const domains = args.domains || defaultDomains;

        // Create main OpenSearch certificate for HTTP and transport
        const opensearchCertificate = new apiextensions.CustomResource(`${name}-cert`, {
            apiVersion: "cert-manager.io/v1",
            kind: "Certificate",
            metadata: {
                name: `${name}-certificate`,
                namespace: args.namespace
            },
            spec: {
                secretName: certSecretName,
                dnsNames: domains,
                issuerRef: {
                    name: args.issuerName,
                    kind: "ClusterIssuer"
                },
                usages: [
                    "digital signature",
                    "key encipherment",
                    "server auth",
                    "client auth"
                ],
                // Generate both RSA certificate and separate files for OpenSearch
                privateKey: {
                    algorithm: "RSA",
                    size: 2048
                },
                // Add extended key usage for OpenSearch
                isCA: false,
                duration: "8760h", // 1 year
                renewBefore: "720h", // 30 days
            }
        }, { provider: args.provider, parent: this });

        // Create admin certificate for OpenSearch administrative operations
        const adminCertificate = new apiextensions.CustomResource(`${name}-admin-cert`, {
            apiVersion: "cert-manager.io/v1",
            kind: "Certificate",
            metadata: {
                name: `${name}-admin-certificate`,
                namespace: args.namespace
            },
            spec: {
                secretName: adminCertSecretName,
                commonName: "admin",
                subject: {
                    organizations: ["Example Com Inc."],
                    organizationalUnits: ["Example Com Inc. Root CA"],
                    countries: ["US"]
                },
                issuerRef: {
                    name: args.issuerName,
                    kind: "ClusterIssuer"
                },
                usages: [
                    "digital signature",
                    "key encipherment",
                    "client auth"
                ],
                privateKey: {
                    algorithm: "RSA",
                    size: 2048
                },
                isCA: false,
                duration: "8760h", // 1 year
                renewBefore: "720h", // 30 days
            }
        }, { provider: args.provider, parent: this });

        // Use the computed secret names directly instead of accessing spec.secretName
        // which returns Input<any> and may not resolve correctly
        this.certificateSecretName = pulumi.output(certSecretName);
        this.adminCertificateSecretName = pulumi.output(adminCertSecretName);

        this.registerOutputs({
            certificateSecretName: this.certificateSecretName,
            adminCertificateSecretName: this.adminCertificateSecretName
        });
    }
}

// Creates a CA issuer for OpenSearch-specific certificates using a two-stage bootstrap:
// 1. Create a SelfSigned ClusterIssuer
// 2. Use it to generate a CA Certificate
// 3. Create a CA ClusterIssuer that references the generated CA secret
export class OpenSearchCAIssuer extends ComponentResource {
    public readonly issuerName: Output<string>;
    public readonly caSecretName: Output<string>;

    constructor(name: string, args: { provider: Provider, namespace?: Output<string> }, opts?: ComponentResourceOptions) {
        super("x:kubernetes:openSearchCAIssuer", name, args, opts);

        const caSecretName = `${name}-ca-secret`;
        const caNamespace = args.namespace || pulumi.output("cert-manager");

        // Step 1: Create a SelfSigned ClusterIssuer to bootstrap the CA
        const selfSignedIssuer = new apiextensions.CustomResource(`${name}-selfsigned-issuer`, {
            apiVersion: "cert-manager.io/v1",
            kind: "ClusterIssuer",
            metadata: {
                name: `${name}-selfsigned-issuer`
            },
            spec: {
                selfSigned: {}
            }
        }, { provider: args.provider, parent: this });

        // Step 2: Create a CA Certificate using the SelfSigned issuer
        // The certificate is stored in the cert-manager namespace (or specified namespace)
        // so the CA ClusterIssuer can reference it
        const caCertificate = new apiextensions.CustomResource(`${name}-ca-cert`, {
            apiVersion: "cert-manager.io/v1",
            kind: "Certificate",
            metadata: {
                name: `${name}-ca-certificate`,
                namespace: caNamespace
            },
            spec: {
                isCA: true,
                commonName: "OpenSearch CA",
                secretName: caSecretName,
                privateKey: {
                    algorithm: "RSA",
                    size: 2048
                },
                issuerRef: {
                    name: selfSignedIssuer.metadata.name,
                    kind: "ClusterIssuer"
                },
                duration: "87600h", // 10 years
                renewBefore: "8760h", // 1 year
            }
        }, { provider: args.provider, parent: this, dependsOn: [selfSignedIssuer] });

        // Step 3: Create the CA ClusterIssuer referencing the generated CA secret
        const caIssuer = new apiextensions.CustomResource(`${name}-ca-issuer`, {
            apiVersion: "cert-manager.io/v1",
            kind: "ClusterIssuer",
            metadata: {
                name: `${name}-opensearch-ca-issuer`
            },
            spec: {
                ca: {
                    secretName: caSecretName
                }
            }
        }, { provider: args.provider, parent: this, dependsOn: [caCertificate] });

        this.issuerName = caIssuer.metadata.name;
        this.caSecretName = pulumi.output(caSecretName);
        this.registerOutputs({
            issuerName: this.issuerName,
            caSecretName: this.caSecretName
        });
    }
}