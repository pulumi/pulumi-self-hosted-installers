import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as azure from "@pulumi/azure-native";
import { ComponentResource, ComponentResourceOptions, Output } from "@pulumi/pulumi";

export interface KeyStorageArgs {
    objectId: Output<string>,
    tenantId: Output<string>,
    resourceGroupName: Output<string>,
    tags?: pulumi.Input<{
        [key: string]: pulumi.Input<string>;
    }>,
}

export class KeyStorage extends ComponentResource {
    public readonly KeyVaultUri: Output<string>;
    public readonly KeyName: Output<string>;
    public readonly KeyVersion: Output<string>;
    constructor(name: string, args: KeyStorageArgs, opts?: ComponentResourceOptions) {
        super("x:infrastructure:keystorage", name, opts);

        // KeyVault names must be globally unique so add a random suffix to ensure uniqueness.
        const vault = new azure.keyvault.Vault(`pulumivault`, {
            resourceGroupName: args.resourceGroupName,
            properties: {
                accessPolicies: [
                    {
                        objectId: args.objectId,
                        permissions: {
                            keys: [
                                "Get",
                                "List",
                                "Update",
                                "Create",
                                "Import",
                                "Delete",
                                "Recover",
                                "Backup",
                                "Restore",
                                "Decrypt",
                                "Encrypt",
                                "UnwrapKey",
                                "WrapKey",
                                "Verify",
                                "Sign",
                                "Purge"
                            ],
                            secrets: [
                                "Get",
                                "List",
                                "Set",
                                "Delete",
                                "Recover",
                                "Backup",
                                "Restore",
                                "Purge"
                            ],
                        },
                        tenantId: args.tenantId,
                    }
                ],
                enabledForDeployment: true,
                enabledForDiskEncryption: true,
                enabledForTemplateDeployment: true,
                sku: {
                    family: azure.keyvault.SkuFamily.A,
                    name: azure.keyvault.SkuName.Standard, // standard as we don't need HSM
                },
                tenantId: args.tenantId,
                enableSoftDelete: true,
            },
            tags: args.tags,
        }, {parent: this, protect: true});

        const key = new azure.keyvault.Key(`${name}-key`, {
            resourceGroupName: args.resourceGroupName,

            properties: {
                kty: azure.keyvault.JsonWebKeyType.RSA
            },
            vaultName: vault.name,
            tags: args.tags,
        }, {parent: vault});

        this.KeyVaultUri = pulumi.interpolate`https://${vault.name}.vault.azure.net`;
        this.KeyName = key.name;

        const keyUriWithoutVersion = pulumi.interpolate`${this.KeyVaultUri}/keys/${key.name}/`;
        this.KeyVersion = pulumi.all([keyUriWithoutVersion, key.keyUriWithVersion]).apply(([keyUriWithoutVersion, keyUriWithVersion]) => {
            return keyUriWithVersion.replace(keyUriWithoutVersion, "");
        });

        this.registerOutputs({
            KeyVaultUri: this.KeyVaultUri,
            KeyName: this.KeyName,
            KeyVersion: this.KeyVersion
        });
    }
}
