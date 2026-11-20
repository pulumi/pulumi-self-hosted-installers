import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";

export interface NetworkingOutputs {
  clusterName: pulumi.Output<string>;
  vpcId: pulumi.Output<string>;
  publicSubnetIds: pulumi.Output<string[]>;
  privateSubnetIds: pulumi.Output<string[]>;
}

export interface NetworkingArgs {}

export class NetworkResources extends pulumi.ComponentResource {
  public readonly clusterName: pulumi.Output<string>;
  public readonly vpcId: pulumi.Output<string>;
  public readonly publicSubnetIds: pulumi.Output<string[]>;
  public readonly privateSubnetIds: pulumi.Output<string[]>;

  constructor(
    name: string,
    args: NetworkingArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("eks-self-hosted:index:Network", name, {}, opts);

    const config = new pulumi.Config();

    const baseName = config.require("baseName");
    const eksClusterName = config.require("eksClusterName");
    const networkCidrBlock = config.require("networkCidrBlock");
    const vpcId = config.get("vpcId");
    const publicSubnetIds = config.getObject<string[]>("publicSubnetIds");
    const privateSubnetIds = config.getObject<string[]>("privateSubnetIds");

    this.clusterName = pulumi.output(eksClusterName);
    const clusterNameTag = `kubernetes.io/cluster/${eksClusterName}`;

    // Use the provided VPC and subnets if they exist.
    if (vpcId && publicSubnetIds && privateSubnetIds) {
      this.vpcId = pulumi.output(vpcId);
      this.publicSubnetIds = pulumi.output(publicSubnetIds);
      this.privateSubnetIds = pulumi.output(privateSubnetIds);
    } else {
      // Otherwise, create a new VPC and subnets
      const vpc = new awsx.ec2.Vpc(
        `${baseName}-vpc`,
        {
          cidrBlock: networkCidrBlock,
          numberOfAvailabilityZones: 3,
          subnetStrategy: awsx.ec2.SubnetAllocationStrategy.Auto,
          subnetSpecs: [
            // Any non-null value is valid.
            {
              type: "Public",
              tags: {
                "kubernetes.io/role/elb": "1",
                [clusterNameTag]: "shared",
              },
            },
            {
              type: "Private",
              tags: { "kubernetes.io/role/internal-elb": "1" },
            },
          ],
          // tags: { [clusterNameTag]:  "shared" }
          tags: { Name: `${baseName}-vpc` },
        },
        {
          transformations: [
            (args) => {
              if (
                args.type === "aws:ec2/vpc:Vpc" ||
                args.type === "aws:ec2/subnet:Subnet"
              ) {
                return {
                  props: args.props,
                  opts: pulumi.mergeOptions(args.opts, {
                    ignoreChanges: ["tags"],
                  }),
                };
              }
              return undefined;
            },
          ],
        }
      );

      this.vpcId = vpc.vpcId;
      this.publicSubnetIds = vpc.publicSubnetIds;
      this.privateSubnetIds = vpc.privateSubnetIds;
    }

    this.registerOutputs({
      clusterName: this.clusterName,
      vpcId: this.vpcId,
      publicSubnetIds: this.publicSubnetIds,
      privateSubnetIds: this.privateSubnetIds,
    });
  }
}
