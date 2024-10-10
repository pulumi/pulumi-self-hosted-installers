import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";

//////////
// ALB Ingress Controller
// The ALB Ingress Controller automatically creates and plumbs ALBs when a K8s ingress is created. 

export interface AlbIngressControllerOptions {
  // The VPC for the cluster and ALBs
  vpcId: string | pulumi.Output<string> | pulumi.Output<any>;
  // The cluster name associated with the worker node group.
  clusterName: pulumi.Output<any>;
  // K8s provider to use to create the resources in k8s cluster
  k8sprovider: k8s.Provider;
}

export function createAlbIngressController(name: string, args: AlbIngressControllerOptions) {

  // service account for the ALB Ingress Controller
  const albServiceAccount = new k8s.core.v1.ServiceAccount("albServiceAccount", {
    metadata: {
        name: "aws-load-balancer-controller",
        namespace: "kube-system"
    }
  }, {provider: args.k8sprovider})

  const albHelm = new k8s.helm.v3.Release("albhelm", {
    repositoryOpts: {
        repo: "https://aws.github.io/eks-charts"
    },
    chart: "aws-load-balancer-controller",
    namespace: "kube-system",
    values: {
        clusterName: args.clusterName,
        serviceAccount: {
            create: false,
            name: "aws-load-balancer-controller"
        },
        vpcId: args.vpcId,
    }
  }, {provider: args.k8sprovider});
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
export interface AlbSecGroupOptions {
  // The VPC in which to create the security group.
  vpcId: string | pulumi.Output<string> | pulumi.Output<any>;
  // The security group id of the worker node groups in the cluster that the ALBs
  // will be servicing.
  nodeSecurityGroupId: pulumi.Output<any>;
  // The cluster name associated with the worker node group.
  clusterName: pulumi.Output<any>;
}
export function createAlbSecurityGroup(name: string, args: AlbSecGroupOptions): aws.ec2.SecurityGroup {
  const albSecurityGroup = new aws.ec2.SecurityGroup(`${name}-albSecurityGroup`, {
      vpcId: args.vpcId,
      revokeRulesOnDelete: true,
      tags: 
        args.clusterName.apply(cluster => (<aws.Tags>{
          "Name": `${name}-albSecurityGroup`,
          [`kubernetes.io/cluster/${cluster}`]: "owned",
      })),
  });

  const nodeAlbIngressRule = new aws.ec2.SecurityGroupRule(`${name}-nodeAlbIngressRule`, {
      description: "Allow ALBs to communicate with workers",
      type: "ingress",
      fromPort: 0,
      toPort: 65535,
      protocol: "tcp",
      securityGroupId: args.nodeSecurityGroupId,
      sourceSecurityGroupId: albSecurityGroup.id,
  });

  const albInternetEgressRule = new aws.ec2.SecurityGroupRule(`${name}-albInternetEgressRule`, {
      description: "Allow external internet access",
      type: "egress",
      fromPort: 0,
      toPort: 0,
      protocol: "-1",  // all
      cidrBlocks: [ "0.0.0.0/0" ],
      securityGroupId: albSecurityGroup.id,
  });

  const albInternetHttpIngressRule = new aws.ec2.SecurityGroupRule(`${name}-albInternetHttpEgressRule`, {
      description: "Allow internet clients to communicate with ALBs over HTTP",
      type: "ingress",
      fromPort: 80,
      toPort: 80,
      protocol: "tcp",  // all
      cidrBlocks: [ "0.0.0.0/0" ],
      securityGroupId: albSecurityGroup.id,
  });

  const albInternetHttpsIngressRule = new aws.ec2.SecurityGroupRule(`${name}-albInternetHttpsEgressRule`, {
      description: "Allow internet clients to communicate with ALBs over HTTPS",
      type: "ingress",
      fromPort: 443,
      toPort: 443,
      protocol: "tcp",  // all
      cidrBlocks: [ "0.0.0.0/0" ],
      securityGroupId: albSecurityGroup.id,
  });

  return albSecurityGroup;
}