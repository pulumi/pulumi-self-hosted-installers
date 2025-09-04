# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## EKS Hosted Architecture Overview

This is the Amazon EKS installer for the Self-Hosted Pulumi Service, implementing a microstack architecture with 8 independent Pulumi projects deployed in numbered sequence. This design supports bring-your-own-infrastructure (BYO) scenarios and modular feature deployment.

## Deployment Architecture

### 8-Stage Sequential Deployment
Each numbered directory is an independent Pulumi project that must be deployed in order:

1. **01-iam**: IAM roles and policies for EKS, ALB controller, and service accounts
2. **02-networking**: VPC, subnets, security groups, and networking foundation
3. **05-eks-cluster**: EKS cluster with managed node groups and OIDC provider
4. **10-cluster-svcs**: Kubernetes cluster services (ALB ingress controller)
5. **15-state-policies-mgmt**: S3 buckets for Pulumi state and policy pack storage
6. **20-database**: RDS Aurora MySQL cluster for Pulumi Service data
7. **25-insights**: OpenSearch domain for Pulumi Insights feature
8. **30-esc**: S3 bucket for Pulumi ESC (Environment, Secrets, Configuration)
9. **90-pulumi-service**: Final deployment of Pulumi API and Console services

### Stack Dependencies
- Each stack consumes outputs from previous stacks via `pulumi.StackReference`
- Configuration flows through numbered sequence: 01 → 02 → 05 → 10 → 15/20/25/30 → 90
- Optional stacks (25-insights, 30-esc) can be skipped based on licensing requirements

## Development Commands

### Per-Stack Commands
Navigate to any numbered directory (e.g., `01-iam/`) and use:

```bash
# Install dependencies
npm install

# Build TypeScript
tsc

# Deploy stack
pulumi up

# Preview changes
pulumi preview

# Destroy stack
pulumi destroy
```

### Configuration Management
Each stack has configuration requirements documented in `Pulumi.README.yaml`:

```bash
# Copy example config
cp Pulumi.README.yaml Pulumi.{stack-name}.yaml

# Set configuration values
pulumi config set aws:region us-east-1
pulumi config set baseName pulumiselfhost
```

### Full Deployment Workflow
```bash
# Deploy all stacks in sequence
for dir in 01-iam 02-networking 05-eks-cluster 10-cluster-svcs 15-state-policies-mgmt 20-database 25-insights 30-esc 90-pulumi-service; do
    cd $dir
    npm install && pulumi up --yes
    cd ..
done
```

## Bring-Your-Own Infrastructure Support

### Supported BYO Scenarios
- **01-iam**: Use existing IAM roles instead of creating new ones
- **02-networking**: Use existing VPC/subnets instead of creating new networking
- **15-state-policies-mgmt**: Use existing S3 buckets for state storage
- **30-esc**: Use existing S3 bucket for ESC storage

### BYO Configuration Pattern
When using existing infrastructure:
1. Still run the installer stack (don't skip it)
2. Provide existing resource IDs/ARNs in configuration
3. Stack creates "dummy" resources and outputs existing values
4. Downstream stacks consume outputs normally

Example BYO IAM configuration:
```yaml
config:
  # Use existing IAM roles
  eksServiceRoleArn: arn:aws:iam::123456789012:role/existing-eks-service-role
  eksInstanceRoleArn: arn:aws:iam::123456789012:role/existing-eks-instance-role
```

## Code Structure Patterns

### TypeScript Project Structure
Each stack follows consistent structure:
```
{number}-{name}/
├── Pulumi.yaml              # Project definition
├── Pulumi.README.yaml       # Configuration documentation and example
├── package.json            # Node.js dependencies
├── tsconfig.json           # TypeScript configuration
├── config.ts              # Configuration input validation
├── index.ts               # Main deployment logic
└── {feature}.ts           # Feature-specific modules
```

### Configuration Management Pattern
- `config.ts`: Validates and exposes configuration using `pulumi.Config`
- `Pulumi.README.yaml`: Documents all required and optional configuration
- Stack references: `new pulumi.StackReference("organization/project-{stage}/stack")`

### Resource Naming Convention
All resources use consistent naming: `${baseName}-{purpose}-{disambiguator}`
- Example: `pulumiselfhost-eks-cluster`, `pulumiselfhost-db-subnet-group`

## Key Dependencies

### Common Dependencies Across All Stacks
- `@pulumi/pulumi`: Core Pulumi SDK
- `@pulumi/aws`: AWS provider for cloud resources
- `@pulumi/eks`: High-level EKS component (stack 05 only)
- `@pulumi/kubernetes`: Kubernetes resources (stacks 10, 90)

### Stack-Specific Dependencies
- **01-iam**: IAM policies and role management
- **05-eks-cluster**: EKS cluster creation with `@pulumi/eks`
- **10-cluster-svcs**: Kubernetes deployments and Helm charts
- **25-insights**: OpenSearch domain configuration
- **90-pulumi-service**: Complex Kubernetes application deployment

## Testing and Validation

### Pre-Deployment Validation
```bash
# Validate TypeScript compilation
tsc --noEmit

# Preview deployment changes
pulumi preview
```

### Post-Deployment Testing
- EKS cluster accessibility via `kubectl`
- Pulumi Service health checks at configured endpoints
- Database connectivity validation
- S3 bucket policy verification

## Security Considerations

### IAM and Access Management
- Service roles follow least-privilege principle
- OIDC provider enables service account authentication
- SSO role ARN required for kubectl access

### Network Security
- Private subnets for worker nodes and databases
- Security groups restrict traffic to necessary ports
- ALB terminates TLS at load balancer

### Storage Security  
- S3 buckets use server-side encryption
- RDS encrypted at rest with AWS KMS
- OpenSearch domain uses encryption in transit and at rest

## Version Compatibility

### Kubernetes Version Support
- Current: Kubernetes 1.31.0 (as of v3.1, Feb 2025)
- EKS managed node groups automatically updated
- See README.md "Installer Revision History" for version matrix

### Migration Notes
- Version 3.0 migrated to managed node groups from self-managed
- Version 3.1 migrated off deprecated `@pulumi/kubernetesx` package
- Review upgrade steps in main README.md for breaking changes