import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import * as mocks from "./mocks";

/*
Flag-off parity: with enablePrivateLoadBalancerAndLimitEgress unset, every stage must register exactly the resources
(including component args), make exactly the invokes and return exactly the outputs that origin/master 27127eef does.

Allowlisted differences from master, each a deliberate fix that applies to every install (see allowlistedFixes):
- the OpenSearch master password (infrastructure) now sets minUpper/minLower/minNumeric/minSpecial = 1, because
  OpenSearch rejects a password without every character class. ignoreChanges keeps existing installs from replacing it.
- the API task role KMS policy (application) now also grants kms:Encrypt and kms:GenerateDataKey, which the service
  needs to create ESC environment keys (self-hosting docs, components/api.md "Encryption services").

fixtures/flag-off-parity.json holds a sha256 of each stage's canonical recording. It was produced by compiling this file
against the origin/master sources and running it with PARITY_FIXTURE_UPDATE=<path to the fixture>. On a mismatch the
current recording is written to test/bin/test/parity-<stage>.actual.json; diff it against one produced on master.
*/

// compiled to test/bin/test/, the fixture lives in test/fixtures/
const fixturePath = path.join(__dirname, "..", "..", "fixtures", "flag-off-parity.json");

const configs: Record<string, Record<string, unknown>> = {
    infrastructure: {
        vpcId: mocks.vpcId,
        publicSubnetIds: mocks.publicSubnetIds,
        privateSubnetIds: mocks.privateSubnetIds,
        isolatedSubnetIds: mocks.isolatedSubnetIds,
        enableOpenSearch: true,
    },
    application: {
        acmCertificateArn: `arn:aws:acm:${mocks.region}:${mocks.accountId}:certificate/abc`,
        kmsServiceKeyId: "key-1234",
        licenseKey: "license",
        imageTag: "latest",
        domainName: "example.com",
        subDomain: "pulumi",
        vpcId: mocks.vpcId,
        privateSubnetIds: mocks.privateSubnetIds,
        publicSubnetIds: mocks.publicSubnetIds,
        isolatedSubnetIds: mocks.isolatedSubnetIds,
        dbClusterEndpoint: "pulumi.cluster-abc.us-west-2.rds.amazonaws.com",
        dbPort: 3306,
        dbName: "pulumi",
        dbSecurityGroupId: "sg-db",
        dbUsername: "pulumi",
        dbPassword: "password",
        endpointSecurityGroupId: "sg-endpoints",
        whiteListCidrBlocks: ["192.168.0.0/16"],
        opensearchUser: "admin",
        opensearchPassword: "password",
        opensearchEndpoint: "https://vpc-pulumi-abc.us-west-2.es.amazonaws.com",
        opensearchDomainName: "pulumi",
        samlCertPublicKey: "public",
        samlCertPrivateKey: "private",
        smtpServer: "email-smtp.us-west-2.amazonaws.com:587",
        smtpUsername: "user",
        smtpPassword: "password",
        // the historical misspelled key must keep working
        consoleDesirecNumberTasks: 2,
    },
    dns: {
        route53ZoneName: "example.com",
        route53Subdomain: "pulumi",
        apiLoadBalancerDnsName: "api.us-west-2.elb.amazonaws.com",
        apiLoadBalancerZoneId: "ZELBAPI",
        consoleLoadBalancerDnsName: "console.us-west-2.elb.amazonaws.com",
        consoleLoadBalancerZoneId: "ZELBCONSOLE",
    },
};

// Every opt-in key this branch adds, set to its "off" value; the recording must still match master.
const explicitlyOff: Record<string, Record<string, unknown>> = {
    infrastructure: { enablePrivateLoadBalancerAndLimitEgress: false },
    application: {
        enablePrivateLoadBalancerAndLimitEgress: false,
        imagePrefix: "",
        ecrPullThroughCacheImport: false,
        enableEngineEventsBucket: false,
        enableRegistryBuckets: false,
        httpsProxy: "",
        noProxy: [],
    },
    dns: { enablePrivateLoadBalancerAndLimitEgress: false, skipDnsRecords: false },
};

