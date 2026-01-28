import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { Input, Output, ComponentResource, ComponentResourceOptions } from "@pulumi/pulumi";
import { CustomResource } from "@pulumi/kubernetes/apiextensions"

// OpenSearch TLS-enabled component for Pulumi Self-Hosted Services
// Supports cross-namespace communication with proper certificate management
//
// NOTE: If you need to use a local version of the helm charts instead of the remote repo, do the following:
// - Locally copy the repo: `git clone https://github.com/opensearch-project/helm-charts.git`
// - Comment out the fetchOpts and repo fields in the two helm charts resources below.
// - Uncomment the path field for each helm chart resources and set it to the local path of the opensearch or opensearch-dashboard helm chart accordingly.
//
// TLS Configuration:
// - enableTLS: true/false - Enable TLS for OpenSearch HTTP and transport layers
// - certificateSecretName: Name of Kubernetes secret containing TLS certificates
// - crossNamespaceAccess: true/false - Enable access from other namespaces
// - allowedNamespaces: List of namespace names allowed to access OpenSearch   

export interface OpenSearchArgs {
    namespace: Output<string>;
    serviceAccount: Input<string>;
    initialAdminPassword: Input<string>;
    enableTLS?: Input<boolean>;
    certificateSecretName?: Input<string>;
    trustedCASecretName?: Input<string>;
    adminCertificateSecretName?: Input<string>;
    crossNamespaceAccess?: Input<boolean>;
    allowedNamespaces?: Input<string[]>;
}

export class OpenSearch extends ComponentResource {
    public namespace: Output<string>;
    public serviceName: Output<string>;
    public endpoint: Output<string>;
    public secureEndpoint: Output<string>;

