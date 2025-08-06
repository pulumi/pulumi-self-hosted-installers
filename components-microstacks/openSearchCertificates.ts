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

        this.certificateSecretName = opensearchCertificate.spec.secretName;
        this.adminCertificateSecretName = adminCertificate.spec.secretName;

        this.registerOutputs({
            certificateSecretName: this.certificateSecretName,
            adminCertificateSecretName: this.adminCertificateSecretName
        });
    }
}

// Utility function to create a CA issuer for OpenSearch-specific certificates
export class OpenSearchCAIssuer extends ComponentResource {
    public readonly issuerName: Output<string>;

    constructor(name: string, args: { provider: Provider, namespace?: Output<string> }, opts?: ComponentResourceOptions) {
        super("x:kubernetes:openSearchCAIssuer", name, args, opts);

        // Create a self-signed CA issuer specifically for OpenSearch
        const caIssuer = new apiextensions.CustomResource(`${name}-ca-issuer`, {
            apiVersion: "cert-manager.io/v1",
            kind: "ClusterIssuer",
            metadata: {
                name: `${name}-opensearch-ca-issuer`
            },
            spec: {
                ca: {
                    secretName: "opensearch-ca-secret"
                }
            }
        }, { provider: args.provider, parent: this });

        this.issuerName = caIssuer.metadata.name;
        this.registerOutputs({
            issuerName: this.issuerName
        });
    }
}