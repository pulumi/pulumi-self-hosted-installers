# AKS-Hosted Installer

Three-stage Azure Kubernetes Service (AKS) deployment of the Self-Hosted Pulumi
Service: 01-infrastructure → 02-kubernetes → 03-application. See the root
`AGENTS.md` for repository-wide conventions.

## Code Review Guidance

Be constructive and focus on production AKS deployment reliability.

### Pulumi Infrastructure-as-Code best practices

- Proper resource naming conventions and tagging
- Stack references and output handling between deployment stages
- Configuration management (`Pulumi.*.yaml` files)
- Provider version consistency and updates

### AKS-specific considerations

- Azure Kubernetes Service (AKS) cluster configuration
- Azure AD integration and workload identity
- Azure Database for MySQL configuration and networking
- Azure Storage account setup and blob storage
- Virtual network (VNet) and subnet configuration
- Key Vault integration for secret management
- Azure Active Directory service principal and identity management
- NGINX ingress controller deployment and configuration
- cert-manager setup for automated certificate management
- Azure-specific networking and security groups
- Multi-stage deployment: 01-infrastructure → 02-kubernetes → 03-application
- OpenSearch deployment and configuration for search services

### Azure integration patterns

- Azure resource group organization and naming
- Azure AD authentication and RBAC integration
- Azure networking and private endpoints
- Azure Monitor and logging integration
- Workload identity federation setup
- Azure Key Vault secret management

### Security and production readiness

- Secret management and encryption at rest
- Network security (private endpoints, ingress/egress rules)
- Certificate management and TLS configuration
- RBAC and service account permissions
- Azure AD integration and authentication flows
- Workload identity and managed identity configuration

### Code quality

- TypeScript idioms and error handling
- Resource cleanup and lifecycle management
- Documentation updates (README.md, architecture diagrams)
- Test coverage for integration tests
- Mermaid diagram accuracy and enterprise styling standards

### AKS deployment patterns

- Validate 3-stage deployment dependencies (01→02→03)
- Check for breaking changes in component interfaces
- Ensure backwards compatibility with existing AKS deployments
- Azure-specific Kubernetes patterns and configurations
- Ingress and certificate automation workflows
