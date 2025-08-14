import * as pulumi from "@pulumi/pulumi";

const pulumiConfig = new pulumi.Config();

// Default to true for production, but allow tests to disable protection
const protectResources = pulumiConfig.getBoolean("protectResources") ?? true;

// Build the config object used by the code
export const config = {
    baseName: pulumiConfig.require("baseName"),
    checkpointsS3BucketName: pulumiConfig.get("checkpointsS3BucketName"),
    policyPacksS3BucketName: pulumiConfig.get("policyPacksS3BucketName"),
    eventsS3BucketName: pulumiConfig.get("eventsS3BucketName"),
    protectResources: protectResources,
};



