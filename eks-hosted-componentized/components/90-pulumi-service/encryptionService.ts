import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as random from "@pulumi/random";
import { Input, Output, ComponentResource, ComponentResourceOptions } from "@pulumi/pulumi";
import { secret } from "@pulumi/pulumi";

export interface EncryptionServiceArgs {
    namespace: Input<string>,
    commonName: string,
    awsKMSKeyArn: string | undefined,
    encryptionKey: string | undefined,
    provider: k8s.Provider,
}

// Until this issue is addressed: https://github.com/pulumi/pulumi-service/issues/8785
// We will use locally mounted key as per https://www.pulumi.com/docs/guides/self-hosted/components/api/#local-keys
// To this end, this component creates a secret containing the key value and then constructs volume and volume mount specs
// to be added to the api service pod.
// When the above issue is addressed, this code can be modified to set things up using the GCP key service and 
// just return empty volume specs with no need to update the index.ts program.
export class EncryptionService extends ComponentResource {
    pulumiLocalKeysVolumes: k8s.types.input.core.v1.Volume[];
    pulumiLocalKeysVolumeMounts: k8s.types.input.core.v1.VolumeMount[]; 
    encryptionServiceEnv: k8s.types.input.core.v1.EnvVar;
    constructor(name: string, args: EncryptionServiceArgs, opts?: ComponentResourceOptions) {
        super("x:kubernetes:encryption-service", name, opts);

        // If this stack's configuration specified an AWS KMS key, use that for
        // managing the Pulumi Service's secrets.
        if (args.awsKMSKeyArn) {
            this.encryptionServiceEnv = {
                name: "PULUMI_KMS_KEY",
                value: args.awsKMSKeyArn
            }
            this.pulumiLocalKeysVolumes = []
            this.pulumiLocalKeysVolumeMounts = [];
        } else {
            // Need to use a local key

            const volumeName = "encryptionservice";
            const secretName = "pulumilocalkeys"; // Must match value used in kx.Secret() declaration below
            this.encryptionServiceEnv = {
                name: "PULUMI_LOCAL_KEYS",
                value: `/${volumeName}/${secretName}`
            }

            // Store the string as a secret.
            const pulumiLocalKeysSecret = new k8s.core.v1.Secret(`${args.commonName}-local-keys`, {
                metadata: { 
                    namespace: args.namespace, 
                    name: secretName 
                },
                stringData: { "pulumilocalkeys": args.encryptionKey ?? "" }, // Note it's impossible to get to this point of the code without encryptionKey being defined
            }, { provider: args.provider, parent: this });

            // construct volume spec and mount specs to use the secret as a file as per:
            // https://kubernetes.io/docs/concepts/configuration/secret/#using-secrets-as-files-from-a-pod
            this.pulumiLocalKeysVolumes = [{
                name: volumeName,
                secret: {
                    secretName: secretName,
                }
            }];

            // construct the volume mount spec 
            this.pulumiLocalKeysVolumeMounts = [{
                name: volumeName,
                mountPath: `/${volumeName}`,
                readOnly: true,
            }];
        }

        this.registerOutputs({
            pulumiLocalKeysVolumes: this.pulumiLocalKeysVolumes,
            pulumiLocalKeysVolumeMounts: this.pulumiLocalKeysVolumeMounts,
            encryptionServiceEnv: this.encryptionServiceEnv
        })
    }
}
