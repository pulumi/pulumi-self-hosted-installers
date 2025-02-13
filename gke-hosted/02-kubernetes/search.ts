import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import {
  Input,
  Output,
  ComponentResource,
  ComponentResourceOptions,
} from "@pulumi/pulumi";

// NOTE: If you need to use a local version of the helm charts instead of the remote repo, do the following:
// - Locally copy the repo: `git clone https://github.com/opensearch-project/helm-charts.git`
// - Comment out the fetchOpts and repo fields in the two helm charts resources below.
// - Uncomment the path field for each helm chart resources and set it to the local path of the opensearch or opensearch-dashboard helm chart accordingly.

export interface OpenSearchArgs {
  namespace: Output<string>;
  serviceAccount: Input<string>;
  intitialAdminPassword: Input<string>;
  sysctlInit?: Input<boolean>;
}

export class OpenSearch extends ComponentResource {
  public namespace: Output<string>;

  constructor(
    name: string,
    args: OpenSearchArgs,
    opts: ComponentResourceOptions,
  ) {
    super("x:kubernetes:opensearch", name, opts);
    const osRepoUrl = "https://opensearch-project.github.io/helm-charts/";
    const osChartName = "opensearch";
    const chartVersion = "2.24.1";
    const oscVersion = "2.14.0";
    opts = { ...opts, parent: this };

    const sysctlInitEnabled: boolean =
      args.sysctlInit !== undefined && args.sysctlInit == true;

    if (!sysctlInitEnabled) {
      const maxMapCountSetterDaemonSet = new k8s.apps.v1.DaemonSet(
        "max_map_count_setterDaemonSet",
        {
          apiVersion: "apps/v1",
          kind: "DaemonSet",
          metadata: {
            name: "max-map-count-setter",
            labels: {
              "k8s-app": "max-map-count-setter",
            },
          },
          spec: {
            selector: {
              matchLabels: {
                name: "max-map-count-setter",
              },
            },
            template: {
              metadata: {
                labels: {
                  name: "max-map-count-setter",
                },
              },
              spec: {
                initContainers: [
                  {
                    name: "max-map-count-setter",
                    image: "docker.io/bash:5.2.21",
                    resources: {
                      limits: {
                        cpu: "100m",
                        memory: "32Mi",
                      },
                    },
                    securityContext: {
                      privileged: true,
                      runAsUser: 0,
                    },
                    command: [
                      "/usr/local/bin/bash",
                      "-e",
                      "-c",
                      "echo 262144 > /proc/sys/vm/max_map_count",
                    ],
                  },
                ],
                containers: [
                  {
                    name: "sleep",
                    image: "docker.io/bash:5.2.21",
                    command: ["sleep", "infinity"],
                  },
                ],
              },
            },
          },
        },
        opts
      );
      opts = pulumi.mergeOptions(opts, {
        dependsOn: [maxMapCountSetterDaemonSet],
      });
    }

    const opensearch = new k8s.helm.v3.Chart(
      "opensearch",
      {
        chart: osChartName,
        version: chartVersion,
        namespace: args.namespace,
        // Comment out the fetchOpts block if using local copy of the helm chart.
        // And uncomment the path field and set it to the local path of the helm chart if using a local copy of the helm chart.
        fetchOpts: {
          repo: osRepoUrl,
        },
        // path: "/path/to/local/helm-charts/charts",
        values: {
          roles: ["master", "ingest", "data", "remote_cluster_client"],
          replicas: 3,
          imageTag: oscVersion,
          image: {
            tag: oscVersion,
          },
          opensearchJavaOpts: "-Xmx1024M -Xms1024M",
          persistence: {
            enabled: false,
          },
          resources: {
            requests: {
              memory: "2Gi",
              cpu: "1000m",
            },
            limits: {
              memory: "2Gi",
              cpu: "1000m",
            },
          },
          sysctlInit: {
            enabled: sysctlInitEnabled,
          },
          extraEnvs: [
            {
              name: "OPENSEARCH_INITIAL_ADMIN_PASSWORD",
              value: args.intitialAdminPassword,
            },
          ],
          rbac: {
            serviceAccountName: args.serviceAccount,
            automountServiceAccountToken: true,
          },
          serviceAccountName: args.serviceAccount,
        },
      },
      opts,
    );

    this.namespace = pulumi.output(args.namespace);

    this.registerOutputs({
      namespace: this.namespace,
    });
  }
}
