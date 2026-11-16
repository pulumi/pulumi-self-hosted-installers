import { describe, it, before } from "node:test";
import * as assert from "node:assert/strict";

import * as mocks from "./mocks";

const recordType = "aws:route53/record:Record";
const getZone = "aws:route53/getZone:getZone";

const baseConfig = {
    route53ZoneName: "example.com",
    route53Subdomain: "pulumi",
    apiLoadBalancerDnsName: "internal-api.us-west-2.elb.amazonaws.com",
    apiLoadBalancerZoneId: "ZELBAPI",
    consoleLoadBalancerDnsName: "internal-console.us-west-2.elb.amazonaws.com",
    consoleLoadBalancerZoneId: "ZELBCONSOLE",
};

// the dns stage reads config and registers resources at import time, so each run loads it afresh
async function run(config: Record<string, unknown>): Promise<{ harness: mocks.Harness, outputs: any }> {
    const harness = await mocks.setup("dns", config);
    for (const key of Object.keys(require.cache)) {
        if (/[\\/]bin[\\/]dns[\\/]/.test(key)) {
            delete require.cache[key];
        }
    }
    const outputs = require("../dns/index");
    await harness.settle();
    return { harness, outputs };
}

function resolve(value: any): Promise<any> {
    return new Promise(done => value.apply ? value.apply(done) : done(value));
}

function assertRecords(harness: mocks.Harness, zoneId: string) {
    const api = harness.named(recordType, "pulumi-dns-api-record").inputs;
    const app = harness.named(recordType, "pulumi-dns-console-record").inputs;

    assert.equal(api.zoneId, zoneId);
    assert.equal(api.name, "api.pulumi.example.com");
    assert.equal(api.type, "A");
    assert.deepEqual(api.aliases, [{ name: baseConfig.apiLoadBalancerDnsName, zoneId: "ZELBAPI", evaluateTargetHealth: true }]);

    assert.equal(app.zoneId, zoneId);
    assert.equal(app.name, "app.pulumi.example.com");
    assert.deepEqual(app.aliases, [{ name: baseConfig.consoleLoadBalancerDnsName, zoneId: "ZELBCONSOLE", evaluateTargetHealth: true }]);
}

describe("dns", () => {
    it("private mode looks up the private hosted zone and aliases the internal ALBs", async () => {
        const { harness, outputs } = await run({ ...baseConfig, enablePrivateLoadBalancerAndLimitEgress: true, vpcId: mocks.vpcId });

        assert.deepEqual(harness.callsTo(getZone), [{ name: "example.com", privateZone: true, vpcId: mocks.vpcId }]);
        assertRecords(harness, "ZPRIVATE");
        assert.deepEqual(Object.keys(outputs).sort(), ["apiUrl", "consoleUrl"]);
        assert.equal(await resolve(outputs.apiUrl), "https://api.pulumi.example.com");
    });

    it("default looks up the zone without privateZone", async () => {
        const { harness, outputs } = await run(baseConfig);

        assert.deepEqual(harness.callsTo(getZone), [{ name: "example.com" }]);
        assertRecords(harness, "ZPUBLIC");
        assert.deepEqual(Object.keys(outputs).sort(), ["apiUrl", "consoleUrl"]);
        assert.equal(await resolve(outputs.consoleUrl), "https://app.pulumi.example.com");
    });

    it("skipDnsRecords creates nothing and outputs the CNAME targets", async () => {
        const { harness, outputs } = await run({ ...baseConfig, enablePrivateLoadBalancerAndLimitEgress: true, skipDnsRecords: true });

        assert.equal(harness.callsTo(getZone).length, 0);
        assert.equal(harness.ofType(recordType).length, 0);
        assert.deepEqual(outputs, {
            apiUrl: "https://api.pulumi.example.com",
            consoleUrl: "https://app.pulumi.example.com",
            apiLoadBalancerDnsName: baseConfig.apiLoadBalancerDnsName,
            consoleLoadBalancerDnsName: baseConfig.consoleLoadBalancerDnsName,
        });
    });
});
