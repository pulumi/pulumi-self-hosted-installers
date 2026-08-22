# Pulumi EKS Self-Hosted Template

This template deploys a complete Pulumi self-hosted infrastructure on AWS EKS, including all necessary components for running Pulumi's services in your own environment.

## Architecture

The template creates the following components:
- **IAM Resources**: Service roles and policies for EKS and RDS
- **Networking**: VPC, subnets, and security groups
- **EKS Cluster**: Kubernetes cluster with managed node groups
- **Cluster Services**: Load balancer controller and essential addons
- **State Management**: S3 buckets for state, policies, and events
- **Database**: RDS Aurora MySQL cluster for Pulumi data
- **Insights**: OpenSearch for observability and search
- **ESC**: Environment, Secrets, and Configuration storage
- **Pulumi Service**: Complete API and Console deployment

## Configuration Parameters

### Required Parameters

These parameters must be provided and have no default values:

| Parameter | Type | Description |
|-----------|------|-------------|
| `baseName` | string | Base name used for all resource naming |
| `eksClusterName` | string | Name of the EKS cluster |
| `opensearchPassword` | string (secret) | Admin password for OpenSearch cluster |
| `licenseKey` | string (secret) | Pulumi license key for self-hosted deployment |
| `hostedZoneDomainName` | string | Domain name for the Route53 hosted zone (e.g., "example.com") |
| `hostedZoneDomainSubdomain` | string | Subdomain prefix for services (e.g., "pulumi" for pulumi.example.com) |
| `imageTag` | string | Docker image tag for Pulumi services |

### Optional Parameters

All optional parameters have `default: null` and will use component defaults if not specified:

#### Networking Configuration
| Parameter | Type | Description |
|-----------|------|-------------|
| `networkCidrBlock` | string | CIDR block for the VPC (required by networking component) |
| `vpcId` | string | ID of existing VPC to use instead of creating new one |
| `publicSubnetIds` | object | Array of existing public subnet IDs |
| `privateSubnetIds` | object | Array of existing private subnet IDs |

**Resource Creation Behavior:**
- If `vpcId`, `publicSubnetIds`, and `privateSubnetIds` are ALL provided → Uses existing networking
- If any of these are missing → **Creates new VPC and subnets** (requires `networkCidrBlock`)

#### IAM Configuration
| Parameter | Type | Description |
|-----------|------|-------------|
| `eksServiceRoleName` | string | Name of existing EKS service role |
| `eksInstanceRoleName` | string | Name of existing EKS instance role |
| `databaseMonitoringRoleArn` | string | ARN of existing RDS monitoring role |

#### EKS Cluster Configuration
| Parameter | Type | Description |
|-----------|------|-------------|
| `clusterVersion` | string | Kubernetes version (component default: "1.30.3") |
| `standardNodeGroupInstanceType` | string | Instance type for standard node group (component default: "t3.xlarge") |
| `standardNodeGroupDesiredCapacity` | number | Desired capacity for standard node group (component default: 2) |
| `standardNodeGroupMinSize` | number | Minimum size for standard node group (component default: 2) |
| `standardNodeGroupMaxSize` | number | Maximum size for standard node group (component default: 5) |
| `pulumiNodeGroupInstanceType` | string | Instance type for Pulumi-specific node group (component default: "t3.xlarge") |
| `pulumiNodeGroupDesiredCapacity` | number | Desired capacity for Pulumi node group (component default: 3) |
| `pulumiNodeGroupMinSize` | number | Minimum size for Pulumi node group (component default: 3) |
| `pulumiNodeGroupMaxSize` | number | Maximum size for Pulumi node group (component default: 5) |
| `httpTokens` | string | IMDS tokens setting (component default: "required") |
| `httpPutResponseHopLimit` | number | IMDS hop limit (component default: 2) |

#### S3 Storage Configuration
| Parameter | Type | Description |
|-----------|------|-------------|
| `checkpointsS3BucketName` | string | Existing S3 bucket for state checkpoints |
| `policyPacksS3BucketName` | string | Existing S3 bucket for policy packs |
| `eventsS3BucketName` | string | Existing S3 bucket for audit events |
| `escBucketName` | string | Existing S3 bucket for ESC storage |

**Resource Creation Behavior:**
- If any bucket name is NOT provided → **Creates new S3 bucket** for that storage type
- If bucket name IS provided → Uses existing bucket

