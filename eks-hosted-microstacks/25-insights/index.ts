import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { OpenSearchArgs, OpenSearch } from "../../components-microstacks/openSearch";
import { config } from "./config";

const baseName = config.baseName 

const k8sProvider = new k8s.Provider("k8s-provider", {kubeconfig: config.kubeconfig});

// Deploy opensearch cluster on the k8s cluster.
const openSearchNamespace = new k8s.core.v1.Namespace(`${baseName}-opensearch-ns`, {
  metadata: {name: config.namespace},
}, {provider: k8sProvider});

const openSearch = new OpenSearch(`${baseName}-search`, {
  namespace: openSearchNamespace.metadata.name,
  serviceAccount: config.serviceAccount,
  intitialAdminPassword: config.intitialAdminPassword,
}, {provider: k8sProvider});

export const openSearchEndpoint = pulumi.interpolate`https://opensearch-cluster-master.${openSearchNamespace.metadata.name}:9200`
export const openSearchUser = "admin"
export const openSearchPassword = config.intitialAdminPassword
export const openSearchNamespaceName = openSearchNamespace.metadata.name