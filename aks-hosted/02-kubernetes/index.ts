import { secret, output, Output } from "@pulumi/pulumi";
import { Provider } from "@pulumi/kubernetes";
import { config } from "./config";
import { KubernetesCluster } from "./cluster";
import { NginxIngress } from "./helm-nginx-ingress";
import { CertManager } from "./cert-manager";
import { Identity } from "./identity";

const certManagerNamespaceName = "pulumi-selfhosted-certmanager";
const cluster = new KubernetesCluster(config.resourceNamePrefix, {
    aDAdminGroupId: config.adGroupId,
    aDApplicationId: config.adApplicationId,
    aDApplicationSecret: config.adApplicationSecret,
    resourceGroupName: config.resourceGroupName,
    tags: config.baseTags,
    disableAzureDnsCertManagement: config.disableAzureDnsCertManagement,
    privateIpAddress: config.privateIpAddress,
});

export const kubeconfig = secret(cluster.Kubeconfig);
const provider = new Provider("k8s-provider", {
    kubeconfig,
    deleteUnreachable: true,
}, { dependsOn: cluster });

const ingress = new NginxIngress(config.resourceNamePrefix, {
    provider,
    ipAddress: cluster.ClusterIp,
    enablePrivateLoadBalancer: config.enablePrivateLoadBalancer,
}, { dependsOn: cluster });

let clientId: Output<string> | undefined;
let certManagerNs: Output<string> | undefined;

// by enabling azure dns cert manager we will enable oidc and workload identity
// this props will allow use to deploy cert-manager using azure managed identity
// ultimately, the cert-manager pods will be able to use this ID to securely work with
// azure DNS resources to ensure our certs are automatically verified.
if (!config.disableAzureDnsCertManagement) {
    const certManager = new CertManager("pulumi-selfhosted", {
        provider,
        certManagerNamespaceName,
    }, { dependsOn: cluster });

    certManagerNs = certManager.CertManagerNamespace;

    const identity = new Identity("pulumi-selfhosted", {
        azureDnsZone: output(config.azureDnsZoneName!),
        azureDnsZoneResourceGroup: output(config.azureDnsZoneResourceGroup!),
        certManagerName: certManager.CertManagerName,
        certManagerNamespaceName: certManager.CertManagerNamespace,
        clusterOidcIssuerUrl: cluster.OidcClusterIssuerUrl,
        nodeResourceGroupName: config.resourceGroupName,
        tags: config.baseTags,
    });

    clientId = identity.ClientId;
}

export const ingressIp = cluster.ClusterIp;
export const ingressNamespace = ingress.IngressNamespace;
export const stackName2 = config.stackName;

// this will enable cert-manager deployments using letsencrypt in the 03 project
export const disableAzureDnsCertManagement = config.disableAzureDnsCertManagement;
export const certManagerNamespace = certManagerNs;
export const azureDnsZone = config.azureDnsZoneName;
export const azureDnsZoneResourceGroup = config.azureDnsZoneResourceGroup;
export const managedClientId = clientId;