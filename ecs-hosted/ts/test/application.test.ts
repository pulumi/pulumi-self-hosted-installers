import { describe, it, before } from "node:test";
import * as assert from "node:assert/strict";

import * as mocks from "./mocks";

const lbType = "aws:lb/loadBalancer:LoadBalancer";
const sgType = "aws:ec2/securityGroup:SecurityGroup";
const taskDefType = "aws:ecs/taskDefinition:TaskDefinition";

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

function apiEnvironment(harness: mocks.Harness): Record<string, string> {
    const definitions = JSON.parse(harness.named(taskDefType, "pulumi-service-api-task-def").inputs.containerDefinitions);
    return Object.fromEntries(definitions[0].environment.map((e: any) => [e.name, e.value]));
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

describe("application, private mode with httpsProxy", () => {
    let harness: mocks.Harness;
    const proxyConfig = {
        ...baseConfig,
        enablePrivateLoadBalancerAndLimitEgress: true,
        httpsProxy: "http://proxy.internal.example:3128",
        noProxy: [".corp.example"],
        smtpServer: "email-smtp.us-west-2.amazonaws.com:587",
        opensearchEndpoint: "https://vpc-pulumi-abc.us-west-2.es.amazonaws.com",
    };

    before(async () => {
        harness = await run(proxyConfig);
    });

    it("sets the proxy variables on the API container", () => {
        const env = apiEnvironment(harness);
        assert.equal(env.HTTPS_PROXY, "http://proxy.internal.example:3128");
        assert.equal(env.HTTP_PROXY, "http://proxy.internal.example:3128");
        assert.deepEqual(env.NO_PROXY.split(","), [
            "localhost",
            "127.0.0.1",
            "169.254.169.254",
            "169.254.170.2",
            ...mocks.vpcCidrBlocks,
            "s3.amazonaws.com",
            "s3.us-west-2.amazonaws.com",
            "kms.us-west-2.amazonaws.com",
            "secretsmanager.us-west-2.amazonaws.com",
            "pulumi.cluster-abc.us-west-2.rds.amazonaws.com",
            "vpc-pulumi-abc.us-west-2.es.amazonaws.com",
            "api.pulumi.example.com",
            "app.pulumi.example.com",
            ".corp.example",
        ]);
    });

    it("opens the proxy port to the VPC on the API security group only", () => {
        const proxyRule = (sg: string) => egress(harness, sg).find(rule => rule.fromPort === 3128);
        assert.deepEqual(proxyRule(apiSg)?.cidrBlocks, mocks.vpcCidrBlocks);
        assert.equal(proxyRule(consoleSg), undefined);
        assert.equal(proxyRule(migrationsSg), undefined);
    });

    it("opens the SMTP port to the VPC on the API security group", () => {
        const smtpRule = egress(harness, apiSg).find(rule => rule.fromPort === 587);
        assert.deepEqual(smtpRule?.cidrBlocks, mocks.vpcCidrBlocks);
    });

    it("rejects a proxy without a scheme", async () => {
        await assert.rejects(run({ ...proxyConfig, httpsProxy: "proxy.internal.example:3128" }), /httpsProxy/);
    });
});

describe("application, consoleDesiredNumberTasks", () => {
    const flagOff = { ...baseConfig, publicSubnetIds: mocks.publicSubnetIds, endpointSecurityGroupId: "sg-endpoints" };
    const desiredCount = async (config: Record<string, unknown>) =>
        (await run(config)).named("aws:ecs/service:Service", "pulumi-console-service").inputs.desiredCount;

    it("reads the correct key, then the historical misspelled one", async () => {
        assert.equal(await desiredCount({ ...flagOff, consoleDesiredNumberTasks: 4 }), 4);
        assert.equal(await desiredCount({ ...flagOff, consoleDesirecNumberTasks: 2 }), 2);
        assert.equal(await desiredCount({ ...flagOff, consoleDesiredNumberTasks: 4, consoleDesirecNumberTasks: 2 }), 4);
        assert.equal(await desiredCount(flagOff), 1);
    });
});

describe("application, imagePrefix (ECR pull-through cache)", () => {
    const flagOff = { ...baseConfig, publicSubnetIds: mocks.publicSubnetIds, endpointSecurityGroupId: "sg-endpoints" };
    const taskDefinitions = ["pulumi-service-api-task-def", "pulumi-console-task-def", "pulumi-service-migrations-task-def"];
    const images = (harness: mocks.Harness) => taskDefinitions.map(name =>
        JSON.parse(harness.named(taskDefType, name).inputs.containerDefinitions)[0].image);
    const importPolicies = (harness: mocks.Harness) => harness.ofType("aws:iam/rolePolicy:RolePolicy")
        .filter(p => String(p.inputs.policy).includes("ecr:BatchImportUpstreamImage"));

    it("puts the prefix between the registry and pulumi/<image>, normalizing slashes", async () => {
        for (const imagePrefix of ["docker-hub", "/docker-hub/"]) {
            assert.deepEqual(images(await run({ ...flagOff, imagePrefix })), ["service", "console", "migrations"].map(image =>
                `${mocks.accountId}.dkr.ecr.${mocks.region}.amazonaws.com/docker-hub/pulumi/${image}:latest`));
        }
    });

    it("keeps the master image URIs when unset", async () => {
        const harness = await run(flagOff);
        assert.deepEqual(images(harness), ["service", "console", "migrations"].map(image =>
            `${mocks.accountId}.dkr.ecr.${mocks.region}.amazonaws.com/pulumi/${image}:latest`));
        assert.equal(importPolicies(harness).length, 0);
    });

    it("ecrPullThroughCacheImport grants the import permissions on the prefixed repos to all three roles", async () => {
        const harness = await run({ ...flagOff, imagePrefix: "docker-hub", ecrRepoAccountId: "210987654321", ecrPullThroughCacheImport: true });
        const policies = importPolicies(harness);
        assert.deepEqual(policies.map(p => p.name).sort(), [
            "pulumi-console-execution-role-att-0",
            "pulumi-service-api-execution-role-att-0",
            "pulumi-service-migrations-migration-pull-through-cache-pol",
        ]);
        for (const policy of policies) {
            assert.deepEqual(JSON.parse(policy.inputs.policy).Statement, [{
                Effect: "Allow",
                Action: ["ecr:BatchImportUpstreamImage", "ecr:CreateRepository"],
                Resource: `arn:aws:ecr:${mocks.region}:210987654321:repository/docker-hub/pulumi/*`,
            }]);
        }
    });

    it("rejects ecrPullThroughCacheImport without imagePrefix", async () => {
        await assert.rejects(run({ ...flagOff, ecrPullThroughCacheImport: true }), /imagePrefix/);
    });
});

describe("application, API task role KMS permissions", () => {
    it("grants the four actions the self-hosting docs require", async () => {
        const harness = await run({ ...baseConfig, publicSubnetIds: mocks.publicSubnetIds, endpointSecurityGroupId: "sg-endpoints" });
        const policy = JSON.parse(harness.named("aws:iam/rolePolicy:RolePolicy", "pulumi-service-api-task-role-att-1").inputs.policy);
        assert.deepEqual(policy.Statement, [{
            Effect: "Allow",
            Action: ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey", "kms:GenerateDataKeyWithoutPlaintext"],
            Resource: [`arn:aws:kms:${mocks.region}:${mocks.accountId}:key/key-1234`],
        }]);
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

    it("sets no proxy variables", () => {
        const env = apiEnvironment(harness);
        for (const name of ["HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY"]) {
            assert.equal(env[name], undefined);
        }
    });

    it("still requires publicSubnetIds and endpointSecurityGroupId", async () => {
        await assert.rejects(run({ ...baseConfig, endpointSecurityGroupId: "sg-endpoints" }), /publicSubnetIds/);
        await assert.rejects(run({ ...baseConfig, publicSubnetIds: mocks.publicSubnetIds }), /endpointSecurityGroupId/);
    });
});
