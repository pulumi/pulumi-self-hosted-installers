import * as pulumi from "@pulumi/pulumi";

const pulumiConfig = new pulumi.Config();

export const config = {
    baseName: pulumiConfig.require("baseName"),
    ssoRoleArn: pulumiConfig.require("ssoRoleArn"),
    // Optional: If bringing your own IAM configs - see Pulumi.README.yaml
    eksServiceRoleName: pulumiConfig.get("eksServiceRoleName"),
    eksInstanceRoleName: pulumiConfig.get("eksInstanceRoleName"), 
    databaseMonitoringRoleArn: pulumiConfig.get("databaseMonitoringRoleArn"),
};
