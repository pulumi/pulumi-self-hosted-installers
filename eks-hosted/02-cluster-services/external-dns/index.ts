import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as kx from "@pulumi/kubernetesx";
import * as aws from "@pulumi/aws";
import * as rbac from "./rbac";

export type ExternalDnsOptions = {
    namespace: pulumi.Input<string>;
    provider: k8s.Provider;
    commandArgs: pulumi.Input<any>;
    clusterOidcProviderArn: pulumi.Input<string>;
    clusterOidcProviderUrl: pulumi.Input<string>;
};

const pulumiComponentNamespace: string = "pulumi:ExternalDns";

export class ExternalDns extends pulumi.ComponentResource {
    public readonly iamRole: aws.iam.Role;
    public readonly serviceAccount: k8s.core.v1.ServiceAccount;
    public readonly serviceAccountName: pulumi.Output<string>;
    public readonly clusterRole: k8s.rbac.v1.ClusterRole;
    public readonly clusterRoleName: pulumi.Output<string>;
    public readonly clusterRoleBinding: k8s.rbac.v1.ClusterRoleBinding;
    public readonly deployment: kx.Deployment;

    constructor(
        name: string,
        args: ExternalDnsOptions,
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super(pulumiComponentNamespace, name, args, opts);

        // ServiceAccount
        this.iamRole = rbac.createIAM(name, args.namespace,
            args.clusterOidcProviderArn, args.clusterOidcProviderUrl);
        this.serviceAccount = rbac.createServiceAccount(name,
            args.provider, this.iamRole.arn, args.namespace);
        this.serviceAccountName = this.serviceAccount.metadata.name;

        // RBAC ClusterRole
        this.clusterRole = rbac.createClusterRole(name, args.provider);
        this.clusterRoleName = this.clusterRole.metadata.apply(m => m.name);
        this.clusterRoleBinding = rbac.createClusterRoleBinding(
            name, args.provider, args.namespace, this.serviceAccountName, this.clusterRoleName);

        // Deployment
        const labels = { app: name };
        this.deployment = createDeployment(
            name, args.provider, args.namespace,
            this.serviceAccountName, labels, args.commandArgs);
    }
}

// Create a Deployment
export function createDeployment(
    name: string,
    provider: k8s.Provider,
    namespace: pulumi.Input<string>,
    serviceAccountName: pulumi.Input<string>,
    labels: pulumi.Input<any>,
    commandArgs: pulumi.Input<any>): kx.Deployment
{
    const podBuilder = new kx.PodBuilder({
        serviceAccountName: serviceAccountName,
        containers: [{
            image: "us.gcr.io/k8s-artifacts-prod/external-dns/external-dns:v0.7.0",
            args: commandArgs,
            resources: {requests: {cpu: "256m", memory: "256Mi"}},
            securityContext: {
                runAsNonRoot: true,
                runAsUser: 65534,
                readOnlyRootFilesystem: true,
                capabilities: {drop: ["ALL"]},
            },
        }],
        securityContext: {
            runAsUser: 65534,
            fsGroup: 65534,
        },
    });
    return new kx.Deployment(name, {
        metadata: { namespace: namespace },
        spec: podBuilder.asDeploymentSpec({ replicas: 2 })
    },{provider});
}
