# Group 6: IAM & Access Control Enhancements (Non-Breaking)

**Target Files:** `gke-hosted/01-infrastructure/serviceAccount.ts` and cross-cutting IAM configurations

## Overview
These IAM and access control enhancements implement fine-grained permissions and conditional access without removing existing permissions, ensuring no service disruption while significantly improving security posture.

## Tasks in This Group

### 1. Fine-Grained Storage Access Controls (HIGH)
- **Current State**: Basic IAM
- **Implementation**: Implement fine-grained IAM with conditions
- **Timeline**: 2-3 weeks
- **Pulumi Changes**:
  ```typescript
  // Add conditional IAM bindings
  const conditionalBinding = new gcp.storage.BucketIAMBinding("conditional-access", {
    bucket: bucket.name,
    role: "roles/storage.objectUser",
    members: [serviceAccount.email],
    condition: {
      title: "Time and location based access",
      expression: "request.time.getHours() >= 8 && request.time.getHours() <= 18"
    }
  });
  ```

### 2. RBAC Granularity Enhancement (HIGH)
- **Current State**: Basic service accounts
- **Implementation**: Implement principle of least privilege RBAC
- **Timeline**: 2-3 weeks
- **Kubernetes Changes**: Create specific roles for different service components

### 3. Data Residency Controls (MEDIUM)
- **Current State**: Not enforced
- **Implementation**: Configure data residency controls
- **Timeline**: 2-3 weeks
- **Pulumi Changes**:
  ```typescript
  // Add location-based IAM conditions
  condition: {
    expression: "resource.location in ['us-east1', 'us-west1']"
  }
  ```

## Implementation Steps

### 1. Enhanced Service Account Architecture
```typescript
export class ServiceAccount extends pulumi.ComponentResource {
  public readonly serviceAccountName: pulumi.Output<string>;
  public readonly serviceAccountEmail: pulumi.Output<string>;
  public readonly workloadIdentityBinding: gcp.serviceaccount.IAMBinding;
  
  constructor(name: string, args: ServiceAccountArgs) {
    super("x:infrastructure:serviceaccount", name);

    // Create separate service accounts for different functions
    const apiServiceAccount = new gcp.serviceaccount.Account(`${name}-api`, {
      accountId: `${name}-api-sa`,
      displayName: "Pulumi API Service Account",
      description: "Service account for Pulumi API with minimal required permissions",
    }, { parent: this });

    const consoleServiceAccount = new gcp.serviceaccount.Account(`${name}-console`, {
      accountId: `${name}-console-sa`, 
      displayName: "Pulumi Console Service Account",
      description: "Service account for Pulumi Console with read-only permissions",
    }, { parent: this });

    const migrationServiceAccount = new gcp.serviceaccount.Account(`${name}-migration`, {
      accountId: `${name}-migration-sa`,
      displayName: "Pulumi Migration Service Account", 
      description: "Service account for database migrations with elevated permissions",
    }, { parent: this });

    // API service account permissions (read/write to buckets, database access)
    const apiStorageBinding = new gcp.projects.IAMBinding(`${name}-api-storage`, {
      project: gcp.config.project,
      role: "roles/storage.objectUser",
      members: [pulumi.interpolate`serviceAccount:${apiServiceAccount.email}`],
      condition: {
        title: "API bucket access",
        description: "Allow access only to Pulumi-specific buckets",
        expression: pulumi.interpolate`
          resource.name.startsWith("projects/_/buckets/${args.checkpointBucketName}/") ||
          resource.name.startsWith("projects/_/buckets/${args.policyBucketName}/") ||
          resource.name.startsWith("projects/_/buckets/${args.escBucketName}/")
        `,
      },
    });

    const apiDatabaseBinding = new gcp.projects.IAMBinding(`${name}-api-database`, {
      project: gcp.config.project,
      role: "roles/cloudsql.client",
      members: [pulumi.interpolate`serviceAccount:${apiServiceAccount.email}`],
      condition: {
        title: "Database access during business hours",
        description: "Allow database access during business hours only",
        expression: "request.time.getHours() >= 6 && request.time.getHours() <= 22",
      },
    });

    // Console service account permissions (read-only)
    const consoleStorageBinding = new gcp.projects.IAMBinding(`${name}-console-storage`, {
      project: gcp.config.project,
      role: "roles/storage.objectViewer",
      members: [pulumi.interpolate`serviceAccount:${consoleServiceAccount.email}`],
      condition: {
        title: "Console read-only access",
        description: "Read-only access to specific buckets",
        expression: pulumi.interpolate`
          resource.name.startsWith("projects/_/buckets/${args.checkpointBucketName}/") ||
          resource.name.startsWith("projects/_/buckets/${args.policyBucketName}/")
        `,
      },
    });

    // Migration service account permissions (elevated, time-limited)
    const migrationDatabaseBinding = new gcp.projects.IAMBinding(`${name}-migration-database`, {
      project: gcp.config.project,
      role: "roles/cloudsql.editor",
      members: [pulumi.interpolate`serviceAccount:${migrationServiceAccount.email}`],
      condition: {
        title: "Migration window access",
        description: "Allow database admin access only during maintenance windows",
        expression: `
          (request.time.getHours() >= 2 && request.time.getHours() <= 4) ||
          (request.time.getDayOfWeek() == 0 && request.time.getHours() >= 1 && request.time.getHours() <= 5)
        `,
      },
    });
```

