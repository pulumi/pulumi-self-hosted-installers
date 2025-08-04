import * as k8s from "@pulumi/kubernetes";

export function createEnvValueFromSecret(secret: k8s.core.v1.Secret, key: string) {
    return {
        secretKeyRef: {
            name: secret.metadata.name,
            key: key
        }
    };
}