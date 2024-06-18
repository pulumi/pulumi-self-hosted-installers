// import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as kx from "@pulumi/kubernetesx";
import { config } from "./config";

const opensearchNamespace = new k8s.core.v1.Namespace("opensearch-namespace", {
    metadata: { name: "opensearch" },
});

const opensearchLabels = { app: "opensearch" };

const opensearchDeployment = new kx.Deployment("opensearch-deployment", {
    metadata: {
        namespace: opensearchNamespace.metadata.name,
        labels: opensearchLabels,
    },
    spec: {
        replicas: config.opensearch.instanceCount,
        selector: { matchLabels: opensearchLabels },
        template: {
            metadata: { labels: opensearchLabels },
            spec: {
                containers: [
                    {
                        name: "opensearch",
                        image: `opensearchproject/opensearch:${config.opensearch.imageTag}`,
                        ports: { containerPort: 9200 },
                        env: [
                            { name: "cluster.name", value: "opensearch-cluster" },
                            { name: "node.name", value: "opensearch-node" },
                            { name: "discovery.seed_hosts", value: "opensearch" },
                            { name: "cluster.initial_master_nodes", value: "opensearch" },
                            { name: "OPENSEARCH_JAVA_OPTS", value: "-Xms512m -Xmx512m" },
                            { name: "OPENSEARCH_USERNAME", value: config.opensearch.adminUsername },
                            { name: "OPENSEARCH_PASSWORD", value: config.opensearch.adminPassword },
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
        labels: opensearchLabels,
    },
    spec: {
        type: "ClusterIP",
        ports: [{ port: 9200, targetPort: 9200 }],
        selector: opensearchLabels,
    },
});

const opensearchDashboardsDeployment = new kx.Deployment("opensearch-dashboards-deployment", {
    metadata: {
        namespace: opensearchNamespace.metadata.name,
        labels: { app: "opensearch-dashboards" },
    },
    spec: {
        replicas: 1,
        selector: { matchLabels: { app: "opensearch-dashboards" } },
        template: {
            metadata: { labels: { app: "opensearch-dashboards" } },
            spec: {
                containers: [
                    {
                        name: "opensearch-dashboards",
                        image: `opensearchproject/opensearch-dashboards:${config.opensearch.imageTag}`,
                        ports: { containerPort: 5601 },
                        env: [
                            { name: "OPENSEARCH_HOSTS", value: "http://opensearch:9200" },
                            { name: "OPENSEARCH_USERNAME", value: config.opensearch.adminUsername },
                            { name: "OPENSEARCH_PASSWORD", value: config.opensearch.adminPassword },
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
        labels: { app: "opensearch-dashboards" },
    },
    spec: {
        type: "ClusterIP",
        ports: [{ port: 5601, targetPort: 5601 }],
        selector: { app: "opensearch-dashboards" },
    },
});

export const opensearchEndpoint = opensearchService.spec.clusterIP;
export const opensearchDashboardsEndpoint = opensearchDashboardsService.spec.clusterIP;
