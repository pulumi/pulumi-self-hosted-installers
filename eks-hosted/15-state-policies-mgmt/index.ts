import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { config } from "./config";

const baseName = config.baseName 

export let checkpointsS3BucketName; 
export let policyPacksS3BucketName; 
export let eventsS3BucketName; 
// "" when Registry storage is off, so existing stacks get no undefined-output warnings
export let registryPublicS3BucketName: pulumi.Input<string> = "";
export let registryPrivateS3BucketName: pulumi.Input<string> = "";

///////////////
// Use provided S3 bucket or create S3 Buckets as applicable.
if (config.checkpointsS3BucketName) {
  checkpointsS3BucketName = config.checkpointsS3BucketName;
} else {
  const checkpointsBucket = new aws.s3.Bucket(`${baseName}-checkpoints`, {}, { protect: true})
  checkpointsS3BucketName = checkpointsBucket.bucket;
} 

if (config.policyPacksS3BucketName) {
  policyPacksS3BucketName = config.policyPacksS3BucketName;
} else {  
  const policyPacksBucket = new aws.s3.Bucket(`${baseName}-policypacks`, {}, { protect: true});
  policyPacksS3BucketName = policyPacksBucket.bucket;
}

if (config.eventsS3BucketName) {
  eventsS3BucketName = config.eventsS3BucketName;
} else {
  const eventsBucket = new aws.s3.Bucket(`${baseName}-events`, {}, { protect: true});
  eventsS3BucketName = eventsBucket.bucket;
}

// Opt-in: Pulumi Registry needs its own public and private buckets (wired up in 90-pulumi-service
// when enableRegistryBuckets is set there too). Off by default, so existing stacks are unchanged.
if (config.registryPublicS3BucketName) {
  registryPublicS3BucketName = config.registryPublicS3BucketName;
} else if (config.enableRegistryBuckets) {
  const registryPublicBucket = new aws.s3.Bucket(`${baseName}-registry-public`, {}, { protect: true });
  registryPublicS3BucketName = registryPublicBucket.bucket;
}

if (config.registryPrivateS3BucketName) {
  registryPrivateS3BucketName = config.registryPrivateS3BucketName;
} else if (config.enableRegistryBuckets) {
  const registryPrivateBucket = new aws.s3.Bucket(`${baseName}-registry-private`, {}, { protect: true });
  registryPrivateS3BucketName = registryPrivateBucket.bucket;
}
