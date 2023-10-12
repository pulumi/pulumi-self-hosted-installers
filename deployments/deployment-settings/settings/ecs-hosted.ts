import * as pulumi from "@pulumi/pulumi";
import * as service from "@pulumi/pulumiservice";

const org = pulumi.getOrganization();
const projectList = ["infrastructure", "application", "dns"];
const stack = "test";

projectList.map(project => {
    new service.DeploymentSettings(`ecs-${project}-deploymentsettings`, {
        organization: org,
        project,
        stack: stack,
        sourceContext: {
            git: {
                repoDir: `ecs-hosted/ts/${project}`,
                repoUrl: "https://github.com/pulumi/pulumi-self-hosted-installers.git",
                branch: "refs/heads/setup-deployments"
            }
        }
    })
})