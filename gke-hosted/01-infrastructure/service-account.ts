import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as random from "@pulumi/random";
import { Output } from "@pulumi/pulumi";

export interface ServiceAccountArgs {
    tags?: pulumi.Input<{
        [key: string]: pulumi.Input<string>;
    }>,
};

export class ServiceAccount extends pulumi.ComponentResource {
    public readonly serviceAccountName: Output<string>;
    public readonly serviceAccountAccessKeyId: Output<string>;
    public readonly serviceAccountSecretAccessKey: Output<string>;
    constructor(name: string, args?: ServiceAccountArgs) {
        super("x:infrastructure:serviceaccount", name);

        // Create a service account to be used by the api service for access to the buckets and SQL DB.
        const saName = `${name}-sa`
        const serviceAccount = new gcp.serviceaccount.Account(saName, {
            accountId: saName,
            displayName: "A service account for the api service",
        }, {parent: this, protect: true});

        const serviceAccountIAM = new gcp.projects.IAMBinding(`${saName}-IAM`, {
            project: gcp.config.project || "",
            role: "roles/storage.admin",
            members: [pulumi.interpolate`serviceAccount:${serviceAccount.email}`],
        }, {parent: serviceAccount});

        const serviceAccountKey = new gcp.storage.HmacKey(`${saName}-hmac`, {
            serviceAccountEmail: serviceAccount.email
        }, {parent: this, additionalSecretOutputs: ["secret"]});

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
