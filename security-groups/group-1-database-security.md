# Group 1: Database Security Enhancements (Non-Breaking)

**Target File:** `gke-hosted/01-infrastructure/database.ts:25-70`

## Overview
These database security enhancements can be implemented as configuration changes to the existing Cloud SQL instance without breaking the application or requiring downtime.

## Tasks in This Group

### 1. Database Encryption at Rest (CRITICAL)
- **Current State**: Not configured
- **Implementation**: Add customer-managed encryption key (CMEK) configuration
- **Timeline**: 1-2 weeks
- **Pulumi Changes**:
  ```typescript
  // Add to database instance settings
  encryptionKeyName: kmsKey.id,
  ```

### 2. SSL/TLS Enforcement (HIGH)
- **Current State**: Not enforced
- **Implementation**: Require SSL connections with certificate validation
- **Timeline**: 1 week
- **Pulumi Changes**:
  ```typescript
  // Add to ipConfiguration
  requireSsl: true,
  sslMode: "REQUIRE",
  ```

### 3. Database Auditing (HIGH)
- **Current State**: Not enabled
- **Implementation**: Enable Cloud SQL audit logging
- **Timeline**: 1 week
- **Pulumi Changes**:
  ```typescript
  // Add to database instance settings
  databaseFlags: [
    { name: "general_log", value: "on" },
    { name: "slow_query_log", value: "on" },
    { name: "log_output", value: "FILE" }
  ],
  ```

### 4. Database Backup Encryption (MEDIUM)
- **Current State**: Not specified
- **Implementation**: Configure encrypted automated backups
- **Timeline**: 1 week
- **Pulumi Changes**:
  ```typescript
  // Add to settings
  backupConfiguration: {
    enabled: true,
    startTime: "03:00",
    pointInTimeRecoveryEnabled: true,
    backupRetentionSettings: {
      retainedBackups: 30,
      retentionUnit: "COUNT"
    }
  },
  ```

### 5. Database Firewall Rules (MEDIUM)
- **Current State**: Basic IP restrictions
- **Implementation**: Implement database-level firewall rules
- **Timeline**: 1 week
- **Pulumi Changes**:
  ```typescript
  // Add to ipConfiguration
  authorizedNetworks: [
    {
      name: "gke-cluster-only",
      value: clusterSubnetCidr
    }
  ],
  ```

## Implementation Steps

1. **Create KMS Key for Database Encryption**
   ```typescript
   const dbKmsKey = new gcp.kms.CryptoKey("db-encryption-key", {
     keyRing: keyRing.id,
     rotationPeriod: "2592000s", // 30 days
   });
   ```

2. **Update Database Instance Configuration**
   - Add encryption key reference
   - Enable SSL enforcement
   - Configure audit logging
   - Set up automated backups
   - Restrict network access

3. **Grant Required Permissions**
   ```typescript
   const dbServiceAccount = new gcp.projects.getProject({}).then(project => 
     `service-${project.number}@gcp-sa-cloud-sql.iam.gserviceaccount.com`
   );
   
   const kmsBinding = new gcp.kms.CryptoKeyIAMBinding("db-kms-binding", {
     cryptoKeyId: dbKmsKey.id,
     role: "roles/cloudkms.cryptoKeyEncrypterDecrypter",
     members: [pulumi.interpolate`serviceAccount:${dbServiceAccount}`],
   });
   ```

## Expected Security Improvements

- **Encryption**: Database data encrypted at rest with customer-managed keys
- **Transport Security**: All connections require SSL/TLS
- **Audit Trail**: Complete database activity logging
- **Backup Security**: Encrypted backup storage with retention policies
- **Network Security**: Restricted database access to authorized networks only

## Risk Assessment

- **Breaking Change Risk**: **LOW** - These are configuration enhancements
- **Downtime Risk**: **MINIMAL** - Most changes can be applied without restart
- **Rollback Risk**: **LOW** - Changes can be reverted if needed

## Validation Steps

1. Verify encryption key is being used
2. Test SSL connection enforcement
3. Confirm audit logs are being generated
4. Validate backup encryption and retention
5. Test network access restrictions

## Dependencies

- GCP KMS key ring must be created first
- Service account permissions for KMS access
- Network subnet CIDR information for firewall rules

## Success Criteria

- [ ] Database encryption at rest enabled with CMEK
- [ ] SSL/TLS connections enforced
- [ ] Audit logging active and functional
- [ ] Encrypted backups with proper retention
- [ ] Network access properly restricted
- [ ] Application connectivity unaffected