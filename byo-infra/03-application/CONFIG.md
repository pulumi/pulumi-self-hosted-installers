# Configuration Guide

This document describes the configuration requirements for the Pulumi Self-Hosted Application deployment.

## Required Configuration

### Stack References

This stack depends on outputs from two prerequisite stacks:

1. **Infrastructure Stack** (`stackName1`): Provides database and storage resources
2. **Cluster Stack** (`stackName2`): Provides Kubernetes cluster and kubeconfig

### Required Values

| Configuration Key | Type | Description | Example |
|-------------------|------|-------------|---------|
| `imageTag` | string | Docker image tag for Pulumi services | `v3.118.0` |
| `stackName1` | string | Infrastructure stack reference | `org/01-infrastructure/dev` |
| `stackName2` | string | Cluster stack reference | `org/02-kubernetes/dev` |
| `apiDomain` | string | API domain (must start with "api.") | `api.example.com` |
| `consoleDomain` | string | Console domain (must start with "app.") | `app.example.com` |

### Required Secrets

| Secret Key | Type | Description |
|------------|------|-------------|
| `licenseKey` | string | Pulumi license key |
| `apiTlsKey` | string | TLS private key for API domain |
| `apiTlsCert` | string | TLS certificate for API domain |
| `consoleTlsKey` | string | TLS private key for console domain |
| `consoleTlsCert` | string | TLS certificate for console domain |

### Optional Configuration

| Configuration Key | Type | Default | Description |
|-------------------|------|---------|-------------|
| `commonName` | string | `pulumi-selfhosted` | Resource name prefix |
| `smtpServer` | string | `""` | SMTP server for notifications |
| `smtpUsername` | string | `""` | SMTP username |
| `smtpFromAddress` | string | `message@pulumi.com` | Email from address |
| `recaptchaSiteKey` | string | `""` | reCAPTCHA site key |
| `samlSsoEnabled` | string | `false` | Enable SAML SSO |

### Optional Secrets

| Secret Key | Type | Default | Description |
|------------|------|---------|-------------|
| `smtpPassword` | string | `""` | SMTP password |
| `recaptchaSecretKey` | string | `""` | reCAPTCHA secret key |

## Stack Dependencies

### Infrastructure Stack Outputs Required

- `dbConnectionString` - MySQL database connection string
- `dbHost` - Database host
- `dbLogin` - Database username
- `dbPassword` - Database password
- `dbServerName` - Database server name
- `policyBucketConnectionString` - S3-compatible storage for policy packs
- `checkpointBucketConnectionString` - S3-compatible storage for checkpoints
- `serviceAccountAccessKeyId` - Storage access key ID
- `serviceAccountSecretAccessKey` - Storage secret access key

### Cluster Stack Outputs Required

- `kubeconfig` - Kubernetes cluster configuration

## Setup Instructions

1. Copy `Pulumi.EXAMPLE.yaml` to `Pulumi.<stack-name>.yaml`
2. Update the configuration values for your environment
3. Replace mock certificates with real TLS certificates for your domains
4. Ensure the referenced infrastructure and cluster stacks are deployed
5. Set your Pulumi license key in the secrets section

## TLS Certificate Requirements

The API and Console endpoints require valid TLS certificates. You can:
- Use certificates from a Certificate Authority (CA)
- Use Let's Encrypt certificates
- Generate self-signed certificates for testing (not recommended for production)

## Domain Requirements

- `apiDomain` must start with "api." (e.g., `api.example.com`)
- `consoleDomain` must start with "app." (e.g., `app.example.com`)
- Both domains should point to your Kubernetes cluster's ingress controller