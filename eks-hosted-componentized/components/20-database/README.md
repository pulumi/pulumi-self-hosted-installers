# Required Configurations

aws:region - the AWS region to deploy to
baseName - the base name to use when creating resources, this should be shared across all connected components

Please be sure to set up OIDC (or local credentials) to deploy to AWS

# Optional Configurations

dbReplicas - number of database replicas to create (default: 2)
dbInstanceType - RDS instance type for database (default: "db.r5.large")

## Existing Database Configuration

If you want to use an existing database instead of creating a new RDS Aurora cluster, provide all of the following configurations:

dbHostEndpoint - existing database host endpoint
dbPort - existing database port
dbUsername - existing database username  
dbPassword - existing database password (will be stored as secret)

# Required Args

This component requires the following values to be passed as arguments:
- databaseMonitoringRoleArn - IAM role for RDS enhanced monitoring (from 01-iam component)
- privateSubnetIds - array of private subnet IDs for database placement (from 02-networking component)
- nodeSecurityGroupId - security group ID of EKS worker nodes for database access (from 05-eks-cluster component)


# What This Component Creates

This component manages database resources for Pulumi:
- If existing database info is provided, it uses that connection
- If no existing database info is provided, it creates:
  - RDS Aurora MySQL cluster with specified number of replicas
  - Database subnet group using private subnets
  - Parameter group with logging enabled
  - Encrypted storage and automated backups
  - Enhanced monitoring integration