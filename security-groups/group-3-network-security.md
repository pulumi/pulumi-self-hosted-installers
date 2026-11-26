# Group 3: Network Security Foundation (Non-Breaking)

**Target File:** `gke-hosted/01-infrastructure/network.ts:16-43`

## Overview
These network security enhancements add defense-in-depth protection without changing application connectivity or requiring application modifications.

## Tasks in This Group

### 1. Firewall Rules Implementation (HIGH)
- **Current State**: Basic VPC with auto-subnets
- **Implementation**: Implement explicit firewall rules with deny-all default
- **Timeline**: 2-3 weeks
- **Pulumi Changes**:
  ```typescript
  // Add explicit firewall rules
  const denyAllFirewall = new gcp.compute.Firewall("deny-all-default", {
    network: vnet.id,
    priority: 65534,
    direction: "INGRESS",
    allows: [],
    denies: [{ protocol: "all" }],
    sourceRanges: ["0.0.0.0/0"],
  });
  ```

### 2. VPC Flow Logs Enablement (MEDIUM)
- **Current State**: Not enabled
- **Implementation**: Enable VPC Flow Logs for network monitoring
- **Timeline**: 1 week
- **Pulumi Changes**:
  ```typescript
  // Add to subnet configuration
  logConfig: {
    enable: true,
    flowSampling: 0.5,
    aggregationInterval: "INTERVAL_10_MIN",
  },
  ```

### 3. Private Service Connect Configuration (MEDIUM)
- **Current State**: Public service endpoints
- **Implementation**: Configure Private Service Connect for GCP APIs
- **Timeline**: 2-3 weeks
- **Pulumi Changes**:
  ```typescript
  // Add private service connect endpoint
  const pscEndpoint = new gcp.compute.ServiceAttachment("private-service-connect", {
    connectionPreference: "ACCEPT_AUTOMATIC",
    natSubnets: [subnet.selfLink],
  });
  ```

### 4. Cloud Armor DDoS Protection (MEDIUM)
- **Current State**: Basic GCP protection
- **Implementation**: Configure Cloud Armor with custom rules
- **Timeline**: 2-3 weeks
- **Pulumi Changes**:
  ```typescript
  // Add Cloud Armor security policy
  const securityPolicy = new gcp.compute.SecurityPolicy("ddos-protection", {
    rules: [{
      action: "deny(403)",
      priority: 1000,
      match: {
        expr: {
          expression: "origin.region_code == 'CN'"
        }
      }
    }]
  });
  ```

## Implementation Steps

### 1. Enhanced VPC Configuration
```typescript
export class Network extends pulumi.ComponentResource {
  public readonly networkName: pulumi.Output<string>;
  public readonly networkId: pulumi.Output<string>;
  public readonly subnetId: pulumi.Output<string>;
  
  constructor(name: string, args: NetworkArgs) {
    super("x:infrastructure:networking", name);

    // Create VPC with explicit configuration
    const vnet = new gcp.compute.Network(`${name}-network`, {
      autoCreateSubnetworks: false, // Explicit subnet control
      routingMode: "REGIONAL",
    }, { parent: this });

    // Create subnet with flow logs
    const subnet = new gcp.compute.Subnetwork(`${name}-subnet`, {
      network: vnet.id,
      ipCidrRange: "10.0.0.0/16",
      region: gcp.config.region,
      logConfig: {
        enable: true,
        flowSampling: 0.5,
        aggregationInterval: "INTERVAL_10_MIN",
        metadata: "INCLUDE_ALL_METADATA",
      },
      privateIpGoogleAccess: true,
    }, { parent: this });

    // Private IP allocation for service networking
    const privateIpAddress = new gcp.compute.GlobalAddress(`${name}-private-ips`, {
      purpose: "VPC_PEERING",
      addressType: "INTERNAL",
      prefixLength: 16,
      network: vnet.id,
      labels: args.tags,
    }, { parent: this });

    // Private VPC connection
    const privateVpcConnection = new gcp.servicenetworking.Connection(`${name}-private-conn`, {
      network: vnet.id,
      service: "servicenetworking.googleapis.com",
      reservedPeeringRanges: [privateIpAddress.name],
    }, { parent: this });
```

