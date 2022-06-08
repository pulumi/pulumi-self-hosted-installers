import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as tls from "@pulumi/tls";
import { config } from "./config";
import { ComponentResourceOptions, Output } from "@pulumi/pulumi";

interface KubernetesClusterArgs {
  region: pulumi.Input<string>,
  networkName: pulumi.Input<string>,
  clusterVersion: pulumi.Input<string>,
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>,
}

export class KubernetesCluster extends pulumi.ComponentResource {
  public readonly Kubeconfig: Output<string>;
  public readonly Name: Output<string>;
  constructor(name: string, args: KubernetesClusterArgs, opts?: ComponentResourceOptions) {
    super("x:kubernetes:cluster", name, opts);

    // Create the GKE cluster with autopilot 
    const cluster = new gcp.container.Cluster("pulumi-self-hosted", {
      network: args.networkName,
      enableAutopilot: true,
      location: args.region,
      ipAllocationPolicy: {}, // need to work around a bug in the underlying TF provider
      minMasterVersion: config.clusterVersion,
    }, {parent: this, protect: true});

    // Manufacture a GKE-style Kubeconfig. Note that this is slightly "different" because of the way GKE requires
    // gcloud to be in the picture for cluster authentication (rather than using the client cert/key directly).
    const kubeconfig = pulumi.secret(pulumi.
        all([ cluster.name, cluster.endpoint, cluster.masterAuth ]).
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

    this.Name = cluster.name;
    this.Kubeconfig = kubeconfig;

    this.registerOutputs({
      Name: this.Name,
      Kubeconfig: this.Kubeconfig,
    });
  }
}