    constructor(name: string, args: OpenSearchArgs, opts: ComponentResourceOptions) {
        super("x:kubernetes:opensearch", name, opts);
        const osRepoUrl = "https://opensearch-project.github.io/helm-charts/"
        const osChartName = "opensearch"
        const chartVersion = "2.24.1"
        const oscVersion = "2.14.0"
        opts = {...opts, parent: this}  
        const opensearch = new k8s.helm.v3.Chart("opensearch", {
            chart: osChartName,
            version: chartVersion,
            namespace: args.namespace,
            // Comment out the fetchOpts block if using local copy of the helm chart.
            // And uncomment the path field and set it to the local path of the helm chart if using a local copy of the helm chart.
            fetchOpts: {
                repo: osRepoUrl,
            },
            // path: "/path/to/local/helm-charts/charts",
            values: {
                roles: [
                    "master",
                    "ingest",
                    "data",
                    "remote_cluster_client"
                ],
                replicas: 3,
                imageTag: oscVersion,
                image: {
                    tag: oscVersion,
                },
                opensearchJavaOpts: "-Xmx1024M -Xms1024M",
                persistence: {
                    enabled: false,
                },
                resources: {
                    requests: {
                        memory: "2Gi",
                        cpu: "1000m"
                    },
                    limits: {
                        memory: "2Gi",
                        cpu: "1000m",
                    },
                },
                sysctlInit: {
                    enabled: true
                },
                extraEnvs: [
                    {
                        name: "OPENSEARCH_INITIAL_ADMIN_PASSWORD",
                        value: args.initialAdminPassword,
                    }
                ],
                rbac: {
                    serviceAccountName: args.serviceAccount,
                    automountServiceAccountToken: true,
                },
                serviceAccountName: args.serviceAccount,
                
                // TLS Configuration
                // cert-manager creates secrets with standard keys: tls.crt, tls.key, ca.crt
                config: args.enableTLS ? {
                    // Transport layer TLS - use cert-manager's standard secret keys
                    "plugins.security.ssl.transport.pemcert_filepath": "/usr/share/opensearch/config/tls.crt",
                    "plugins.security.ssl.transport.pemkey_filepath": "/usr/share/opensearch/config/tls.key",
                    "plugins.security.ssl.transport.pemtrustedcas_filepath": "/usr/share/opensearch/config/ca.crt",
                    "plugins.security.ssl.transport.enforce_hostname_verification": "false",
                    "plugins.security.ssl.transport.resolve_hostname": "false",

                    // HTTP layer TLS - use same certificate for HTTP
                    "plugins.security.ssl.http.enabled": "true",
                    "plugins.security.ssl.http.pemcert_filepath": "/usr/share/opensearch/config/tls.crt",
                    "plugins.security.ssl.http.pemkey_filepath": "/usr/share/opensearch/config/tls.key",
                    "plugins.security.ssl.http.pemtrustedcas_filepath": "/usr/share/opensearch/config/ca.crt",

                    // Security configuration
                    "plugins.security.allow_unsafe_democertificates": "false",
                    "plugins.security.allow_default_init_securityindex": "true",
                    "plugins.security.audit.type": "internal_opensearch",
                    "plugins.security.enable_snapshot_restore_privilege": "true",
                    "plugins.security.check_snapshot_restore_write_privileges": "true",
                    "plugins.security.restapi.roles_enabled": '["all_access", "security_rest_api_access"]',
                } : {
                    // Disable TLS (legacy behavior)
                    "plugins.security.ssl.http.enabled": "false",
                    "plugins.security.ssl.transport.enforce_hostname_verification": "false",
                    "plugins.security.disabled": "true"
                },
                
                // Secret mounts for TLS certificates
                secretMounts: args.enableTLS ? [
                    {
                        name: "opensearch-certs",
                        secretName: args.certificateSecretName || "opensearch-certificates",
                        path: "/usr/share/opensearch/config",
                    }
                ] : [],
                
                // Service configuration for cross-namespace access
                service: {
                    type: "ClusterIP",
                    annotations: args.crossNamespaceAccess ? {
                        "service.alpha.kubernetes.io/tolerate-unready-endpoints": "true"
                    } : {}
                },
                
                // Network policy for cross-namespace communication
                networkPolicy: args.crossNamespaceAccess ? {
                    enabled: true,
                    ingress: [
                        {
                            from: args.allowedNamespaces ? args.allowedNamespaces.map(ns => ({
                                namespaceSelector: {
                                    matchLabels: {
                                        name: ns
                                    }
                                }
                            })) : [
                                {
                                    namespaceSelector: {}
                                }
                            ],
                            ports: [
                                {
                                    port: 9200,
                                    protocol: "TCP"
                                }
                            ]
                        }
                    ]
                } : { enabled: false }
            },
        }, opts);

        const opensearchDashboard = new k8s.helm.v3.Chart("opensearch-dashboards", {
            chart: `${osChartName}-dashboards`,
            version: "2.22.0",
            namespace: args.namespace,
            // Comment out the fetchOpts block if using local copy of the helm chart.
            // And, uncomment the path field and set it to the local path of the helm chart if using a local copy of the helm chart.
            fetchOpts: {
                repo: osRepoUrl,
            },
            // path: "/path/to/local/helm-charts/charts",
            values: {
                replicas: 1,
                imageTag: oscVersion,
                image: {
                    tag: oscVersion,
                },
                resources: {
                    requests: {
                        memory: "1Gi",
                        cpu: "500m"
                    },
                    limits: {
                        memory: "1Gi",
                        cpu: "500m",
                    },
                },
                service: {
                    type: "NodePort",
                    annotations: {
                        "cloud.google.com/neg": '{"ingress": true}',
                    },
                },
                extraEnvs: [
                    {
                        name: "OPENSEARCH_INITIAL_ADMIN_PASSWORD",
                        value: args.initialAdminPassword
                    }
                ],
                rbac: {
                    serviceAccountName: args.serviceAccount,
                    automountServiceAccountToken: true,
                },
                serviceAccountName: args.serviceAccount
            },
        }, opts);


        this.namespace = pulumi.output(args.namespace);
        this.serviceName = pulumi.interpolate`opensearch-cluster-master`;
        
        // Generate appropriate endpoints based on TLS configuration
        this.endpoint = args.enableTLS ? 
            pulumi.interpolate`https://${this.serviceName}.${this.namespace}.svc.cluster.local:9200` :
            pulumi.interpolate`http://${this.serviceName}.${this.namespace}.svc.cluster.local:9200`;
            
        this.secureEndpoint = pulumi.interpolate`https://${this.serviceName}.${this.namespace}.svc.cluster.local:9200`;

        this.registerOutputs({
            namespace: this.namespace,
            serviceName: this.serviceName,
            endpoint: this.endpoint,
            secureEndpoint: this.secureEndpoint
        });
    }
}