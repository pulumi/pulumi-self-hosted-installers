# Group 4: GKE Cluster Security Hardening (Non-Breaking)

**Target File:** `gke-hosted/02-kubernetes/cluster.ts:20-66`

## Overview
These GKE cluster security enhancements can be implemented as cluster-level configurations that enhance security without disrupting running workloads.

## Tasks in This Group

### 1. Pod Security Standards Implementation (CRITICAL)
- **Current State**: Not implemented
- **Implementation**: Implement restricted Pod Security Standards
- **Timeline**: 2-3 weeks
- **Pulumi Changes**:
  ```typescript
  // Add to cluster configuration
  podSecurityPolicy: {
    enabled: true,
  },
  addonsConfig: {
    gkeBackupAgentConfig: {
      enabled: true,
    },
  },
  ```

### 2. Node Security Enhancements (MEDIUM)
- **Current State**: Default configuration
- **Implementation**: Enable node auto-upgrade and security patches
- **Timeline**: 1-2 weeks
- **Pulumi Changes**:
  ```typescript
  // Add to cluster configuration
  nodeConfig: {
    imageType: "COS_CONTAINERD",
    machineType: "e2-standard-4",
    metadata: {
      "disable-legacy-endpoints": "true"
    },
    shieldedInstanceConfig: {
      enableSecureBoot: true,
      enableIntegrityMonitoring: true,
    },
  },
  ```

