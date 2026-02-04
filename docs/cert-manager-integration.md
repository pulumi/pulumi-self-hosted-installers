# Certificate Manager Integration for OpenSearch Cross-Namespace Communication

This document describes the certificate manager integration that enables OpenSearch to work across Kubernetes namespaces with proper TLS certificates.

## Overview

The Pulumi Self-Hosted Services now support deploying OpenSearch in a separate namespace from the Pulumi API and Console services, with secure TLS communication enabled by cert-manager.

### Problem Solved

Previously, OpenSearch had to be deployed in the same namespace as the Pulumi services due to TLS certificate issues. This implementation:

- Enables OpenSearch deployment in isolated namespaces
- Provides automatic TLS certificate management via cert-manager
- Supports cross-namespace communication with proper DNS names
- Works across all supported cloud platforms (AWS EKS, Azure AKS, Google GKE)

## Architecture

### Components Added

1. **Cloud-Agnostic cert-manager Components**:
   - `CertManager`: Generic cert-manager installation
   - `AWSRoute53ClusterIssuer`: AWS Route53 DNS challenges with IRSA
   - `AzureDNSClusterIssuer`: Azure DNS challenges with Managed Identity
   - `GCPDNSClusterIssuer`: Google Cloud DNS challenges with Service Account

2. **Enhanced OpenSearch Component**:
   - TLS configuration with `enableTLS` parameter
   - Cross-namespace DNS names and endpoints
   - Network policies for secure inter-namespace access
   - Certificate secret mounting

3. **OpenSearch Certificate Management**:
   - `OpenSearchCertificates`: Auto-generates certificates with proper DNS SANs
   - `OpenSearchCAIssuer`: CA issuer for OpenSearch-specific certificates

### Cross-Namespace Communication

The implementation enables OpenSearch communication using fully qualified DNS names:

```
https://opensearch-cluster-master.${namespace}.svc.cluster.local:9200
```

Instead of the previous same-namespace approach:
```
https://opensearch-cluster-master:9200
```

## Platform Integration

### AWS EKS

**Files Modified:**
- `eks-hosted/10-cluster-svcs/index.ts`: Added cert-manager installation and Route53 issuer
- `eks-hosted/10-cluster-svcs/config.ts`: Added cert-manager configuration parameters
- `eks-hosted/25-insights/index.ts`: Updated OpenSearch with TLS support
- `eks-hosted/25-insights/config.ts`: Added TLS and namespace configuration

**Configuration Required:**
```yaml
# In Pulumi.yaml configuration
certManagerEmail: "admin@yourdomain.com"
awsRegion: "us-east-1"
hostedZoneId: "Z123456789ABCDEFGHIJ"  # Your Route53 hosted zone ID
certManagerIAMRoleArn: "arn:aws:iam::123456789012:role/cert-manager-role"  # IRSA role for Route53 access
enableOpenSearchTLS: true
opensearchNamespace: "pulumi-insights"
pulumiServiceNamespace: "pulumi-service"
```

### Google Cloud GKE

**Files Modified:**
- `gke-hosted/02-kubernetes/index.ts`: Added cert-manager and GCP DNS issuer
- `gke-hosted/02-kubernetes/config.ts`: Added cert-manager configuration

**Configuration Required:**
```yaml
# In Pulumi.yaml configuration
certManagerEmail: "admin@yourdomain.com"
gcpProject: "your-gcp-project-id"
gcpServiceAccountSecretName: "gcp-dns-service-account"  # Secret containing service account JSON
enableOpenSearchTLS: true
openSearchNamespace: "opensearch"
```

### Azure AKS

Azure AKS already had cert-manager integration. The implementation maintains backward compatibility while providing the new cloud-agnostic components.

## Configuration Examples

### EKS Example Configuration

