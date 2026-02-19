# Required Configurations

aws:region - the AWS region to deploy to
baseName - the base name to use when creating resources, this should be shared across all connected components

Please be sure to set up OIDC (or local credentials) to deploy to AWS

# Optional Configurations

If you want to bring existing roles instead of making new ones, provide each of the following configurations

databaseMonitoringRoleArn
eksServiceRoleName
eksInstanceRoleName
