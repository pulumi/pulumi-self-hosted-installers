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
    // If this stack's configuration specified an AWS KMS key, use that for
    // managing the Pulumi Service's secrets.

    // TODO: kms key needs to allow appropriate IAM permissions to k8s sa role
    if (config.awsKMSKeyArn) {
        return {
            envVarName: "PULUMI_KMS_KEY",
            envVarValue: config.awsKMSKeyArn,
            mountPoint: [],
        }
    };

    // If no KMS key use local implementation.
    // Create 32 bytes of random data and place it in a Secret.
    const localKeys = new random.RandomPassword("localKeys", { length: 32 }, {
        additionalSecretOutputs: ["result"],
        protect: true,
    });
    const localKeysSecret = new kx.Secret("localkeys", {
        metadata: { namespace: config.appsNamespaceName },
        stringData: { localkeys: localKeys.result }
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
