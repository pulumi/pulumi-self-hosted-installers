import { storage } from "@pulumi/azure-native";
import { Input, Output, ComponentResource, ComponentResourceOptions, secret, all } from "@pulumi/pulumi";

export interface StorageArgs {
    resourceGroupName: Output<string>,
    // creates the two Pulumi Registry containers
    enableRegistryContainers?: boolean,
    tags?: Input<{
        [key: string]: Input<string>;
    }>,
}

export class Storage extends ComponentResource {
    public readonly storageAccountId: Output<string>;
    public readonly storageAccountName: Output<string>;
    public readonly storageAccountKey1: Output<string>;
    public readonly storageAccountKey2: Output<string>;
    public readonly checkpointBlobId: Output<string>;
    public readonly policyBlobId: Output<string>;
    public readonly checkpointBlobName: Output<string>;
    public readonly policyBlobName: Output<string>;
    public readonly escBlobId: Output<string>;
    public readonly escBlobName: Output<string>;
    public readonly registryPublicBlobName?: Output<string>;
    public readonly registryPrivateBlobName?: Output<string>;
    constructor(name: string, args: StorageArgs) {
        super("x:infrastructure:storage", name);

        // Uses a different resource name because of Azure's 24 character limit and global unique name requirements
        const storageAccount = new storage.StorageAccount("pulumi", {
            resourceGroupName: args.resourceGroupName,
            sku: {
                name: storage.SkuName.Standard_LRS,
            },
            kind: storage.Kind.StorageV2,
            tags: args.tags,
        }, { parent: this, protect: true });

        const checkpointBlob = new storage.BlobContainer(`pulumicheckpoints`, {
            resourceGroupName: args.resourceGroupName,
            accountName: storageAccount.name,
        }, { parent: storageAccount, protect: true });

        const policyBlob = new storage.BlobContainer(`pulumipolicypacks`, {
            resourceGroupName: args.resourceGroupName,
            accountName: storageAccount.name,
        }, { parent: storageAccount, protect: true });

        const escBlob = new storage.BlobContainer(`pulumiesc`, {
            resourceGroupName: args.resourceGroupName,
            accountName: storageAccount.name,
        }, { parent: storageAccount, protect: true });

        // Opt-in: Pulumi Registry needs its own public and private containers. Without them the API logs
        // "the registry service will not operate properly" at startup and Registry does not work.
        if (args.enableRegistryContainers) {
            const registryPublicBlob = new storage.BlobContainer(`pulumiregistrypublic`, {
                resourceGroupName: args.resourceGroupName,
                accountName: storageAccount.name,
            }, { parent: storageAccount, protect: true });
            const registryPrivateBlob = new storage.BlobContainer(`pulumiregistryprivate`, {
                resourceGroupName: args.resourceGroupName,
                accountName: storageAccount.name,
            }, { parent: storageAccount, protect: true });
            this.registryPublicBlobName = registryPublicBlob.name;
            this.registryPrivateBlobName = registryPrivateBlob.name;
        }

        const storageAccountKeys = storage.listStorageAccountKeysOutput({
            resourceGroupName: args.resourceGroupName,
            accountName: storageAccount.name,
        });

        this.storageAccountKey1 = secret(storageAccountKeys.keys[0].value);
        this.storageAccountKey2 = secret(storageAccountKeys.keys[1].value);
        this.checkpointBlobId = checkpointBlob.id;
        this.policyBlobId = policyBlob.id;
        this.escBlobId = escBlob.id;
        this.storageAccountId = storageAccount.id
        this.checkpointBlobName = checkpointBlob.name;
        this.policyBlobName = policyBlob.name;
        this.escBlobName = escBlob.name;
        this.storageAccountName = storageAccount.name;

        this.registerOutputs({
            storageAccountId: this.storageAccountId,
            storageAccountKey1: this.storageAccountKey1,
            storageAccountKey2: this.storageAccountKey2,
            checkpointBlobId: this.checkpointBlobId,
            policyBlobId: this.policyBlobId,
            escBlobId: this.escBlobId,
            checkpointBlobName: this.checkpointBlobName,
            policyBlobName: this.policyBlobName,
            escBlobName: this.escBlobName,
            registryPublicBlobName: this.registryPublicBlobName,
            registryPrivateBlobName: this.registryPrivateBlobName,
            storageAccountName: this.storageAccountName
        });
    }
}
