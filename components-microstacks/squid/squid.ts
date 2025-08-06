import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { Input, Output, ComponentResource, ComponentResourceOptions } from "@pulumi/pulumi";
import { CustomResource } from "@pulumi/kubernetes/apiextensions"
import * as fs from 'fs';

export interface SquidArgs {
    namespace: Output<string> | string,
    serviceAccount?: Input<string>,
    storageClassName: Input<string>,
    storageSize: Input<string>,
};

export class Squid extends ComponentResource {
    public namespace: Output<string> | string;
    public squidService: k8s.core.v1.Service;

    constructor(name: string, args: SquidArgs, opts?: ComponentResourceOptions) {
        super("x:kubernetes:squid", name, opts);
        const conf = fs.readFileSync('./squid.conf', 'utf-8');
        this.namespace = args.namespace

        const squidConfig = new k8s.core.v1.ConfigMap("squid-config", {
            data: {
                squid: conf,
            },
            metadata: {
                name: "squid-config",
                namespace: args.namespace,
            },
        }, {
            parent: this,
        });

        const squidVolumeClaim = new k8s.core.v1.PersistentVolumeClaim("squid-volume-claim", {
            metadata: {
                name: "squid-volume-claim",
                namespace: args.namespace,
            },
            spec: {
                accessModes: ["ReadWriteOnce"],
                resources: {
                    requests: {
                        storage: args.storageSize,
                    },
                },
                storageClassName: args.storageClassName,
            },
        }, {
            parent: this,
        });

        this.squidService = new k8s.core.v1.Service("squid-service", {
            metadata: {
                annotations: {},
                labels: {
                    app: "squid",
                },
                name: "squid-service",
                namespace: args.namespace,
            },
            spec: {
                internalTrafficPolicy: "Cluster",
                ipFamilies: ["IPv4"],
                ipFamilyPolicy: "SingleStack",
                ports: [{
                    port: 3128,
                    protocol: "TCP",
                    targetPort: 3128,
                }],
                selector: {
                    app: "squid",
                },
                sessionAffinity: "None",
                type: k8s.core.v1.ServiceSpecType.NodePort,
            },
        }, {
            parent: this,
        });

        const squidDeployment = new k8s.apps.v1.Deployment("squid-deployment", {
            metadata: {
                annotations: {},
                name: "squid-deployment",
                namespace: args.namespace,
            },
            spec: {
                progressDeadlineSeconds: 600,
                replicas: 1,
                revisionHistoryLimit: 10,
                selector: {
                    matchLabels: {
                        app: "squid",
                    },
                },
                strategy: {
                    rollingUpdate: {
                        maxSurge: "25%",
                        maxUnavailable: "25%",
                    },
                    type: "RollingUpdate",
                },
                template: {
                    metadata: {
                        labels: {
                            app: "squid",
                        },
                    },
                    spec: {
                        initContainers: [
                            {
                                name: "init-folders",
                                image: "ubuntu/squid:edge",
                                command: [
                                    "sh",
                                    "-c",
                                    "chown -R proxy:proxy /var/cache/squid && chmod 0755 /var/cache/squid"
                                ],
                                volumeMounts: [
                                    {
                                        mountPath: "/var/cache/squid",
                                        name: "squid-data",
                                    },
                                ]
                            }
                        ],
                        containers: [{
                            image: "ubuntu/squid:edge",
                            imagePullPolicy: "IfNotPresent",
                            name: "squid",
                            ports: [{
                                containerPort: 3128,
                                name: "squid",
                                protocol: "TCP",
                            }],
                            resources: {},
                            terminationMessagePath: "/dev/termination-log",
                            terminationMessagePolicy: "File",
                            volumeMounts: [
                                {
                                    mountPath: "/etc/squid/squid.conf",
                                    name: "squid-config-volume",
                                    subPath: "squid.conf",
                                },
                                {
                                    mountPath: "/var/cache/squid",
                                    name: "squid-data",
                                },
                            ],
                        }],
                        dnsPolicy: "ClusterFirst",
                        restartPolicy: "Always",
                        schedulerName: "default-scheduler",
                        securityContext: {},
                        terminationGracePeriodSeconds: 30,
                        volumes: [
                            {
                                configMap: {
                                    defaultMode: 420,
                                    items: [{
                                        key: "squid",
                                        path: "squid.conf",
                                    }],
                                    name: squidConfig.metadata.name,
                                },
                                name: "squid-config-volume",
                            },
                            {
                                name: "squid-data",
                                persistentVolumeClaim: {
                                    claimName: squidVolumeClaim.metadata.name,
                                },
                            },
                        ],
                    },
                },
            },
        }, {
            parent: this,
        });
    }
}