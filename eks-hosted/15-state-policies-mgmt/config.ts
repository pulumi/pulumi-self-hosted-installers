import * as pulumi from "@pulumi/pulumi";

const pulumiConfig = new pulumi.Config();

// Build the config object used by the code
export const config = {
    baseName: pulumiConfig.require("baseName"),
    checkpointsS3BucketName: pulumiConfig.get("checkpointsS3BucketName"),
    checkpointsS3BucketNameV2: pulumiConfig.get("checkpointsS3BucketNameV2"),
    policyPacksS3BucketName: pulumiConfig.get("policyPacksS3BucketName"),
    eventsS3BucketName: pulumiConfig.get("eventsS3BucketName"),
    eventsS3BucketNameV2: pulumiConfig.get("eventsS3BucketNameV2"),
};



