import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { config } from "./config";

const opensearchNamespace = new k8s.core.v1.Namespace("opensearch-namespace", {
    metadata: {
        name: "opensearch",
    },
});

const opensearchDeployment = new k8s.apps.v1.Deployment("opensearch-deployment", {
    metadata: {
        namespace: opensearchNamespace.metadata.name,
        name: "opensearch",
    },
    spec: {
        replicas: config.opensearch.instanceCount,
        selector: {
            matchLabels: {
                app: "opensearch",
            },
        },
        template: {
            metadata: {
                labels: {
                    app: "opensearch",
                },
            },
            spec: {
                containers: [
                    {
                        name: "opensearch",
                        image: `opensearchproject/opensearch:${config.opensearch.imageTag}`,
                        ports: [{ containerPort: 9200 }],
                        env: [
                            {
                                name: "cluster.name",
                                value: "opensearch-cluster",
                            },
                            {
                                name: "node.name",
                                value: "opensearch-node",
                            },
                            {
                                name: "discovery.type",
                                value: "single-node",
                            },
                            {
                                name: "OPENSEARCH_JAVA_OPTS",
                                value: "-Xms512m -Xmx512m",
                            },
                            {
                                name: "OPENSEARCH_USERNAME",
                                valueFrom: {
                                    secretKeyRef: {
                                        name: "opensearch-credentials",
                                        key: "username",
                                    },
                                },
                            },
                            {
                                name: "OPENSEARCH_PASSWORD",
                                valueFrom: {
                                    secretKeyRef: {
                                        name: "opensearch-credentials",
                                        key: "password",
                                    },
                                },
                            },
                        ],
                        volumeMounts: [
                            {
                                name: "opensearch-data",
                                mountPath: "/usr/share/opensearch/data",
                            },
                        ],
                    },
                ],
                volumes: [
                    {
                        name: "opensearch-data",
                        emptyDir: {},
                    },
                ],
            },
        },
    },
});

const opensearchService = new k8s.core.v1.Service("opensearch-service", {
    metadata: {
        namespace: opensearchNamespace.metadata.name,
        name: "opensearch",
    },
    spec: {
        selector: {
            app: "opensearch",
        },
        ports: [
            {
                port: 9200,
                targetPort: 9200,
            },
        ],
    },
});

const opensearchDashboardsDeployment = new k8s.apps.v1.Deployment("opensearch-dashboards-deployment", {
    metadata: {
        namespace: opensearchNamespace.metadata.name,
        name: "opensearch-dashboards",
    },
    spec: {
        replicas: 1,
        selector: {
            matchLabels: {
                app: "opensearch-dashboards",
            },
        },
        template: {
            metadata: {
                labels: {
                    app: "opensearch-dashboards",
                },
            },
            spec: {
                containers: [
                    {
                        name: "opensearch-dashboards",
                        image: `opensearchproject/opensearch-dashboards:${config.opensearch.dashboardsImageTag}`,
                        ports: [{ containerPort: 5601 }],
                        env: [
                            {
                                name: "OPENSEARCH_HOSTS",
                                value: "http://opensearch:9200",
                            },
                        ],
                    },
                ],
            },
        },
    },
});

const opensearchDashboardsService = new k8s.core.v1.Service("opensearch-dashboards-service", {
    metadata: {
        namespace: opensearchNamespace.metadata.name,
        name: "opensearch-dashboards",
    },
    spec: {
        selector: {
            app: "opensearch-dashboards",
        },
        ports: [
            {
                port: 5601,
                targetPort: 5601,
            },
        ],
    },
});

const opensearchCredentials = new k8s.core.v1.Secret("opensearch-credentials", {
    metadata: {
        namespace: opensearchNamespace.metadata.name,
        name: "opensearch-credentials",
    },
    stringData: {
        username: config.opensearch.adminUsername,
        password: config.opensearch.adminPassword,
    },
});

export const opensearchEndpoint = opensearchService.status.loadBalancer.ingress[0].hostname;
export const opensearchDashboardsEndpoint = opensearchDashboardsService.status.loadBalancer.ingress[0].hostname;
