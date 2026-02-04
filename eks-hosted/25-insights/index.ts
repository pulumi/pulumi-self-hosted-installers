import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { OpenSearchArgs, OpenSearch, OpenSearchCertificates } from "../../components-microstacks";
import { config } from "./config";

const baseName = config.baseName 

const k8sProvider = new k8s.Provider("k8s-provider", {kubeconfig: config.kubeconfig});

// Deploy opensearch cluster on the k8s cluster.
const openSearchNamespace = new k8s.core.v1.Namespace(`${baseName}-opensearch-ns`, {
  metadata: {name: config.namespace},
}, {provider: k8sProvider});

// Create TLS certificates for OpenSearch cross-namespace communication
const openSearchCertificates = new OpenSearchCertificates(`${baseName}-search-certs`, {
  provider: k8sProvider,
  namespace: openSearchNamespace.metadata.name,
  issuerName: config.certManagerIssuerName,
  certificateSecretName: "opensearch-certificates",
  adminCertificateSecretName: "opensearch-admin-certificates",
}, { dependsOn: [openSearchNamespace] });

const openSearch = new OpenSearch(`${baseName}-search`, {
  namespace: openSearchNamespace.metadata.name,
  serviceAccount: config.serviceAccount,
  initialAdminPassword: config.initialAdminPassword,
  enableTLS: config.enableOpenSearchTLS,
  certificateSecretName: openSearchCertificates.certificateSecretName,
  crossNamespaceAccess: true,
  allowedNamespaces: [config.pulumiServiceNamespace],
}, {provider: k8sProvider, dependsOn: [openSearchCertificates] });

// OpenSearch endpoint with proper cross-namespace DNS and TLS support
export const openSearchEndpoint = config.enableOpenSearchTLS ?
  openSearch.secureEndpoint :
  openSearch.endpoint
export const openSearchUser = "admin"
export const openSearchPassword = config.initialAdminPassword
export const openSearchNamespaceName = openSearchNamespace.metadata.name
export const openSearchCertificatesSecretName = openSearchCertificates.certificateSecretName