# Group 5: Monitoring & Logging Infrastructure (Non-Breaking)

**Target Files:** Cross-cutting across all components

## Overview
These monitoring and logging enhancements add comprehensive observability without impacting application functionality. All changes are additive and provide enhanced security visibility.

## Tasks in This Group

### 1. Log Retention Policies (MEDIUM)
- **Current State**: Default retention
- **Implementation**: Implement compliant log retention policies
- **Timeline**: 1-2 weeks
- **Pulumi Changes**:
  ```typescript
  // Add log sink with retention
  const logSink = new gcp.logging.ProjectSink("security-log-sink", {
    destination: "storage.googleapis.com/security-logs-bucket",
    filter: "severity >= ERROR",
    bigqueryOptions: {
      usePartitionedTables: true,
    },
  });
  ```

### 2. Log Encryption (MEDIUM)
- **Current State**: Not encrypted
- **Implementation**: Encrypt logs in transit and at rest
- **Timeline**: 2-3 weeks
- **Pulumi Changes**:
  ```typescript
  // Add KMS encryption for log storage
  const logBucket = new gcp.storage.Bucket("security-logs", {
    encryption: {
      defaultKmsKeyName: loggingKmsKey.id,
    },
  });
  ```

### 3. Prometheus/Grafana Deployment (MEDIUM)
- **Current State**: Not deployed
- **Implementation**: Deploy monitoring stack with custom dashboards
- **Timeline**: 3-4 weeks
- **Kubernetes Deployment**: Add monitoring namespace and resources

### 4. Enhanced VPC Flow Logs (From Group 3)
- **Current State**: Not enabled
- **Implementation**: Enable VPC Flow Logs for network monitoring
- **Timeline**: 1 week (already covered in Group 3)

### 5. Database Audit Logs (From Group 1)
- **Current State**: Not enabled  
- **Implementation**: Enable Cloud SQL audit logging
- **Timeline**: 1 week (already covered in Group 1)

### 6. Storage Access Logs (From Group 2)
- **Current State**: Not configured
- **Implementation**: Enable access and storage logs
- **Timeline**: 1 week (already covered in Group 2)

## Implementation Steps

### 1. Centralized Logging Infrastructure
```typescript
// Create KMS key for log encryption
const loggingKmsKey = new gcp.kms.CryptoKey("logging-encryption-key", {
  keyRing: keyRing.id,
  rotationPeriod: "2592000s", // 30 days
  purpose: "ENCRYPT_DECRYPT",
});

// Create secure log storage bucket
const securityLogsBucket = new gcp.storage.Bucket("security-logs-bucket", {
  location: "US",
  storageClass: "COLDLINE", // Cost-effective for long-term storage
  encryption: {
    defaultKmsKeyName: loggingKmsKey.id,
  },
  versioning: {
    enabled: true,
  },
  lifecycleRules: [{
    action: {
      type: "SetStorageClass",
      storageClass: "ARCHIVE",
    },
    condition: {
      age: 365, // Move to archive after 1 year
    },
  }, {
    action: {
      type: "Delete",
    },
    condition: {
      age: 2555, // 7 years retention for compliance
    },
  }],
  uniformBucketLevelAccess: true,
  labels: {
    purpose: "security-logs",
    compliance: "banking",
  },
});

// Create BigQuery dataset for log analysis
const securityLogsDataset = new gcp.bigquery.Dataset("security-logs-dataset", {
  datasetId: "security_logs",
  location: "US",
  description: "Security and audit logs for compliance",
  defaultEncryptionConfiguration: {
    kmsKeyName: loggingKmsKey.id,
  },
  access: [{
    role: "OWNER",
    userByEmail: "security-team@company.com",
  }, {
    role: "READER", 
    groupByEmail: "audit-team@company.com",
  }],
});
```

