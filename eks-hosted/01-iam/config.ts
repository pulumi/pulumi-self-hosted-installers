import * as pulumi from "@pulumi/pulumi";

const pulumiConfig = new pulumi.Config();

export const config = {
    baseName: pulumiConfig.require("baseName"),
    // Optional: If bringing your own IAM configs - see Pulumi.README.yaml
    eksServiceRoleName: pulumiConfig.get("eksServiceRoleName"),
    eksInstanceRoleName: pulumiConfig.get("eksInstanceRoleName"), 
    databaseMonitoringRoleArn: pulumiConfig.get("databaseMonitoringRoleArn"),
    // SSO role ARN for Pulumi CLI authentication (passed through)
    ssoRoleArn: pulumiConfig.get("ssoRoleArn"),
};
