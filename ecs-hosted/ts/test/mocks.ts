import * as pulumi from "@pulumi/pulumi";

/*
Minimal harness for running a stage program against pulumi.runtime.setMocks.
Nothing talks to AWS: resources and invokes are recorded and answered with canned values.
Mocks run in preview mode, so the application stage skips launching the migrations task.
*/

export const accountId = "123456789012";
export const region = "us-west-2";
export const vpcId = "vpc-0123";
export const vpcCidrBlocks = ["10.0.0.0/16", "100.64.0.0/20"];
export const s3PrefixListId = "pl-s3lookup";
export const privateSubnetIds = ["subnet-priv-a", "subnet-priv-b"];
export const publicSubnetIds = ["subnet-pub-a", "subnet-pub-b"];
export const isolatedSubnetIds = ["subnet-iso-a", "subnet-iso-b"];

// subnet-iso-b has no explicit route table association and falls back to the main route table
const routeTablesBySubnet: Record<string, string[]> = {
    "subnet-priv-a": ["rtb-priv-a"],
    "subnet-priv-b": ["rtb-priv-b"],
    "subnet-iso-a": ["rtb-iso"],
    "subnet-iso-b": [],
};
export const mainRouteTableId = "rtb-main";

export interface Recorded {
    type: string;
    name: string;
    inputs: any;
}

export interface Harness {
    resources: Recorded[];
    calls: { token: string, inputs: any }[];
    ofType(type: string): Recorded[];
    named(type: string, name: string): Recorded;
    callsTo(token: string): any[];
    settle(): Promise<void>;
}

export async function setup(project: string, config: Record<string, unknown>): Promise<Harness> {
    const resources: Recorded[] = [];
    const calls: { token: string, inputs: any }[] = [];

    const allConfig: Record<string, string> = { "aws:region": region };
    for (const [key, value] of Object.entries(config)) {
        allConfig[key.includes(":") ? key : `${project}:${key}`] = typeof value === "string" ? value : JSON.stringify(value);
    }
    pulumi.runtime.setAllConfig(allConfig);

    await pulumi.runtime.setMocks({
        newResource(args: pulumi.runtime.MockResourceArgs): pulumi.runtime.MockResourceResult {
            resources.push({ type: args.type, name: args.name, inputs: args.inputs });

            const state: Record<string, any> = { ...args.inputs, arn: `arn:aws:mock:${region}:${accountId}:${args.name}` };
            switch (args.type) {
                case "aws:lb/loadBalancer:LoadBalancer":
                    state.dnsName = `${args.inputs.internal ? "internal-" : ""}${args.name}.${region}.elb.amazonaws.com`;
                    state.zoneId = "ZELB";
                    break;
                case "aws:s3/bucket:Bucket":
                    state.bucket = args.name;
                    break;
                case "aws:ec2/vpcEndpoint:VpcEndpoint":
                    state.prefixListId = "pl-s3endpoint";
                    break;
                case "aws:route53/record:Record":
                    state.fqdn = args.inputs.name;
                    break;
            }

            return { id: `${args.name}-id`, state };
        },

        call(args: pulumi.runtime.MockCallArgs): Record<string, any> {
            calls.push({ token: args.token, inputs: args.inputs });

            switch (args.token) {
                case "aws:index/getCallerIdentity:getCallerIdentity":
                    return { accountId, arn: `arn:aws:iam::${accountId}:user/test`, userId: "test", id: accountId };
                case "aws:ec2/getVpc:getVpc":
                    return {
                        id: args.inputs.id,
                        cidrBlock: vpcCidrBlocks[0],
                        cidrBlockAssociations: vpcCidrBlocks.map((cidrBlock, i) => ({ associationId: `assoc-${i}`, cidrBlock, state: "associated" })),
                    };
                case "aws:ec2/getPrefixList:getPrefixList":
                    return { id: args.inputs.prefixListId ?? s3PrefixListId, name: args.inputs.name ?? `com.amazonaws.${region}.s3`, cidrBlocks: [] };
                case "aws:ec2/getRouteTables:getRouteTables": {
                    const filter = args.inputs.filters[0];
                    const ids = filter.name === "association.main" ? [mainRouteTableId] : routeTablesBySubnet[filter.values[0]] ?? [];
                    return { id: region, ids, region, tags: {} };
                }
                case "aws:kms/getKey:getKey":
                    return { id: args.inputs.keyId, arn: `arn:aws:kms:${region}:${accountId}:key/${args.inputs.keyId}` };
                case "aws:ec2/getSecurityGroup:getSecurityGroup":
                    return { id: args.inputs.id, arn: `arn:aws:ec2:${region}:${accountId}:security-group/${args.inputs.id}` };
                case "aws:elb/getServiceAccount:getServiceAccount":
                    return { id: "elb", arn: "arn:aws:iam::797873946194:root" };
                case "aws:route53/getZone:getZone":
                    return { id: "zone", zoneId: args.inputs.privateZone ? "ZPRIVATE" : "ZPUBLIC", name: args.inputs.name };
                default:
                    return args.inputs;
            }
        },
    }, project, "test", true);

    const harness: Harness = {
        resources,
        calls,
        ofType: type => resources.filter(r => r.type === type),
        named(type, name) {
            const found = resources.find(r => r.type === type && r.name === name);
            if (!found) {
                throw new Error(`no ${type} named ${name}; have: ${harness.ofType(type).map(r => r.name).join(", ")}`);
            }
            return found;
        },
        callsTo: token => calls.filter(c => c.token === token).map(c => c.inputs),
        // registrations wait on outputs of other resources and invokes; wait until nothing new shows up for a while
        async settle() {
            let last = -1;
            let stable = 0;
            while (stable < 10) {
                await new Promise(resolve => setTimeout(resolve, 10));
                const now = resources.length + calls.length;
                stable = now === last ? stable + 1 : 0;
                last = now;
            }
        },
    };

    return harness;
}

// egress rules allowing everything to 0.0.0.0/0
export function opensToInternet(rules: any[] | undefined): boolean {
    return (rules ?? []).some(rule => (rule.cidrBlocks ?? []).includes("0.0.0.0/0"));
}
