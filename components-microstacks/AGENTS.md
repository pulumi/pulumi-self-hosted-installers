# Shared Kubernetes Components

Reusable Kubernetes TypeScript components consumed by the platform installers
(EKS stage 90 and others). See the root `AGENTS.md` for repository-wide
conventions — changes here affect multiple platforms, so flag them to reviewers.

## Code Review Guidance

Be constructive and focus on component reusability and production reliability
across all platforms.

### Pulumi Infrastructure-as-Code best practices

- Proper resource naming conventions and tagging
- Component interface design and reusability
- Configuration management and input validation
- Provider version consistency and updates

### Component-specific considerations

- **api.ts**: Pulumi API service deployment, container configuration, service discovery
- **console.ts**: Pulumi Console UI deployment, frontend service configuration
- **cert-manager.ts**: Certificate management automation, ACME configuration, TLS setup
- **openSearch.ts**: Search service deployment, indexing configuration, cluster management
- Component interface consistency across different cloud platforms
- Kubernetes resource definitions and manifest generation
- Service mesh and networking configurations
- Resource dependencies and initialization order

### Cross-platform compatibility

- Ensure components work across EKS, ECS, AKS, and GKE platforms
- Validate Kubernetes API version compatibility
- Check for platform-specific customizations and configuration options
- Ensure consistent behavior across different cloud providers
- Validate ingress controller and load balancer configurations

### Security and production readiness

- Secret management and encryption at rest
- Network security (service mesh, ingress/egress rules)
- Certificate management and TLS configuration
- RBAC and service account permissions
- Container security and image scanning considerations
- Pod security policies and admission controllers

### Code quality

- TypeScript idioms and error handling
- Component lifecycle management and cleanup
- Documentation updates and interface specifications
- Test coverage for component functionality
- Reusable component design patterns

### Component design patterns

- Validate component interfaces are backwards compatible
- Check for breaking changes that affect platform deployments
- Ensure proper abstraction and encapsulation
- Validate configuration parameter consistency
- Component versioning and dependency management
