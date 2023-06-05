import * as pulumi from "@pulumi/pulumi";
import { network } from "@pulumi/azure-native";
import { Input, Output, ComponentResource, ComponentResourceOptions } from "@pulumi/pulumi";

export interface NetworkArgs {
  resourceGroupName: Output<string>,
  networkCidr: string,
  dbSubnetCidr: string,
  aksSubnetCidr: string,
  tags?: Input<{
    [key: string]: Input<string>;
  }>,
};

export class Network extends ComponentResource {
  public readonly dbSubnetId: Output<string>;
  public readonly aksSubnetId: Output<string>;
  constructor(name: string, args: NetworkArgs) {
    super("x:infrastructure:networking", name);

    const vnet = new network.VirtualNetwork(`${name}-vnet`, {
      resourceGroupName: args.resourceGroupName,
      addressSpace: {
        addressPrefixes: [args.networkCidr],
      },
      tags: args.tags,
    }, { parent: this, ignoreChanges: ["subnets", "etags"] }); // ignore changes due to https://github.com/pulumi/pulumi-azure-native/issues/611#issuecomment-721490800

    const dbSubnet = new network.Subnet(`${name}-dbsnet`, {
      resourceGroupName: args.resourceGroupName,

      virtualNetworkName: vnet.name,
      addressPrefix: args.dbSubnetCidr,
      
      delegations: [{
        name: "mysqldelegation",
        serviceName: "Microsoft.DBforMySQL/flexibleServers"
      }]
    }, { parent: vnet });

    const aksSubnet = new network.Subnet(`${name}-akssnet`, {
      resourceGroupName: args.resourceGroupName,

      virtualNetworkName: vnet.name,
      addressPrefix: args.aksSubnetCidr,
      serviceEndpoints: [{
        service: "Microsoft.Sql"
      }],
      
    }, { parent: vnet });

    this.dbSubnetId = dbSubnet.id;
    this.aksSubnetId = aksSubnet.id;
    this.registerOutputs({
      DbSubnetId: this.dbSubnetId,
      AksSubnetId: this.aksSubnetId,
    });
  }
}
