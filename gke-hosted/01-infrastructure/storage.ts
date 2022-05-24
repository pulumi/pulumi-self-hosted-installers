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
    public readonly serviceAccountName: Output<string>;
    public readonly serviceAccountAccessKeyId: Output<string>;
    public readonly serviceAccountSecretAccessKey: Output<string>;
    constructor(name: string, args: StorageArgs) {
        super("x:infrastructure:storage", name);

        // Create a service account that will have access to the buckets
        const saName = `${name}-bkt-sa`
        const serviceAccount = new gcp.serviceaccount.Account(saName, {
            accountId: saName,
            displayName: "A service account for a self-hosted bucket access.",
        }, {parent: this, protect: true});

        const serviceAccountIAM = new gcp.projects.IAMBinding(`${saName}-IAM`, {
            project: gcp.config.project || "",
            role: "roles/storage.admin",
            members: [pulumi.interpolate`serviceAccount:${serviceAccount.email}`],
        }, {parent: serviceAccount});

        const serviceAccountKey = new gcp.storage.HmacKey(`${saName}-hmac`, {
            serviceAccountEmail: serviceAccount.email
        }, {parent: this, additionalSecretOutputs: ["secret"]});

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
        this.serviceAccountName = serviceAccount.name;
        this.serviceAccountAccessKeyId = serviceAccountKey.accessId;
        this.serviceAccountSecretAccessKey = serviceAccountKey.secret;
        
        this.registerOutputs({
            checkpointBucketId: this.checkpointBucketId,
            policyBucketId: this.policyBucketId,
            checkpointBucketName: this.checkpointBucketName,
            policyBucketName: this.policyBucketName,
            serviceAccountName: this.serviceAccountName,
            serviceAccountAccessKeyId: this.serviceAccountAccessKeyId,
            serviceAccountSecretAccessKey: this.serviceAccountSecretAccessKey,
        });
    }
}
