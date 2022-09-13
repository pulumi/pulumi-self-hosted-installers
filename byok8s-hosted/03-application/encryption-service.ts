import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as kx from "@pulumi/kubernetesx";
import * as random from "@pulumi/random";
import { Input, Output, ComponentResource, ComponentResourceOptions } from "@pulumi/pulumi";
import { secret } from "@pulumi/pulumi";

export interface EncryptionServiceArgs {
    namespace: Input<string>,
    commonName: string,
    provider: k8s.Provider,
}

// We use a locally mounted key as per https://www.pulumi.com/docs/guides/self-hosted/components/api/#local-keys
// To this end, this component creates a secret containing the key value and then constructs volume and volume mount specs
// to be added to the api service pod.
export class EncryptionService extends ComponentResource {
    pulumiLocalKeysVolumeSpec: k8s.types.input.core.v1.Volume;
    pulumiLocalKeysVolumeMountSpec: k8s.types.input.core.v1.VolumeMount;
    encryptionServiceEnv: k8s.types.input.core.v1.EnvVar;
    constructor(name: string, args: EncryptionServiceArgs, opts?: ComponentResourceOptions) {
        super("x:kubernetes:encryption-service", name, opts);

        const volumeName = "encyrptionservice";
        const secretName = "pulumilocalkeys"; // Must match value used in kx.Secret() declaration below
        this.encryptionServiceEnv = {
            name: "PULUMI_LOCAL_KEYS",
            value: `/${volumeName}/${secretName}`
        }

        // Generate a 32 byte string
        const secret_key = new random.RandomString(`${args.commonName}-secret`, {
            length: 32,
            special: false,
        }).result;

        // Store the string as a secret.
        const pulumiLocalKeysSecret = new kx.Secret(`${args.commonName}-local-keys`, {
            metadata: { 
                namespace: args.namespace, 
                name: secretName 
            },
            stringData: { "pulumilocalkeys": secret_key },
        }, { provider: args.provider, parent: this });

        // construct volume spec and mount specs to use the secret as a file as per:
        // https://kubernetes.io/docs/concepts/configuration/secret/#using-secrets-as-files-from-a-pod
        this.pulumiLocalKeysVolumeSpec = {
            name: volumeName,
            secret: {
              secretName: secretName,
            }
        };

        // construct the volume mount spec 
        this.pulumiLocalKeysVolumeMountSpec = {
            name: volumeName,
            mountPath: `/${volumeName}`,
            readOnly: true,
        };

        this.registerOutputs({
            pulumiLocalKeysVolumeSpec: this.pulumiLocalKeysVolumeSpec,
            pulumiLocalKeysVolumeMountSpec: this.pulumiLocalKeysVolumeMountSpec,
            encryptionServiceEnv: this.encryptionServiceEnv
        })
    }
}
