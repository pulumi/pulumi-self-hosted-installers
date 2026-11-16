import { describe, it, before } from "node:test";
import * as assert from "node:assert/strict";

import * as mocks from "./mocks";

const endpointType = "aws:ec2/vpcEndpoint:VpcEndpoint";

const baseConfig = {
    vpcId: mocks.vpcId,
    privateSubnetIds: mocks.privateSubnetIds,
    isolatedSubnetIds: mocks.isolatedSubnetIds,
};

async function run(config: Record<string, unknown>): Promise<{ harness: mocks.Harness, outputs: any }> {
    const harness = await mocks.setup("infrastructure", config);
    const program: () => Promise<any> = require("../infrastructure/index");
    const outputs = await program();
    await harness.settle();
    return { harness, outputs };
}

describe("infrastructure, VPC endpoints enabled (default), no publicSubnetIds", () => {
    let harness: mocks.Harness;
    let outputs: any;

    before(async () => {
        ({ harness, outputs } = await run(baseConfig));
    });

    it("associates the S3 gateway endpoint with the private and isolated route tables", () => {
        const s3 = harness.named(endpointType, "pulumiselfhosted-s3-endpoint");
        assert.equal(s3.inputs.vpcEndpointType, "Gateway");
        assert.equal(s3.inputs.serviceName, `com.amazonaws.${mocks.region}.s3`);
        // subnet-iso-b has no explicit association, so the main route table is included
        assert.deepEqual(s3.inputs.routeTableIds, ["rtb-iso", mocks.mainRouteTableId, "rtb-priv-a", "rtb-priv-b"]);
    });

    it("creates the interface endpoints, including KMS and CloudWatch Logs, in the private subnets", () => {
        const interfaces = harness.ofType(endpointType).filter(e => e.inputs.vpcEndpointType === "Interface");
        assert.deepEqual(interfaces.map(e => e.inputs.serviceName).sort(), [
            "ecr.api", "ecr.dkr", "kms", "logs", "secretsmanager", "ssm",
        ].map(s => `com.amazonaws.${mocks.region}.${s}`));
        for (const endpoint of interfaces) {
            assert.equal(endpoint.inputs.privateDnsEnabled, true);
            assert.deepEqual(endpoint.inputs.subnetIds, mocks.privateSubnetIds);
        }
    });

    it("exports an empty publicSubnetIds", async () => {
        const value = await new Promise(resolve => outputs.publicSubnetIds.apply(resolve));
        assert.deepEqual(value, []);
    });
});

describe("infrastructure, enableVpcEndpoints=false", () => {
    let harness: mocks.Harness;

    before(async () => {
        ({ harness } = await run({ ...baseConfig, publicSubnetIds: mocks.publicSubnetIds, enableVpcEndpoints: false }));
    });

    it("creates no endpoints and looks up no route tables", () => {
        assert.equal(harness.ofType(endpointType).length, 0);
        assert.equal(harness.callsTo("aws:ec2/getRouteTables:getRouteTables").length, 0);
    });
});