### 2. Kubernetes RBAC Enhancement
```typescript
    // Create namespace-specific roles
    const apiRole = new k8s.rbac.v1.Role(`${name}-api-role`, {
      metadata: {
        namespace: args.appNamespace,
        name: "pulumi-api-role",
      },
      rules: [
        {
          apiGroups: [""],
          resources: ["secrets"],
          verbs: ["get", "list"],
          resourceNames: [
            "pulumi-selfhosted-mysql-db-conn",
            "pulumi-selfhosted-storage-secret",
            "pulumi-selfhosted-license-key",
          ],
        },
        {
          apiGroups: [""],
          resources: ["configmaps"],
          verbs: ["get", "list", "create", "update"],
        },
        {
          apiGroups: [""],
          resources: ["events"],
          verbs: ["create"],
        },
      ],
    }, { provider: k8sProvider });

    const consoleRole = new k8s.rbac.v1.Role(`${name}-console-role`, {
      metadata: {
        namespace: args.appNamespace,
        name: "pulumi-console-role",
      },
      rules: [
        {
          apiGroups: [""],
          resources: ["secrets"],
          verbs: ["get"],
          resourceNames: [
            "pulumi-selfhosted-recaptcha-secret",
          ],
        },
        {
          apiGroups: [""],
          resources: ["configmaps"],
          verbs: ["get", "list"],
        },
      ],
    }, { provider: k8sProvider });

    const migrationRole = new k8s.rbac.v1.Role(`${name}-migration-role`, {
      metadata: {
        namespace: args.appNamespace,
        name: "pulumi-migration-role",
      },
      rules: [
        {
          apiGroups: [""],
          resources: ["secrets"],
          verbs: ["get"],
          resourceNames: [
            "pulumi-selfhosted-mysql-db-conn",
          ],
        },
        {
          apiGroups: ["batch"],
          resources: ["jobs"],
          verbs: ["create", "get", "list", "delete"],
        },
      ],
    }, { provider: k8sProvider });

    // Create Kubernetes service accounts
    const apiKubernetesServiceAccount = new k8s.core.v1.ServiceAccount(`${name}-api-k8s-sa`, {
      metadata: {
        namespace: args.appNamespace,
        name: "pulumi-api-sa",
        annotations: {
          "iam.gke.io/gcp-service-account": apiServiceAccount.email,
        },
      },
    }, { provider: k8sProvider });

    const consoleKubernetesServiceAccount = new k8s.core.v1.ServiceAccount(`${name}-console-k8s-sa`, {
      metadata: {
        namespace: args.appNamespace,
        name: "pulumi-console-sa",
        annotations: {
          "iam.gke.io/gcp-service-account": consoleServiceAccount.email,
        },
      },
    }, { provider: k8sProvider });

    // Bind roles to service accounts
    const apiRoleBinding = new k8s.rbac.v1.RoleBinding(`${name}-api-role-binding`, {
      metadata: {
        namespace: args.appNamespace,
        name: "pulumi-api-role-binding",
      },
      subjects: [{
        kind: "ServiceAccount",
        name: apiKubernetesServiceAccount.metadata.name,
        namespace: args.appNamespace,
      }],
      roleRef: {
        kind: "Role",
        name: apiRole.metadata.name,
        apiGroup: "rbac.authorization.k8s.io",
      },
    }, { provider: k8sProvider });

    const consoleRoleBinding = new k8s.rbac.v1.RoleBinding(`${name}-console-role-binding`, {
      metadata: {
        namespace: args.appNamespace,
        name: "pulumi-console-role-binding",
      },
      subjects: [{
        kind: "ServiceAccount", 
        name: consoleKubernetesServiceAccount.metadata.name,
        namespace: args.appNamespace,
      }],
      roleRef: {
        kind: "Role",
        name: consoleRole.metadata.name,
        apiGroup: "rbac.authorization.k8s.io",
      },
    }, { provider: k8sProvider });
```

