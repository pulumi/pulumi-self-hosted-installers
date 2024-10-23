import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { Input, Output, ComponentResource, ComponentResourceOptions } from "@pulumi/pulumi";
import { CustomResource } from "@pulumi/kubernetes/apiextensions"

export interface OpenSearchArgs {
    namespace: Output<string>,
    serviceAccount: Input<string>,
    intitialAdminPassword: Input<string>,
};

export class OpenSearch extends ComponentResource {
    public namespace: Output<string>;
    public envVars: k8s.types.input.core.v1.EnvVar[];
    // public dashboardService: Output<k8s.core.v1.Service>;
    // public customResourceName: Output<string>;

    constructor(name: string, args: OpenSearchArgs, opts: ComponentResourceOptions) {
        super("x:kubernetes:opensearch", name, opts);
        const osRepoUrl = "https://opensearch-project.github.io/helm-charts/"
        const osChartName = "opensearch"
        const chartVersion = "2.24.1"
        const oscVersion = "2.14.0"
        const opensearch = new k8s.helm.v3.Chart("opensearch", {
            chart: osChartName,
            version: chartVersion,
            namespace: args.namespace,
            fetchOpts: {
                repo: osRepoUrl,
            },
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
                        value: args.intitialAdminPassword,
                    }
                ],
                rbac: {
                    serviceAccountName: args.serviceAccount,
                    automountServiceAccountToken: true,
                },
                serviceAccountName: args.serviceAccount
            },
        }, { parent: this });

        const opensearchDashboard = new k8s.helm.v3.Chart("opensearch-dashboards", {
            chart: `${osChartName}-dashboards`,
            version: "2.22.0",
            namespace: args.namespace,
            fetchOpts: {
                repo: osRepoUrl,
            },
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
                        value: args.intitialAdminPassword,
                    }
                ],
                rbac: {
                    serviceAccountName: args.serviceAccount,
                    automountServiceAccountToken: true,
                },
                serviceAccountName: args.serviceAccount
            },
        }, { parent: this });


        this.namespace = pulumi.output(args.namespace)

        this.envVars = [
            {
                name: "PULUMI_SEARCH_DOMAIN",
                value: "https://opensearch-cluster-master:9200"
            },
            {
                name: "PULUMI_SEARCH_USER",
                value: "admin"
            },
            {
                name: "PULUMI_SEARCH_PASSWORD",
                value: args.intitialAdminPassword.toString(),
            }
        ]

        // this.dashboardService = args.namespace.apply(namespace => k8s.core.v1.Service.get(
        //     "opensearch-dashboard", 
        //     `${namespace}/osr-opensearch-operator-controller-manager-metrics-service`,
        //     {parent: this, provider: opts.provider}
        // ))
        // this.customResourceName = osc.metadata.name
        this.registerOutputs({
            namespace: this.namespace,
            envVars: this.envVars,
        })
    }
}