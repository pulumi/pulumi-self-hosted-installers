import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

export interface NginxIngressArgs {};

export class NginxIngress extends pulumi.ComponentResource {
    public readonly IngressNamespace: pulumi.Output<string>;
    public readonly IngressServiceIp: pulumi.Output<string>;
    constructor(name: string, args: NginxIngressArgs, opts?: pulumi.ComponentResourceOptions) {
        super("x:kubernetes:nginxingress", name, args, opts);

        const ingressNamespace = new k8s.core.v1.Namespace(`${name}-namespace`, {
            metadata: {
                name: `${name}-ingress`,
            },
        }, {dependsOn: opts?.dependsOn, parent: this});

        const nginxIngress = new k8s.helm.v3.Chart(`${name}-ingress`, {
            fetchOpts: {
                repo: "https://kubernetes.github.io/ingress-nginx"
            },
            chart: "ingress-nginx",
            version: "4.12.0",
            namespace: ingressNamespace.metadata.name,
            values: {
                controller: {
                    replicaCount: 2,
                    service: {
                        // This is needed to preserve client IP.
                        // And preserving the client IP is needed to allow the ingressAllowList config option in the 03-application stack to work.
                        externalTrafficPolicy: "Local" 
                    }
                },
            },
        }, { dependsOn: opts?.dependsOn, parent: ingressNamespace});

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