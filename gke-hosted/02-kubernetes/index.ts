import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as k8s from "@pulumi/kubernetes";
import * as random from "@pulumi/random";
import { config } from "./config";
import { KubernetesCluster } from "./cluster";
import { NginxIngress } from "./helmNginxIngress";
import { OpenSearch } from "./search";
import { CertManager, GCPDNSClusterIssuer, OpenSearchCertificates } from "../../components-microstacks";

const region = gcp.config.region!;
const cluster = new KubernetesCluster(`${config.resourceNamePrefix}`, {
  region: region,
  networkName: config.networkName,
  clusterVersion: config.clusterVersion,
  tags: config.baseTags,
});

const commonName = config.commonName;

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

// Install cert-manager for TLS certificate management
const certManager = new CertManager("cert-manager", {
    provider,
    certManagerNamespace: "cert-manager",
    issuerEmail: config.certManagerEmail,
}, { dependsOn: cluster });

// Create GCP DNS ClusterIssuer for automatic certificate provisioning
const gcpDNSIssuer = new GCPDNSClusterIssuer("gcp-dns-issuer", {
    provider,
    issuerEmail: config.certManagerEmail,
    project: config.gcpProject,
    serviceAccountSecretName: config.gcpServiceAccountSecretName,
}, { dependsOn: [certManager] });

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

// Create separate namespace for OpenSearch with TLS support
const openSearchNs = new k8s.core.v1.Namespace(
  "opensearch-ns",
  {
    metadata: {
      name: config.openSearchNamespace,
      labels: {
        name: config.openSearchNamespace
      }
    }
  },
  { provider },
);



/* Since we've set up the cluster in AutoPilot mode, we can't use container sysctl
 * which is required for the OpenSearch helm chart.
 * Therefore, we're creating a namespace and applying a difference security policy so that we can do this.
 * See: https://cloud.google.com/kubernetes-engine/docs/concepts/autopilot-security
 */
// Create TLS certificates for OpenSearch cross-namespace communication
const openSearchCertificates = new OpenSearchCertificates("opensearch-certs", {
  provider,
  namespace: openSearchNs.metadata.name,
  issuerName: gcpDNSIssuer.issuerName,
  certificateSecretName: "opensearch-certificates",
  adminCertificateSecretName: "opensearch-admin-certificates",
}, { dependsOn: [openSearchNs, gcpDNSIssuer] });

const search = new OpenSearch(
  "pulumi-selfhosted",
  {
    namespace: openSearchNs.metadata.name,
    serviceAccount: config.serviceAccountName,
    initialAdminPassword: initialAdminPassword.result,
    sysctlInit: false,
    enableTLS: config.enableOpenSearchTLS,
    certificateSecretName: openSearchCertificates.certificateSecretName,
    crossNamespaceAccess: true,
    allowedNamespaces: [appsNamespace.metadata.name],
  },
  {
    provider,
    dependsOn: [cluster, openSearchCertificates],
  },
);

export const ingressNamespace = ingress.IngressNamespace;
export const ingressServiceIp = ingress.IngressServiceIp;
export const stackName2 = config.stackName;
export const openSearchPassword = initialAdminPassword.result;
export const appNamespace = appsNamespace.metadata.name;
export const openSearchUsername = "admin";
export const openSearchEndpoint = config.enableOpenSearchTLS ?
  search.secureEndpoint :
  search.endpoint;
export const openSearchNamespace = openSearchNs.metadata.name;
export const certManagerNamespace = certManager.namespace;
export const gcpDNSIssuerName = gcpDNSIssuer.issuerName;
