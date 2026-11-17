import * as pulumi from "@pulumi/pulumi";
import * as kms from "@pulumi/aws/kms";
import { LogType } from "./logs/types";
import { getIamPolicyArn } from "../common/utils";

// build the ECR image tag; this could be in the current account or a separate account (AWS)
// imagePrefix (normalized, ends with "/") goes between the registry and the image name, eg- an ECR pull-through cache prefix
export const buildECRImageTag = (accountId: string, region: string, imageName: string, imagePrefix?: string): string => {
    return `${accountId}.dkr.ecr.${region}.amazonaws.com/${imagePrefix ?? ""}${imageName}`;
}

// "docker-hub", "docker-hub/" and "/docker-hub/" all become "docker-hub/"; unset or empty stays undefined
export const normalizeImagePrefix = (value: string | undefined): string | undefined => {
    const trimmed = value?.trim().replace(/^\/+|\/+$/g, "");
    return trimmed ? `${trimmed}/` : undefined;
}

// Lets an ECS task execution role pull an image through an ECR pull-through cache rule the first time, which imports
// the image and creates its repository. Scoped to the Pulumi repositories under the prefix.
export const generatePullThroughCachePolicy = (region: string, ecrAccountId: string, imagePrefix: string): string => {
    return JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Action: [
                "ecr:BatchImportUpstreamImage",
                "ecr:CreateRepository",
            ],
            Resource: getIamPolicyArn(region, `arn:aws:ecr:${region}:${ecrAccountId}:repository/${imagePrefix}pulumi/*`),
        }],
    });
}

// the factory for our log interface
export const toLogType = (input: string | undefined): LogType | undefined => {
    let type: LogType | undefined;

    if (!input) {
        return type;
    }

    switch (input.toLowerCase()) {
        case "awslogs":
            type = LogType.awslogs;
            break;

        case "awsfirelens":
            type = LogType.awsfirelens;
            break;

        case "splunk":
            type = LogType.splunk;
            break;
    }

    return type;
}

// the secrets manager polilcy the service and the migrations will use to interact and decrypt secrets
export const generateSecretsManagerPolicy = (region: string, secretsPrefix: string, kmsKeyId: string, accountId: string) => {

    const key = kms.getKey({
        keyId: kmsKeyId
    });

    return pulumi
        .all([accountId, key])
        .apply(([accountId, key]) => {

            // account for govcloud arns
            const secretsArn = getIamPolicyArn(region, `arn:aws:secretsmanager:${region}:${accountId}:secret:${secretsPrefix}/*`);
            return JSON.stringify({
                Version: "2012-10-17",
                Statement: [
                    {
                        Effect: "Allow",
                        Action: [
                            "secretsmanager:GetSecretValue",
                            "kms:Decrypt",
                        ],
                        Resource: [
                            secretsArn,
                            key.arn,
                        ],
                    },
                ],
            });
        });
}