import * as pulumi from "@pulumi/pulumi";
import * as secretsmanager from "@pulumi/aws/secretsmanager";

import { SecretArgs } from "./types";

const namespace = "pulumi:SecretsManager";

export class Secrets extends pulumi.ComponentResource {

    public readonly outputs: {name: string, valueFrom: pulumi.Output<string>}[];

    constructor(name: string, args: SecretArgs, opts?: pulumi.ComponentResourceOptions) {
        super(namespace, name, args, opts);

        const options = pulumi.mergeOptions(opts, { parent: this });

        this.outputs = args.secrets
            .filter(secret => secret.value)
            .map(secret => {

                const secretName = secret.name.toLocaleLowerCase();

                const awsSecret = new secretsmanager.Secret(`${name}-${secretName}`, {
                    namePrefix: `${args.prefix}/${this.generateSecretName(secret.name)}`,
                    kmsKeyId: args.kmsKeyId
                }, options);

                new secretsmanager.SecretVersion(secretName, {
                    secretId: awsSecret.id,
                    secretString: secret.value
                }, options);

                return {
                    name: secret.name,
                    valueFrom: awsSecret.arn
                };
            });
    }

    generateSecretName(n: string): string {
        return n.toLocaleLowerCase().replace(/_/g, "-");
    }
}