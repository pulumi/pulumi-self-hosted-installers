import * as pulumi from "@pulumi/pulumi";

const pulumiConfig = new pulumi.Config();

export const config = {
    baseName: pulumiConfig.require("baseName"),
    // These may not be set - see Pulumi.README.yaml for more information.
    instanceRoleName: pulumiConfig.get("eksInstanceRoleName"), 
    instanceProfileName: pulumiConfig.get("instanceProfileName"),
    databaseMonitoringRoleArn: pulumiConfig.get("databaseMonitoringRoleArn"),
};
