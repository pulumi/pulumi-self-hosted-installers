import * as pulumi from "@pulumi/pulumi";

const pulumiConfig = new pulumi.Config();

// Build the config object used by the code
export const config = {
    baseName: pulumiConfig.require("baseName"),

    // Optional: If bringing your own ESC bucket configs - see Pulumi.README.yaml
    escBucketName: pulumiConfig.get("escBucketName"),
};
