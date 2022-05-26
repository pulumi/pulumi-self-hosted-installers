import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as random from "@pulumi/random";
import { Output } from "@pulumi/pulumi";

export interface StorageArgs {
    tags?: pulumi.Input<{
        [key: string]: pulumi.Input<string>;
    }>,
};

export class Storage extends pulumi.ComponentResource {
    public readonly checkpointBucketId: Output<string>;
    public readonly policyBucketId: Output<string>;
    public readonly checkpointBucketName: Output<string>;
    public readonly policyBucketName: Output<string>;
    constructor(name: string, args: StorageArgs) {
        super("x:infrastructure:storage", name);

        // Buckets
        const checkpointBucket = new gcp.storage.Bucket(`${name}-checkpoints`, {
            location: "US", // highly available bucketness,
            labels: args.tags,
        }, {parent: this, protect: true})

        const policyBucket = new gcp.storage.Bucket(`${name}-policypacks`, {
            location: "US", // highly available bucketness
            labels: args.tags,
        }, {parent: this, protect: true})

        this.checkpointBucketId = checkpointBucket.id;
        this.policyBucketId = policyBucket.id;
        this.checkpointBucketName = checkpointBucket.name;
        this.policyBucketName = policyBucket.name;
        
        this.registerOutputs({
            checkpointBucketId: this.checkpointBucketId,
            policyBucketId: this.policyBucketId,
            checkpointBucketName: this.checkpointBucketName,
            policyBucketName: this.policyBucketName,
        });
    }
}
