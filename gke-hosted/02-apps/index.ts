import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as k8s from "@pulumi/kubernetes";

import { config } from "./config";
const sysname = config.baseName

// Instantiante k8s provider for the cluster
const k8sProvider = new k8s.Provider(`${sysname}-k8sProvider`, {kubeconfig: config.kubeconfig});


//
// REDIS LEADER.
//

const apiName = `${sysname}-api`
const apiLabels = { app: apiName };
const apiDeployment = new k8s.apps.v1.Deployment(apiName, {
    spec: {
        selector: { matchLabels: apiLabels },
        template: {
            metadata: { labels: apiLabels },
            spec: {
                containers: [
                    {
                        name: apiName,
                        image: "redis",
                        resources: { requests: { cpu: "100m", memory: "100Mi" } },
                        ports: [{ containerPort: 6379 }],
                    },
                ],
            },
        },
    },
}, {provider: k8sProvider});
const redisLeaderService = new k8s.core.v1.Service("redis-leader", {
    metadata: {
        name: "redis-leader",
        labels: redisLeaderDeployment.metadata.labels,
    },
    spec: {
        ports: [{ port: 6379, targetPort: 6379 }],
        selector: redisLeaderDeployment.spec.template.metadata.labels,
    },
}, {provider: k8sProvider});

//
// REDIS REPLICA.
//

const redisReplicaLabels = { app: "redis-replica" };
const redisReplicaDeployment = new k8s.apps.v1.Deployment("redis-replica", {
    spec: {
        selector: { matchLabels: redisReplicaLabels },
        template: {
            metadata: { labels: redisReplicaLabels },
            spec: {
                containers: [
                    {
                        name: "replica",
                        image: "pulumi/guestbook-redis-replica",
                        resources: { requests: { cpu: "100m", memory: "100Mi" } },
                        // If your cluster config does not include a dns service, then to instead access an environment
                        // variable to find the leader's host, change `value: "dns"` to read `value: "env"`.
                        env: [{ name: "GET_HOSTS_FROM", value: "dns" }],
                        ports: [{ containerPort: 6379 }],
                    },
                ],
            },
        },
    },
}, {provider: k8sProvider});
const redisReplicaService = new k8s.core.v1.Service("redis-replica", {
    metadata: {
        name: "redis-replica",
        labels: redisReplicaDeployment.metadata.labels
    },
    spec: {
        ports: [{ port: 6379, targetPort: 6379 }],
        selector: redisReplicaDeployment.spec.template.metadata.labels,
    },
}, {provider: k8sProvider});

//
// FRONTEND
//

const frontendLabels = { app: "frontend" };
const frontendDeployment = new k8s.apps.v1.Deployment("frontend", {
    spec: {
        selector: { matchLabels: frontendLabels },
        replicas: 3,
        template: {
            metadata: { labels: frontendLabels },
            spec: {
                containers: [
                    {
                        name: "frontend",
                        image: "pulumi/guestbook-php-redis",
                        resources: { requests: { cpu: "100m", memory: "100Mi" } },
                        // If your cluster config does not include a dns service, then to instead access an environment
                        // variable to find the master service's host, change `value: "dns"` to read `value: "env"`.
                        env: [{ name: "GET_HOSTS_FROM", value: "dns" /* value: "env"*/ }],
                        ports: [{ containerPort: 80 }],
                    },
                ],
            },
        },
    },
}, {provider: k8sProvider});
const frontendService = new k8s.core.v1.Service("frontend", {
    metadata: {
        labels: frontendDeployment.metadata.labels,
        name: "frontend",
    },
    spec: {
        type: "LoadBalancer",
        ports: [{ port: 80 }],
        selector: frontendDeployment.spec.template.metadata.labels,
    },
}, {provider: k8sProvider});

// Export the frontend IP.
export let frontendIp: pulumi.Output<string>;
frontendIp = frontendService.status.loadBalancer.ingress[0].ip;

