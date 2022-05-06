import * as gcp from "@pulumi/gcp";
import * as k8s from "@pulumi/kubernetes";
import * as random from "@pulumi/random";
import * as pulumi from "@pulumi/pulumi";
import { config } from "./config";

const sysname = config.baseName

// Builds the following base resources used for the self-hosted deployment:
// - Network
// - Google Storage Buckets for state and policy
// - Cloud SQL DB
// - GKE cluster to run the service

// Network
const network = new gcp.compute.Network(`${sysname}-network`, {
  autoCreateSubnetworks: true,
  routingMode: "REGIONAL",
})

// Buckets
const checkpointsBucket = new gcp.storage.Bucket(`${sysname}-checkpoints`, {
  location: "US", // highly available bucketness
})
const policypacksBucket = new gcp.storage.Bucket(`${sysname}-policypacks`, {
  location: "US", // highly available bucketness
})

// DB Set up
// Generate a strong password.
const password = new random.RandomPassword(`${sysname}-password`, {
  length: 16,
  overrideSpecial: "_",
  special: true,
}, {additionalSecretOutputs: ["result"]}).result;

const dbInstance = new gcp.sql.DatabaseInstance(`${sysname}-db`, {
  databaseVersion: "MYSQL_5_6",
  settings: {
    tier: config.dbInstanceType,
    ipConfiguration: {
      authorizedNetworks: [{ value: "0.0.0.0/0" }],
    },
  },
  deletionProtection: true,
});

// Create a user with the configured credentials for the Rails app to use.
const user = new gcp.sql.User(`${sysname}-dbuser`, {
  instance: dbInstance.name,
  name: config.dbUser,
  password: password,
});
export const dbUser  = user.name
export const dbPassword = user.password

// Create the GKE cluster with autopilot 
const k8sCluster = new gcp.container.Cluster("pulumi-self-hosted", {
  network: network.name,
  enableAutopilot: true,
  location: gcp.config.region,
  ipAllocationPolicy: {}, // need to work around a bug in the underlying TF provider
  minMasterVersion: config.clusterVersion,
});

// Manufacture a GKE-style Kubeconfig. Note that this is slightly "different" because of the way GKE requires
// gcloud to be in the picture for cluster authentication (rather than using the client cert/key directly).
export const kubeconfig = pulumi.secret(pulumi.
    all([ k8sCluster.name, k8sCluster.endpoint, k8sCluster.masterAuth ]).
    apply(([ name, endpoint, auth ]) => {
        const context = `${gcp.config.project}_${gcp.config.zone}_${name}`;
        return `apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: ${auth.clusterCaCertificate}
    server: https://${endpoint}
  name: ${context}
contexts:
- context:
    cluster: ${context}
    user: ${context}
  name: ${context}
current-context: ${context}
kind: Config
preferences: {}
users:
- name: ${context}
  user:
    auth-provider:
      config:
        cmd-args: config config-helper --format=json
        cmd-path: gcloud
        expiry-key: '{.credential.token_expiry}'
        token-key: '{.credential.access_token}'
      name: gcp
`;
    }));

