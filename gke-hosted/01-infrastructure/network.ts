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
    constructor(name: string, args: NetworkArgs) {
        super("x:infrastructure:networking", name);

        const vnet = new gcp.compute.Network(`${name}-network`, {
          autoCreateSubnetworks: true,
          routingMode: "REGIONAL",
        }, {parent: this})

        this.networkName = vnet.name

        this.registerOutputs({
          NetworkName: this.networkName,
        });
    }
}
