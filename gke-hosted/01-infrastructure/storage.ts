import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

export interface StorageArgs {
    tags?: pulumi.Input<{
        [key: string]: pulumi.Input<string>;
    }>,
};

export class Storage extends pulumi.ComponentResource {
    public readonly checkpointBucketId: pulumi.Output<string>;
    public readonly checkpointBucketIdV2: pulumi.Output<string>;
    public readonly policyBucketId: pulumi.Output<string>;
    public readonly checkpointBucketName: pulumi.Output<string>;
    public readonly checkpointBucketNameV2: pulumi.Output<string>;
    public readonly policyBucketName: pulumi.Output<string>;
    public readonly escBucketName: pulumi.Output<string>;
    constructor(name: string, args: StorageArgs) {
        super("x:infrastructure:storage", name);

      // Buckets
        const checkpointBucket = new gcp.storage.Bucket(`${name}-checkpoints`, {
            location: "US", // highly available bucketness,
            labels: args.tags,
        }, { parent: this, protect: true });

        const checkpointBucketV2 = new gcp.storage.Bucket(`${name}-checkpoints-v2`, {
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

        this.checkpointBucketId = checkpointBucket.id;
        this.checkpointBucketIdV2 = checkpointBucketV2.id;
        this.policyBucketId = policyBucket.id;
        this.checkpointBucketName = checkpointBucket.name;
        this.checkpointBucketNameV2 = checkpointBucketV2.name;
        this.policyBucketName = policyBucket.name;
        this.escBucketName = escBucket.name;

        this.registerOutputs({
            checkpointBucketId: this.checkpointBucketId,
            checkpointBucketIdV2: this.checkpointBucketIdV2,
            policyBucketId: this.policyBucketId,
            checkpointBucketName: this.checkpointBucketName,
            checkpointBucketNameV2: this.checkpointBucketNameV2,
            policyBucketName: this.policyBucketName,
            escBucketName: this.escBucketName,
        });
    }
}
