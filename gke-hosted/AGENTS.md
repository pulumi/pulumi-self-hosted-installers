# GKE-Hosted Installer

Three-stage Google Kubernetes Engine (GKE) deployment of the Self-Hosted Pulumi
Service: 01-infrastructure → 02-kubernetes → 03-application. See the root
`AGENTS.md` for repository-wide conventions.

## Code Review Guidance

Be constructive and focus on production GKE deployment reliability.

### Pulumi Infrastructure-as-Code best practices

- Proper resource naming conventions and tagging
- Stack references and output handling between deployment stages
- Configuration management (`Pulumi.*.yaml` files)
- Provider version consistency and updates

### GKE-specific considerations

- Google Kubernetes Engine (GKE) Autopilot cluster configuration
- Cloud SQL MySQL database setup and networking
- Google Cloud Storage (GCS) bucket configuration with S3-compatible access
- VPC networking and private Google Access configuration
- Service account creation and IAM permissions
- Local key encryption and security configurations
- NGINX ingress controller deployment and configuration
- Private VPC peering and network connectivity
- Multi-stage deployment: 01-infrastructure → 02-kubernetes → 03-application
- OpenSearch deployment for search services

### Google Cloud integration patterns

- Google Cloud IAM roles and service accounts
- VPC networking and private service networking
- Cloud SQL private IP and authorized networks
- GCS bucket policies and access control
- GKE workload identity and node pool configuration
- Private cluster networking and authorized networks

### Security and production readiness

- Secret management and encryption at rest with local keys
- Network security (private endpoints, ingress/egress rules)
- Certificate management and TLS configuration
- RBAC and service account permissions
- GKE security best practices and workload identity
- Private cluster configuration and network isolation

### Code quality

- TypeScript idioms and error handling
- Resource cleanup and lifecycle management
- Documentation updates (README.md, architecture diagrams)
- Test coverage for integration tests
- Mermaid diagram accuracy and enterprise styling standards

### GKE deployment patterns

- Validate 3-stage deployment dependencies (01→02→03)
- Check for breaking changes in component interfaces
- Ensure backwards compatibility with existing GKE deployments
- GKE Autopilot-specific configurations and limitations
- Google Cloud networking and security patterns
