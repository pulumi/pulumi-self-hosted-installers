import { containerservice, network } from "@pulumi/azure-native/";
import { PrivateKey } from "@pulumi/tls";
import { config } from "./config";
import { Input, ComponentResource, ComponentResourceOptions, Output, output } from "@pulumi/pulumi";

interface KubernetesClusterArgs {
  resourceGroupName: Output<string>;
  aDApplicationId: Output<string>;
  aDApplicationSecret: Output<string>;
  aDAdminGroupId: Output<string>;
  disableAzureDnsCertManagement: boolean;
  privateIpAddress: string | undefined;
  tags?: Input<{
    [key: string]: Input<string>;
  }>,
}

export class KubernetesCluster extends ComponentResource {
  public readonly Kubeconfig: Output<string>;
  public readonly Name: Output<string>;
  public readonly ClusterIp: Output<string>;
  public readonly OidcClusterIssuerUrl: Output<string | undefined>;

  constructor(name: string, args: KubernetesClusterArgs, opts?: ComponentResourceOptions) {
    super("x:kubernetes:cluster", name, opts);

    const sshPublicKey = new PrivateKey(`${name}-sshKey`, {
      algorithm: "RSA",
      rsaBits: 4096,
    },
      { additionalSecretOutputs: ["publicKeyOpenssh"], parent: this }
    ).publicKeyOpenssh;

    const nodeRgName = `${name}-aks-nodes-rg`;
    const clusterArgs: containerservice.ManagedClusterArgs = {
      resourceGroupName: args.resourceGroupName,
      servicePrincipalProfile: {
        clientId: args.aDApplicationId,
        secret: args.aDApplicationSecret,
      },
      aadProfile: {
        managed: true,
        adminGroupObjectIDs: [args.aDAdminGroupId],
      },
      enableRBAC: true,
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
      kubernetesVersion: "1.32.6",
      nodeResourceGroup: nodeRgName,
      networkProfile: {
        networkPlugin: "azure",
      },
      tags: args.tags,
    };

    // by enabling azure dns cert manager we will enable oidc and workload identity
    // this props will allow use to deploy cert-manager using azure managed identity
    // ultimately, the cert-manager pods will be able to use this ID to securely work with
    // azure DNS resources to ensure our certs are automatically verified.
    if (!args.disableAzureDnsCertManagement) {
      clusterArgs.oidcIssuerProfile = {
        enabled: true
      };

      clusterArgs.securityProfile = {
        workloadIdentity: {
          enabled: true
        }
      };
    }

    // Must use a shorter name due to https://aka.ms/aks-naming-rules.
    const cluster = new containerservice.ManagedCluster(
      `${name}-aks`,
      clusterArgs,
      {
        parent: this,
        protect: true,
        deleteBeforeReplace: true,
        replaceOnChanges: ["servicePrincipalProfile"]
      }
    );

    const nodeResourceGroup = cluster.nodeResourceGroup.apply((s: string | undefined) => s!);
    const credentials = containerservice.listManagedClusterAdminCredentialsOutput({
      resourceGroupName: args.resourceGroupName,
      resourceName: cluster.name
    });

    if (args.privateIpAddress) {
      this.ClusterIp = output(args.privateIpAddress!);
    } else {
      this.ClusterIp = this.createPublicIpAddress(name, nodeResourceGroup, args.tags!, cluster);
    }

    this.Name = cluster.name;
    this.Kubeconfig = credentials.kubeconfigs[0].value.apply((config) =>
      Buffer.from(config, "base64").toString()
    );

    this.OidcClusterIssuerUrl = cluster.oidcIssuerProfile.apply((s: any) => s?.issuerURL);
    this.registerOutputs({
      Name: this.Name,
      Kubeconfig: this.Kubeconfig,
      ClusterIp: this.ClusterIp,
      OidcClusterIssuerUrl: this.OidcClusterIssuerUrl,
    });
  }

  createPublicIpAddress(
    name: string,
    nodeResourceGroup: Output<string>,
    tags: Input<{ [key: string]: Input<string> }>,
    cluster: containerservice.ManagedCluster): Output<string> {
    const publicIp = new network.PublicIPAddress(`${name}-publicIp`, {
      resourceGroupName: nodeResourceGroup,
      publicIPAllocationMethod: "Static",
      sku: {
        name: "Standard"
      },
      tags: tags,
    }, { parent: this, dependsOn: [cluster] });

    const ip = network.getPublicIPAddressOutput({
      resourceGroupName: nodeResourceGroup,
      publicIpAddressName: publicIp.name,
    });

    return ip.ipAddress!.apply(s => s!);
  }
}
