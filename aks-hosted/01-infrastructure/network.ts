import { network } from "@pulumi/azure-native";
import { Input, Output, ComponentResource, log } from "@pulumi/pulumi";

export interface NetworkArgs {
  resourceGroupName: Output<string>;
  subnetCidr: string;
  dbSubnetCidr: string;
  networkCidr?: string;
  vnetName?: string;
  tags?: Input<{
    [key: string]: Input<string>;
  }>;
};

export class Network extends ComponentResource {
  public readonly subnetId: Output<string>;
  public readonly dbSubnetId: Output<string>;
  public readonly vnetId: Output<string>;

  constructor(name: string, args: NetworkArgs) {
    super("x:infrastructure:networking", name);

    if (!args.networkCidr && !args.vnetName) {
      const err = "Network requires one of vnetId or networkCidr to be populated"
      log.error(err);
      throw new Error(err)
    }

    // allow users to provide their own vnet, if they elect, but we will still create two subnets
    let vnetName: Output<string>;
    let vnetId: Output<string>;
    if (args.vnetName) {
      const preExisting = network.getVirtualNetworkOutput({
        resourceGroupName: args.resourceGroupName,
        virtualNetworkName: args.vnetName,
      });

      vnetName = preExisting.name;
      vnetId = preExisting.id!.apply(s => s!);
    } else {
      const vnet = new network.VirtualNetwork(`${name}-vnet`, {
        resourceGroupName: args.resourceGroupName,
        addressSpace: {
          addressPrefixes: [args.networkCidr!],
        },
        tags: args.tags,
      }, { parent: this, ignoreChanges: ["subnets", "etags"] }); // ignore changes due to https://github.com/pulumi/pulumi-azure-native/issues/611#issuecomment-721490800
      vnetName = vnet.name;
      vnetId = vnet.id;
    }

    const subnet = new network.Subnet(`${name}-snet`, {
      resourceGroupName: args.resourceGroupName,
      virtualNetworkName: vnetName,
      addressPrefix: args.subnetCidr,
      privateLinkServiceNetworkPolicies: "Disabled",
      privateEndpointNetworkPolicies: "Disabled",
    }, { parent: this });

    // subnet will be dedicated to mysql databases
    // requires at minimum a /28
    const dbSubnet = new network.Subnet(`${name}-db-snet`, {
      resourceGroupName: args.resourceGroupName,
      virtualNetworkName: vnetName,
      addressPrefix: args.dbSubnetCidr,
      privateLinkServiceNetworkPolicies: "Disabled",
      privateEndpointNetworkPolicies: "Disabled",
      delegations: [{
        name: "db-delegation-1",
        serviceName: "Microsoft.DBforMySQL/flexibleServers", // delegation marks this as MySQL flexible server only
      }]
    }, { parent: this });

    this.subnetId = subnet.id;
    this.dbSubnetId = dbSubnet.id;
    this.vnetId = vnetId;
    this.registerOutputs({
      SubnetId: this.subnetId,
      DbSubnetId: this.dbSubnetId,
      VnetId: this.vnetId,
    });
  }
}
