import * as pulumi from "@pulumi/pulumi";
import * as service from "@pulumi/pulumiservice";

const org = pulumi.getOrganization();
const project = "deployment-settings";
const stack = "test";

// these are the deployment settings for THIS project

new service.DeploymentSettings(`${project}`, {
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