### 2. Comprehensive Log Sinks
```typescript
// Application security logs
const appSecurityLogSink = new gcp.logging.ProjectSink("app-security-logs", {
  name: "app-security-logs",
  destination: pulumi.interpolate`storage.googleapis.com/${securityLogsBucket.name}`,
  filter: `
    resource.type="k8s_container" 
    AND (severity >= WARNING 
    OR jsonPayload.event_type="security_event"
    OR jsonPayload.authentication="failed")
  `,
  description: "Application security and authentication events",
});

// Infrastructure audit logs
const infraAuditLogSink = new gcp.logging.ProjectSink("infra-audit-logs", {
  name: "infra-audit-logs", 
  destination: pulumi.interpolate`storage.googleapis.com/${securityLogsBucket.name}`,
  filter: `
    protoPayload.serviceName="cloudresourcemanager.googleapis.com"
    OR protoPayload.serviceName="container.googleapis.com"
    OR protoPayload.serviceName="compute.googleapis.com"
    OR protoPayload.serviceName="sqladmin.googleapis.com"
  `,
  description: "Infrastructure changes and admin activities",
});

// Network security logs
const networkSecurityLogSink = new gcp.logging.ProjectSink("network-security-logs", {
  name: "network-security-logs",
  destination: pulumi.interpolate`bigquery.googleapis.com/projects/${gcp.config.project}/datasets/${securityLogsDataset.datasetId}`,
  filter: `
    resource.type="gce_subnetwork"
    OR resource.type="gce_firewall_rule"
    OR (resource.type="k8s_cluster" AND severity >= WARNING)
  `,
  description: "Network traffic and security events",
  bigqueryOptions: {
    usePartitionedTables: true,
  },
});

// Database security logs
const dbSecurityLogSink = new gcp.logging.ProjectSink("db-security-logs", {
  name: "db-security-logs",
  destination: pulumi.interpolate`storage.googleapis.com/${securityLogsBucket.name}`,
  filter: `
    resource.type="cloudsql_database"
    AND (severity >= WARNING
    OR jsonPayload.databaseId!=""
    OR protoPayload.methodName="cloudsql.instances.connect")
  `,
  description: "Database access and security events",
});
```

### 3. Monitoring Stack Deployment
```typescript
// Create monitoring namespace
const monitoringNamespace = new k8s.core.v1.Namespace("monitoring", {
  metadata: {
    name: "monitoring",
    labels: {
      name: "monitoring",
      "istio-injection": "enabled",
    },
  },
}, { provider: k8sProvider });

// Deploy Prometheus
const prometheusChart = new k8s.helm.v3.Chart("prometheus", {
  chart: "kube-prometheus-stack", 
  version: "45.7.1",
  namespace: monitoringNamespace.metadata.name,
  fetchOpts: {
    repo: "https://prometheus-community.github.io/helm-charts",
  },
  values: {
    prometheus: {
      prometheusSpec: {
        retention: "30d",
        retentionSize: "50GB",
        storageSpec: {
          volumeClaimTemplate: {
            spec: {
              storageClassName: "ssd",
              accessModes: ["ReadWriteOnce"],
              resources: {
                requests: {
                  storage: "100Gi",
                },
              },
            },
          },
        },
        additionalScrapeConfigs: `
        - job_name: 'pulumi-api'
          kubernetes_sd_configs:
          - role: endpoints
            namespaces:
              names:
              - pulumi-selfhosted-apps
          relabel_configs:
          - source_labels: [__meta_kubernetes_service_name]
            action: keep
            regex: pulumi-api-service
        `,
      },
    },
    grafana: {
      adminPassword: "secure-admin-password", // Use secret in production
      persistence: {
        enabled: true,
        size: "10Gi",
      },
      dashboardProviders: {
        "dashboardproviders.yaml": {
          apiVersion: 1,
          providers: [{
            name: "security",
            orgId: 1,
            folder: "Security",
            type: "file",
            disableDeletion: false,
            editable: true,
            options: {
              path: "/var/lib/grafana/dashboards/security",
            },
          }],
        },
      },
    },
    alertmanager: {
      alertmanagerSpec: {
        storage: {
          volumeClaimTemplate: {
            spec: {
              storageClassName: "ssd",
              accessModes: ["ReadWriteOnce"],
              resources: {
                requests: {
                  storage: "10Gi",
                },
              },
            },
          },
        },
      },
      config: {
        global: {
          smtpSmarthost: "smtp.company.com:587",
          smtpFrom: "alerts@company.com",
        },
        route: {
          groupBy: ["alertname"],
          groupWait: "10s",
          groupInterval: "10s",
          repeatInterval: "1h",
          receiver: "security-team",
        },
        receivers: [{
          name: "security-team",
          emailConfigs: [{
            to: "security-team@company.com",
            subject: "Security Alert: {{ .GroupLabels.alertname }}",
            body: "{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}",
          }],
        }],
      },
    },
  },
}, { provider: k8sProvider, dependsOn: monitoringNamespace });
```

