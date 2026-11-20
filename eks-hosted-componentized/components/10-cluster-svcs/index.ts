import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import {
  createAlbSecurityGroup,
  createAlbIngressController,
} from "./ingress-controller";

export interface ClusterServicesOutputs {
  albSecurityGroupId: pulumi.Output<string>;
}

export interface ClusterServicesArgs {
  // From networking stack
  vpcId: pulumi.Output<string>;
  // From eks cluster stack
  clusterName: pulumi.Output<string>;
  kubeconfig: pulumi.Output<string>;
  nodeSecurityGroupId: pulumi.Output<string>;
}

export class ClusterSVCSResources extends pulumi.ComponentResource {
  public readonly albSecurityGroupId: pulumi.Output<string>;

  constructor(
    name: string,
    args: ClusterServicesArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("eks-self-hosted:index:ClusterServices", name, {}, opts);

    const config = new pulumi.Config();
    const baseName = config.require("baseName");

    // Validate required args
    if (
      !args.vpcId ||
      !args.clusterName ||
      !args.kubeconfig ||
      !args.nodeSecurityGroupId
    ) {
      throw new Error(
        "Missing required arguments: vpcId, clusterName, kubeconfig, nodeSecurityGroupId"
      );
    }

    // instantiate k8s provider for subsequent resources
    const k8sprovider = new k8s.Provider(
      "provider",
      {
        kubeconfig: args.kubeconfig,
        deleteUnreachable: true,
      },
      { parent: this }
    );

    ////////////
    // Enable necessary EKS addons
    // Note that "vpc-cni" is automatically installed by EKS and is not required to be installed.
    new aws.eks.Addon(
      "coreDns",
      {
        addonName: "coredns",
        clusterName: args.clusterName,
        addonVersion: "v1.11.4-eksbuild.2",
      },
      { parent: this }
    );

    //////////
    // ALB Ingress Controller and related resources

    // Create the ALB security group.
    const albSecurityGroup = createAlbSecurityGroup(
      baseName,
      {
        vpcId: args.vpcId,
        nodeSecurityGroupId: pulumi.output(args.nodeSecurityGroupId),
        clusterName: pulumi.output(args.clusterName),
      },
      this
    );

    createAlbIngressController(
      baseName,
      {
        k8sprovider: k8sprovider,
        vpcId: args.vpcId,
        clusterName: pulumi.output(args.clusterName),
      },
      this
    );

    this.albSecurityGroupId = albSecurityGroup.id;

    this.registerOutputs({
      albSecurityGroupId: this.albSecurityGroupId,
    });
  }
}
