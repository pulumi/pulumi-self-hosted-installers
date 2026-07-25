# Required Configurations

aws:region - the AWS region to deploy to
baseName - the base name to use when creating resources, this should be shared across all connected components

Please be sure to set up OIDC (or local credentials) to deploy to AWS

# Optional Configurations

clusterVersion - the Kubernetes version for the EKS cluster (default: "1.30.3")

## Node Group Configurations

standardNodeGroupInstanceType - instance type for standard node group (default: "t3.xlarge")
standardNodeGroupDesiredCapacity - desired capacity for standard node group (default: 2)
standardNodeGroupMinSize - minimum size for standard node group (default: 2)
standardNodeGroupMaxSize - maximum size for standard node group (default: 5)

pulumiNodeGroupInstanceType - instance type for Pulumi node group (default: "t3.xlarge")
pulumiNodeGroupDesiredCapacity - desired capacity for Pulumi node group (default: 3)
pulumiNodeGroupMinSize - minimum size for Pulumi node group (default: 3)
pulumiNodeGroupMaxSize - maximum size for Pulumi node group (default: 5)

httpTokens - IMDS tokens setting (default: "required")
httpPutResponseHopLimit - IMDS hop limit (default: 2)

# Required Args

This component requires the following values to be passed as arguments:
- eksInstanceRole - IAM role for EKS worker nodes (from 01-iam component)
- eksServiceRole - IAM role for EKS cluster service (from 01-iam component) 
- clusterName - name of the EKS cluster (from 02-networking component)
- vpcId - VPC ID for the cluster (from 02-networking component)
- publicSubnetIds - array of public subnet IDs (from 02-networking component)
- privateSubnetIds - array of private subnet IDs (from 02-networking component)