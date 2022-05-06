import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as k8s from "@pulumi/kubernetes";

import { config } from "./config";
const sysname = config.baseName

// Instantiante k8s provider for the cluster
const k8sProvider = new k8s.Provider(`${sysname}-k8sProvider`, {kubeconfig: config.kubeconfig});

// // Namespace for Pulumi Service
// const appsNamespace = new k8s.core.v1.Namespace("apps", undefined, { provider: k8sProvider });
// export const appsNamespaceName = appsNamespace.metadata.name;

// // Create a resource quota in the apps namespace.
// //
// // Given 2 replicas each for HA:
// // API:     4096m cpu, 2048Mi ram
// // Console: 2048m cpu, 1024Mi ram
// //
// // 2x the HA requirements to create capacity for rolling updates of replicas:
// // API:     8192m cpu, 4096Mi ram
// // Console: 4096m cpu, 2048Mi ram
// //
// // Totals:  12288m cpu, 6144Mi ram
// const quotaAppsNamespace = new k8s.core.v1.ResourceQuota("apps", {
//     metadata: {namespace: appsNamespaceName},
//     spec: {
//         hard: {
//             cpu: "12288",
//             memory: "6144Mi",
//             pods: "20",
//             resourcequotas: "1",
//             services: "5",
//         },
//     }
// },{
//     provider: k8sProvider
// });

// // Deploy Pulumi service api 

