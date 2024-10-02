import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as aws from "@pulumi/aws";

// Create the AWS IAM policy and role.
export function createIAM(
    name: string,
    namespace: pulumi.Input<string>,
    clusterOidcProviderArn: pulumi.Input<string>,
    clusterOidcProviderUrl: pulumi.Input<string>): aws.iam.Role
{
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
    
    // Attach the policy to the role for the service account.
    const rpa = new aws.iam.RolePolicyAttachment(name, {
        policyArn: "arn:aws:iam::aws:policy/AmazonS3FullAccess",
        role: saRole,
    });

    return saRole;
}

// Create a ServiceAccount.
export function createServiceAccount(
    name: string,
    provider: k8s.Provider,
    roleArn: pulumi.Input<aws.ARN>,
    namespace: pulumi.Input<string>): k8s.core.v1.ServiceAccount
{
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
