import * as esc from "@pulumi/esc-sdk";
import * as yaml from "yaml";
import { promises as fs } from "fs";

export const getIamPolicyArn = (region: string, policyArn: string): string => {
    let policy = policyArn;

    const regionLower = region.toLocaleLowerCase();
    if (regionLower === "us-gov-west-1" || regionLower === "us-gov-east-1") {
        const splits = policyArn.split(":");
        splits[1] = "aws-us-gov";

        policy = splits.join(":");
    }

    return policy;
}

export const updateEnvironment = async (org: string, project: string, stack: string, envName: string, objectKeys: string[]) => {
    let pat = process.env.PULUMI_ACCESS_TOKEN;
    if (!pat) {
        // attempt to load from ~/.pulumi/credentials.json
        console.log("no PAT found in environment, attempting to load from credentials file");

        const file = await fs.readFile("~/.pulumi/credentials.json", "utf8");
        const creds = JSON.parse(file);
        const current = creds["current"];
        if (!current) {
            throw new Error("No Pulumi access token found in environment or credentials file.");
        }

        pat = creds["accounts"][current]["accessToken"];
    }

    const config = new esc.Configuration({ accessToken: pat });
    const client = new esc.EscApi(config);
    const vals: Record<string, string> = {};
    for (const key in objectKeys) {
        vals[key] = "${stack-outputs.data." + key + "}";
    }

    const doc = yaml.stringify({
        values: {
            "stack-outputs": {
                "fn::open::pulumi-stacks": {
                    stacks: {
                        "data": {
                            stack: `${project}/${stack}`,
                        }
                    }
                }
            },
            "pulumiConfig": vals
        }
    });

    await client.updateEnvironmentYaml(org, envName, doc.toString());
};