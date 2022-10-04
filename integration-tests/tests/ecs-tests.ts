import { PulumiDeployment } from "../pulumiDeployment";
import { pulumiProgram } from "../helpers/ecs-helper";
import * as upath from "upath";

const stackName = "ecs-integration";
const awsConfig = {
    "aws:region": { value: "us-west-2" },
    "aws:profile": { value: "pulumi-ce" }
}

const ecsHelper = new PulumiDeployment({
    stackName: stackName,
    projectName: "ecs-helper",
    pulumiProgram: pulumiProgram
});

const baseDir = upath.joinSafe(__dirname, "../../ecs-hosted/go/infrastructure");
const infra = new PulumiDeployment({
    stackName: stackName,
    workDir: upath.joinSafe(baseDir, "integration")
});

const app = new PulumiDeployment({
    stackName: stackName,
    workDir: upath.joinSafe(baseDir, "app")
});

const dns = new PulumiDeployment({
    stackName: stackName,
    workDir: upath.joinSafe(baseDir, "dns")
});

let deployments: PulumiDeployment[];

before(async () => {
    const helperStack = await ecsHelper.update({
        ...awsConfig
    });

    const infraStack = await infra.update({
        ...awsConfig,

    });

    const appStack = await app.update({
        ...awsConfig,
    });

    const dnsStack = await dns.update({
        ...awsConfig
    });

    // add deployments in reverse order they were created, FIFO, so they are destroyed post test run
    deployments = [
        dns,
        app,
        infra,
        ecsHelper
    ];
});

describe("Pulumi on AWS ECS Tests", () => {
    it("api status page should return a 200", async () => {

    });

    it("console should return a 200", async () => {

    });
})

after(async () => {
    for (const deployment of deployments) {
        await deployment.destroy();
    }
});