# Required Configurations

aws:region - the AWS region to deploy to
baseName - the base name to use when creating resources, this should be shared across all connected components

Please be sure to set up OIDC (or local credentials) to deploy to AWS

# Required Args

This component requires the following values to be passed as arguments:
- vpcId - VPC ID for the cluster (from 02-networking component)
- clusterName - name of the EKS cluster (from 05-eks-cluster component) 
- kubeconfig - Kubernetes configuration for cluster access (from 05-eks-cluster component)
- nodeSecurityGroupId - security group ID of the EKS worker nodes (from 05-eks-cluster component)

# What This Component Creates

This component sets up essential cluster services:
- CoreDNS EKS addon for DNS resolution within the cluster
- AWS Load Balancer Controller for managing ALBs via Kubernetes ingress
- Security group for ALBs with proper ingress/egress rules
- Service account for the ALB controller