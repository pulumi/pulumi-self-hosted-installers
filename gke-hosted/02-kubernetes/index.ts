import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as k8s from "@pulumi/kubernetes";
import { config } from "./config";
import { KubernetesCluster } from "./cluster";
import { NginxIngress } from "./helmNginxIngress";

const region = gcp.config.region!;
const cluster = new KubernetesCluster(`${config.resourceNamePrefix}`, {
    region: region,
    networkName: config.networkName,
    clusterVersion: config.clusterVersion,
    tags: config.baseTags,
});

export const kubeconfig = pulumi.secret(cluster.Kubeconfig);

const provider = new k8s.Provider("k8s-provider", {
    kubeconfig,
}, { dependsOn: cluster });

const ingress = new NginxIngress("pulumi-selfhosted", {
    provider,
}, { dependsOn: cluster });

export const ingressNamespace = ingress.IngressNamespace;
export const ingressServiceIp = ingress.IngressServiceIp;
export const stackName2 = config.stackName;
