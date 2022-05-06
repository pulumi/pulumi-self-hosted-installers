import * as pulumi from "@pulumi/pulumi";

const pulumiConfig = new pulumi.Config();

export const config = {
    baseName: pulumiConfig.get("baseName") || "gke-hosted",
    dbInstanceType: pulumiConfig.get("dbInstanceType") || "db-g1-small",
    dbUser: pulumiConfig.get("dbUser") || "pulumi",
    clusterVersion: pulumiConfig.get("clusterVersion") || "1.21", 
};
