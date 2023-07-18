import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import { Output } from "@pulumi/pulumi";

export interface ServiceAccountArgs {
    policyBucketName: pulumi.Output<string>;
    checkpointBucketName: pulumi.Output<string>;
    tags?: pulumi.Input<{
        [key: string]: pulumi.Input<string>;
    }>,
};

export class ServiceAccount extends pulumi.ComponentResource {
    public readonly serviceAccountName: Output<string>;
    public readonly serviceAccountAccessKeyId: Output<string>;
    public readonly serviceAccountSecretAccessKey: Output<string>;
    constructor(name: string, args: ServiceAccountArgs) {
        super("x:infrastructure:serviceaccount", name);

        // Create a service account to be used by the api service for access to the buckets and SQL DB.
        const saName = `${name}-sa`
        const serviceAccount = new gcp.serviceaccount.Account(saName, {
            accountId: saName,
            displayName: "A service account for the api service",
        }, { parent: this, protect: true });

        // apply least privileges for our SA so we don't get access to all buckets in a given GCP account
        const gcpProject = gcp.config.project!;
        const checkpointBucketIAMMember = new gcp.storage.BucketIAMMember(`${saName}-checkpoint-bucket-iam`, {
            bucket: args.checkpointBucketName,
            role: "roles/storage.objectAdmin",
            member: pulumi.interpolate`serviceAccount:${serviceAccount.email}`
        }, { parent: serviceAccount });

        const policyBucketIAMMember = new gcp.storage.BucketIAMMember(`${saName}-policy-bucket-iam`, {
            bucket: args.policyBucketName,
            role: "roles/storage.objectAdmin",
            member: pulumi.interpolate`serviceAccount:${serviceAccount.email}`
        }, { parent: serviceAccount });

        // new gcp.projects.IAMBinding(`${saName}-IAM`, {
        //     project: gcpProject,
        //     role: "roles/storage.objectAdmin",
        //     members: [pulumi.interpolate`serviceAccount:${serviceAccount.email}`],
        //     // condition: {
        //     //     title: "bucket-grant-policy",
        //     //     description: "grant service account admin permission on specific buckets",
        //     //     expression: pulumi.interpolate`resource.type == "storage.googleapis.com/Bucket" &&
        //     //                    (resource.name.startsWith("projects/${gcpProject}/buckets/${args.checkpointBucketName}") || 
        //     //                     resource.name.startsWith("projects/${gcpProject}/buckets/${args.policyBucketName}"))`
        //     // },
        // }, { parent: serviceAccount });

        const serviceAccountKey = new gcp.storage.HmacKey(`${saName}-hmac`, {
            serviceAccountEmail: serviceAccount.email,
        }, { parent: this, additionalSecretOutputs: ["secret"] });

        this.serviceAccountName = serviceAccount.name;
        this.serviceAccountAccessKeyId = serviceAccountKey.accessId;
        this.serviceAccountSecretAccessKey = serviceAccountKey.secret;

        this.registerOutputs({
            serviceAccountName: this.serviceAccountName,
            serviceAccountAccessKeyId: this.serviceAccountAccessKeyId,
            serviceAccountSecretAccessKey: this.serviceAccountSecretAccessKey,
        });
    }
}