### 4. Security-Specific Monitoring Rules
```typescript
// Custom PrometheusRule for security monitoring
const securityMonitoringRules = new k8s.apiextensions.CustomResource("security-monitoring-rules", {
  apiVersion: "monitoring.coreos.com/v1",
  kind: "PrometheusRule",
  metadata: {
    name: "security-monitoring",
    namespace: monitoringNamespace.metadata.name,
    labels: {
      prometheus: "kube-prometheus",
      role: "alert-rules",
    },
  },
  spec: {
    groups: [{
      name: "security.rules",
      rules: [
        {
          alert: "HighErrorRate",
          expr: "rate(http_requests_total{status=~\"5..\"}[5m]) > 0.1",
          for: "5m",
          labels: {
            severity: "warning",
          },
          annotations: {
            summary: "High error rate detected",
            description: "Error rate is {{ $value }} requests per second",
          },
        },
        {
          alert: "PodSecurityPolicyViolation", 
          expr: "increase(kubernetes_events_total{reason=\"FailedCreate\",message=~\".*denied.*\"}[5m]) > 0",
          for: "1m",
          labels: {
            severity: "critical",
          },
          annotations: {
            summary: "Pod security policy violation",
            description: "Pod creation denied due to security policy",
          },
        },
        {
          alert: "UnauthorizedAPIAccess",
          expr: "rate(apiserver_audit_total{verb!=\"get\",verb!=\"list\",code!~\"2..\"}[5m]) > 0.01",
          for: "2m",
          labels: {
            severity: "warning",
          },
          annotations: {
            summary: "Unauthorized API access detected",
            description: "Unauthorized API calls detected at {{ $value }} per second",
          },
        },
        {
          alert: "DatabaseConnectionFailure",
          expr: "mysql_up == 0",
          for: "1m",
          labels: {
            severity: "critical",
          },
          annotations: {
            summary: "Database connection failure",
            description: "Unable to connect to MySQL database",
          },
        },
      ],
    }],
  },
}, { provider: k8sProvider, dependsOn: prometheusChart });
```

### 5. Log Analysis and Alerting
```typescript
// Cloud Function for real-time log analysis
const logAnalysisFunction = new gcp.cloudfunctions.Function("log-analysis", {
  name: "security-log-analysis",
  description: "Real-time security log analysis",
  runtime: "python39",
  availableMemoryMb: 256,
  timeout: 60,
  entryPoint: "analyze_logs",
  eventTrigger: {
    eventType: "google.pubsub.topic.publish",
    resource: logAnalysisTopic.name,
  },
  environmentVariables: {
    SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/...",
    ALERT_THRESHOLD: "5",
  },
});

// Pub/Sub topic for log processing
const logAnalysisTopic = new gcp.pubsub.Topic("log-analysis-topic", {
  name: "security-log-analysis",
});

// Log router to send critical logs to Pub/Sub
const criticalLogRouter = new gcp.logging.ProjectSink("critical-log-router", {
  name: "critical-log-router",
  destination: pulumi.interpolate`pubsub.googleapis.com/projects/${gcp.config.project}/topics/${logAnalysisTopic.name}`,
  filter: `
    severity >= ERROR
    OR jsonPayload.event_type="security_incident"
    OR jsonPayload.authentication="failed"
    OR protoPayload.authenticationInfo.principalEmail=""
  `,
  description: "Route critical security events for real-time analysis",
});
```

## Expected Security Improvements

- **Comprehensive Logging**: All security-relevant events captured and retained
- **Real-time Monitoring**: Immediate alerts for security incidents
- **Compliance**: Long-term log retention meeting banking requirements
- **Analysis Capability**: Tools for security investigation and forensics
- **Encrypted Storage**: All logs encrypted in transit and at rest

## Risk Assessment

- **Breaking Change Risk**: **NONE** - All changes are additive
- **Storage Costs**: **MEDIUM** - Increased storage costs for comprehensive logging
- **Performance Impact**: **LOW** - Minimal impact on application performance

## Implementation Timeline

### Week 1: Foundation
- Set up KMS keys for log encryption
- Create storage buckets and BigQuery datasets
- Configure basic log sinks

### Week 2: Enhanced Logging
- Deploy comprehensive log filters
- Set up log retention policies
- Configure log encryption

### Week 3-4: Monitoring Stack
- Deploy Prometheus/Grafana
- Configure security dashboards
- Set up alerting rules

## Validation Steps

1. **Log Collection**: Verify all log types are being collected
2. **Encryption**: Confirm logs are encrypted in storage
3. **Retention**: Test log retention policies are working
4. **Monitoring**: Validate Prometheus is scraping metrics
5. **Alerting**: Test alert delivery mechanisms
6. **Dashboards**: Verify Grafana dashboards display data correctly

## Dependencies

- GCP Logging API enabled
- Cloud Functions API enabled (for real-time analysis)
- Pub/Sub API enabled
- BigQuery API enabled
- Sufficient storage quotas

## Success Criteria

- [ ] All security logs centralized and encrypted
- [ ] Log retention policies comply with banking regulations
- [ ] Real-time monitoring and alerting operational
- [ ] Security dashboards provide visibility
- [ ] Log analysis capabilities functional
- [ ] No impact on application performance

## Compliance Benefits

- **Audit Trail**: Complete audit trail for regulatory compliance
- **Incident Response**: Enhanced capability for security incident investigation
- **Monitoring**: Continuous monitoring for suspicious activities
- **Retention**: Proper log retention for legal and regulatory requirements

## Cost Optimization

- Use COLDLINE storage for long-term log retention
- Implement lifecycle policies to reduce storage costs
- Use BigQuery for cost-effective log analysis
- Set up log sampling for high-volume, low-value logs