import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as k8s from "@pulumi/kubernetes";
import * as random from "@pulumi/random";
import { config } from "./config";
import { KubernetesCluster } from "./cluster";
import { NginxIngress } from "./helmNginxIngress";
import { OpenSearch } from "./search";

const region = gcp.config.region!;
const cluster = new KubernetesCluster(`${config.resourceNamePrefix}`, {
  region: region,
  networkName: config.networkName,
  clusterVersion: config.clusterVersion,
  tags: config.baseTags,
});

const commonName = "pulumi-selfhosted";

export const kubeconfig = pulumi.secret(cluster.Kubeconfig);

const provider = new k8s.Provider(
  "k8s-provider",
  {
    kubeconfig,
  },
  { dependsOn: cluster },
);

const ingress = new NginxIngress(
  "pulumi-selfhosted",
  {
    provider,
  },
  { dependsOn: cluster },
);

const initialAdminPassword = new random.RandomPassword(
  "initialSearchAdminPassword",
  {
    length: 20,
  },
);

const appsNamespace = new k8s.core.v1.Namespace(
  `${commonName}-apps`,
  {
    metadata: {
      name: `${commonName}-apps`,
    },
  },
  { provider },
);

/* We're going to put the opensearch containers in the same namespace as the pulumi service 
*  to work around issues with TLS
*/

// const openSearchNs = new k8s.core.v1.Namespace(
//   "opensearchns",
//   {},
//   { provider },
// );



/* Since we've set up the cluster in AutoPilot mode, we can't use container sysctl
 * which is required for the OpenSearch helm chart.
 * Therefore, we're creating a namespace and applying a difference security policy so that we can do this.
 * See: https://cloud.google.com/kubernetes-engine/docs/concepts/autopilot-security
 */
const search = new OpenSearch(
  "pulumi-selfhosted",
  {
    namespace: appsNamespace.metadata.name,
    serviceAccount: config.serviceAccountName,
    intitialAdminPassword: initialAdminPassword.result,
    sysctlInit: false,
  },
  {
    provider,
    dependsOn: [cluster],
  },
);

export const ingressNamespace = ingress.IngressNamespace;
export const ingressServiceIp = ingress.IngressServiceIp;
export const stackName2 = config.stackName;
export const openSearchPassword = initialAdminPassword.result;
export const appNamespace = appsNamespace.metadata.name;
export const openSearchUsername = "admin";
export const openSearchEndpoint = pulumi.interpolate`https://opensearch-cluster-master:9200`;
