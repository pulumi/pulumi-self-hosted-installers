import { authorization, containerservice, managedidentity, network } from "@pulumi/azure-native/";
import { PrivateKey } from "@pulumi/tls";
import { config } from "./config";
import { Input, ComponentResource, ComponentResourceOptions, Output, all, interpolate } from "@pulumi/pulumi";

interface KubernetesClusterArgs {
  resourceGroupName: Output<string>;
  aDApplicationId: Output<string>;
  aDApplicationSecret: Output<string>;
  aDAdminGroupId: Output<string>;
  enableAzureDnsCertManagement: boolean;
  tags?: Input<{
    [key: string]: Input<string>;
  }>,
}

export class KubernetesCluster extends ComponentResource {
  public readonly Kubeconfig: Output<string>;
  public readonly Name: Output<string>;
  public readonly PublicIp: Output<string>;
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
    const clusterArgs: containerservice.v20220302preview.ManagedClusterArgs = {
      resourceGroupName: args.resourceGroupName,
      servicePrincipalProfile: {
        clientId: args.aDApplicationId,
        secret: args.aDApplicationSecret,
      },
      enableRBAC: true,
      aadProfile: {
        managed: true,
        adminGroupObjectIDs: [args.aDAdminGroupId],
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
      kubernetesVersion: "1.26.3",
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
    if (args.enableAzureDnsCertManagement) {
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
    const cluster = new containerservice.v20220302preview.ManagedCluster(`${name}-aks`, clusterArgs, { parent: this, protect: true });

    const nodeResourceGroup = cluster.nodeResourceGroup.apply(s => s!);
    const publicIp = new network.PublicIPAddress(`${name}-publicIp`, {
      resourceGroupName: nodeResourceGroup,
      publicIPAllocationMethod: "Static",
      sku: {
        name: "Standard"
      },
      tags: args.tags,
    }, { parent: this, dependsOn: [cluster] });

    const credentials = containerservice.listManagedClusterAdminCredentialsOutput({
      resourceGroupName: args.resourceGroupName,
      resourceName: cluster.name
    });

    const ip = network.getPublicIPAddressOutput({
      resourceGroupName: nodeResourceGroup,
      publicIpAddressName: publicIp.name,
    });

    this.Name = cluster.name;
    this.PublicIp = ip.ipAddress!.apply(s => s!);
    this.Kubeconfig = credentials.kubeconfigs[0].value.apply((config) =>
      Buffer.from(config, "base64").toString()
    );

    this.OidcClusterIssuerUrl = cluster.oidcIssuerProfile.apply(s => s?.issuerURL);
    this.registerOutputs({
      Name: this.Name,
      Kubeconfig: this.Kubeconfig,
      PublicIp: this.PublicIp,
      OidcClusterIssuerUrl: this.OidcClusterIssuerUrl,
    });
  }
}
