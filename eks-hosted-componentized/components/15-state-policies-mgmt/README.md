# Required Configurations

aws:region - the AWS region to deploy to
baseName - the base name to use when creating resources, this should be shared across all connected components

Please be sure to set up OIDC (or local credentials) to deploy to AWS

# Optional Configurations

If you want to use existing S3 buckets instead of creating new ones, provide any of the following configurations:

checkpointsS3BucketName - existing S3 bucket name for storing Pulumi state checkpoints
policyPacksS3BucketName - existing S3 bucket name for storing Pulumi policy packs
eventsS3BucketName - existing S3 bucket name for storing Pulumi events

# Optional Args

This component accepts the following optional arguments (which take precedence over config values):
- checkpointsS3BucketName - S3 bucket name for checkpoints
- policyPacksS3BucketName - S3 bucket name for policy packs  
- eventsS3BucketName - S3 bucket name for events

# What This Component Creates

This component manages S3 buckets for Pulumi state and policy management:
- Checkpoints bucket for storing Pulumi state snapshots
- Policy packs bucket for storing Pulumi policy packages
- Events bucket for storing Pulumi audit events

If bucket names are not provided via config or args, new S3 buckets will be created with protection enabled.