```yaml
# Pulumi.dev.yaml example for EKS
config:
  aws:region: us-east-1
  selfhosted-10-clustersvcs:baseName: pulumi-dev
  selfhosted-10-clustersvcs:certManagerEmail: admin@mycompany.com
  selfhosted-10-clustersvcs:hostedZoneId: Z123456789ABCDEFGHIJ
  selfhosted-10-clustersvcs:certManagerIAMRoleArn: arn:aws:iam::123456789012:role/cert-manager-route53-role
  
  selfhosted-25-insights:baseName: pulumi-dev
  selfhosted-25-insights:enableOpenSearchTLS: true
  selfhosted-25-insights:opensearchNamespace: pulumi-insights
  selfhosted-25-insights:pulumiServiceNamespace: pulumi-service
  selfhosted-25-insights:opensearchPassword:
    secure: AAABADHGciP7...  # Encrypted password
```

### GKE Example Configuration

```yaml
# Pulumi.dev.yaml example for GKE
config:
  gcp:project: my-gcp-project
  selfhosted-02-kubernetes:stackName1: my-org/selfhosted-01-infrastructure/dev
  selfhosted-02-kubernetes:certManagerEmail: admin@mycompany.com
  selfhosted-02-kubernetes:gcpProject: my-gcp-project
  selfhosted-02-kubernetes:gcpServiceAccountSecretName: gcp-dns-service-account
  selfhosted-02-kubernetes:enableOpenSearchTLS: true
  selfhosted-02-kubernetes:openSearchNamespace: opensearch
```

## Security Considerations

### Network Policies

The implementation creates NetworkPolicies to restrict cross-namespace communication:

```yaml
networkPolicy:
  enabled: true
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: pulumi-service-namespace
      ports:
        - port: 9200
          protocol: TCP
```

### Certificate Management

- Certificates are automatically renewed by cert-manager
- Private keys are stored securely in Kubernetes secrets
- DNS challenges use cloud-native authentication (IRSA, Managed Identity, Service Account)

### RBAC

Each cloud platform uses appropriate RBAC:
- **AWS**: IAM roles with IRSA for Route53 access
- **Azure**: Managed Identity for Azure DNS access
- **GCP**: Service Account for Cloud DNS access

## Troubleshooting

### Common Issues

1. **Certificate provisioning fails**:
   - Verify DNS provider credentials and permissions
   - Check cert-manager logs: `kubectl logs -n cert-manager deployment/cert-manager`
   - Verify issuer status: `kubectl describe clusterissuer <issuer-name>`

2. **OpenSearch connection fails**:
   - Verify certificate secret exists: `kubectl get secret opensearch-certificates -n <namespace>`
   - Check OpenSearch logs for TLS errors
   - Verify network policies allow cross-namespace communication

3. **DNS resolution issues**:
   - Ensure CoreDNS is working correctly
   - Test DNS resolution: `nslookup opensearch-cluster-master.<namespace>.svc.cluster.local`

### Useful Commands

```bash
# Check certificate status
kubectl get certificate -A

# Check certificate details
kubectl describe certificate opensearch-certificate -n <namespace>

# Check issuer status
kubectl get clusterissuer
kubectl describe clusterissuer <issuer-name>

# Check OpenSearch pod logs
kubectl logs -n <namespace> -l app=opensearch

# Test OpenSearch connectivity from another namespace
kubectl run test-pod --rm -i --tty --image=curlimages/curl -- \
  curl -k https://opensearch-cluster-master.<namespace>.svc.cluster.local:9200
```

## Migration Guide

### Existing Deployments

For existing deployments that have OpenSearch in the same namespace as Pulumi services:

1. **Enable TLS**: Set `enableOpenSearchTLS: true` in configuration
2. **Update namespace**: Change `opensearchNamespace` to desired separate namespace
3. **Configure cert-manager**: Add cert-manager configuration for your cloud platform
4. **Update DNS**: Pulumi services will automatically use the new cross-namespace endpoint

### Rollback

To rollback to same-namespace deployment:

1. Set `enableOpenSearchTLS: false`
2. Set `opensearchNamespace` to same as Pulumi services namespace
3. Redeploy the stack

The implementation maintains full backward compatibility.