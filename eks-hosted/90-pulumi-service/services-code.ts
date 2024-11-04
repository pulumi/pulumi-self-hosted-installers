////////////
// Create Kubernetes namespaces needed later.
const clusterSvcsNamespace = new k8s.core.v1.Namespace("cluster-svcs", undefined, { provider: cluster.provider, protect: true });
export const clusterSvcsNamespaceName = clusterSvcsNamespace.metadata.name;

const appsNamespace = new k8s.core.v1.Namespace("apps", undefined, { provider: cluster.provider, protect: true });
export const appsNamespaceName = appsNamespace.metadata.name;

// Create a resource quota in the apps namespace.
//
// Given 2 replicas each for HA:
// API:     4096m cpu, 2048Mi ram
// Console: 2048m cpu, 1024Mi ram
//
// 2x the HA requirements to create capacity for rolling updates of replicas:
// API:     8192m cpu, 4096Mi ram
// Console: 4096m cpu, 2048Mi ram
//
// Totals:  12288m cpu, 6144Mi ram
const quotaAppsNamespace = new k8s.core.v1.ResourceQuota("apps", {
    metadata: {namespace: appsNamespaceName},
    spec: {
        hard: {
            cpu: "12288",
            memory: "6144Mi",
            pods: "20",
            resourcequotas: "1",
            services: "5",
        },
    }
},{
    provider: cluster.provider
});
