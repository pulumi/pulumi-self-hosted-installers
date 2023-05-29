import { core, Provider, helm } from "@pulumi/kubernetes";
import { ComponentResource, Input, ComponentResourceOptions, Output, interpolate } from "@pulumi/pulumi";

export interface NginxIngressArgs {
    provider: Provider
};

export class NginxIngress extends ComponentResource {
    public readonly IngressNamespace: Output<string>;
    public readonly IngressServiceIp: Output<string>;
    constructor(name: string, args: NginxIngressArgs, opts?: ComponentResourceOptions) {
        super("x:kubernetes:nginxingress", name);

        const ingressNamespace = new core.v1.Namespace(`${name}-namespace`, {
            metadata: {
                name: `${name}-ingress`,
            },
        }, {provider: args.provider, dependsOn: opts?.dependsOn, parent: this});

        const nginx = new helm.v3.Release(`ingress`, {
            chart: "ingress-nginx",
            repositoryOpts: {
                repo: "https://kubernetes.github.io/ingress-nginx"
            },
            namespace: ingressNamespace.metadata.name,
            version: "4.6.1",
            values: {
                controller: {
                    replicaCount: 1,
                    nodeSelector: {
                        "kubernetes.io/os": "linux"
                    },
                    admissionWebhooks: {
                        patch: {
                            nodeSelector: {
                                "kubernetes.io/os": "linux"
                            }
                        }
                    },
                    service: {
                        "externalTrafficPolicy":"Local", // https://github.com/MicrosoftDocs/azure-docs/issues/92179#issuecomment-1169809165
                    },
                },
                defaultBackend: {
                    nodeSelector: {
                        "kubernetes.io/os": "linux"
                    }
                }
            },
        }, {provider: args.provider, dependsOn: opts?.dependsOn, parent: ingressNamespace})

        this.IngressNamespace = ingressNamespace.metadata.name;
        const service = core.v1.Service.get("ingress-service", interpolate`${nginx.status.namespace}/${nginx.status.name}-ingress-nginx-controller`, {provider: args.provider});
        this.IngressServiceIp = service.status.loadBalancer.ingress[0].ip;
    
        this.registerOutputs({
            IngressNamespace: this.IngressNamespace,
            IngressServiceIp: this.IngressServiceIp,
        });
    }
}
