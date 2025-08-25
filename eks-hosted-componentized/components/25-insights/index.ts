import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

// Note: OpenSearch component is not available - this will need to be implemented separately
// import { OpenSearchArgs, OpenSearch } from "../../components-microstacks/openSearch";

export interface InsightsOutputs {
  openSearchEndpoint: string;
  openSearchUser: string;
  openSearchPassword: pulumi.Output<string>;
  openSearchNamespaceName: pulumi.Output<string>;
}

export interface InsightsArgs {
  // From IAM stack
  eksServiceRoleName: pulumi.Output<string>;
  // From EKS cluster stack
  kubeconfig: pulumi.Output<string>;
}

export class InsightsResources extends pulumi.ComponentResource {
  public readonly openSearchEndpoint: pulumi.Output<string>;
  public readonly openSearchUser: string;
  public readonly openSearchPassword: pulumi.Output<string>;
  public readonly openSearchNamespaceName: pulumi.Output<string>;

  constructor(
    name: string,
    args: InsightsArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("eks-self-hosted:index:Insights", name, {}, opts);

    const config = new pulumi.Config();
    const baseName = config.require("baseName");
    const opensearchPassword = config.requireSecret("opensearchPassword");

    // NOTE: Ultimately, the opensearch cluster will go in a namespace named something like `pulumi-insights`.
    // But for now, it is going into the same namespace that is used for the pulumi service to work around a challenge related to TLS certs.
    // Once the certs code is in place, the namespace will be changed to `pulumi-insights` and the cluster deployed there.
    // Since the opensearch cluster is not stateful/can be reindexed on demand, making this change later will not be a problem.
    const opensearchNameSpace = "pulumi-service";

    // Validate required args
    if (!args.eksServiceRoleName || !args.kubeconfig) {
      throw new Error(
        "Missing required arguments: eksServiceRoleName, kubeconfig"
      );
    }

    const k8sProvider = new k8s.Provider(
      "k8s-provider",
      {
        kubeconfig: args.kubeconfig,
      },
      { parent: this }
    );

    // Deploy opensearch cluster on the k8s cluster.
    const openSearchNamespace = new k8s.core.v1.Namespace(
      `${baseName}-opensearch-ns`,
      {
        metadata: { name: opensearchNameSpace },
      },
      { provider: k8sProvider, parent: this }
    );

    // const openSearch = new OpenSearch(`${baseName}-search`, {
    //   namespace: openSearchNamespace.metadata.name,
    //   serviceAccount: args.eksServiceRoleName,
    //   intitialAdminPassword: opensearchPassword,
    // }, {provider: k8sProvider, parent: this});

    // The endpoint is currently hardcoded as shown.
    // Once opensearch cluster can be deployed in it's own namespace, the endpoint will need to be updated to: pulumi.interpolate`https://opensearch-cluster-master.${openSearchNamespace.metadata.name}:9200`
    this.openSearchEndpoint = pulumi.interpolate`https://opensearch-cluster-master.${openSearchNamespace.metadata.name}:9200`;
    this.openSearchUser = "admin";
    this.openSearchPassword = opensearchPassword;
    this.openSearchNamespaceName = openSearchNamespace.metadata.name;

    this.registerOutputs({
      openSearchEndpoint: this.openSearchEndpoint,
      openSearchUser: this.openSearchUser,
      openSearchPassword: this.openSearchPassword,
      openSearchNamespaceName: this.openSearchNamespaceName,
    });
  }
}
