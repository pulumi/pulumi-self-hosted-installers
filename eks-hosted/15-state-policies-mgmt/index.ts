import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { config } from "./config";

const baseName = config.baseName 

export let checkpointsS3BucketName; 
export let policyPacksS3BucketName; 
export let eventsS3BucketName; 

///////////////
// Use provided S3 bucket or create S3 Buckets as applicable.
if (checkpointsS3BucketName) {
  checkpointsS3BucketName = config.checkpointsS3BucketName;
} else {
  const checkpointsBucket = new aws.s3.Bucket(`${baseName}-checkpoints`, {}, { protect: true})
  checkpointsS3BucketName = checkpointsBucket.bucket;
} 

if (policyPacksS3BucketName) {
  policyPacksS3BucketName = config.policyPacksS3BucketName;
} else {  
  const policyPacksBucket = new aws.s3.Bucket(`${baseName}-policypacks`, {}, { protect: true});
  policyPacksS3BucketName = policyPacksBucket.bucket;
}

if (eventsS3BucketName) {
  eventsS3BucketName = config.eventsS3BucketName;
} else {
  const eventsBucket = new aws.s3.Bucket(`${baseName}-events`, {}, { protect: true});
  eventsS3BucketName = eventsBucket.bucket;
}
