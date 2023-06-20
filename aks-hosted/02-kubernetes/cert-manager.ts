import { ComponentResource, ComponentResourceOptions, Output } from "@pulumi/pulumi";
import { core, helm, Provider } from "@pulumi/kubernetes";

export interface CertManagerArgs {
    provider: Provider;
    certManagerNamespaceName: string;
}

export class CertManager extends ComponentResource {
    public readonly CertManagerNamespace: Output<string>;
    public readonly CertManagerName: Output<string>;

    constructor(name: string, args: CertManagerArgs, opts?: ComponentResourceOptions) {
        super("x:kubernetes:certManager", name, args, opts);

        const certManagerNamespace = new core.v1.Namespace(`${name}-namespace`, {
            metadata: {
                name: args.certManagerNamespaceName,
            },
        }, { provider: args.provider, dependsOn: opts?.dependsOn, parent: this });

        const certManager = new helm.v3.Release("cert-manager", {
            chart: "cert-manager",
            repositoryOpts: {
                repo: "https://charts.jetstack.io"
            },
            namespace: certManagerNamespace.metadata.name,
            version: "1.12.1",
            values: {
                installCRDs: true,
                podLabels: {
                    "azure.workload.identity/use": "true"
                },
                serviceAccount: {
                    lables: {
                        "azure.workload.identity/use": "true"
                    }
                }
            }
        }, { provider: args.provider, dependsOn: opts?.dependsOn, parent: this });

        this.CertManagerNamespace = certManagerNamespace.metadata.name;
        this.CertManagerName = certManager.status.name;
        this.registerOutputs({
            CertManagerNamespace: this.CertManagerNamespace,
            CertManagerName: this.CertManagerName,
        });
    }
}