import * as native from "@pulumi/azure-native";
import * as pulumi from "@pulumi/pulumi";
import * as tls from "@pulumi/tls";
import { config } from "./config";
import { ComponentResourceOptions, Output } from "@pulumi/pulumi";

interface KubernetesClusterArgs {
  ResourceGroupName: Output<string>;
  ADApplicationId: Output<string>;
  ADApplicationSecret: Output<string>;
  ADAdminGroupId: Output<string>;
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>,
}

export class KubernetesCluster extends pulumi.ComponentResource {
  public readonly Kubeconfig: Output<string>;
  public readonly Name: Output<string>;
  constructor(name: string, args: KubernetesClusterArgs, opts?: ComponentResourceOptions) {
    super("x:kubernetes:cluster", name, opts);

    const sshPublicKey = new tls.PrivateKey(`${name}-sshKey`, {
        algorithm: "RSA",
        rsaBits: 4096,
      },
      { additionalSecretOutputs: ["publicKeyOpenssh"], parent: this }
    ).publicKeyOpenssh;

    // Must use a shorter name due to https://aka.ms/aks-naming-rules.
    const cluster = new native.containerservice.ManagedCluster(`${name}-aks`, {
        resourceGroupName: args.ResourceGroupName,

        servicePrincipalProfile: {
          clientId: args.ADApplicationId,
          secret: args.ADApplicationSecret,
        },
        enableRBAC: true,
        aadProfile: {
          managed: true,
          adminGroupObjectIDs: [args.ADAdminGroupId],
        },
        agentPoolProfiles: [
          {
            count: 2,
            mode: "System",
            name: "agentpool",
            nodeLabels: {},
            osDiskSizeGB: 30,
            osType: "Linux",
            type: "VirtualMachineScaleSets",
            vmSize: "Standard_DS3_v2",
            vnetSubnetID: config.subnetId,
          },
        ],
        dnsPrefix: `${name}`,
        linuxProfile: {
          adminUsername: "adminpulumi",
          ssh: {
            publicKeys: [
              {
                keyData: sshPublicKey,
              },
            ],
          },
        },
        kubernetesVersion: "1.21.9",
        nodeResourceGroup: `${name}-aks-nodes-rg`,

        tags: args.tags,
      }, {parent: this, protect: true});

    const credentials = pulumi
      .all([cluster.name, args.ResourceGroupName])
      .apply(([clusterName, resourceGroupName]) => {
        return native.containerservice.listManagedClusterAdminCredentials(
          {
            resourceGroupName: resourceGroupName,
            resourceName: clusterName,
          }
        );
      });

    this.Name = cluster.name;
    this.Kubeconfig = credentials.kubeconfigs[0].value.apply((config) =>
      Buffer.from(config, "base64").toString()
    );
    this.registerOutputs({
      Name: this.Name,
      Kubeconfig: this.Kubeconfig,
    });
  }
}