### 3. Data Residency and Location Controls
```typescript
    // Organization policy for data residency
    const dataResidencyPolicy = new gcp.orgpolicy.Policy(`${name}-data-residency`, {
      name: pulumi.interpolate`projects/${gcp.config.project}/policies/constraints/gcp.resourceLocations`,
      spec: {
        rules: [{
          allowAll: false,
          values: {
            allowedValues: [
              "in:us-locations", // Allow only US locations
            ],
          },
        }],
      },
    });

    // Storage location constraints
    const storageLocationBinding = new gcp.storage.BucketIAMBinding(`${name}-storage-location`, {
      bucket: args.checkpointBucketName,
      role: "roles/storage.objectUser",
      members: [pulumi.interpolate`serviceAccount:${apiServiceAccount.email}`],
      condition: {
        title: "US-only data access",
        description: "Allow access only from US locations",
        expression: `
          resource.location in ['US', 'us-east1', 'us-west1', 'us-central1', 'us-east4'] &&
          origin.region_code == 'US'
        `,
      },
    });

    // Database location constraints
    const databaseLocationBinding = new gcp.projects.IAMBinding(`${name}-database-location`, {
      project: gcp.config.project,
      role: "roles/cloudsql.client",
      members: [pulumi.interpolate`serviceAccount:${apiServiceAccount.email}`],
      condition: {
        title: "Regional database access",
        description: "Allow database access only from approved regions",
        expression: `
          request.region in ['us-east1', 'us-west1', 'us-central1'] &&
          resource.location.startsWith('us-')
        `,
      },
    });
```

### 4. Workload Identity Integration
```typescript
    // Workload identity bindings for each service account
    const apiWorkloadIdentityBinding = new gcp.serviceaccount.IAMBinding(`${name}-api-workload-identity`, {
      serviceAccountId: apiServiceAccount.name,
      role: "roles/iam.workloadIdentityUser",
      members: [
        pulumi.interpolate`serviceAccount:${gcp.config.project}.svc.id.goog[${args.appNamespace}/${apiKubernetesServiceAccount.metadata.name}]`,
      ],
    });

    const consoleWorkloadIdentityBinding = new gcp.serviceaccount.IAMBinding(`${name}-console-workload-identity`, {
      serviceAccountId: consoleServiceAccount.name,
      role: "roles/iam.workloadIdentityUser", 
      members: [
        pulumi.interpolate`serviceAccount:${gcp.config.project}.svc.id.goog[${args.appNamespace}/${consoleKubernetesServiceAccount.metadata.name}]`,
      ],
    });

    // Cross-project access for multi-environment scenarios
    const crossProjectBinding = new gcp.projects.IAMBinding(`${name}-cross-project`, {
      project: "shared-services-project",
      role: "roles/storage.objectViewer",
      members: [pulumi.interpolate`serviceAccount:${apiServiceAccount.email}`],
      condition: {
        title: "Cross-project shared resources",
        description: "Allow read access to shared resources",
        expression: `
          resource.name.startsWith("projects/_/buckets/shared-configs/") &&
          request.time.getHours() >= 8 && request.time.getHours() <= 18
        `,
      },
    });
```

