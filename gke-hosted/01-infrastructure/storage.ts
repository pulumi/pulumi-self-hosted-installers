import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

export interface StorageArgs {
    // creates the two Pulumi Registry buckets
    enableRegistryBuckets?: boolean,
    tags?: pulumi.Input<{
        [key: string]: pulumi.Input<string>;
    }>,
};

export class Storage extends pulumi.ComponentResource {
    public readonly checkpointBucketId: pulumi.Output<string>;
    public readonly policyBucketId: pulumi.Output<string>;
    public readonly checkpointBucketName: pulumi.Output<string>;
    public readonly policyBucketName: pulumi.Output<string>;
    public readonly escBucketName: pulumi.Output<string>;
    public readonly registryPublicBucketName?: pulumi.Output<string>;
    public readonly registryPrivateBucketName?: pulumi.Output<string>;
    constructor(name: string, args: StorageArgs) {
        super("x:infrastructure:storage", name);

      // Buckets
        const checkpointBucket = new gcp.storage.Bucket(`${name}-checkpoints`, {
            location: "US", // highly available bucketness,
            labels: args.tags,
        }, { parent: this, protect: true });

        const policyBucket = new gcp.storage.Bucket(`${name}-policypacks`, {
            location: "US", // highly available bucketness
            labels: args.tags,
        }, { parent: this, protect: true });

        const escBucket = new gcp.storage.Bucket(`${name}-esc`, {
              location: "US",
              labels: args.tags,
        }, { parent: this, protect: true });

        // Opt-in: Pulumi Registry needs its own public and private buckets. Without them the API logs
        // "the registry service will not operate properly" at startup and Registry does not work.
        if (args.enableRegistryBuckets) {
            const registryPublicBucket = new gcp.storage.Bucket(`${name}-registry-public`, {
                location: "US",
                labels: args.tags,
            }, { parent: this, protect: true });
            const registryPrivateBucket = new gcp.storage.Bucket(`${name}-registry-private`, {
                location: "US",
                labels: args.tags,
            }, { parent: this, protect: true });
            this.registryPublicBucketName = registryPublicBucket.name;
            this.registryPrivateBucketName = registryPrivateBucket.name;
        }

        this.checkpointBucketId = checkpointBucket.id;
        this.policyBucketId = policyBucket.id;
        this.checkpointBucketName = checkpointBucket.name;
        this.policyBucketName = policyBucket.name;
        this.escBucketName = escBucket.name;

        this.registerOutputs({
            checkpointBucketId: this.checkpointBucketId,
            policyBucketId: this.policyBucketId,
            checkpointBucketName: this.checkpointBucketName,
            policyBucketName: this.policyBucketName,
            escBucketName: this.escBucketName,
            registryPublicBucketName: this.registryPublicBucketName,
            registryPrivateBucketName: this.registryPrivateBucketName,
        });
    }
}
