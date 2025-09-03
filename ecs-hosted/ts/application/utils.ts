import * as pulumi from "@pulumi/pulumi";
import * as kms from "@pulumi/aws/kms";
import { LogType } from "./logs/types";
// Local implementation of getIamPolicyArn to avoid dependency on ../common
const getIamPolicyArn = (region: string, policyArn: string): string => {
    let policy = policyArn;

    const regionLower = region.toLocaleLowerCase();
    if (regionLower === "us-gov-west-1" || regionLower === "us-gov-east-1") {
        const splits = policyArn.split(":");
        splits[1] = "aws-us-gov";

        policy = splits.join(":");
    }

    return policy;
}

// build the ECR image tag; this could be in the current account or a separate account (AWS)
export const buildECRImageTag = (accountId: string, region: string, imageName: string): string => {
    return `${accountId}.dkr.ecr.${region}.amazonaws.com/${imageName}`;
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