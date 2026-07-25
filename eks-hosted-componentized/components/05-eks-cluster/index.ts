import * as aws from "@pulumi/aws";
import * as eks from "@pulumi/eks";
import * as pulumi from "@pulumi/pulumi";

export interface EKSClusterOutputs {
  kubeconfig: pulumi.Output<string>;
  clusterName: pulumi.Output<string>;
  region: pulumi.Output<string | undefined>;
  nodeSecurityGroupId: pulumi.Output<string>;
  nodeGroupInstanceType: string;
}

export interface EKSClusterArgs {
  // From IAM stack
  eksInstanceRole?: pulumi.Output<aws.iam.Role>;
  eksServiceRole?: pulumi.Output<aws.iam.Role>;
  // From networking stack
  clusterName?: pulumi.Output<string>;
  vpcId?: pulumi.Output<string>;
  publicSubnetIds?: pulumi.Output<string[]>;
  privateSubnetIds?: pulumi.Output<string[]>;
}

export class EKSClusterResources extends pulumi.ComponentResource {
  public readonly kubeconfig: pulumi.Output<string>;
  public readonly clusterName: pulumi.Output<string>;
  public readonly nodeSecurityGroupId: pulumi.Output<string>;
  public readonly nodeGroupInstanceType: string;

  constructor(
    name: string,
    args: EKSClusterArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("eks-self-hosted:index:EKSCluster", name, {}, opts);

    const config = new pulumi.Config();

    const baseName = config.require("baseName");
    const clusterVersion = config.get("clusterVersion") || "1.33";

    // Node group configurations
    const standardNodeGroupInstanceType =
      config.get("standardNodeGroupInstanceType") || "t3.xlarge";
    const standardNodeGroupDesiredCapacity =
      config.getNumber("standardNodeGroupDesiredCapacity") ?? 2;
    const standardNodeGroupMinSize =
      config.getNumber("standardNodeGroupMinSize") ?? 2;
    const standardNodeGroupMaxSize =
      config.getNumber("standardNodeGroupMaxSize") ?? 5;

    const pulumiNodeGroupInstanceType =
      config.get("pulumiNodeGroupInstanceType") || "t3.xlarge";
    const pulumiNodeGroupDesiredCapacity =
      config.getNumber("pulumiNodeGroupDesiredCapacity") ?? 3;
    const pulumiNodeGroupMinSize =
      config.getNumber("pulumiNodeGroupMinSize") ?? 3;
    const pulumiNodeGroupMaxSize =
      config.getNumber("pulumiNodeGroupMaxSize") ?? 5;

    const httpTokens = config.get("httpTokens") || "required";
    const httpPutResponseHopLimit =
      config.getNumber("httpPutResponseHopLimit") ?? 2;

    // Use provided args or throw error if required values are missing
    if (
      !args.eksInstanceRole ||
      !args.eksServiceRole ||
      !args.clusterName ||
      !args.vpcId ||
      !args.publicSubnetIds ||
      !args.privateSubnetIds
    ) {
      throw new Error(
        "Missing required arguments: eksInstanceRole, eksServiceRole, clusterName, vpcId, publicSubnetIds, privateSubnetIds"
      );
    }

    const tags = { Project: "pulumi-k8s-aws-cluster", Owner: "pulumi" };

    // Create an EKS cluster.
    const cluster = new eks.Cluster(
      `${baseName}`,
      {
        name: args.clusterName,
        authenticationMode: "API",
        // We keep these serviceRole and instanceRole properties to prevent the EKS provider from creating its own roles.
        serviceRole: args.eksServiceRole,
        instanceRole: args.eksInstanceRole,
        vpcId: args.vpcId,
        publicSubnetIds: args.publicSubnetIds,
        privateSubnetIds: args.privateSubnetIds,
        providerCredentialOpts: { profileName: process.env.AWS_PROFILE },
        nodeAssociatePublicIpAddress: false,
        skipDefaultNodeGroup: true,
        version: clusterVersion,
        createOidcProvider: false,
        tags: tags,
        enabledClusterLogTypes: [
          "api",
          "audit",
          "authenticator",
          "controllerManager",
          "scheduler",
        ],
      },
      { protect: true, parent: this }
    );

    const instanceRoleArn = args.eksInstanceRole.apply((role: any) => role.arn);

    // Launch template for the managed node group to manage settings.
    const ngManagedLaunchTemplate = new aws.ec2.LaunchTemplate(
      `${baseName}-ng-managed-launch-template`,
      {
        vpcSecurityGroupIds: [cluster.nodeSecurityGroupId],
        metadataOptions: {
          httpTokens: httpTokens,
          httpPutResponseHopLimit: httpPutResponseHopLimit,
        },
      },
      { parent: this }
    );

    const ngManagedStandard = new eks.ManagedNodeGroup(
      `${baseName}-ng-managed-standard`,
      {
        cluster: cluster,
        instanceTypes: [<aws.ec2.InstanceType>standardNodeGroupInstanceType],
        launchTemplate: {
          id: ngManagedLaunchTemplate.id,
          version: ngManagedLaunchTemplate.latestVersion.apply((v) =>
            v.toString()
          ),
        },
        nodeRoleArn: instanceRoleArn,
        scalingConfig: {
          desiredSize: standardNodeGroupDesiredCapacity,
          minSize: standardNodeGroupMinSize,
          maxSize: standardNodeGroupMaxSize,
        },
        subnetIds: args.privateSubnetIds,
        tags: tags,
      },
      { parent: this }
    );

    const ngManagedPulumi = new eks.ManagedNodeGroup(
      `${baseName}-ng-managed-pulumi`,
      {
        cluster: cluster,
        instanceTypes: [<aws.ec2.InstanceType>pulumiNodeGroupInstanceType],
        launchTemplate: {
          id: ngManagedLaunchTemplate.id,
          version: ngManagedLaunchTemplate.latestVersion.apply((v) =>
            v.toString()
          ),
        },
        nodeRoleArn: instanceRoleArn,
        scalingConfig: {
          desiredSize: pulumiNodeGroupDesiredCapacity,
          minSize: pulumiNodeGroupMinSize,
          maxSize: pulumiNodeGroupMaxSize,
        },
        subnetIds: args.privateSubnetIds,
        taints: [
          {
            key: "self-hosted-pulumi",
            value: "true",
            effect: "NO_SCHEDULE",
          },
        ],
        tags: tags,
      },
      { parent: this }
    );

    // Set outputs
    this.kubeconfig = pulumi.secret(cluster.kubeconfig.apply(JSON.stringify));
    this.clusterName = cluster.core.cluster.name;
    const region = aws.config.region;
    this.nodeSecurityGroupId = cluster.nodeSecurityGroupId;
    this.nodeGroupInstanceType = pulumiNodeGroupInstanceType;

    this.registerOutputs({
      kubeconfig: this.kubeconfig,
      clusterName: this.clusterName,
      region: region,
      nodeSecurityGroupId: this.nodeSecurityGroupId,
      nodeGroupInstanceType: this.nodeGroupInstanceType,
    });
  }
}
