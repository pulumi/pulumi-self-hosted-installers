# Component Extraction Plan: EKS to components-microstacks

## Overview

Plan to extract Kubernetes-agnostic components from EKS-hosted directory and move them to the shared `components-microstacks` directory for reuse across all cloud platforms (AWS EKS, Google GKE, Azure AKS).

## Current State Analysis

### components-microstacks Directory
- `api.ts` - Empty placeholder
- `console.ts` - Empty placeholder  
- `cert-manager.ts` - Empty placeholder
- `openSearch.ts` - Functional OpenSearch Helm chart deployment
- `index.ts` - Basic structure

### Key Findings from EKS Analysis

The EKS `90-pulumi-service/` stage contains the primary Kubernetes deployments that are cloud-agnostic:

1. **API Deployment** - Complete Kubernetes deployment with database migration init container
2. **Console Deployment** - Frontend service deployment
3. **Kubernetes Services** - Service definitions for API and Console
4. **Secrets Management** - Multiple Kubernetes secrets for various integrations
5. **Encryption Service** - Local key storage with optional cloud KMS integration

## Implementation Plan

### Phase 1: Core Service Components (High Priority)

#### 1. API Component (`api.ts`)
- **Source**: `eks-hosted/90-pulumi-service/index.ts:133-225`
- **Kubernetes Resources**: 
  - Deployment with init container for database migrations
  - Service (port 80 → 8080)
  - PodDisruptionBudget for high availability
- **Key Features**:
  - Database migration init container
  - Comprehensive environment variable configuration
  - Resource specifications and volume mounts
- **Parameterization Needed**:
  - Image names (API and migrations)
  - Resource requirements (CPU, memory)
  - Environment variables (domain names, database connections)
  - Namespace configuration
  - Replica count
  - Storage configuration (abstract S3/GCS/Azure Blob)

#### 2. Console Component (`console.ts`)
- **Source**: `eks-hosted/90-pulumi-service/index.ts:240-305`
- **Kubernetes Resources**:
  - Deployment for frontend service
  - Service (port 80 → 3000)
  - PodDisruptionBudget
- **Key Features**:
  - Console container configuration
  - UI feature flag management
  - OAuth provider integration
- **Parameterization Needed**:
  - Console image name
  - Domain configuration
  - Feature flags (email login/signup, SAML SSO)
  - OAuth provider settings
  - Internal API endpoint configuration

### Phase 2: Supporting Infrastructure (Medium Priority)

#### 3. Modular Secrets Management Components
- **Source**: `eks-hosted/90-pulumi-service/secrets.ts`
- **Current Issues**: Very EKS-specific, monolithic structure
- **Proposed Split**:
  - `databaseSecrets.ts` - Database connection credentials
  - `smtpSecrets.ts` - Email server configuration
  - `oauthSecrets.ts` - OAuth provider settings (GitHub, Google, etc.)
  - `samlSecrets.ts` - SAML SSO certificate management with auto-generation
- **Benefits**: Modular approach, flexible secret key naming, support for external secret references

#### 4. Encryption Service Component (`encryptionService.ts`)
- **Source**: `eks-hosted/90-pulumi-service/encryptionService.ts`
- **Kubernetes Resources**:
  - Secret for local encryption keys
  - Volume and VolumeMount specifications
- **Cloud Dependencies**: AWS KMS integration (conditional)
- **Abstraction Goals**:
  - Support multiple cloud key management services (AWS KMS, Azure Key Vault, GCP KMS)
  - Maintain local key fallback option
  - Configurable encryption backends

### Phase 3: Enhanced Infrastructure (Lower Priority)

#### 5. OpenSearch Component Improvements
- **Current**: Already exists in `components-microstacks/openSearch.ts`
- **Issues**: 
  - Contains GCP-specific service annotations (`cloud.google.com/neg`)
  - Hardcoded namespace logic
- **Improvements**:
  - Remove cloud-specific annotations
  - Make service type configurable
  - Support different ingress patterns per cloud provider

#### 6. Ingress Component (`ingress.ts`)
- **Purpose**: Abstract ingress patterns across cloud providers
- **Support**: 
  - ALB (AWS) with AWS-specific annotations
  - NGINX (GKE/AKS) with standard annotations
  - Cloud-specific TLS certificate management
- **Features**:
  - Parameterized annotations per cloud provider
  - Domain routing configuration
  - TLS certificate management patterns

## Cross-Platform Comparison

### Common Patterns Identified
1. **API + Console deployment pattern** - Consistent across all platforms
2. **Database migration init containers** - Same pattern everywhere
3. **Secret management for credentials** - Similar structures
4. **Environment variable injection** - Standard Kubernetes patterns
5. **Service-to-service communication** - Consistent networking patterns

### Platform-Specific Differences
- **AWS EKS**: Uses ALB Ingress, Route53 DNS, ACM certificates
- **Google GKE**: Uses NGINX Ingress, Cloud DNS, Let's Encrypt certificates
- **Azure AKS**: Uses NGINX Ingress, Azure DNS, cert-manager certificates

## Proposed Configuration Interface

```typescript
export interface PulumiServiceArgs {
  namespace: pulumi.Input<string>;
  imageTag: pulumi.Input<string>;
  
  // Domain configuration
  apiDomain: pulumi.Input<string>;
  consoleDomain: pulumi.Input<string>;
  
  // Resource configuration  
  apiReplicas?: pulumi.Input<number>;
  consoleReplicas?: pulumi.Input<number>;
  
  // Storage configuration (cloud-agnostic)
  storageConfig: {
    checkpointsEndpoint: pulumi.Input<string>;
    policyPacksEndpoint: pulumi.Input<string>;
    escEndpoint: pulumi.Input<string>;
    eventsEndpoint: pulumi.Input<string>;
  };
  
  // Database configuration
  database: DatabaseConfig;
  
  // Optional integrations
  smtp?: SMTPConfig;
  oauth?: OAuthConfig;
  openSearch?: OpenSearchConfig;
  
  // Ingress configuration (varies by cloud)
  ingress: IngressConfig;
}
```

## Migration Strategy

### Step-by-Step Approach
1. **Extract one component at a time** to minimize disruption
2. **Create comprehensive TypeScript interfaces** for configuration
3. **Update EKS implementation** to use new shared components
4. **Validate functionality** with existing EKS deployments
5. **Migrate GKE and AKS** to use shared components
6. **Remove duplicate code** from platform-specific directories
7. **Update documentation** and examples

### Backward Compatibility
- Maintain existing EKS functionality during transition
- Provide migration guides for users
- Support both old and new component structures temporarily

## Benefits

### Code Reuse
- Same core components work across EKS, GKE, AKS
- Reduced duplication of Kubernetes resource definitions
- Consistent deployment patterns

### Maintenance
- Single source of truth for core Pulumi Service components
- Easier to implement new features across all platforms
- Simplified testing and validation

### Consistency
- Standardized configuration interfaces
- Uniform behavior across cloud providers
- Easier troubleshooting and support

## Success Metrics

1. **Reduction in duplicate code** - Measure lines of code eliminated
2. **Cross-platform consistency** - Verify identical Kubernetes resources
3. **Configuration simplicity** - Reduced platform-specific parameters
4. **Maintenance efficiency** - Time to implement features across platforms

## Next Steps

1. **Begin with API component extraction** - Highest impact, well-defined scope
2. **Create comprehensive test suite** - Validate components work across platforms
3. **Update documentation** - Reflect new shared component architecture
4. **Engage stakeholders** - Get feedback on proposed interfaces and migration approach