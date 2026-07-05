# Required Configurations

aws:region - the AWS region to deploy to
licenseKey - Pulumi license key (stored as secret)
hostedZoneDomainName - domain name for the hosted zone (e.g., "example.com")
hostedZoneDomainSubdomain - subdomain prefix (e.g., "pulumi" for pulumi.example.com)
imageTag - Docker image tag for Pulumi services

**Encryption Configuration** (one of these is required):
- awsKMSKeyArn - AWS KMS key ARN for encryption
- encryptionKey - hard-coded encryption key (if not using KMS)

Please be sure to set up OIDC (or local credentials) to deploy to AWS

# Optional Configurations

## Service Configuration
apiReplicas - number of API service replicas (default: 2)
consoleReplicas - number of console service replicas (default: 2)

## SMTP Configuration
smtpServer - SMTP server for email notifications
smtpUsername - SMTP username
smtpPassword - SMTP password
smtpGenericSender - generic sender email address

## reCAPTCHA Configuration
recaptchaSiteKey - reCAPTCHA site key
recaptchaSecretKey - reCAPTCHA secret key

## SAML SSO Configuration
samlSsoEnabled - enable SAML SSO (default: "false")

## Email Login Configuration
consoleHideEmailSignup - hide email signup in console (default: "false")
consoleHideEmailLogin - hide email login in console (default: "false") 
apiDisableEmailSignup - disable email signup in API (default: "false")
apiDisableEmailLogin - disable email login in API (default: "false")

## GitHub OAuth Configuration
github_oauth_endpoint - GitHub OAuth endpoint
github_oauth_id - GitHub OAuth client ID
github_oauth_secret - GitHub OAuth client secret

# Required Args

This component requires the following values to be passed as arguments from other stack components:
- kubeconfig, clusterName, nodeGroupInstanceType (from 05-eks-cluster)
- albSecurityGroupId (from 10-cluster-svcs)
- checkpointsS3BucketName, policyPacksS3BucketName, eventsS3BucketName (from 15-state-policies-mgmt)
- dbConn (from 20-database)
- escBucketName (from 30-esc)
- eksInstanceRoleName (from 01-iam)
- openSearchEndpoint, openSearchUser, openSearchPassword, openSearchNamespaceName (from 25-insights)

# What This Component Creates

This component deploys the complete Pulumi self-hosted service including:
- Kubernetes namespace for Pulumi services
- Service accounts and RBAC configuration
- Secrets management for database, SMTP, OAuth, etc.
- Encryption service (KMS or local key)
- API service deployment with migration init container
- Console (frontend) service deployment
- Load balancer services for API and Console
- ACM TLS certificates for HTTPS
- Application Load Balancer ingresses with SSL termination
- Route53 DNS records for API and Console endpoints
- Pod disruption budgets for high availability

The service will be accessible at:
- API: https://api.{subdomain}.{domain}
- Console: https://app.{subdomain}.{domain}