### 2. Comprehensive Firewall Rules
```typescript
    // Deny all by default (lowest priority)
    const denyAllIngress = new gcp.compute.Firewall(`${name}-deny-all-ingress`, {
      network: vnet.id,
      priority: 65534,
      direction: "INGRESS",
      denies: [{ protocol: "all" }],
      sourceRanges: ["0.0.0.0/0"],
      description: "Deny all ingress traffic by default",
    }, { parent: this });

    const denyAllEgress = new gcp.compute.Firewall(`${name}-deny-all-egress`, {
      network: vnet.id,
      priority: 65534,
      direction: "EGRESS",
      denies: [{ protocol: "all" }],
      destinationRanges: ["0.0.0.0/0"],
      description: "Deny all egress traffic by default",
    }, { parent: this });

    // Allow internal communication
    const allowInternal = new gcp.compute.Firewall(`${name}-allow-internal`, {
      network: vnet.id,
      priority: 1000,
      direction: "INGRESS",
      allows: [
        { protocol: "tcp" },
        { protocol: "udp" },
        { protocol: "icmp" }
      ],
      sourceRanges: ["10.0.0.0/8"],
      description: "Allow internal VPC communication",
    }, { parent: this });

    // Allow GKE cluster communication
    const allowGkeNodes = new gcp.compute.Firewall(`${name}-allow-gke-nodes`, {
      network: vnet.id,
      priority: 1000,
      direction: "INGRESS",
      allows: [
        { protocol: "tcp", ports: ["1-65535"] },
        { protocol: "udp", ports: ["1-65535"] }
      ],
      sourceRanges: ["10.0.0.0/16"], // GKE node subnet
      targetTags: ["gke-node"],
      description: "Allow GKE node-to-node communication",
    }, { parent: this });

    // Allow HTTPS ingress
    const allowHttpsIngress = new gcp.compute.Firewall(`${name}-allow-https`, {
      network: vnet.id,
      priority: 1000,
      direction: "INGRESS",
      allows: [{ protocol: "tcp", ports: ["443"] }],
      sourceRanges: ["0.0.0.0/0"],
      targetTags: ["https-server"],
      description: "Allow HTTPS ingress",
    }, { parent: this });

    // Allow necessary egress
    const allowHttpsEgress = new gcp.compute.Firewall(`${name}-allow-https-egress`, {
      network: vnet.id,
      priority: 1000,
      direction: "EGRESS",
      allows: [
        { protocol: "tcp", ports: ["443"] },
        { protocol: "tcp", ports: ["80"] }
      ],
      destinationRanges: ["0.0.0.0/0"],
      description: "Allow HTTPS/HTTP egress for updates and API calls",
    }, { parent: this });
```

### 3. Cloud Armor Security Policy
```typescript
    // Cloud Armor security policy
    const securityPolicy = new gcp.compute.SecurityPolicy(`${name}-security-policy`, {
      description: "Security policy for DDoS protection and threat mitigation",
      rules: [
        {
          action: "deny(403)",
          priority: 1000,
          description: "Block traffic from high-risk countries",
          match: {
            expr: {
              expression: "origin.region_code == 'CN' || origin.region_code == 'RU'"
            }
          }
        },
        {
          action: "rate_based_ban",
          priority: 2000,
          description: "Rate limiting rule",
          match: {
            expr: {
              expression: "true"
            }
          },
          rateLimitOptions: {
            conformAction: "allow",
            exceedAction: "deny(429)",
            enforceOnKey: "IP",
            rateLimitThreshold: {
              count: 100,
              intervalSec: 60
            },
            banDurationSec: 300
          }
        },
        {
          action: "allow",
          priority: 2147483647,
          description: "Default allow rule",
          match: {
            expr: {
              expression: "true"
            }
          }
        }
      ]
    }, { parent: this });
```

### 4. Private Service Connect Endpoints
```typescript
    // Private service connect for Google APIs
    const privateServiceConnect = new gcp.compute.Address(`${name}-psc-endpoint`, {
      name: `${name}-psc-endpoint`,
      subnetwork: subnet.id,
      addressType: "INTERNAL",
      purpose: "GCE_ENDPOINT",
    }, { parent: this });

    const pscForwardingRule = new gcp.compute.ForwardingRule(`${name}-psc-rule`, {
      name: `${name}-psc-googleapis`,
      target: "all-apis",
      loadBalancingScheme: "",
      network: vnet.id,
      ipAddress: privateServiceConnect.address,
    }, { parent: this });
```

## Expected Security Improvements

- **Network Segmentation**: Explicit firewall rules with deny-all default
- **Traffic Monitoring**: Complete VPC flow logs for security analysis
- **Private Communication**: GCP API access through private endpoints
- **DDoS Protection**: Advanced Cloud Armor rules and rate limiting
- **Threat Mitigation**: Geographic and behavioral blocking rules

## Risk Assessment

- **Breaking Change Risk**: **LOW** - Additive security controls
- **Connectivity Risk**: **MEDIUM** - Requires careful firewall rule testing
- **Performance Impact**: **MINIMAL** - Slight latency for flow logging

## Testing & Validation

### Pre-Implementation Testing
1. Document current connectivity patterns
2. Test application flows in staging environment
3. Validate GKE cluster communication requirements

### Post-Implementation Validation
1. Verify all application services remain accessible
2. Confirm GKE cluster nodes can communicate
3. Test private API endpoint connectivity
4. Validate flow logs are being generated
5. Check Cloud Armor rules are functioning

## Rollback Plan

```typescript
// Emergency firewall rule to allow all traffic if needed
const emergencyAllowAll = new gcp.compute.Firewall(`${name}-emergency-allow`, {
  network: vnet.id,
  priority: 100, // Higher priority than deny rules
  direction: "INGRESS",
  allows: [{ protocol: "all" }],
  sourceRanges: ["0.0.0.0/0"],
  disabled: true, // Keep disabled unless emergency
}, { parent: this });
```

## Dependencies

- GCP Compute Engine API enabled
- Cloud Armor API enabled
- Service Networking API enabled
- Appropriate IAM permissions for firewall management

## Success Criteria

- [ ] Explicit firewall rules implemented with deny-all default
- [ ] VPC flow logs enabled and generating data
- [ ] Private service connect endpoints functional
- [ ] Cloud Armor security policy active
- [ ] All application connectivity preserved
- [ ] Security monitoring enhanced without performance degradation

## Monitoring & Alerting

### Flow Log Analysis
- Set up log sinks for security analysis
- Create alerts for unusual traffic patterns
- Monitor for potential security incidents

### Firewall Rule Monitoring
- Track blocked connections
- Alert on repeated deny rule hits
- Monitor for potential attacks

### Cloud Armor Metrics
- Monitor blocked requests by rule
- Track rate limiting effectiveness
- Alert on high-volume attacks