// Removes exactly the allowlisted fix inputs (with exactly the expected values) before hashing, so the rest of the
// recording is still compared with master. Unit tests in infrastructure.test.ts assert the fix itself.
function allowlistedFixes(resources: mocks.Recorded[]): mocks.Recorded[] {
    const passwordFix: Record<string, unknown> = { minUpper: 1, minLower: 1, minNumeric: 1, minSpecial: 1 };

    // The KMS policy JSON appears in the API task role policy and, as task definition args, in the API container
    // service component. Swap exactly the fixed action list back to master's in those two resources only.
    const kmsFixed = '"Action":["kms:Encrypt","kms:Decrypt","kms:GenerateDataKey","kms:GenerateDataKeyWithoutPlaintext"]';
    const kmsMaster = '"Action":["kms:Decrypt","kms:GenerateDataKeyWithoutPlaintext"]';
    const kmsResources = ["aws:iam/rolePolicy:RolePolicy::pulumi-service-api-task-role-att-1", "pulumi:containerService::pulumi-service-api"];
    const swapKmsActions = (value: any): any =>
        typeof value === "string" ? value.split(kmsFixed).join(kmsMaster) :
        Array.isArray(value) ? value.map(swapKmsActions) :
        value && Object.getPrototypeOf(value) === Object.prototype ?
            Object.fromEntries(Object.entries(value).map(([k, v]) => [k, swapKmsActions(v)])) :
        value;

    return resources.map(r => {
        if (r.type === "random:index/randomPassword:RandomPassword" && r.name === "pulumiselfhosted-ressearch-pw") {
            const inputs = Object.fromEntries(Object.entries(r.inputs).filter(([k, v]) => passwordFix[k] !== v));
            return { ...r, inputs };
        }

        if (kmsResources.includes(`${r.type}::${r.name}`)) {
            return { ...r, inputs: swapKmsActions(r.inputs) };
        }

        return r;
    });
}

// JSON with sorted object keys, so key order (irrelevant to Pulumi) does not change the hash
function canonical(value: unknown): string {
    return JSON.stringify(value, (_key, v) => v && typeof v === "object" && !Array.isArray(v) ?
        Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) :
        v, 2);
}

async function resolveOutput(value: any): Promise<unknown> {
    if (value && typeof value.apply === "function" && value.isKnown) {
        return await value.isKnown ? await value.promise() : "<unknown>";
    }
    return value;
}

async function record(stage: string, config: Record<string, unknown>) {
    const harness = await mocks.setup(stage, config);
    if (stage === "dns") {
        // the dns stage reads config and registers resources at import time
        for (const key of Object.keys(require.cache)) {
            if (/[\\/]bin[\\/]dns[\\/]/.test(key)) {
                delete require.cache[key];
            }
        }
    }
    const stageModule = require(`../${stage}/index`);
    const outputs = typeof stageModule === "function" ? await stageModule() : stageModule;
    await harness.settle();

    const keys = Object.keys(outputs ?? {}).sort();
    const values = await Promise.all(keys.map(k => resolveOutput(outputs[k])));

    const recording = canonical({
        resources: allowlistedFixes(harness.resources)
            .map(r => ({ type: r.type, name: r.name, inputs: r.inputs }))
            .sort((a, b) => `${a.type}::${a.name}`.localeCompare(`${b.type}::${b.name}`)),
        invokes: harness.calls.map(c => canonical(c)).sort(),
        outputs: Object.fromEntries(keys.map((k, i) => [k, values[i]])),
    });

    return {
        resources: harness.resources.length,
        invokes: harness.calls.length,
        sha256: crypto.createHash("sha256").update(recording).digest("hex"),
        recording,
    };
}

describe("flag-off parity with master", () => {
    const updatePath = process.env.PARITY_FIXTURE_UPDATE;
    const expected = updatePath ? undefined : JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    const recorded: Record<string, unknown> = {};

    for (const stage of ["infrastructure", "application", "dns"]) {
        it(stage, async () => {
            const { recording, ...summary } = await record(stage, configs[stage]);
            recorded[stage] = summary;

            if (updatePath) {
                return;
            }

            if (summary.sha256 !== expected.stages[stage].sha256) {
                fs.writeFileSync(path.join(__dirname, `parity-${stage}.actual.json`), recording);
            }
            assert.deepEqual(summary, expected.stages[stage]);
        });
    }

    for (const stage of ["infrastructure", "application", "dns"]) {
        it(`${stage}, new keys explicitly off`, { skip: !!updatePath }, async () => {
            const { recording, ...summary } = await record(stage, { ...configs[stage], ...explicitlyOff[stage] });
            if (summary.sha256 !== expected.stages[stage].sha256) {
                fs.writeFileSync(path.join(__dirname, `parity-${stage}-explicitly-off.actual.json`), recording);
            }
            assert.deepEqual(summary, expected.stages[stage]);
        });
    }

    it("writes the fixture when PARITY_FIXTURE_UPDATE is set", { skip: !updatePath }, () => {
        fs.writeFileSync(updatePath!, JSON.stringify({ source: process.env.PARITY_FIXTURE_SOURCE, stages: recorded }, null, 4) + "\n");
    });
});
