import * as pulumi from "@pulumi/pulumi";

const pulumiConfig = new pulumi.Config();

export const config = {
    baseName: pulumiConfig.require("baseName"),
    ssoRoleArn: pulumiConfig.require("ssoRoleArn"),
};
