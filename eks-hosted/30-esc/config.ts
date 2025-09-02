import * as pulumi from "@pulumi/pulumi";

const pulumiConfig = new pulumi.Config();

// Default to true for production, but allow tests to disable protection
const protectResources = pulumiConfig.getBoolean("protectResources") ?? true;

// Build the config object used by the code
export const config = {
    baseName: pulumiConfig.require("baseName"),

    // Optional: If bringing your own ESC bucket configs - see Pulumi.README.yaml
    escBucketName: pulumiConfig.get("escBucketName"),
    
    // Protection settings
    protectResources: protectResources,
};
