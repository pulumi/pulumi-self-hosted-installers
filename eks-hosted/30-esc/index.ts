import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { config } from "./config";

const baseName = config.baseName 

///////////////
// Resources for ESC feature - which at this point is very minimal, but kept in a separate stack in case future features require more infrastructure..

// Create S3 Bucket for the service checkpoints and policy packs.
const escBucket = new aws.s3.Bucket(`${baseName}-esc`, {}, { protect: true});
export const escBucketName = escBucket.id;