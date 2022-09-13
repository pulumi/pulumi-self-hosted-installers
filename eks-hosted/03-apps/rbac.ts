import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as aws from "@pulumi/aws";
import { assumeRoleWithWebIdentity } from "@pulumi/aws/config";

// Create the AWS IAM policy and role.
export function createIAM(
    name: string,
    namespace: pulumi.Input<string>,
    clusterOidcProviderArn: pulumi.Input<string>,
    clusterOidcProviderUrl: pulumi.Input<string>,
    policyPackBucket: pulumi.Output<string>,
    checkpointBucket: pulumi.Output<string>): aws.iam.Role {
    // Create the IAM target policy and role for the Service Account.
    const saAssumeRolePolicy = pulumi.all([clusterOidcProviderUrl, clusterOidcProviderArn, namespace]).apply(([url, arn, namespaceName]) => aws.iam.getPolicyDocument({
        statements: [{
            actions: ["sts:AssumeRoleWithWebIdentity"],
            conditions: [{
                test: "StringEquals",
                values: [`system:serviceaccount:${namespaceName}:${name}`],
                variable: `${url.replace("https://", "")}:sub`,
            }],
            effect: "Allow",
            principals: [{
                identifiers: [arn],
                type: "Federated",
            }],
        }],
    }));

    const saRole = new aws.iam.Role(name, {
        assumeRolePolicy: saAssumeRolePolicy.json,
    });

    // only give the sa full access to the checkpoints and policy pack buckets nothing else
    // this could probably be restricted more, but it's probably futile
    const s3PolicyDoc = pulumi.all([policyPackBucket, checkpointBucket]).apply(([pBucket, cBucket]) => {
        const checkpoint = `arn:aws:s3:::${cBucket}`;
        const policyPack = `arn:aws:s3:::${pBucket}`;

        return JSON.stringify({
            Version: "2012-10-17",
            Statement: [{
                Effect: "Allow",
                Action: ["s3:*"],
                Resource: [
                    policyPack,
                    `${policyPack}/*`,
                    checkpoint,
                    `${checkpoint}/*`
                ]
            }]
        })
    });

    const policy = new aws.iam.Policy(name, {
        description: "Allow API access to checkpoints and policy pack bucket",
        policy: s3PolicyDoc
    });

    new aws.iam.RolePolicyAttachment(name, {
        role: saRole,
        policyArn: policy.arn
    });

    return saRole;
}

// Create a ServiceAccount.
export function createServiceAccount(
    name: string,
    provider: k8s.Provider,
    roleArn: pulumi.Input<aws.ARN>,
    namespace: pulumi.Input<string>): k8s.core.v1.ServiceAccount {
    return new k8s.core.v1.ServiceAccount(name, {
        metadata: {
            namespace: namespace,
            name: name,
            annotations: {
                "eks.amazonaws.com/role-arn": roleArn,
            },
        },
    }, { provider },
    );
}