### 3. Network Policies Implementation (HIGH)
- **Current State**: Not configured
- **Implementation**: Deploy Kubernetes network policies (won't break existing traffic)
- **Timeline**: 3-4 weeks
- **Pulumi Changes**:
  ```typescript
  // Add to cluster configuration
  networkPolicy: {
    enabled: true,
    provider: "CALICO",
  },
  addonsConfig: {
    networkPolicyConfig: {
      disabled: false,
    },
  },
  ```

### 4. Admission Controllers Configuration (HIGH)
- **Current State**: Default only
- **Implementation**: Configure additional admission controllers
- **Timeline**: 3-4 weeks
- **Pulumi Changes**:
  ```typescript
  // Add to cluster configuration
  masterAuth: {
    clusterCaCertificate: "",
  },
  addonsConfig: {
    configConnectorConfig: {
      enabled: true,
    },
  },
  ```

## Implementation Steps

### 1. Enhanced Cluster Configuration
```typescript
export class KubernetesCluster extends pulumi.ComponentResource {
  public readonly Kubeconfig: pulumi.Output<string>;
  public readonly Name: pulumi.Output<string>;
  
  constructor(name: string, args: KubernetesClusterArgs, opts?: pulumi.ComponentResourceOptions) {
    super("x:kubernetes:cluster", name, opts);

    // Create the GKE cluster with enhanced security
    const cluster = new gcp.container.Cluster("pulumi-self-hosted", {
      network: args.networkName,
      subnetwork: args.subnetName,
      enableAutopilot: true,
      location: args.region,
      
      // Network security
      ipAllocationPolicy: {
        clusterSecondaryRangeName: "pods",
        servicesSecondaryRangeName: "services",
      },
      privateClusterConfig: {
        enablePrivateNodes: true,
        enablePrivateEndpoint: false, // Keep false for management access
        masterIpv4CidrBlock: "172.16.0.0/28",
      },
      
      // Network policies
      networkPolicy: {
        enabled: true,
        provider: "CALICO",
      },
      
      // Pod security
      podSecurityPolicyConfig: {
        enabled: true,
      },
      
      // Binary authorization
      binaryAuthorization: {
        evaluationMode: "PROJECT_SINGLETON_POLICY_ENFORCE",
      },
      
      // Workload identity
      workloadIdentityConfig: {
        workloadPool: pulumi.interpolate`${gcp.config.project}.svc.id.goog`,
      },
      
      // Enhanced addons
      addonsConfig: {
        networkPolicyConfig: {
          disabled: false,
        },
        configConnectorConfig: {
          enabled: true,
        },
        gkeBackupAgentConfig: {
          enabled: true,
        },
        kalmConfig: {
          enabled: true,
        },
      },
      
      // Security settings
      authenticatorGroupsConfig: {
        enabled: true,
        securityGroup: pulumi.interpolate`gke-security-groups@${gcp.config.project}.iam.gserviceaccount.com`,
      },
      
      // Logging and monitoring
      loggingService: "logging.googleapis.com/kubernetes",
      monitoringService: "monitoring.googleapis.com/kubernetes",
      
      // Cluster version and maintenance
      minMasterVersion: config.clusterVersion,
      maintenancePolicy: {
        dailyMaintenanceWindow: {
          startTime: "03:00",
        },
      },
      
      // Resource usage export
      resourceUsageExportConfig: {
        enableNetworkEgressMetering: true,
        enableResourceConsumptionMetering: true,
        bigqueryDestination: {
          datasetId: "gke_usage_data",
        },
      },
      
    }, { parent: this, protect: true });
```

### 2. Pod Security Policies
```typescript
    // Create pod security policies after cluster creation
    const restrictedPSP = new k8s.policy.v1beta1.PodSecurityPolicy("restricted-psp", {
      metadata: {
        name: "restricted",
        annotations: {
          "seccomp.security.alpha.kubernetes.io/allowedProfileNames": "runtime/default",
          "seccomp.security.alpha.kubernetes.io/defaultProfileName": "runtime/default",
          "apparmor.security.beta.kubernetes.io/allowedProfileNames": "runtime/default",
          "apparmor.security.beta.kubernetes.io/defaultProfileName": "runtime/default",
        },
      },
      spec: {
        privileged: false,
        allowPrivilegeEscalation: false,
        requiredDropCapabilities: ["ALL"],
        volumes: [
          "configMap",
          "emptyDir",
          "projected",
          "secret",
          "downwardAPI",
          "persistentVolumeClaim",
        ],
        runAsUser: {
          rule: "MustRunAsNonRoot",
        },
        seLinux: {
          rule: "RunAsAny",
        },
        fsGroup: {
          rule: "RunAsAny",
        },
        readOnlyRootFilesystem: true,
      },
    }, { provider: k8sProvider, dependsOn: cluster });
```

### 3. Network Policies
```typescript
    // Default deny-all network policy
    const defaultDenyNetworkPolicy = new k8s.networking.v1.NetworkPolicy("default-deny-all", {
      metadata: {
        name: "default-deny-all",
        namespace: "default",
      },
      spec: {
        podSelector: {},
        policyTypes: ["Ingress", "Egress"],
      },
    }, { provider: k8sProvider, dependsOn: cluster });

    // Allow DNS resolution
    const allowDnsNetworkPolicy = new k8s.networking.v1.NetworkPolicy("allow-dns", {
      metadata: {
        name: "allow-dns",
        namespace: "default",
      },
      spec: {
        podSelector: {},
        policyTypes: ["Egress"],
        egress: [{
          to: [{
            namespaceSelector: {
              matchLabels: {
                name: "kube-system",
              },
            },
          }],
          ports: [{
            protocol: "UDP",
            port: 53,
          }],
        }],
      },
    }, { provider: k8sProvider, dependsOn: cluster });

    // Allow ingress controller traffic
    const allowIngressNetworkPolicy = new k8s.networking.v1.NetworkPolicy("allow-ingress", {
      metadata: {
        name: "allow-ingress",
        namespace: "pulumi-selfhosted-apps",
      },
      spec: {
        podSelector: {
          matchLabels: {
            app: "pulumi-api",
          },
        },
        policyTypes: ["Ingress"],
        ingress: [{
          from: [{
            namespaceSelector: {
              matchLabels: {
                name: "pulumi-selfhosted-ingress",
              },
            },
          }],
          ports: [{
            protocol: "TCP",
            port: 8080,
          }],
        }],
      },
    }, { provider: k8sProvider, dependsOn: cluster });
```

### 4. Binary Authorization Policy
```typescript
    // Binary authorization policy
    const binaryAuthPolicy = new gcp.binaryauthorization.Policy("binary-auth-policy", {
      description: "Binary authorization policy for GKE cluster",
      globalPolicyEvaluationMode: "ENABLE",
      defaultAdmissionRule: {
        evaluationMode: "REQUIRE_ATTESTATION",
        enforcementMode: "ENFORCED_BLOCK_AND_AUDIT_LOG",
        requireAttestationsBy: [attestor.name],
      },
      clusterAdmissionRules: [{
        cluster: pulumi.interpolate`projects/${gcp.config.project}/zones/${gcp.config.zone}/clusters/${cluster.name}`,
        evaluationMode: "REQUIRE_ATTESTATION",
        enforcementMode: "ENFORCED_BLOCK_AND_AUDIT_LOG",
        requireAttestationsBy: [attestor.name],
      }],
    });

    // Create attestor for image verification
    const attestor = new gcp.binaryauthorization.Attestor("image-attestor", {
      name: "pulumi-image-attestor",
      description: "Attestor for Pulumi service images",
      attestationAuthorityNote: {
        noteReference: note.name,
        publicKeys: [{
          asciiArmoredPgpPublicKey: publicKey,
        }],
      },
    });
```

### 5. Workload Identity Configuration
```typescript
    // Workload identity binding
    const workloadIdentityBinding = new gcp.serviceaccount.IAMBinding("workload-identity-binding", {
      serviceAccountId: googleServiceAccount.name,
      role: "roles/iam.workloadIdentityUser",
      members: [
        pulumi.interpolate`serviceAccount:${gcp.config.project}.svc.id.goog[${namespace}/${kubernetesServiceAccount}]`,
      ],
    });
```

## Expected Security Improvements

- **Pod Security**: Restricted pod security policies preventing privileged execution
- **Network Isolation**: Default-deny network policies with explicit allow rules
- **Node Security**: Hardened nodes with shielded instances and auto-updates
- **Image Security**: Binary authorization ensuring only verified images run
- **Identity Security**: Workload identity for secure GCP API access

## Risk Assessment

- **Breaking Change Risk**: **LOW** - Policies can be initially permissive
- **Workload Impact**: **MINIMAL** - Autopilot handles most configurations
- **Performance Impact**: **NEGLIGIBLE** - Security policies have minimal overhead

## Implementation Strategy

### Phase 1: Foundation (Week 1-2)
1. Enable node security features
2. Configure workload identity
3. Set up monitoring and logging

### Phase 2: Network Security (Week 3-4)
1. Enable network policies
2. Deploy default-deny policies
3. Create specific allow policies for application traffic

### Phase 3: Pod Security (Week 5-6)
1. Deploy permissive pod security policies
2. Gradually tighten restrictions
3. Test application compatibility

### Phase 4: Image Security (Week 7-8)
1. Set up binary authorization
2. Create image attestation process
3. Enforce image verification

## Testing & Validation

### Pre-Implementation
- Document current pod specifications
- Test network connectivity patterns
- Verify image sources and signatures

### During Implementation  
- Monitor for policy violations
- Test application functionality
- Validate security controls

### Post-Implementation
- Verify all security policies are active
- Confirm applications run without issues
- Test security incident response

## Rollback Procedures

```typescript
// Emergency policy disabling
const emergencyPolicyDisable = {
  podSecurityPolicyConfig: {
    enabled: false,
  },
  networkPolicy: {
    enabled: false,
  },
  binaryAuthorization: {
    evaluationMode: "DISABLED",
  },
};
```

## Dependencies

- GKE Autopilot cluster
- Binary Authorization API enabled
- Container Analysis API enabled
- Appropriate IAM permissions

## Success Criteria

- [ ] Pod security standards implemented and enforced
- [ ] Network policies active with appropriate traffic flow
- [ ] Node security features enabled
- [ ] Binary authorization configured and working
- [ ] Workload identity functional
- [ ] All applications running without security violations
- [ ] Enhanced security monitoring operational

## Monitoring & Alerting

### Security Events
- Pod security policy violations
- Network policy denials
- Binary authorization blocks
- Workload identity failures

### Cluster Health
- Node security status
- Policy compliance metrics
- Security scanning results
- Admission controller performance