# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Architecture

This repository contains Pulumi Infrastructure-as-Code installers for deploying the Self-Hosted Pulumi Service across multiple cloud platforms. The architecture is organized by target platform with both TypeScript and Go implementations where applicable.

### Platform-Specific Installers
- **AWS EKS**: Multi-stage deployment (`eks-hosted/`) with numbered subdirectories (01-iam, 02-networking, etc.)
- **AWS ECS**: Both TypeScript (`ecs-hosted/ts/`) and Go (`ecs-hosted/go/`) implementations
- **Azure AKS**: Three-stage deployment (`aks-hosted/`) for infrastructure, Kubernetes, and application
- **Google GKE**: Three-stage deployment (`gke-hosted/`) following similar pattern to AKS
- **Docker Compose**: Quick-start option (`quickstart-docker-compose/`) for local development
- **Local Docker**: Single-node deployment (`local-docker/`)

### Shared Components
- **components-microstacks/**: Reusable Kubernetes components for API, console, cert-manager, and OpenSearch
- **byo-infra/**: Bring-your-own-infrastructure templates

## Development Commands

### TypeScript Projects
Navigate to any TypeScript-based project directory and use:
- Build: `tsc` (uses local tsconfig.json)
- Install dependencies: `npm install` or `npm ci`
- No linting/formatting configured at project level

### Go Projects
- Test: `go test ./...` (from project root or individual Go module directories)
- Build: `go build` (for individual modules)
- Format: `go fmt ./...`
- Vet: `go vet ./...`

### Integration Tests
Located in `quickstart-docker-compose/tests/`:
- Run with build tags: `go test -tags=minio ./...`
- Tests create users, run stack operations, and verify API endpoints
- Requires running Pulumi Service at `http://localhost:8080`

## Code Structure

### Multi-Stage Deployment Pattern
Most cloud platform installers follow a numbered stage pattern:
1. **01-infrastructure**: Core cloud resources (networking, databases, storage)
2. **02-kubernetes**: Kubernetes cluster setup and services  
3. **03-application**: Pulumi Service deployment and configuration

Each stage is a separate Pulumi project with its own `Pulumi.yaml`, `package.json`/`go.mod`, and configuration.

### Configuration Management
- Each project has `Pulumi.EXAMPLE.yaml` showing required configuration
- Uses stack-specific config files (`Pulumi.{stack-name}.yaml`)
- Common patterns: resource prefixes, domain names, certificate paths, feature flags

### Bring-Your-Own (BYO) Infrastructure Support
Several installers support using existing infrastructure:
- IAM resources (EKS: 01-iam)
- VPC/Networking (EKS: 02-networking) 
- S3 buckets for state storage (EKS: 15-state-policies-mgmt)
- ESC storage (EKS: 30-esc)

### Component Architecture
The `components-microstacks/` directory contains reusable Kubernetes components:
- `api.ts`: Pulumi API service deployment
- `console.ts`: Pulumi Console UI deployment
- `cert-manager.ts`: Certificate management
- `openSearch.ts`: Search service for resource discovery

## Key Dependencies

### TypeScript Projects
- `@pulumi/pulumi`: Core Pulumi SDK
- Cloud-specific: `@pulumi/aws`, `@pulumi/azure-native`, `@pulumi/gcp`
- `@pulumi/kubernetes`: Kubernetes resource management
- `@pulumi/awsx`: AWS extensions for ECS/load balancers

### Go Projects  
- `github.com/pulumi/pulumi/sdk/v3`: Core Pulumi Go SDK
- `github.com/stretchr/testify`: Test framework
- Cloud provider modules for AWS/Azure/GCP resources

## Testing Strategy

### Integration Tests
- Located in `quickstart-docker-compose/tests/`
- Uses Pulumi Automation API for programmatic stack operations
- Tests user creation, stack updates, and policy pack operations
- Test applications in `tests/test-pulumi-app/` and `tests/test-policy-pack/`

### Unit Tests
- Go modules have `*_test.go` files (e.g., `ecs-hosted/go/common/utils_test.go`)
- Test cloud-specific utility functions (ARN handling, endpoint resolution)

## Deployment Guidelines

### State Backend
- Recommended: S3 backend for AWS deployments
- Alternative: Pulumi Cloud backend
- Each installer assumes backend is configured before deployment

### Deployment Order
- Follow numbered directory order for multi-stage deployments
- Each stage outputs values consumed by subsequent stages
- Can use existing infrastructure by providing resource IDs in configuration

### Security Considerations
- TLS certificates required for API and console endpoints
- Domain name requirements: `api.{domain}` and `app.{domain}`
- IAM roles and service accounts created per cloud platform best practices

## Documentation and Diagrams

### Mermaid Architecture Diagrams
Each platform README contains comprehensive Mermaid diagrams showing:
- **Platform-specific services**: Actual cloud service names (Amazon EKS, Azure AKS, Google GKE, etc.)
- **Multi-stage dependencies**: Stack references and data flow between deployment stages
- **Resource relationships**: Networking, storage, compute, and security component connections
- **External dependencies**: Required services like SMTP, DNS, certificates

### Documentation Development Tools
Root-level `package.json` provides development tools:
```bash
# Install documentation tools
npm install

# Lint all documentation
npm run lint

# Validate standalone mermaid diagrams (recommended)
npm run validate:standalone

# Generate SVG diagrams from standalone .mmd files
npm run generate:diagrams

# Legacy: validate inline diagrams (deprecated)
npm run validate:diagrams
```

**Tools included**:
- `@mermaid-js/mermaid-cli`: Mermaid diagram validation and SVG generation
- `markdownlint-cli`: Markdown formatting and style consistency

### Standalone Diagram Management
All platform README files use **standalone mermaid diagrams** stored in `diagrams/` directories:

**File Structure Pattern**:
```
{platform}/
├── README.md                 # Contains SVG image references
└── diagrams/
    ├── 01-overview.mmd      # Standalone mermaid source
    ├── 01-overview.svg      # Generated SVG for display
    ├── 02-infrastructure.mmd
    ├── 02-infrastructure.svg
    └── ...
```

**README Reference Pattern**:
```markdown
### Overview - Deployment Flow
![Overview Diagram](./diagrams/01-overview.svg)
```

**Key Benefits**:
- ✅ Diagrams render properly in GitHub and other markdown viewers
- ✅ Standalone .mmd files can be validated independently
- ✅ SVG generation provides consistent, high-quality display
- ✅ Maintainable separation of diagram source from documentation

**Workflow for Diagram Updates**:
1. Edit `.mmd` files in the appropriate `diagrams/` directory
2. Run `npm run validate:standalone` to check syntax
3. Run `npm run generate:diagrams` to create/update SVG files
4. Commit both `.mmd` and `.svg` files to version control

### Architecture Patterns by Platform

#### EKS (AWS) - 8-Stage Microstack Architecture
- **Complexity**: Highest granularity with 8 independent stacks
- **BYO Support**: Extensive bring-your-own infrastructure options
- **Key Services**: Amazon EKS, Aurora MySQL, S3, ALB, OpenSearch
- **Pattern**: Numbered stages (01-iam → 02-networking → 05-eks-cluster → etc.)

#### ECS (AWS) - 3-Stage Container Architecture  
- **Versions**: TypeScript and Go implementations
- **Key Services**: ECS Fargate, Aurora MySQL, ALB/NLB, VPC Endpoints
- **Pattern**: infrastructure → application → DNS
- **Difference**: Go version supports private load balancers for air-gapped deployments

#### GKE (Google Cloud) - 3-Stage Managed Architecture
- **Key Services**: GKE Autopilot, Cloud SQL MySQL, GCS, NGINX Ingress
- **Pattern**: infrastructure → kubernetes → application
- **Features**: Private VPC peering, S3-compatible GCS access, local key encryption

#### AKS (Azure) - 3-Stage Enterprise Architecture
- **Key Services**: AKS, Azure Database for MySQL, Azure Storage, cert-manager
- **Pattern**: infrastructure → kubernetes → application  
- **Features**: Azure AD integration, automated certificate management, workload identity

### Enterprise Mermaid Diagram Standards
All diagrams in this repository follow enterprise-grade styling standards:

**Core Configuration**: 
```yaml
---
config:
  look: neo
  theme: base
---
```

**Enterprise Styling Requirements**:
1. **Neo Look + Base Theme**: Professional appearance with light background compatibility for README files
2. **Official Pulumi Branding**: Use authentic Pulumi brand colors:
   - Primary Pulumi: `#4d5bd9` (Pulumi Blue)
   - Accent Color: `#f7bf2a` (Pulumi Yellow)
3. **4px Borders**: Enterprise visual weight with `stroke-width:4px`
4. **Bold Typography**: Add `font-weight:bold` to all class definitions
5. **YAML Frontmatter**: Replace legacy `%%{init: {...}}%%` syntax

**Cloud Provider Color Scheme**:
- **AWS Services**: `#FF9900` (Amazon Orange) with Pulumi accent borders
- **Azure Services**: `#0078D4` (Microsoft Blue) with Pulumi accent borders  
- **Google Cloud**: `#4285F4` (Google Blue) with Pulumi accent borders
- **Pulumi Services**: `#4d5bd9` with `#f7bf2a` borders
- **Security**: `#7B1FA2` (Professional Purple)
- **Storage**: `#1976D2` (Professional Blue)
- **Networking**: `#D32F2F` (Enterprise Red)

**Professional Structure**:
- Use subgraphs for logical component grouping
- Include emojis and detailed descriptions for visual hierarchy
- Maintain consistent service categorization across platforms
- Include actual cloud service names (e.g., "Amazon EKS", "Azure Kubernetes Service")

**Validation & Generation**:
1. **Syntax Validation**: Always run `npm run validate:standalone` before committing
2. **SVG Generation**: Use `npm run generate:diagrams` to create enterprise-styled SVGs
3. **Version Control**: Commit both `.mmd` source files and generated `.svg` files

### Common Diagram Issues and Solutions

**Text Overflow Problems**:
- **Issue**: Long text labels exceed diagram box boundaries
- **Solution**: Reduce font size to 18px and shorten text labels
- **Example**: Change "DNS Resolution and HTTPS Traffic" → "DNS & HTTPS"

**Parse Errors**:
- **Issue**: Trailing spaces in subgraph labels cause validation failures
- **Solution**: Remove all trailing whitespace from subgraph definitions
- **Example**: `subgraph NET["Network"] ` → `subgraph NET["Network"]`

**README Display Issues**:
- **Issue**: Inline mermaid blocks don't render properly in GitHub
- **Solution**: Use standalone .mmd files with SVG generation and markdown image syntax
- **Pattern**: `![Diagram Title](./diagrams/filename.svg)`