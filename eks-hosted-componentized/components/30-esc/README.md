# Required Configurations

aws:region - the AWS region to deploy to
baseName - the base name to use when creating resources, this should be shared across all connected components

Please be sure to set up OIDC (or local credentials) to deploy to AWS

# Optional Configurations

If you want to use an existing S3 bucket for ESC storage instead of creating a new one, provide:

escBucketName - existing S3 bucket name for ESC (Environments, Secrets, and Configuration) storage

# Optional Args

This component accepts the following optional argument (which takes precedence over config values):
- escBucketName - S3 bucket name for ESC storage

# What This Component Creates

This component manages resources for Pulumi ESC (Environments, Secrets, and Configuration):
- If an existing ESC bucket name is provided (via config or args), it uses that bucket
- If no existing bucket name is provided, it creates a new S3 bucket with protection enabled

# Notes

This component is intentionally minimal but kept as a separate stack to allow for future ESC-related infrastructure requirements.