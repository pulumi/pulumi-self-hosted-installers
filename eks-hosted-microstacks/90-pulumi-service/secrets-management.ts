import { AwsExecReadAcl } from "@pulumi/aws/s3";
import * as aws from "@pulumi/aws";
import * as kx from "@pulumi/kubernetesx";
import * as random from "@pulumi/random";

interface secretsIntegrationPoints {
    //Environment variable to set on the Pulumi API container, describing the secrets provider to use.
    envVarName: string,
    envVarValue: string,
    // Key files that needed to be mounted into
    // the container. (May contain 0 elements, if no mounting is required.))
    mountPoint: any[];
}

// configurePulumiSecretProvider will use provided configuration to set an environment variable for secret
// management and create and specify file to be mounted to the container, if needed.
export function configurePulumiSecretProvider(config: any, provider: any): secretsIntegrationPoints {
    // Throw an error if neither a KMS key nor a local key is provided.
    if (!config.awsKMSKeyArn && !config.encryptionKey) {
        throw new Error("\n**** ERROR ****\nEither an AWS KMS key ARN or a local encryption key must be provided.\n See Pulumi.README.yaml for more information.\n********");
    }

    // If this stack's configuration specified an AWS KMS key, use that for
    // managing the Pulumi Service's secrets.
    if (config.awsKMSKeyArn) {
        return {
            envVarName: "PULUMI_KMS_KEY",
            envVarValue: config.awsKMSKeyArn,
            mountPoint: [],
        }
    };

    // If no KMS key use the provided local key
    const localKeysSecret = new kx.Secret("localkeys", {
        metadata: { namespace: config.appsNamespaceName },
        stringData: { localkeys: config.encryptionKey}
    }, {
        provider,
        protect: true,
    });

    return {
        envVarName: "PULUMI_LOCAL_KEYS",
        envVarValue: "/etc/pulumi/keys/localkeys",
        mountPoint: [localKeysSecret.mount("/etc/pulumi/keys")],
    }
}
