import * as pulumi from "@pulumi/pulumi";
import * as service from "@pulumi/pulumiservice";

const org = pulumi.getOrganization();
const project = "aws-setup";
const stack = "test";

new service.DeploymentSettings(`${project}-deploymentsettings`, {
    organization: org,
    project,
    stack: stack,
    sourceContext: {
        git: {
            repoDir: `deployments/${project}`,
            repoUrl: "https://github.com/pulumi/pulumi-self-hosted-installers.git",
            branch: "refs/heads/setup-deployments"
        }
    }
});