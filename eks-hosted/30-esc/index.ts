import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { config } from "./config";

const baseName = config.baseName 

///////////////
// Resources for ESC feature - which at this point is very minimal, but kept in a separate stack in case future features require more infrastructure..

// Create S3 Bucket for the ESC storage - if not using an existing bucket.
let escBucketName: pulumi.Output<string> | string
if (!config.escBucketName) {
    const escBucket = new aws.s3.Bucket(`${baseName}-esc`, {}, { protect: true});
    escBucketName = escBucket.id;
} else {
    escBucketName = config.escBucketName;
}

export { escBucketName };