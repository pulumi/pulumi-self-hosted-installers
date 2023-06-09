import * as pulumi from "@pulumi/pulumi";
import { network } from "@pulumi/azure-native";
import { Input, Output, ComponentResource, log } from "@pulumi/pulumi";

export interface NetworkArgs {
  resourceGroupName: Output<string>,
  subnetCidr: string,
  networkCidr?: string,
  vnetId?: string,
  tags?: Input<{
    [key: string]: Input<string>;
  }>,
};

export class Network extends ComponentResource {
  public readonly subnetId: Output<string>;
  constructor(name: string, args: NetworkArgs) {
    super("x:infrastructure:networking", name);

    if (!args.networkCidr && !args.vnetId) {
      const err = "Network requires one of vnetId or networkCidr to be populated"
      log.error(err);
      throw new Error(err)
    }

    // allow users to provide their own vnet, if they elect
    let vnet: network.VirtualNetwork;
    if (args.vnetId) {
      vnet = network.VirtualNetwork.get(`${name}-vnet`, args.vnetId!);
    } else {
      vnet = new network.VirtualNetwork(`${name}-vnet`, {
        resourceGroupName: args.resourceGroupName,
        addressSpace: {
          addressPrefixes: [args.networkCidr!],
        },
        tags: args.tags,
      }, { parent: this, ignoreChanges: ["subnets", "etags"] }); // ignore changes due to https://github.com/pulumi/pulumi-azure-native/issues/611#issuecomment-721490800
    }

    const subnet = new network.Subnet(`${name}-snet`, {
      resourceGroupName: args.resourceGroupName,
      virtualNetworkName: vnet.name,
      addressPrefix: args.subnetCidr,
      serviceEndpoints: [{
        service: "Microsoft.Sql"
      }],
    }, { parent: vnet });

    this.subnetId = subnet.id;
    this.registerOutputs({
      SubnetId: this.subnetId,
    });
  }
}
