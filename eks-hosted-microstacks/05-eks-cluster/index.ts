import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as eks from "@pulumi/eks";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { config } from "./config";

const baseName = config.baseName 
const tags = { "Project": "pulumi-k8s-aws-cluster", "Owner": "pulumi"};

/////////////////////
// --- EKS Cluster ---
const serviceRole = aws.iam.Role.get("eksServiceRole", config.eksServiceRoleName)
const instanceRole = aws.iam.Role.get("instanceRole", config.eksInstanceRoleName)
const instanceProfile = aws.iam.InstanceProfile.get("ng-standard", config.instanceProfileName)

// Create an EKS cluster.
const cluster = new eks.Cluster(`${baseName}`, {
    name: config.clusterName,
    authenticationMode: "API",
    // We keep these serviceRole and instanceRole properties to prevent the EKS provider from creating its own roles.
    serviceRole: serviceRole,
    instanceRole: instanceRole,
    vpcId: config.vpcId,
    publicSubnetIds: config.publicSubnetIds,
    privateSubnetIds: config.privateSubnetIds,
    providerCredentialOpts: { profileName: process.env.AWS_PROFILE}, 
    nodeAssociatePublicIpAddress: false,
    skipDefaultNodeGroup: true,
    deployDashboard: false,
    version: config.clusterVersion,
    createOidcProvider: false,
    tags: tags,
    enabledClusterLogTypes: ["api", "audit", "authenticator", "controllerManager", "scheduler"],
}, {
    transformations: [(args) => {
        if (args.type === "aws:eks/cluster:Cluster") {
            return {
                props: args.props,
                opts: pulumi.mergeOptions(args.opts, {
                    protect: true,
                })
            }
        }
        return undefined;
    }],
});

// Export the cluster details.
export const kubeconfig = pulumi.secret(cluster.kubeconfig.apply(JSON.stringify));
export const clusterName = cluster.core.cluster.name;
export const region = aws.config.region;
export const nodeSecurityGroupId = cluster.nodeSecurityGroup.id; // For RDS
export const nodeGroupInstanceType = config.pulumiNodeGroupInstanceType;

/////////////////////
/// Build node groups
const ssmParam = pulumi.output(aws.ssm.getParameter({
    // https://docs.aws.amazon.com/eks/latest/userguide/retrieve-ami-id.html
    name: `/aws/service/eks/optimized-ami/${config.clusterVersion}/amazon-linux-2/recommended`,
}))
const amiId = ssmParam.value.apply(s => JSON.parse(s).image_id)

// Create a standard node group.
const ngStandard = new eks.NodeGroup(`${baseName}-ng-standard`, {
    cluster: cluster,
    instanceProfile: instanceProfile,
    nodeAssociatePublicIpAddress: false,
    nodeSecurityGroup: cluster.nodeSecurityGroup,
    clusterIngressRule: cluster.eksClusterIngressRule,
    amiId: amiId,
    
    instanceType: <aws.ec2.InstanceType>config.standardNodeGroupInstanceType,
    desiredCapacity: config.standardNodeGroupDesiredCapacity,
    minSize: config.standardNodeGroupMinSize,
    maxSize: config.standardNodeGroupMaxSize,

    labels: {"amiId": `${amiId}`},
    cloudFormationTags: clusterName.apply(clusterName => ({
        "k8s.io/cluster-autoscaler/enabled": "true",
        [`k8s.io/cluster-autoscaler/${clusterName}`]: "true",
        ...tags,
    })),
}, {
    providers: { kubernetes: cluster.provider},
});

// Create a standard node group tainted for use only by self-hosted pulumi.
const ngStandardPulumi = new eks.NodeGroup(`${baseName}-ng-standard-pulumi`, {
    cluster: cluster,
    instanceProfile: instanceProfile,
    nodeAssociatePublicIpAddress: false,
    nodeSecurityGroup: cluster.nodeSecurityGroup,
    clusterIngressRule: cluster.eksClusterIngressRule,
    amiId: amiId,

    instanceType: <aws.ec2.InstanceType>config.pulumiNodeGroupInstanceType,
    desiredCapacity: config.pulumiNodeGroupDesiredCapacity,
    minSize: config.pulumiNodeGroupMinSize,
    maxSize: config.pulumiNodeGroupMaxSize,

    labels: {"amiId": `${amiId}`},
    taints: { "self-hosted-pulumi": { value: "true", effect: "NoSchedule"}},
    cloudFormationTags: clusterName.apply(clusterName => ({
        "k8s.io/cluster-autoscaler/enabled": "true",
        [`k8s.io/cluster-autoscaler/${clusterName}`]: "true",
        ...tags,
    })),
}, {
    providers: { kubernetes: cluster.provider},
});

////////////
// Enable necessary EKS addons
// Note that "vpc-cni" is automatically installed by EKS and is not required to be installed.
const coreDnsAddon = new aws.eks.Addon("coreDns", {
    addonName: "coredns",
    clusterName: clusterName,
    addonVersion: "v1.11.1-eksbuild.8",
}, {dependsOn: [ngStandard, ngStandardPulumi]});

