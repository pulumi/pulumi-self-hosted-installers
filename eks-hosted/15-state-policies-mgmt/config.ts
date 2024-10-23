import * as pulumi from "@pulumi/pulumi";

const pulumiConfig = new pulumi.Config();

// Build the config object used by the code
export const config = {
    baseName: pulumiConfig.require("baseName"),
    checkpointsS3BucketName: pulumiConfig.get("checkpointsS3BucketName"),
    policyPacksS3BucketName: pulumiConfig.get("policyPacksS3BucketName"),
    eventsS3BucketName: pulumiConfig.get("eventsS3BucketName"),
};



