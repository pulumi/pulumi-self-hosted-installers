import * as pulumi from "@pulumi/pulumi";
import { network } from "@pulumi/azure-native";
import { Input, Output, ComponentResource, ComponentResourceOptions } from "@pulumi/pulumi";

export interface NetworkArgs {
  resourceGroupName: Output<string>,
  networkCidr: string,
  subnetCidr: string,
  tags?: Input<{
    [key: string]: Input<string>;
  }>,
};

export class Network extends ComponentResource {
  public readonly subnetId: Output<string>;
  constructor(name: string, args: NetworkArgs) {
    super("x:infrastructure:networking", name);

    const vnet = new network.VirtualNetwork(`${name}-vnet`, {
      resourceGroupName: args.resourceGroupName,
      addressSpace: {
        addressPrefixes: [args.networkCidr],
      },
      tags: args.tags,
    }, { parent: this, ignoreChanges: ["subnets", "etags"] }); // ignore changes due to https://github.com/pulumi/pulumi-azure-native/issues/611#issuecomment-721490800

    const subnet = new network.Subnet(`${name}-snet`, {
      resourceGroupName: args.resourceGroupName,

      virtualNetworkName: vnet.name,
      addressPrefix: args.subnetCidr,
      serviceEndpoints: [{
        service: "Microsoft.Sql"
      }],
      delegations: [{
        name: "mysqldelegation",
        serviceName: "Microsoft.DBforMySQL/flexibleServers"
      }]
    }, { parent: vnet });

    this.subnetId = subnet.id;
    this.registerOutputs({
      SubnetId: this.subnetId,
    });
  }
}
