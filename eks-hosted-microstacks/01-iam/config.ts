import * as pulumi from "@pulumi/pulumi";

const pulumiConfig = new pulumi.Config();

export const config = {
    baseName: pulumiConfig.require("baseName"),
    ssoRoleArn: pulumiConfig.require("ssoRoleArn"),
    // These may not be set - see Pulumi.README.yaml for more information.
    eksServiceRoleName: pulumiConfig.get("eksServiceRoleName"),
    eksInstanceRoleName: pulumiConfig.get("eksInstanceRoleName"), 
    instanceProfileName: pulumiConfig.get("instanceProfileName"),
    databaseMonitoringRoleArn: pulumiConfig.get("databaseMonitoringRoleArn"),
};
