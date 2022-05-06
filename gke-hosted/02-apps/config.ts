import * as pulumi from "@pulumi/pulumi";

const pulumiConfig = new pulumi.Config();

const baseInfraStrack = new pulumi.StackReference(pulumiConfig.require("baseInfraStackName"))

export const config = {
    baseName: pulumiConfig.get("baseName") || "gke-hosted",
    kubeconfig: baseInfraStrack.requireOutput("kubeconfig"),
    dbUser: baseInfraStrack.requireOutput("dbUser"),
    dbPassword: baseInfraStrack.requireOutput("dbPassword"),
};