### 5. Audit and Monitoring Integration
```typescript
    // IAM audit logging
    const iamAuditConfig = new gcp.projects.IAMAuditConfig(`${name}-iam-audit`, {
      project: gcp.config.project,
      service: "allServices",
      auditLogConfigs: [
        {
          logType: "ADMIN_READ",
        },
        {
          logType: "DATA_READ",
          exemptedMembers: [
            "serviceAccount:gke-default@system.gserviceaccount.com",
          ],
        },
        {
          logType: "DATA_WRITE",
        },
      ],
    });

    // Service account key monitoring
    const serviceAccountKeyAlert = new gcp.monitoring.AlertPolicy(`${name}-sa-key-alert`, {
      displayName: "Service Account Key Usage",
      conditions: [{
        displayName: "Service account key authentication detected",
        conditionThreshold: {
          filter: `
            resource.type="service_account"
            AND protoPayload.methodName="google.iam.admin.v1.IAMService.CreateServiceAccountKey"
          `,
          comparison: "COMPARISON_GREATER_THAN",
          thresholdValue: 0,
          duration: "60s",
        },
      }],
      alertStrategy: {
        autoClose: "1800s",
      },
      notificationChannels: ["projects/${gcp.config.project}/notificationChannels/security-alerts"],
    });
```

## Expected Security Improvements

- **Principle of Least Privilege**: Each service has only required permissions
- **Conditional Access**: Time and location-based access controls
- **Data Residency**: Ensures data stays within approved locations
- **Workload Identity**: Secure pod-to-GCP authentication without key files
- **Audit Trail**: Comprehensive IAM activity logging
- **Separation of Duties**: Different service accounts for different functions

## Risk Assessment

- **Breaking Change Risk**: **VERY LOW** - All changes are additive
- **Service Disruption**: **NONE** - Existing permissions maintained
- **Complexity**: **MEDIUM** - More complex IAM structure to manage

## Implementation Strategy

### Phase 1: Service Account Separation (Week 1)
1. Create new service accounts for each function
2. Grant equivalent permissions to maintain functionality
3. Update workload identity bindings

### Phase 2: Permission Refinement (Week 2) 
1. Implement conditional access controls
2. Add time and location restrictions
3. Test all functionality with new restrictions

### Phase 3: Data Residency (Week 3)
1. Implement organization policies
2. Add location-based conditions
3. Validate data stays in approved regions

## Validation Steps

1. **Permission Testing**: Verify each service can access required resources
2. **Conditional Access**: Test time and location restrictions work
3. **Data Residency**: Confirm data access is location-restricted
4. **Workload Identity**: Validate pod authentication works
5. **Audit Logging**: Verify all IAM activities are logged

## Dependencies

- Workload Identity enabled on GKE cluster
- Organization Policy API enabled
- Cloud Audit Logs configured
- Appropriate project-level IAM permissions

## Success Criteria

- [ ] Separate service accounts for API, Console, and Migration
- [ ] Conditional access controls implemented and working
- [ ] Data residency controls enforced
- [ ] Workload identity functional for all services
- [ ] Comprehensive IAM audit logging active
- [ ] All services maintain full functionality
- [ ] No service account keys in use

## Compliance Benefits

- **PCI-DSS**: Enhanced access controls and data residency
- **SOC 2**: Detailed access logging and conditional controls
- **Banking Regulations**: Geographic data controls and audit trails
- **Zero Trust**: Workload identity eliminates shared secrets

## Monitoring & Alerting

- Service account key creation alerts
- Conditional access policy violations
- Cross-project access monitoring
- Data residency compliance tracking
- IAM permission escalation detection