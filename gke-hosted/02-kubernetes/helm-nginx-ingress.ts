import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { ComponentResourceOptions, Output } from "@pulumi/pulumi";

export interface NginxIngressArgs {
    provider: k8s.Provider
};

export class NginxIngress extends pulumi.ComponentResource {
    public readonly IngressNamespace: Output<string>;
    public readonly IngressServiceIp: Output<string>;
    constructor(name: string, args: NginxIngressArgs, opts?: ComponentResourceOptions) {
        super("x:kubernetes:nginxingress", name);

        const ingressNamespace = new k8s.core.v1.Namespace(`${name}-namespace`, {
            metadata: {
                name: `${name}-ingress`,
            },
        }, {provider: args.provider, dependsOn: opts?.dependsOn, parent: this});

        const nginxIngress = new k8s.helm.v3.Chart(`${name}-ingress`, {
            fetchOpts: {
                repo: "https://kubernetes.github.io/ingress-nginx"
            },
            chart: "ingress-nginx",
            version: "3.31.0",
            namespace: ingressNamespace.metadata.name,
            values: {
                controller: {
                    replicaCount: 1,
                    // nodeSelector: {
                    //     "beta.kubernetes.io/os": "linux"
                    // },
                    // admissionWebhooks: {
                    //     patch: {
                    //         nodeSelector: {
                    //             "beta.kubernetes.io/os": "linux"
                    //         }
                    //     }
                    // }
                },
                // defaultBackend: {
                //     nodeSelector: {
                //         "beta.kubernetes.io/os": "linux"
                //     }
                // }
            },
        }, {provider: args.provider, dependsOn: opts?.dependsOn, parent: ingressNamespace});

        this.IngressNamespace = ingressNamespace.metadata.name;
        this.IngressServiceIp = nginxIngress
            .getResourceProperty("v1/Service", `${name}-ingress/${name}-ingress-ingress-nginx-controller`, "status")
            .apply(status => status.loadBalancer.ingress[0].ip);
    
        this.registerOutputs({
            IngressNamespace: this.IngressNamespace,
            IngressServiceIp: this.IngressServiceIp,
        });
    }
}
