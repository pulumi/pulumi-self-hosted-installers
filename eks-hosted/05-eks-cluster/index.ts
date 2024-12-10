import * as aws from "@pulumi/aws";
import * as eks from "@pulumi/eks";
import * as pulumi from "@pulumi/pulumi";
import { config } from "./config";

const baseName = config.baseName 
const tags = { "Project": "pulumi-k8s-aws-cluster", "Owner": "pulumi"};

/////////////////////
// --- EKS Cluster ---
// Create an EKS cluster.
const cluster = new eks.Cluster(`${baseName}`, {
    name: config.clusterName,
    authenticationMode: "API",
    // We keep these serviceRole and instanceRole properties to prevent the EKS provider from creating its own roles.
    serviceRole: config.eksServiceRole,
    instanceRole: config.eksInstanceRole,
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
}, { protect: true });

// Export the cluster details.
export const kubeconfig = pulumi.secret(cluster.kubeconfig.apply(JSON.stringify));
export const clusterName = cluster.core.cluster.name;
export const region = aws.config.region;
export const nodeSecurityGroupId = cluster.nodeSecurityGroupId;
export const nodeGroupInstanceType = config.pulumiNodeGroupInstanceType;

/////////////////////
// Build managed nodegroup for the service to run on.

const instanceRoleArn = config.eksInstanceRole.apply(role => role.arn); 

// Launch template for the managed node group to manage settings.
const ngManagedLaunchTemplate = new aws.ec2.LaunchTemplate(`${baseName}-ng-managed-launch-template`, {
    vpcSecurityGroupIds: [cluster.nodeSecurityGroupId],
    metadataOptions: {
        httpTokens: config.httpTokens,
        httpPutResponseHopLimit: config.httpPutResponseHopLimit,
    },
})

const ngManagedStandard = new eks.ManagedNodeGroup(`${baseName}-ng-managed-standard`, {
    cluster: cluster,
    instanceTypes: [<aws.ec2.InstanceType>config.standardNodeGroupInstanceType],
    launchTemplate: {
        id: ngManagedLaunchTemplate.id,
        version: ngManagedLaunchTemplate.latestVersion.apply(v => v.toString()),
    },
    nodeRoleArn: instanceRoleArn,
    scalingConfig: {
        desiredSize: config.standardNodeGroupDesiredCapacity,
        minSize: config.standardNodeGroupMinSize,
        maxSize: config.standardNodeGroupMaxSize,
    },
    subnetIds: config.privateSubnetIds,
    tags: tags,
})

const ngManagedPulumi = new eks.ManagedNodeGroup(`${baseName}-ng-managed-pulumi`, {
    cluster: cluster,
    instanceTypes: [<aws.ec2.InstanceType>config.pulumiNodeGroupInstanceType],
    launchTemplate: {
        id: ngManagedLaunchTemplate.id,
        version: ngManagedLaunchTemplate.latestVersion.apply(v => v.toString()),
    },
    nodeRoleArn: instanceRoleArn,
    scalingConfig: {
        desiredSize: config.pulumiNodeGroupDesiredCapacity,
        minSize: config.pulumiNodeGroupMinSize,
        maxSize: config.pulumiNodeGroupMaxSize,
    },
    subnetIds: config.privateSubnetIds,
    taints: [{ 
        key: "self-hosted-pulumi",
        value: "true", 
        effect: "NO_SCHEDULE"
    }],
    tags: tags,
});
