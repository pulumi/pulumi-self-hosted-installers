import { PulumiDeployment } from "../pulumiDeployment";
import { expect } from "chai";
import * as upath from "upath";
import * as superagent from "superagent";
import { getLicenseKey } from "../helpers/utils";
import { pulumiProgram } from "../helpers/aks-helper";

const awsRegion = "us-west-2";
const azureLocation = "WestUS";
const stackName = "integration";

const subId = process.env["AZURE_SUBSCRIPTION_ID"];
if (!subId) {
    throw new Error("AZURE_SUBSCRIPTION_ID environment variable must be present");
}

const azureConfig = {
    "azure-native:location": { value: azureLocation },
    "azure-native:subscriptionId": { value: subId! }
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

const dnsHelper = new PulumiDeployment({
    stackName: stackName,
    projectName: "aks-dns-helper",
    pulumiProgram: pulumiProgram
});

const domain = "pulumi-dev.net";

before(async () => {

    const licenseKey = await getLicenseKey(awsRegion);

    await infra.update({
        ...azureConfig,
        "networkCidr": { value: "10.100.0.0/16" },
        "subnetCidr": { value: "10.100.0.0/24" },
    }, true);

    await kubernetes.update({
        ...azureConfig,
        "stackName1": { value: `${org}/k8s-azure-01-infrastructure/${stackName}` },
    }, true);

    const helper = await dnsHelper.update({
        ...azureConfig,
        "k8sStackRef": { value: `${org}/k8s-azure-02-kubernetes-cluster/${stackName}` },
        "resourceGroup": { value: "pulumi-dev-shared" },
        "zoneName": { value: domain }
    }, true);

    await apps.update({
        ...azureConfig,
        "stackName1": { value: `${org}/k8s-azure-01-infrastructure/${stackName}` },
        "stackName2": { value: `${org}/k8s-azure-02-kubernetes-cluster/${stackName}` },
        "imageTag": { value: "latest" },
        "licenseKey": { value: licenseKey },
        "apiDomain": { value: `api.aks.${domain}` },
        "consoleDomain": { value: `app.aks.${domain}` },
        "apiTlsKey": { value: helper["apiKey"].value },
        "apiTlsCert": { value: helper["apiCert"].value },
        "consoleTlsKey": { value: helper["consoleKey"].value },
        "consoleTlsCert": { value: helper["consoleCert"].value },
    }, true);    
});

after(async () => {
    await apps.destroy();

    await kubernetes.unprotectStateAll();
    await kubernetes.destroy();

    await infra.unprotectStateAll();
    await infra.destroy();

    await dnsHelper.destroy();
});

describe("Pulumi on Azure AKS Tests", () => {
    it("console home page should return a 200", async () => {
        const response = await superagent.get(`https://app.aks.${domain}`).disableTLSCerts();
        expect(response.statusCode).to.be.eq(200);
    });

    it("api status page should return a 200", async () => {
        const response = await superagent.get(`https://api.aks.${domain}/api/status`).disableTLSCerts();
        expect(response.statusCode).to.be.eq(200);
    });
})
