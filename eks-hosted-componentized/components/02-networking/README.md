# Required Configurations

aws:region - the AWS region to deploy to
baseName - the base name to use when creating resources, this should be shared across all connected components
eksClusterName - the name of the EKS cluster
networkCidrBlock - the CIDR block for the VPC network

Please be sure to set up OIDC (or local credentials) to deploy to AWS

# Optional Configurations

If you want to bring your own VPC and subnets instead of creating new ones, provide each of the following configurations

vpcId - the ID of an existing VPC
publicSubnetIds - array of public subnet IDs
privateSubnetIds - array of private subnet IDs