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
    
    // Based on:
    // https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/EC2NewInstanceCWL.html
    const policy = new aws.iam.Policy(name, {
        description: "Allows Fluentd to manage CloudWatch Logs",
        policy: JSON.stringify(
            {
                Version: "2012-10-17",
                Statement: [{Effect: "Allow", Action: ["logs:*"], Resource: ["arn:aws:logs:*:*:*"]}]
            }
        )
    });

    // Attach the policy to the role for the service account.
    const rpa = new aws.iam.RolePolicyAttachment(name, {
        policyArn: policy.arn,
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

// Create a ClusterRole.
// https://git.io/JvoH1
export function createClusterRole(
    name: string,
    provider: k8s.Provider): k8s.rbac.v1.ClusterRole {
    return new k8s.rbac.v1.ClusterRole(
        name,
        {
            rules: [
                {
                    apiGroups: [""],
                    resources: ["pods", "namespaces"],
                    verbs: ["get", "list", "watch"],
                },
                {
                    apiGroups: ["extensions"],
                    resources: ["podsecuritypolicies"],
                    verbs: ["use"],
                },
            ],
        },
        { provider },
    );
}

// Create a ClusterRoleBinding from ServiceAccount -> ClusterRole.
export function createClusterRoleBinding(
    name: string,
    provider: k8s.Provider,
    namespace: pulumi.Input<string>,
    serviceAccountName: pulumi.Input<string>,
    clusterRoleName: pulumi.Input<string>): k8s.rbac.v1.ClusterRoleBinding {
    return new k8s.rbac.v1.ClusterRoleBinding(
        name,
        {
            subjects: [
                {
                    kind: "ServiceAccount",
                    name: serviceAccountName,
                    namespace: namespace,
                },
            ],
            roleRef: {
                apiGroup: "rbac.authorization.k8s.io",
                kind: "ClusterRole",
                name: clusterRoleName,
            },
        },
        { provider },
    );
}
