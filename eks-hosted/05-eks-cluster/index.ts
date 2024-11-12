import * as aws from "@pulumi/aws";
import * as eks from "@pulumi/eks";
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

// For RDS
export const nodeGroupInstanceType = config.pulumiNodeGroupInstanceType;

/////////////////////
/// Build node groups
const ssmParam = pulumi.output(aws.ssm.getParameter({
    // https://docs.aws.amazon.com/eks/latest/userguide/retrieve-ami-id.html
    name: `/aws/service/eks/optimized-ami/${config.clusterVersion}/amazon-linux-2/recommended`,
}))
export const amiId = ssmParam.value.apply(s => <string>JSON.parse(s).image_id)

// Create a standard node group.
const ngStandard = new eks.NodeGroupV2(`${baseName}-ng-standard`, {
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

    // labels: {"amiId": amiId},
    cloudFormationTags: clusterName.apply(clusterName => ({
        "k8s.io/cluster-autoscaler/enabled": "true",
        [`k8s.io/cluster-autoscaler/${clusterName}`]: "true",
        ...tags,
    })),
}, {
    providers: { kubernetes: cluster.provider},
});

// Create a standard node group tainted for use only by self-hosted pulumi.
const ngStandardPulumi = new eks.NodeGroupV2(`${baseName}-ng-standard-pulumi`, {
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

    // labels: {"amiId": amiId},
    taints: { "self-hosted-pulumi": { value: "true", effect: "NoSchedule"}},
    cloudFormationTags: clusterName.apply(clusterName => ({
        "k8s.io/cluster-autoscaler/enabled": "true",
        [`k8s.io/cluster-autoscaler/${clusterName}`]: "true",
        ...tags,
    })),
}, {
    providers: { kubernetes: cluster.provider},
});
