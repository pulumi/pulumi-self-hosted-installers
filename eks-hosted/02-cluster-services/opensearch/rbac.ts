import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import { config } from "../config";

const accountId = pulumi.output(aws.getCallerIdentity({}).then(id => id.accountId));

const openSearchPolicy = accountId.apply(accountId => new aws.iam.Policy("openSearchPolicy", {
    description: "A policy for OpenSearch access",
    policy: {
        Version: "2012-10-17",
        Statement: [
            {
                Effect: "Allow",
                Action: [
                    "es:ESHttpGet",
                    "es:ESHttpPut",
                    "es:ESHttpPost",
                    "es:ESHttpDelete",
                ],
                Resource: `arn:aws:es:${aws.config.region}:${accountId}:domain/${config.openSearchDomainName}/*`,
            },
        ],
    },
}));

const openSearchRole = new aws.iam.Role("openSearchRole", {
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "es.amazonaws.com" }),
});

new aws.iam.RolePolicyAttachment("openSearchRolePolicyAttachment", {
    role: openSearchRole,
    policyArn: openSearchPolicy.arn,
});

const openSearchServiceAccount = new k8s.core.v1.ServiceAccount("openSearchServiceAccount", {
    metadata: {
        name: "opensearch-sa",
        namespace: config.clusterSvcsNamespaceName,
    },
});

new k8s.rbac.v1.ClusterRoleBinding("openSearchClusterRoleBinding", {
    metadata: {
        name: "opensearch-crb",
    },
    subjects: [
        {
            kind: "ServiceAccount",
            name: openSearchServiceAccount.metadata.name,
            namespace: openSearchServiceAccount.metadata.namespace,
        },
    ],
    roleRef: {
        kind: "ClusterRole",
        name: "cluster-admin",
        apiGroup: "rbac.authorization.k8s.io",
    },
});
