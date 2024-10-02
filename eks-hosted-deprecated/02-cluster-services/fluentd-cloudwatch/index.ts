import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as aws from "@pulumi/aws";
import * as rbac from "./rbac";

export type FluentdCloudWatchOptions = {
    namespace: pulumi.Input<string>;
    provider: k8s.Provider;
    clusterOidcProviderArn: pulumi.Input<string>;
    clusterOidcProviderUrl: pulumi.Input<string>;
};

const pulumiComponentNamespace: string = "pulumi:FluentdCloudWatch";

export class FluentdCloudWatch extends pulumi.ComponentResource {
    public readonly iamRole: aws.iam.Role;
    public readonly serviceAccount: k8s.core.v1.ServiceAccount;
    public readonly serviceAccountName: pulumi.Output<string>;
    public readonly clusterRole: k8s.rbac.v1.ClusterRole;
    public readonly clusterRoleName: pulumi.Output<string>;
    public readonly clusterRoleBinding: k8s.rbac.v1.ClusterRoleBinding;
    public readonly logGroup: aws.cloudwatch.LogGroup;
    public readonly logGroupName: pulumi.Output<string>;
    public readonly chart: k8s.helm.v3.Chart;

    constructor(
        name: string,
        args: FluentdCloudWatchOptions,
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super(pulumiComponentNamespace, name, args, opts);

        // ServiceAccount
        this.iamRole = rbac.createIAM(name, args.namespace,
            args.clusterOidcProviderArn, args.clusterOidcProviderUrl);
        this.serviceAccount = rbac.createServiceAccount(name,
            args.provider, this.iamRole.arn, args.namespace);
        this.serviceAccountName = this.serviceAccount.metadata.name;

        // RBAC
        this.clusterRole = rbac.createClusterRole(name, args.provider);
        this.clusterRoleName = this.clusterRole.metadata.name;
        this.clusterRoleBinding = rbac.createClusterRoleBinding(
            name, args.provider, args.namespace, this.serviceAccountName, this.clusterRoleName);

        // Log groups and Helm chart
        this.logGroup = new aws.cloudwatch.LogGroup(name);
        this.logGroupName = this.logGroup.name;
        this.chart = createFluentd(name, args.provider, args.namespace,
            this.serviceAccountName, this.logGroupName);
    }
}

export function createFluentd (
    name: string,
    provider: k8s.Provider,
    namespace: pulumi.Input<string>,
    serviceAccountName: pulumi.Input<string>,
    logGroupName: pulumi.Input<string>): k8s.helm.v3.Chart 
{
    return new k8s.helm.v3.Chart(name, 
        {
            namespace: namespace,
            chart: "fluentd-cloudwatch",
            version: "0.13.2",
            fetchOpts: {
                repo: "https://charts.helm.sh/incubator/"
            },
            values: {
                extraVars: [ "{ name: FLUENT_UID, value: '0' }" ],
                rbac: {serviceAccountName: serviceAccountName},
                awsRegion: pulumi.output(aws.getRegion()).name,
                logGroupName: logGroupName,
            },
        },
        {providers: { kubernetes: provider }},
    );
}
