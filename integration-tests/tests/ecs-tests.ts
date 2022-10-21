import { PulumiDeployment } from "../pulumiDeployment";
import { pulumiProgram } from "../helpers/ecs-helper";
import { expect } from "chai";
import * as upath from "upath";
import * as superagent from "superagent";

const stackName = "integration";
const awsConfig = {
    "aws:region": { value: "us-west-2" },
    "aws:profile": { value: "pulumi-ce" }
};

const org = "team-ce";

const ecsHelper = new PulumiDeployment({
    stackName: stackName,
    projectName: "ecs-helper",
    pulumiProgram: pulumiProgram
});

const baseDir = upath.joinSafe(__dirname, "../../ecs-hosted/go");
const infra = new PulumiDeployment({
    stackName: stackName,
    workDir: upath.joinSafe(baseDir, "infrastructure")
});

const app = new PulumiDeployment({
    stackName: stackName,
    workDir: upath.joinSafe(baseDir, "application")
});

const dns = new PulumiDeployment({
    stackName: stackName,
    workDir: upath.joinSafe(baseDir, "dns")
});

let deployments: PulumiDeployment[];

const licenseKey = process.env["PULUMI_LICENSE_KEY"] || "";
if (licenseKey === "") {
    throw new Error("PULUMI_LICENSE_KEY not detected and is required");
}

const domain = "pulumi-ce.team";
const subDomain = "ecsintegration";

before(async () => {
    const helperStack = await ecsHelper.update({
        ...awsConfig,
        "domainName": { value: `${subDomain}.${domain}` },
        "zoneName": { value: "pulumi-ce.team" }
    });

    await infra.update({
        ...awsConfig,
        "vpcId": { value: helperStack["vpcId"].value },
        "publicSubnetIds": { value: JSON.stringify(helperStack["publicSubnetIds"].value) },
        "privateSubnetIds": { value: JSON.stringify(helperStack["privateSubnetIds"].value) },
        "isolatedSubnetIds": { value: JSON.stringify(helperStack["privateSubnetIds"].value) },
    });

    await app.update({
        ...awsConfig,
        "baseStackReference": { value: `${org}/infrastructure-go/${stackName}` },
        "acmCertificateArn": { value: helperStack["acmCertificateArn"].value },
        "kmsServiceKeyId": { value: helperStack["kmsServiceKeyId"].value },
        "licenseKey": { value: licenseKey },
        "imageTag": { value: "latest" },
        "route53Subdomain": { value: "ecsintegration" },
        "route53ZoneName": { value: "pulumi-ce.team" },
    });

    await dns.update({
        ...awsConfig,
        "appStackReference": {value: `${org}/application-go/${stackName}`}
    });

    // add deployments in reverse order they were created, FIFO, so they are destroyed post test run
    deployments = [
        dns,
        app,
        infra,
        ecsHelper
    ];
});

after(async () => {
    // for (const deployment of deployments) {
    //     await deployment.destroy();
    // }
});

describe("Pulumi on AWS ECS Tests", () => {
    it("api status page should return a 200", async () => {
        const outputs = await dns.getOutputs();
        const url = outputs["consoleUrl"].value;
        expect(url).to.be.a("string");

        const response = await superagent.get(url);
        expect(response.statusCode).to.be.eq(200);
    });

    it("console should return a 200", async () => {
        const outputs = await dns.getOutputs();
        const url = outputs["apiUrl"].value;
        expect(url).to.be.a("string");

        const response = await superagent.get(`${url}/api/status`);
        expect(response.statusCode).to.be.eq(200);
    });
})