import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { config } from "./config";

const baseName = config.baseName 

///////////////
// Create S3 Buckets for the service checkpoints and policy packs and events.
const checkpointsBucket = new aws.s3.Bucket(`${baseName}-checkpoints`, {}, { protect: true});
const policyPacksBucket = new aws.s3.Bucket(`${baseName}-policypacks`, {}, { protect: true});
const eventsBucket = new aws.s3.Bucket(`${baseName}-events`, {}, { protect: true});

export const checkpointsS3BucketName = checkpointsBucket.id;
export const policyPacksS3BucketName = policyPacksBucket.id;
export const eventsS3BucketName = eventsBucket.id;