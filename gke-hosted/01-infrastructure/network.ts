import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import { Output } from "@pulumi/pulumi";

export interface NetworkArgs {
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>,
};

export class Network extends pulumi.ComponentResource {
    public readonly networkName: Output<string>;
    public readonly networkId: Output<string>;
    constructor(name: string, args: NetworkArgs) {
        super("x:infrastructure:networking", name);

        const vnet = new gcp.compute.Network(`${name}-network`, {
          autoCreateSubnetworks: true,
          routingMode: "REGIONAL",
        }, {parent: this})

        const privateIpAddress = new gcp.compute.GlobalAddress(`${name}-private-ips`, {
          purpose: "VPC_PEERING",
          addressType: "INTERNAL",
          prefixLength: 16,
          network: vnet.id
        }, {parent: this})

        const privateVpcConnection = new gcp.servicenetworking.Connection(`${name}-private-conn`, {
          network: vnet.id,
          service: "servicenetworking.googleapis.com",
          reservedPeeringRanges: [privateIpAddress.name]
        }, {parent: this})

        this.networkName = vnet.name
        this.networkId = pulumi.all([vnet.id, privateVpcConnection.id]).apply(([vnetId, pvcId]) => vnetId) // This ensure we don't return the VPC ID until the private connection is created. 

        this.registerOutputs({
          NetworkName: this.networkName,
          NetworkId: this.networkId,
        });
    }
}
