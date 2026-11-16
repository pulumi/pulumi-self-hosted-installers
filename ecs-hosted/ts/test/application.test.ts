import { describe, it, before } from "node:test";
import * as assert from "node:assert/strict";

import * as mocks from "./mocks";

const lbType = "aws:lb/loadBalancer:LoadBalancer";
const sgType = "aws:ec2/securityGroup:SecurityGroup";

const lbSecurityGroups = ["pulumi-tm-api-lb-lb-sg", "pulumi-tm-console-lb-lb-sg"];
const apiSg = "pulumi-service-api-service-sg";
const consoleSg = "pulumi-console-service-sg";
const migrationsSg = "pulumi-service-migrations-sg";
const dbSecurityGroupId = "sg-db";

const baseConfig = {
    acmCertificateArn: `arn:aws:acm:${mocks.region}:${mocks.accountId}:certificate/abc`,
    kmsServiceKeyId: "key-1234",
    licenseKey: "license",
    imageTag: "latest",
    domainName: "example.com",
    subDomain: "pulumi",
    vpcId: mocks.vpcId,
    privateSubnetIds: mocks.privateSubnetIds,
    isolatedSubnetIds: mocks.isolatedSubnetIds,
    dbClusterEndpoint: "pulumi.cluster-abc.us-west-2.rds.amazonaws.com",
    dbPort: 3306,
    dbName: "pulumi",
    dbSecurityGroupId: dbSecurityGroupId,
    dbUsername: "pulumi",
    dbPassword: "password",
};

async function run(config: Record<string, unknown>): Promise<mocks.Harness> {
    const harness = await mocks.setup("application", config);
    const program: () => Promise<unknown> = require("../application/index");
    await program();
    await harness.settle();
    return harness;
}

function ingressCidrs(harness: mocks.Harness, sgName: string): string[][] {
    return harness.named(sgType, sgName).inputs.ingress.map((rule: any) => rule.cidrBlocks);
}

function egress(harness: mocks.Harness, sgName: string): any[] {
    return harness.named(sgType, sgName).inputs.egress;
}

function hasRule(rules: any[], match: { port: number, prefixListIds?: string[], securityGroups?: string[] }): boolean {
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    return rules.some(rule =>
        rule.protocol === "tcp" &&
        rule.fromPort === match.port &&
        rule.toPort === match.port &&
        (!match.prefixListIds || same(rule.prefixListIds, match.prefixListIds)) &&
        (!match.securityGroups || same(rule.securityGroups, match.securityGroups)));
}

function assertPrivateEgress(rules: any[], prefixListId: string, expectDb: boolean) {
    assert.equal(mocks.opensToInternet(rules), false, "no 0.0.0.0/0 egress");
    assert.ok(rules.every(rule => rule.protocol === "tcp"), "no all-protocol egress");

    const vpc = (port: number) => rules.find(rule => rule.fromPort === port && rule.cidrBlocks);
    assert.deepEqual(vpc(443)?.cidrBlocks, mocks.vpcCidrBlocks);
    assert.deepEqual(vpc(80)?.cidrBlocks, mocks.vpcCidrBlocks);
    assert.ok(hasRule(rules, { port: 443, prefixListIds: [prefixListId] }), "443 to the S3 prefix list");
    assert.equal(hasRule(rules, { port: 3306, securityGroups: [dbSecurityGroupId] }), expectDb, "3306 to the DB security group");
    assert.equal(rules.length, expectDb ? 4 : 3);
}

describe("application, enablePrivateLoadBalancerAndLimitEgress", () => {
    let harness: mocks.Harness;

    before(async () => {
        // no publicSubnetIds and no endpointSecurityGroupId: neither is required in private mode
        harness = await run({ ...baseConfig, enablePrivateLoadBalancerAndLimitEgress: true });
    });

    it("creates internal ALBs in the private subnets", () => {
        const lbs = harness.ofType(lbType);
        assert.equal(lbs.length, 2);
        for (const lb of lbs) {
            assert.equal(lb.inputs.loadBalancerType, "application");
            assert.equal(lb.inputs.internal, true);
            assert.deepEqual(lb.inputs.subnets, mocks.privateSubnetIds);
        }
    });

    it("limits ALB ingress to the VPC CIDR blocks", () => {
        for (const sg of lbSecurityGroups) {
            assert.deepEqual(ingressCidrs(harness, sg), [mocks.vpcCidrBlocks, mocks.vpcCidrBlocks]);
        }
    });

    it("restricts API egress to the VPC, S3 and the database", () => {
        assertPrivateEgress(egress(harness, apiSg), mocks.s3PrefixListId, true);
    });

    it("restricts console egress to the VPC and S3", () => {
        assertPrivateEgress(egress(harness, consoleSg), mocks.s3PrefixListId, false);
    });

    it("restricts migrations egress to the VPC, S3 and the database", () => {
        assertPrivateEgress(egress(harness, migrationsSg), mocks.s3PrefixListId, true);
    });

    it("looks up the VPC and the S3 prefix list by name", () => {
        assert.deepEqual(harness.callsTo("aws:ec2/getVpc:getVpc").map(i => i.id), [mocks.vpcId]);
        assert.deepEqual(harness.callsTo("aws:ec2/getPrefixList:getPrefixList").map(i => i.name), [`com.amazonaws.${mocks.region}.s3`]);
    });
});

describe("application, private mode with whiteListCidrBlocks and s3EndpointPrefixId", () => {
    let harness: mocks.Harness;
    const whiteList = ["10.20.0.0/16"];

    before(async () => {
        harness = await run({
            ...baseConfig,
            enablePrivateLoadBalancerAndLimitEgress: true,
            whiteListCidrBlocks: whiteList,
            s3EndpointPrefixId: "pl-fromconfig",
        });
    });

    it("uses whiteListCidrBlocks for ALB ingress", () => {
        for (const sg of lbSecurityGroups) {
            assert.deepEqual(ingressCidrs(harness, sg), [whiteList, whiteList]);
        }
    });

    it("uses the configured prefix list without a lookup", () => {
        assertPrivateEgress(egress(harness, apiSg), "pl-fromconfig", true);
        assert.equal(harness.callsTo("aws:ec2/getPrefixList:getPrefixList").length, 0);
    });
});

describe("application, default (flag off)", () => {
    let harness: mocks.Harness;

    before(async () => {
        harness = await run({ ...baseConfig, publicSubnetIds: mocks.publicSubnetIds, endpointSecurityGroupId: "sg-endpoints" });
    });

    it("creates internet-facing ALBs in the public subnets", () => {
        const lbs = harness.ofType(lbType);
        assert.equal(lbs.length, 2);
        for (const lb of lbs) {
            assert.equal(lb.inputs.internal, false);
            assert.deepEqual(lb.inputs.subnets, mocks.publicSubnetIds);
        }
    });

    it("allows ALB ingress from anywhere", () => {
        for (const sg of lbSecurityGroups) {
            assert.deepEqual(ingressCidrs(harness, sg), [["0.0.0.0/0"], ["0.0.0.0/0"]]);
        }
    });

    it("keeps all-traffic egress on the API, console and migrations security groups", () => {
        for (const sg of [apiSg, consoleSg, migrationsSg]) {
            assert.deepEqual(egress(harness, sg), [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] }]);
        }
    });

    it("does not look up the VPC", () => {
        assert.equal(harness.callsTo("aws:ec2/getVpc:getVpc").length, 0);
    });

    it("still requires publicSubnetIds", async () => {
        await assert.rejects(run(baseConfig), /publicSubnetIds/);
    });
});
