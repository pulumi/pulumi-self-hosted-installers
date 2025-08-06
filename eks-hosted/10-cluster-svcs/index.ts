import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { config } from "./config";
import { createAlbSecurityGroup, createAlbIngressController } from "./ingress-controller";
import { CertManager, AWSRoute53ClusterIssuer } from "../../components-microstacks";

// instantiate k8s provider for subsequent resources
const k8sprovider = new k8s.Provider("provider", {kubeconfig: config.kubeconfig, deleteUnreachable: true});

////////////
// Enable necessary EKS addons
// Note that "vpc-cni" is automatically installed by EKS and is not required to be installed.
const coreDnsAddon = new aws.eks.Addon("coreDns", {
    addonName: "coredns",
    clusterName: config.clusterName,
    addonVersion: "v1.11.4-eksbuild.2",
});

//////////
// ALB Ingress Controller and related resources

// Create the ALB security group.
const albSecurityGroup = createAlbSecurityGroup(config.baseName, {
    vpcId: config.vpcId,
    nodeSecurityGroupId: config.nodeSecurityGroupId,
    clusterName: config.clusterName,
});

const albIngressController = createAlbIngressController(config.baseName, {
    k8sprovider: k8sprovider,
    vpcId: config.vpcId,
    clusterName: config.clusterName,
});

//////////
// Cert-Manager for TLS certificate management
// This enables OpenSearch to work across namespaces with proper TLS certificates

// Install cert-manager
const certManager = new CertManager("cert-manager", {
    provider: k8sprovider,
    certManagerNamespace: "cert-manager",
    issuerEmail: config.certManagerEmail,
});

// Create AWS Route53 ClusterIssuer for automatic certificate provisioning
const route53Issuer = new AWSRoute53ClusterIssuer("route53-issuer", {
    provider: k8sprovider,
    issuerEmail: config.certManagerEmail,
    region: config.awsRegion,
    hostedZoneId: config.hostedZoneId,
    // Use IRSA role for Route53 access
    role: config.certManagerIAMRoleArn,
}, { dependsOn: [certManager] });

export const albSecurityGroupId = albSecurityGroup.id;
export const certManagerNamespace = certManager.namespace;
export const route53IssuerName = route53Issuer.issuerName;

