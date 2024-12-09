import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { config } from "./config";
import { createAlbSecurityGroup, createAlbIngressController } from "./ingress-controller";

// instantiate k8s provider for subsequent resources
const k8sprovider = new k8s.Provider("provider", {kubeconfig: config.kubeconfig, deleteUnreachable: true});

////////////
// Enable necessary EKS addons
// Note that "vpc-cni" is automatically installed by EKS and is not required to be installed.
const coreDnsAddon = new aws.eks.Addon("coreDns", {
    addonName: "coredns",
    clusterName: config.clusterName,
    // addonVersion: "v1.11.3-eksbuild.2",
    addonVersion: "v1.11.1-eksbuild.8",
});

//////////
// ALB Ingress Controller and related resources

// Create the ALB security group.
const albSecurityGroup = createAlbSecurityGroup(config.baseName, {
    vpcId: config.vpcId,
    nodeSecurityGroupId: config.nodeSecurityGroupId,
    // tags: tags,
    clusterName: config.clusterName,
});

const albIngressController = createAlbIngressController(config.baseName, {
    k8sprovider: k8sprovider,
    vpcId: config.vpcId,
    clusterName: config.clusterName,
});

export const albSecurityGroupId = albSecurityGroup.id;

