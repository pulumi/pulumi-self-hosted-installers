import { PulumiDeployment } from "../pulumiDeployment";
import { pulumiProgram } from "../helpers/ecs-helper";
import { expect } from "chai";
import * as upath from "upath";
import * as superagent from "superagent";
import { getLicenseKey } from "../helpers/utils";

const awsRegion = "us-west-2";
const azureLocation = "WestUS";
const stackName = "integration";
const azureConfig = {
    "azure-native:location": { value: azureLocation },
    "azure-native:subscriptionId": { value: "" }
};

const org = "team-ce";

const baseDir = upath.joinSafe(__dirname, "../../aks-hosted");
const infra = new PulumiDeployment({
    stackName: stackName,
    workDir: upath.joinSafe(baseDir, "01-infrastructure")
});

const kubernetes = new PulumiDeployment({
    stackName: stackName,
    workDir: upath.joinSafe(baseDir, "02-kubernetes")
});

const apps = new PulumiDeployment({
    stackName: stackName,
    workDir: upath.joinSafe(baseDir, "03-application")
});

const domain = "pulumi-ce.team";
const subDomain = "ecsintegration";

before(async () => {

    const licenseKey = await getLicenseKey(awsRegion);

    await infra.update({
        ...azureConfig,
        "networkCidr": { value: "10.100.0.0/16" },
        "subnetCidr": { value: "10.100.0.0/24" },
    });

    await kubernetes.update({
        ...azureConfig,
        "stackName1": { value: `${org}/01-infrastructure/${stackName}` },
    });

    await apps.update({
        ...azureConfig,
        "stackName1": { value: `${org}/01-infrastructure/${stackName}` },
        "stackName2": { value: `${org}/02-kubernetes/${stackName}` },
        "imageTag": { value: "latest" },
        "licenseKey": { value: licenseKey },
        "apiDomain": { value: "apiaks.pulumi-ce.team" },
        "consoleDomain": { value: "consoleaks.pulumi-ce.team" },

    });
});

after(async () => {
    await apps.destroy();

    await kubernetes.unprotectStateAll();
    await kubernetes.destroy();

    await infra.unprotectStateAll();
    await infra.destroy();

    //await ecsHelper.destroy();
});

describe("Pulumi on AWS ECS Tests", () => {
    it("console home page should return a 200", async () => {
        const outputs = await dns.getOutputs();
        const url = outputs["consoleUrl"].value;
        expect(url).to.be.a("string");

        const response = await superagent.get(url);
        expect(response.statusCode).to.be.eq(200);
    });

    it("api status page should return a 200", async () => {
        const outputs = await dns.getOutputs();
        const url = outputs["apiUrl"].value;
        expect(url).to.be.a("string");

        const response = await superagent.get(`${url}/api/status`);
        expect(response.statusCode).to.be.eq(200);
    });
})
