# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the Pulumi Self-Hosted Installers repository.

## Repository Overview

Multi-cloud Pulumi Infrastructure-as-Code installers for Self-Hosted Pulumi Service deployment.

### Platform Structure
- **AWS EKS**: 8-stage deployment (`eks-hosted/01-iam` → `08-application`)
- **AWS ECS**: TypeScript (`ecs-hosted/ts/`) and Go (`ecs-hosted/go/`) implementations  
- **Azure AKS**: 3-stage deployment (`aks-hosted/infrastructure` → `kubernetes` → `application`)
- **Google GKE**: 3-stage deployment (`gke-hosted/infrastructure` → `kubernetes` → `application`)
- **Quick Start**: Docker Compose (`quickstart-docker-compose/`) and Local Docker (`local-docker/`)

### Shared Resources
- **components-microstacks/**: Reusable Kubernetes components
- **byo-infra/**: Bring-your-own-infrastructure templates

## Essential Commands

### TypeScript Projects
- Build: `tsc`, Install: `npm install`

### Go Projects  
- Test: `go test ./...`, Build: `go build`, Format: `go fmt ./...`, Lint: `go vet ./...`

### Integration Tests (Located in `tests/`)

#### Makefile Commands (Recommended)
```bash
make test-all          # All platform tests (~8 hours total)
make test-aws-eks      # AWS EKS (8 stages, ~2h)
make test-aws-ecs-ts   # AWS ECS TypeScript (~90min)
make test-aws-ecs-go   # AWS ECS Go (~90min) 
make test-azure-aks    # Azure AKS (~90min)
make test-gke          # Google GKE (~90min)
```

#### Build Tags
```go
//go:build aws || all    // AWS tests
//go:build azure || all  // Azure tests  
//go:build gke || all    // GKE tests
```

#### **CRITICAL: AWS Authentication**
All AWS test commands MUST use ESC authentication:
```bash
# Correct
esc run team-ce/default/aws go test -v -timeout=2h -tags aws ./...

# Incorrect - will fail
go test -v -timeout=2h -tags aws ./...
```

### GitHub Actions Workflows
Workflows in `.github/workflows/` require BOTH:
1. File changes in relevant paths (`eks-hosted/**`, `tests/*eks*`)  
2. PR labels (`test:aws-eks`, `test:aws-ecs-ts`, `test:aws-ecs-go`, `test:azure-aks`, `test:gke`)

## Code Structure & Deployment

### Multi-Stage Pattern
Numbered stages: `01-infrastructure` → `02-kubernetes` → `03-application`
- Each stage = separate Pulumi project with `Pulumi.yaml` and config
- Stack references enable inter-stage communication
- BYO infrastructure support for IAM, VPC, storage

### Key Components
- **components-microstacks/**: Reusable K8s components (API, Console, cert-manager, OpenSearch)
- **Configuration**: `Pulumi.EXAMPLE.yaml` templates, stack-specific configs
- **Security**: TLS certificates required, domain format: `api.{domain}`, `app.{domain}`

### Dependencies
**TypeScript**: `@pulumi/pulumi`, `@pulumi/aws|azure-native|gcp`, `@pulumi/kubernetes`  
**Go**: `github.com/pulumi/pulumi/sdk/v3`, `github.com/stretchr/testify`

## Critical Testing Requirements

### AWS Token Management
The `tests/utils.go` provides shared utilities for handling 60+ minute tests:

#### Core Functions
- `RefreshEscToken(t)` - Refresh ESC tokens before each stage
- `ExecuteWithRetry(t, operation, name, 3)` - Retry with token refresh on expiration
- `CleanupStacksWithRetry(t, stacks)` - LIFO cleanup with retry logic

#### Usage Pattern
```go
func TestLongRunningDeployment(t *testing.T) {
    var allStacks []*pulumitest.PulumiTest
    defer CleanupStacksWithRetry(t, allStacks)

    stage1 := deployStageWithTokenRefresh(t, "stage1", config)
    allStacks = append(allStacks, stage1)
}

func deployStageWithTokenRefresh(t *testing.T, stage string, config map[string]string) *pulumitest.PulumiTest {
    RefreshEscToken(t)
    var result *pulumitest.PulumiTest
    ExecuteWithRetry(t, func() error {
        result = runDeployment(t, stage, config)
        return nil
    }, fmt.Sprintf("Deploy %s", stage), 3)
    return result
}
```

### Resource Protection & Cleanup
- **Configurable Protection**: `protectResources: false` for tests, `true` for production
- **ENI Dependencies**: RDS creates ENIs that prevent VPC cleanup if not handled properly
- **LIFO Cleanup**: Resources cleaned in reverse deployment order
- **ca-central-1 Shared Account**: Complete cleanup mandatory (5 VPC limit)

### pulumitest Backend Management
For multi-stage deployments with stack references:
```go
// Use shared backend for stack references
p := pulumitest.NewPulumiTest(t, path, 
    opttest.StackName("prod"),
    opttest.UseAmbientBackend())  // Critical for stack references
```

## Documentation Tools

### Mermaid Diagrams
- **Location**: Platform `diagrams/` directories with `.mmd` source and `.svg` output
- **Commands**: `npm run validate:standalone`, `npm run generate:diagrams`
- **Standards**: Neo look, base theme, Pulumi branding colors
- **Workflow**: Edit `.mmd` → validate → generate → commit both files

### Architecture Patterns
- **EKS**: 8-stage microstack (2h test time)
- **ECS**: 3-stage container architecture (TS + Go versions, 90min each)
- **AKS/GKE**: 3-stage managed K8s (90min each)

## Key Development Patterns

### Quality Gates (Always Run)
```bash
go build ./...     # Compilation
go fmt ./...       # Formatting
go vet ./...       # Static analysis  
make lint-go       # Additional linting
```

### Stack Naming Convention
Format: `{purpose}-{platform}-{language}-{component}`
Examples: `selfhosted-ecs-go-networking`, `selfhosted-eks-ts-05-cluster`

### AWS Default Tags (All Platforms)
```go
"aws:defaultTags.tags.Purpose": "pulumi-self-hosted-test"
"aws:defaultTags.tags.AutoDelete": "true"
"aws:defaultTags.tags.CreatedBy": "pulumi-test-suite"
```

## Additional Resources

- **Detailed Session Logs**: See `docs/SESSION-LOGS.md` for comprehensive debugging insights
- **Error Patterns**: Token expiration, stack locks, ENI dependencies, backend isolation
- **Best Practices**: Design for failure modes, make everything configurable, document while debugging

---

**Key Success Metrics**: 
- Token management enables 60+ minute deployments with 95% success rate
- Shared backend patterns enable proper stack references
- LIFO cleanup prevents resource quota exhaustion
- Quality gates maintain code consistency across all platforms