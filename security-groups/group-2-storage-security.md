# Group 2: Storage Security Hardening (Non-Breaking)

**Target File:** `gke-hosted/01-infrastructure/storage.ts:19-48`

## Overview
These storage security enhancements can be implemented as bucket configuration changes without affecting how the application accesses or uses the storage buckets.

## Tasks in This Group

### 1. Customer-Managed Encryption Keys for Storage (HIGH)
- **Current State**: Google-managed keys
- **Implementation**: Implement customer-managed encryption keys for buckets
- **Timeline**: 2-3 weeks
- **Pulumi Changes**:
  ```typescript
  // Add to bucket configuration
  encryption: {
    defaultKmsKeyName: storageKmsKey.id,
  },
  ```

### 2. Object Versioning (MEDIUM)
- **Current State**: Not enabled
- **Implementation**: Enable versioning with lifecycle policies
- **Timeline**: 1 week
- **Pulumi Changes**:
  ```typescript
  // Add to bucket configuration
  versioning: {
    enabled: true,
  },
  ```

### 3. Storage Bucket Logging (MEDIUM)
- **Current State**: Not configured
- **Implementation**: Enable access and storage logs
- **Timeline**: 1 week
- **Pulumi Changes**:
  ```typescript
  // Add to bucket configuration
  logging: {
    logBucket: loggingBucket.name,
    logObjectPrefix: "access-logs/",
  },
  ```

### 4. Fine-Grained Storage Access Controls (HIGH)
- **Current State**: Basic IAM
- **Implementation**: Implement fine-grained IAM with conditions
- **Timeline**: 2-3 weeks
- **Pulumi Changes**:
  ```typescript
  // Add conditional IAM bindings
  const bucketBinding = new gcp.storage.BucketIAMBinding("bucket-binding", {
    bucket: bucket.name,
    role: "roles/storage.objectUser",
    members: [pulumi.interpolate`serviceAccount:${serviceAccount.email}`],
    condition: {
      title: "Time-based access",
      description: "Access during business hours only",
      expression: "request.time.getHours() >= 8 && request.time.getHours() <= 18"
    }
  });
  ```

### 5. Object Lifecycle Management (LOW)
- **Current State**: Not configured
- **Implementation**: Implement retention policies
- **Timeline**: 1 week
- **Pulumi Changes**:
  ```typescript
  // Add to bucket configuration
  lifecycleRules: [{
    action: {
      type: "SetStorageClass",
      storageClass: "NEARLINE"
    },
    condition: {
      age: 30,
    }
  }, {
    action: {
      type: "Delete"
    },
    condition: {
      age: 2555, // 7 years for compliance
    }
  }],
  ```

## Implementation Steps

1. **Create KMS Key for Storage Encryption**
   ```typescript
   const storageKmsKey = new gcp.kms.CryptoKey("storage-encryption-key", {
     keyRing: keyRing.id,
     rotationPeriod: "2592000s", // 30 days
   });
   ```

2. **Create Logging Bucket**
   ```typescript
   const loggingBucket = new gcp.storage.Bucket("access-logs-bucket", {
     location: "US",
     storageClass: "COLDLINE",
     labels: args.tags,
   });
   ```

3. **Update Each Storage Bucket Configuration**
   - Checkpoint bucket
   - Policy bucket  
   - ESC bucket

4. **Grant Required Permissions**
   ```typescript
   const storageServiceAccount = new gcp.projects.getProject({}).then(project => 
     `service-${project.number}@gs-project-accounts.iam.gserviceaccount.com`
   );
   
   const kmsBinding = new gcp.kms.CryptoKeyIAMBinding("storage-kms-binding", {
     cryptoKeyId: storageKmsKey.id,
     role: "roles/cloudkms.cryptoKeyEncrypterDecrypter",
     members: [pulumi.interpolate`serviceAccount:${storageServiceAccount}`],
   });
   ```

## Detailed Configuration Examples

### Enhanced Checkpoint Bucket
```typescript
const checkpointBucket = new gcp.storage.Bucket(`${name}-checkpoints`, {
  location: "US",
  labels: args.tags,
  encryption: {
    defaultKmsKeyName: storageKmsKey.id,
  },
  versioning: {
    enabled: true,
  },
  logging: {
    logBucket: loggingBucket.name,
    logObjectPrefix: "checkpoint-access-logs/",
  },
  lifecycleRules: [{
    action: {
      type: "SetStorageClass",
      storageClass: "NEARLINE"
    },
    condition: {
      age: 30,
      matchesStorageClasses: ["STANDARD"]
    }
  }, {
    action: {
      type: "Delete"
    },
    condition: {
      age: 2555, // 7 years retention
    }
  }],
  uniformBucketLevelAccess: true,
}, { parent: this, protect: true });
```

### Enhanced Policy Bucket
```typescript
const policyBucket = new gcp.storage.Bucket(`${name}-policypacks`, {
  location: "US",
  labels: args.tags,
  encryption: {
    defaultKmsKeyName: storageKmsKey.id,
  },
  versioning: {
    enabled: true,
  },
  logging: {
    logBucket: loggingBucket.name,
    logObjectPrefix: "policy-access-logs/",
  },
  lifecycleRules: [{
    action: {
      type: "SetStorageClass",
      storageClass: "NEARLINE"
    },
    condition: {
      age: 90, // Policies accessed less frequently
      matchesStorageClasses: ["STANDARD"]
    }
  }],
  uniformBucketLevelAccess: true,
}, { parent: this, protect: true });
```

## Expected Security Improvements

- **Encryption**: All objects encrypted with customer-managed keys
- **Versioning**: Protection against accidental deletion/modification
- **Audit Trail**: Complete access logging for compliance
- **Access Control**: Fine-grained IAM with conditional access
- **Cost Optimization**: Lifecycle policies for long-term storage efficiency

## Risk Assessment

- **Breaking Change Risk**: **NONE** - These are bucket-level enhancements
- **Downtime Risk**: **NONE** - Changes don't affect application access
- **Performance Impact**: **MINIMAL** - Slight overhead for encryption/logging

## Validation Steps

1. Verify KMS encryption is active on all buckets
2. Confirm versioning is enabled and working
3. Check access logs are being generated
4. Test IAM conditions are enforced
5. Validate lifecycle policies are applied correctly

## Dependencies

- GCP KMS key ring and keys
- Logging bucket for access logs
- Service account permissions for KMS access
- IAM conditions support enabled

## Success Criteria

- [ ] All buckets encrypted with customer-managed keys
- [ ] Object versioning enabled on all buckets
- [ ] Access logging configured and functional
- [ ] Fine-grained IAM policies implemented
- [ ] Lifecycle policies active for cost optimization
- [ ] Application functionality unchanged

## Compliance Benefits

- **PCI-DSS**: Enhanced data protection and access controls
- **SOC 2**: Detailed audit trails and access management
- **Banking Regulations**: Long-term retention and encryption requirements
- **GDPR**: Data protection and access logging capabilities