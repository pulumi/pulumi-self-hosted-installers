import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";

export interface OpenSearchComponentArgs {
    namespace: kubernetes.core.v1.Namespace;
    storageClassName: string;
    storageSizeGB: number;
    accessModes: string[];
}

export class OpenSearchComponent extends pulumi.ComponentResource {
    constructor(name: string, args: OpenSearchComponentArgs, opts?: pulumi.ComponentResourceOptions) {
        super("x:kubernetes:search", name, args, opts);

        const serviceName = "opensearch";
        const headlessServiceName = "opensearch-headless";
        const dashboardServiceName = "opensearch-dashboards";
        const imageTag = "2.5.0";
        const searchImage = `opensearchproject/opensearch:${imageTag}`;
        const dashboardImage = `opensearchproject/opensearch-dashboards:${imageTag}`;
        const mountPath = "/usr/share/opensearch/data";

        new kubernetes.apps.v1.StatefulSet(
            "search",
            {
                metadata: {
                    namespace: args.namespace.metadata.name,
                },
                spec: {
                    serviceName: serviceName,
                    selector: {
                        matchLabels: {
                            app: serviceName,
                        },
                    },
                    replicas: 1,
                    template: {
                        metadata: {
                            labels: {
                                app: serviceName,
                            },
                        },
                        spec: {
                            terminationGracePeriodSeconds: 10,
                            containers: [
                                {
                                    image: searchImage,
                                    name: "search",
                                    env: [
                                        {
                                            name: "cluster.name",
                                            value: "opensearch-cluster",
                                        },
                                        {
                                            name: "node.name",
                                            valueFrom: {
                                                fieldRef: {
                                                    fieldPath: "metadata.name",
                                                },
                                            },
                                        },
                                        {
                                            name: "discovery.seed_hosts",
                                            value: headlessServiceName,
                                        },
                                        {
                                            name: "bootstrap.memory_lock",
                                            value: "true",
                                        },
                                        {
                                            name: "OPENSEARCH_JAVA_OPTS",
                                            value: "-Xms512m -Xmx512m",
                                        },
                                        {
                                            name: "discovery.type",
                                            value: "single-node",
                                        },
                                        {
                                            name: "plugins.security.ssl.http.enabled",
                                            value: "false",
                                        },
                                        {
                                            name: "plugins.security.ssl.transport.enforce_hostname_verification",
                                            value: "false",
                                        },
                                    ],
                                    ports: [
                                        {
                                            containerPort: 9200,
                                            name: "http-port",
                                        },
                                        {
                                            containerPort: 9300,
                                            name: "transport-port",
                                        },
                                        {
                                            containerPort: 9600,
                                            name: "metrics-port",
                                        },
                                    ],
                                    volumeMounts: [
                                        {
                                            name: "search-persistent-storage",
                                            mountPath: mountPath,
                                        },
                                    ],
                                },
                            ],
                            initContainers: [
                                {
                                    name: "fsgroup-volume",
                                    image: "busybox:latest",
                                    command: ["sh", "-c"],
                                    args: [`chown -R 1000:1000 ${mountPath}`],
                                    securityContext: {
                                        runAsUser: 0,
                                    },
                                    volumeMounts: [
                                        {
                                            name: "search-persistent-storage",
                                            mountPath: mountPath,
                                        },
                                    ],
                                },
                            ],
                        },
                    },
                    volumeClaimTemplates: [
                        {
                            metadata: {
                                name: "search-persistent-storage",
                            },
                            spec: {
                                accessModes: args.accessModes,
                                storageClassName: args.storageClassName,
                                resources: {
                                    requests: {
                                        storage: `${args.storageSizeGB}Gi`,
                                    },
                                },
                            },
                        },
                    ],
                },
            },
            { parent: this, deletedWith: args.namespace },
        );

        new kubernetes.core.v1.Service(
            "search",
            {
                metadata: {
                    name: serviceName,
                    namespace: args.namespace.metadata.name,
                },
                spec: {
                    type: "ClusterIP",
                    ports: [
                        {
                            name: "http",
                            port: 9200,
                            targetPort: "http-port",
                        },
                        {
                            name: "transport",
                            port: 9300,
                            targetPort: "transport-port",
                        },
                        {
                            name: "metrics",
                            port: 9600,
                            targetPort: "metrics-port",
                        },
                    ],
                    selector: {
                        app: serviceName,
                    },
                },
            },
            { parent: this, deletedWith: args.namespace },
        );

        new kubernetes.core.v1.Service(
            "search-headless",
            {
                metadata: {
                    name: headlessServiceName,
                    annotations: {
                        "service.alpha.kubernetes.io/tolerate-unready-endpoints": "true",
                    },
                    namespace: args.namespace.metadata.name,
                },
                spec: {
                    clusterIP: "None",
                    publishNotReadyAddresses: true,
                    ports: [
                        {
                            name: "http",
                            port: 9200,
                            targetPort: "http-port",
                        },
                        {
                            name: "transport",
                            port: 9300,
                            targetPort: "transport-port",
                        },
                        {
                            name: "metrics",
                            port: 9600,
                            targetPort: "metrics-port",
                        },
                    ],
                    selector: {
                        app: serviceName,
                    },
                },
            },
            { parent: this, deletedWith: args.namespace },
        );

        new kubernetes.apps.v1.Deployment(
            "search-dashboards",
            {
                metadata: {
                    namespace: args.namespace.metadata.name,
                },
                spec: {
                    replicas: 1,
                    selector: {
                        matchLabels: {
                            app: dashboardServiceName,
                        },
                    },
                    template: {
                        metadata: {
                            labels: {
                                app: dashboardServiceName,
                            },
                        },
                        spec: {
                            containers: [
                                {
                                    name: "opensearch-dashboards",
                                    image: dashboardImage,
                                    imagePullPolicy: "IfNotPresent",
                                    ports: [
                                        {
                                            name: "dashboard-port",
                                            containerPort: 5601,
                                        },
                                    ],
                                    env: [
                                        {
                                            name: "OPENSEARCH_HOSTS",
                                            value: `http://${serviceName}:9200`,
                                        },
                                    ],
                                },
                            ],
                        },
                    },
                },
            },
            { parent: this, deletedWith: args.namespace },
        );

        new kubernetes.core.v1.Service(
            "search-dashboards",
            {
                metadata: {
                    name: dashboardServiceName,
                    namespace: args.namespace.metadata.name,
                },
                spec: {
                    type: "ClusterIP",
                    ports: [
                        {
                            name: "dashboard",
                            port: 5601,
                            targetPort: "dashboard-port",
                        },
                    ],
                    selector: {
                        app: dashboardServiceName,
                    },
                },
            },
            { parent: this, deletedWith: args.namespace },
        );

        this.registerOutputs();
    }
}
