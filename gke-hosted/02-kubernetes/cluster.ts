import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import { config } from "./config";

interface KubernetesClusterArgs {
  region: pulumi.Input<string>,
  networkName: pulumi.Input<string>,
  clusterVersion: pulumi.Input<string>,
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>,
}

export class KubernetesCluster extends pulumi.ComponentResource {
  public readonly Kubeconfig: pulumi.Output<string>;
  public readonly Name: pulumi.Output<string>;
  constructor(name: string, args: KubernetesClusterArgs, opts?: pulumi.ComponentResourceOptions) {
    super("x:kubernetes:cluster", name, opts);

    // Create the GKE cluster with autopilot 
    const cluster = new gcp.container.Cluster("pulumi-self-hosted", {
      network: args.networkName,
      enableAutopilot: true,
      location: args.region,
      ipAllocationPolicy: {}, // need to work around a bug in the underlying TF provider
      minMasterVersion: config.clusterVersion,
    }, { parent: this, protect: true });

    const kubeconfig = pulumi.
      all([cluster.name, cluster.endpoint, cluster.masterAuth]).
      apply(([name, endpoint, masterAuth]) => {
        const context = `${gcp.config.project}_${gcp.config.zone}_${name}`;
        return `apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: ${masterAuth.clusterCaCertificate}
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
    exec:
      apiVersion: client.authentication.k8s.io/v1beta1
      command: gke-gcloud-auth-plugin
      installHint: Install gke-gcloud-auth-plugin for use with kubectl by following
        https://cloud.google.com/blog/products/containers-kubernetes/kubectl-auth-changes-in-gke
      provideClusterInfo: true`;
      });

    this.Name = cluster.name;
    this.Kubeconfig = kubeconfig;

    this.registerOutputs({
      Name: this.Name,
      Kubeconfig: this.Kubeconfig,
    });
  }
}

