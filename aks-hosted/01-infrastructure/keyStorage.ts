import { keyvault } from "@pulumi/azure-native";
import { ComponentResource, ComponentResourceOptions, Input, Output, interpolate, all } from "@pulumi/pulumi";

export interface KeyStorageArgs {
    objectId: Output<string>,
    tenantId: Output<string>,
    resourceGroupName: Output<string>,
    tags?: Input<{
        [key: string]: Input<string>;
    }>,
}

export class KeyStorage extends ComponentResource {
    public readonly KeyVaultUri: Output<string>;
    public readonly KeyName: Output<string>;
    public readonly KeyVersion: Output<string>;
    constructor(name: string, args: KeyStorageArgs, opts?: ComponentResourceOptions) {
        super("x:infrastructure:keystorage", name, opts);

        // KeyVault names must be globally unique so add a random suffix to ensure uniqueness.
        const vault = new keyvault.Vault(`pulumivault`, {
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
                    family: keyvault.SkuFamily.A,
                    name: keyvault.SkuName.Standard, // standard as we don't need HSM
                },
                tenantId: args.tenantId,
                enableSoftDelete: true,
            },
            tags: args.tags,
        }, {parent: this, protect: true});

        const key = new keyvault.Key(`${name}-key`, {
            resourceGroupName: args.resourceGroupName,

            properties: {
                kty: keyvault.JsonWebKeyType.RSA
            },
            vaultName: vault.name,
            tags: args.tags,
        }, {parent: vault});

        this.KeyVaultUri = interpolate`https://${vault.name}.vault.azure.net`;
        this.KeyName = key.name;

        const keyUriWithoutVersion = interpolate`${this.KeyVaultUri}/keys/${key.name}/`;
        this.KeyVersion = all([keyUriWithoutVersion, key.keyUriWithVersion]).apply(([keyUriWithoutVersion, keyUriWithVersion]) => {
            return keyUriWithVersion.replace(keyUriWithoutVersion, "");
        });

        this.registerOutputs({
            KeyVaultUri: this.KeyVaultUri,
            KeyName: this.KeyName,
            KeyVersion: this.KeyVersion
        });
    }
}
