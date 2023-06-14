import { Config, StackReference } from "@pulumi/pulumi";
import { network, resources } from "@pulumi/azure-native";
import * as tls from "@pulumi/tls";

export const pulumiProgram = async () => {
    const config = new Config();
    const k8sStackRef = config.require("k8sStackRef");
    const resourceGroupName = config.require("resourceGroup");
    const zoneName = config.require("zoneName");

    const stackRef = new StackReference(k8sStackRef);

    const ip = stackRef.requireOutput("publicIp");
    const resourceGroup = await resources.getResourceGroup({
        resourceGroupName: resourceGroupName
    });

    const zone = await network.getZone({
        resourceGroupName: resourceGroup.name,
        zoneName: zoneName
    });

    new network.RecordSet("api-record", {
        relativeRecordSetName: "api.aks",
        resourceGroupName: resourceGroup.name,
        zoneName: zone.name,
        aRecords: [{
            ipv4Address: ip
        }],
        recordType: "A",
        ttl: 3600,
    });

    new network.RecordSet("ui-record", {
        relativeRecordSetName: "app.aks",
        resourceGroupName: resourceGroup.name,
        zoneName: zone.name,
        aRecords: [{
            ipv4Address: ip
        }],
        recordType: "A",
        ttl: 3600,
    });

    const apiKey = new tls.PrivateKey("api-key", {
        rsaBits: 4096,
        algorithm: "RSA"
    });

    const consoleKey = new tls.PrivateKey("console-key", {
        rsaBits: 4096,
        algorithm: "RSA"
    });

    const apiCert = new tls.SelfSignedCert("api-cert", {
        privateKeyPem: apiKey.privateKeyPem,
        subject: {
            commonName: "api.aks.pulumi-dev.net",
        },
        dnsNames: [
            "api.aks.pulumi-dev.net",
        ],
        allowedUses: [
            "key_encipherment",
            "digital_signature",
            "server_auth",
        ],
        validityPeriodHours: 24 * 10,
    });

    const consoleCert = new tls.SelfSignedCert("console-cert", {
        privateKeyPem: consoleKey.privateKeyPem,
        subject: {
            commonName: "app.aks.pulumi-dev.net",
        },
        dnsNames: [
            "app.aks.pulumi-dev.net",
        ],
        allowedUses: [
            "key_encipherment",
            "digital_signature",
            "server_auth",
        ],
        validityPeriodHours: 24 * 10,
    });

    return {
        apiCert: apiCert.certPem,
        apiKey: apiKey.privateKeyPem,
        consoleCert: consoleCert.certPem,
        consoleKey: consoleKey.privateKeyPem
    };
};