#### Database Configuration
| Parameter | Type | Description |
|-----------|------|-------------|
| `dbReplicas` | number | Number of database replicas (component default: 2) |
| `dbInstanceType` | string | RDS instance type (component default: "db.r5.large") |
| `dbHostEndpoint` | string | Existing database host endpoint |
| `dbPort` | string | Existing database port |
| `dbUsername` | string | Existing database username |
| `dbPassword` | string (secret) | Existing database password |

**Resource Creation Behavior:**
- If `dbHostEndpoint`, `dbPort`, `dbUsername`, and `dbPassword` are ALL provided → Uses existing database
- If any of these are missing → **Creates new RDS Aurora MySQL cluster** with specified replicas and instance type

#### Encryption Configuration
One of these must be provided (no component defaults available):

| Parameter | Type | Description |
|-----------|------|-------------|
| `awsKMSKeyArn` | string | AWS KMS key ARN for encryption |
| `encryptionKey` | string | Hard-coded encryption key (if not using KMS) |

#### Service Scaling Configuration
| Parameter | Type | Description |
|-----------|------|-------------|
| `apiReplicas` | number | Number of API service replicas (component default: 2) |
| `consoleReplicas` | number | Number of Console service replicas (component default: 2) |

#### SMTP Configuration
All SMTP parameters default to empty string ("") when not specified:

| Parameter | Type | Description |
|-----------|------|-------------|
| `smtpServer` | string | SMTP server for email notifications (component default: "") |
| `smtpUsername` | string | SMTP username (component default: "") |
| `smtpPassword` | string | SMTP password (component default: "") |
| `smtpGenericSender` | string | Generic sender email address (component default: "") |

#### reCAPTCHA Configuration
Both reCAPTCHA parameters default to empty string ("") when not specified:

| Parameter | Type | Description |
|-----------|------|-------------|
| `recaptchaSiteKey` | string | reCAPTCHA site key (component default: "") |
| `recaptchaSecretKey` | string | reCAPTCHA secret key (component default: "") |

#### Authentication Configuration
| Parameter | Type | Description |
|-----------|------|-------------|
| `samlSsoEnabled` | string | Enable SAML SSO ("true"/"false", component default: "false") |
| `consoleHideEmailSignup` | string | Hide email signup in Console ("true"/"false", component default: "false") |
| `consoleHideEmailLogin` | string | Hide email login in Console ("true"/"false", component default: "false") |
| `apiDisableEmailSignup` | string | Disable email signup in API ("true"/"false", component default: "false") |
| `apiDisableEmailLogin` | string | Disable email login in API ("true"/"false", component default: "false") |

#### GitHub OAuth Configuration
All GitHub OAuth parameters default to empty string ("") when not specified:

| Parameter | Type | Description |
|-----------|------|-------------|
| `github_oauth_endpoint` | string | GitHub OAuth endpoint (component default: "") |
| `github_oauth_id` | string | GitHub OAuth client ID (component default: "") |
| `github_oauth_secret` | string | GitHub OAuth client secret (component default: "") |

## Outputs

The template provides both unpacked critical values and complete component outputs:

### Critical Access Information
- `serviceUrl` - HTTPS URL for Pulumi API service
- `consoleUrl` - HTTPS URL for Pulumi Console web interface

### Infrastructure Details
- `kubeconfig` - Kubernetes configuration for cluster access
- `clusterName` - EKS cluster name
- `vpcId`, `publicSubnetIds`, `privateSubnetIds` - Network information
- `dbHost`, `dbPort`, `dbUsername` - Database connection details
- S3 bucket names for various storage needs
- Load balancer DNS names and security group IDs

### Complete Component Outputs
- `iam`, `network`, `cluster`, `clusterServices`, `statePolicies`, `database`, `insights`, `esc`, `pulumiService` - Full outputs from each component

## Prerequisites

1. AWS CLI configured with appropriate credentials
2. Pulumi CLI installed
3. Route53 hosted zone for the domain specified in `hostedZoneDomainName`
4. Valid Pulumi license key for self-hosted deployment

## Usage

1. Create a new Pulumi project using this template
2. Configure the required parameters in your Pulumi configuration
3. Run `pulumi up` to deploy the infrastructure
4. Access your Pulumi services at the provided URLs

## Example Configuration

```bash
pulumi config set baseName my-pulumi
pulumi config set eksClusterName my-pulumi-cluster
pulumi config set --secret opensearchPassword mySecurePassword123
pulumi config set --secret licenseKey pul-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
pulumi config set hostedZoneDomainName example.com
pulumi config set hostedZoneDomainSubdomain pulumi
pulumi config set imageTag 3.100.0
```

After deployment, your services will be available at:
- API: https://api.pulumi.example.com
- Console: https://app.pulumi.example.com