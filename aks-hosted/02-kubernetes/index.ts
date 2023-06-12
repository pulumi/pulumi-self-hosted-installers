import { secret } from "@pulumi/pulumi";
import { Provider } from "@pulumi/kubernetes";
import { config } from "./config";
import { KubernetesCluster } from "./cluster";
import { NginxIngress } from "./helm-nginx-ingress";

const cluster = new KubernetesCluster(`${config.resourceNamePrefix}`, {
    ADAdminGroupId: config.adGroupId,
    ADApplicationId: config.adApplicationId,
    ADApplicationSecret: config.adApplicationSecret,
    ResourceGroupName: config.resourceGroupName,
    tags: config.baseTags,
});

export const kubeconfig = secret(cluster.Kubeconfig);

const provider = new Provider("k8s-provider", {
    kubeconfig,
    deleteUnreachable: true,
}, { dependsOn: cluster });

const ingress = new NginxIngress("pulumi-selfhosted", {
    provider,
    publicIpAddress: cluster.PublicIp,
}, { dependsOn: cluster });

export const publicIp = cluster.PublicIp;
export const ingressNamespace = ingress.IngressNamespace;
//export const ingressServiceIp = ingress.IngressServiceIp;
export const stackName2 = config.stackName;