////////////
// Create the ALB security group.
const albSecurityGroup = createAlbSecurityGroup(baseName, {
    vpcId: config.vpcId,
    nodeSecurityGroup: cluster.nodeSecurityGroup,
    tags: tags,
    clusterName: clusterName,
}, cluster);
export const albSecurityGroupId = albSecurityGroup.id;

////////////
// Create Kubernetes namespaces needed later.
const clusterSvcsNamespace = new k8s.core.v1.Namespace("cluster-svcs", undefined, { provider: cluster.provider, protect: true });
export const clusterSvcsNamespaceName = clusterSvcsNamespace.metadata.name;

const appsNamespace = new k8s.core.v1.Namespace("apps", undefined, { provider: cluster.provider, protect: true });
export const appsNamespaceName = appsNamespace.metadata.name;

// Create a resource quota in the apps namespace.
//
// Given 2 replicas each for HA:
// API:     4096m cpu, 2048Mi ram
// Console: 2048m cpu, 1024Mi ram
//
// 2x the HA requirements to create capacity for rolling updates of replicas:
// API:     8192m cpu, 4096Mi ram
// Console: 4096m cpu, 2048Mi ram
//
// Totals:  12288m cpu, 6144Mi ram
const quotaAppsNamespace = new k8s.core.v1.ResourceQuota("apps", {
    metadata: {namespace: appsNamespaceName},
    spec: {
        hard: {
            cpu: "12288",
            memory: "6144Mi",
            pods: "20",
            resourcequotas: "1",
            services: "5",
        },
    }
},{
    provider: cluster.provider
});

////////////
// Helper function for creating the ALB security group used above.
export interface AlbSecGroupOptions {
    // The VPC in which to create the security group.
    vpcId: pulumi.Input<string>;
    // The security group of the worker node groups in the cluster that the ALBs
    // will be servicing.
    nodeSecurityGroup: aws.ec2.SecurityGroup;
    // The tags to apply to the security group.
    tags: pulumi.Input<{[key: string]: any}>;
    // The cluster name associated with the worker node group.
    clusterName: pulumi.Input<string>;
}

/**
 * Create a security group for the ALBs that can connect and work with the
 * cluster worker nodes.
 *
 * It's best to create a security group for the ALBs to share, if not the
 * ALB controller will default to creating a new one. Auto creation of
 * security groups can hit ENI limits, and is not guaranteed to be deleted by
 * Pulumi on tear downs, as the ALB controller created it out-of-band.
 *
 * See for more details:
 * https://github.com/kubernetes-sigs/aws-alb-ingress-controller/pull/1019
 *
 */
export function createAlbSecurityGroup(name: string, args: AlbSecGroupOptions, parent: pulumi.ComponentResource): aws.ec2.SecurityGroup {
    const albSecurityGroup = new aws.ec2.SecurityGroup(`${name}-albSecurityGroup`, {
        vpcId: args.vpcId,
        revokeRulesOnDelete: true,
        tags: pulumi.all([
            args.tags,
            args.clusterName,
        ]).apply(([tags, clusterName]) => (<aws.Tags>{
            "Name": `${name}-albSecurityGroup`,
            [`kubernetes.io/cluster/${clusterName}`]: "owned",
            ...tags,
        })),
    }, { parent });

    const nodeAlbIngressRule = new aws.ec2.SecurityGroupRule(`${name}-nodeAlbIngressRule`, {
        description: "Allow ALBs to communicate with workers",
        type: "ingress",
        fromPort: 0,
        toPort: 65535,
        protocol: "tcp",
        securityGroupId: args.nodeSecurityGroup.id,
        sourceSecurityGroupId: albSecurityGroup.id,
    }, { parent });

    const albInternetEgressRule = new aws.ec2.SecurityGroupRule(`${name}-albInternetEgressRule`, {
        description: "Allow external internet access",
        type: "egress",
        fromPort: 0,
        toPort: 0,
        protocol: "-1",  // all
        cidrBlocks: [ "0.0.0.0/0" ],
        securityGroupId: albSecurityGroup.id,
    }, { parent });

    const albInternetHttpIngressRule = new aws.ec2.SecurityGroupRule(`${name}-albInternetHttpEgressRule`, {
        description: "Allow internet clients to communicate with ALBs over HTTP",
        type: "ingress",
        fromPort: 80,
        toPort: 80,
        protocol: "tcp",  // all
        cidrBlocks: [ "0.0.0.0/0" ],
        securityGroupId: albSecurityGroup.id,
    }, { parent });

    const albInternetHttpsIngressRule = new aws.ec2.SecurityGroupRule(`${name}-albInternetHttpsEgressRule`, {
        description: "Allow internet clients to communicate with ALBs over HTTPS",
        type: "ingress",
        fromPort: 443,
        toPort: 443,
        protocol: "tcp",  // all
        cidrBlocks: [ "0.0.0.0/0" ],
        securityGroupId: albSecurityGroup.id,
    }, { parent });

    return albSecurityGroup;
}