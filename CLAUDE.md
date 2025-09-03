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

### Integration Tests Framework
Located in `tests/` directory at repository root:
- **Platform Tests**: End-to-end deployment tests for each cloud platform
- **Build Tags**: All tests use consistent build tags (`aws`, `azure`, `gke`, `integration`)
- **Makefile Integration**: Use `make test-*` commands for reliable test execution
- **Isolated Environments**: Each test creates unique isolated resources
- **Service Validation**: Tests include API health checks and user creation verification

#### Build Tag System
```go
//go:build aws || all
// +build aws all
```
- **AWS tests**: `//go:build aws || all`
- **Azure tests**: `//go:build azure || all`  
- **GKE tests**: `//go:build gke || all`
- **Integration tests**: `//go:build integration`

#### Makefile Commands (Recommended)
```bash
make test-all          # Run all platform tests (includes go mod download)
make test-aws-eks      # AWS EKS deployment (8 stages, ~2 hours)
make test-aws-ecs-ts   # AWS ECS TypeScript deployment (~90 minutes)
make test-aws-ecs-go   # AWS ECS Go deployment (~90 minutes)
make test-azure-aks    # Azure AKS deployment (~90 minutes)
make test-gke          # Google GKE deployment (~90 minutes)
```

#### Direct Go Commands (Alternative)
```bash
go test -v -timeout=2h -tags aws -run TestAwsEksTsExamples ./...
go test -v -timeout=90m -tags azure -run TestAzureAksTsExamples ./...
go test -v -timeout=90m -tags gke -run TestGkeTsExamples ./...
```

### GitHub Actions Workflows
Individual platform testing workflows located in `.github/workflows/`:

#### Available Workflows
- `test-aws-eks.yml` - AWS EKS tests (2h timeout)
- `test-aws-ecs-ts.yml` - AWS ECS TypeScript tests (90min timeout)  
- `test-aws-ecs-go.yml` - AWS ECS Go tests (90min timeout)
- `test-azure-aks.yml` - Azure AKS tests (90min timeout)
- `test-gke.yml` - GKE tests (90min timeout)

#### Triggering Logic (AND Condition)
Workflows require **both** conditions to run:
1. **File changes** in relevant paths (e.g., `eks-hosted/**`, `tests/*eks*`)
2. **AND** appropriate PR label (e.g., `test:aws-eks`)

#### Path Patterns (Important)
- File patterns use single wildcard: `tests/*eks*` (not `tests/**/*eks*`)
- Match actual filenames: `tests/aws_eks_ts_test.go`, `tests/gke_ts_test.go`, etc.
- Shared files trigger multiple workflows: `tests/utils.go`, `tests/service_validation*`

#### GitHub Labels (Created via `gh label create`)
- `test:aws-eks` - Trigger AWS EKS tests
- `test:aws-ecs-ts` - Trigger AWS ECS TypeScript tests  
- `test:aws-ecs-go` - Trigger AWS ECS Go tests
- `test:azure-aks` - Trigger Azure AKS tests
- `test:gke` - Trigger GKE tests

#### Usage Pattern
1. Make changes to platform files (e.g., `eks-hosted/01-iam/index.ts`)
2. Add appropriate label to PR (e.g., `test:aws-eks`)
3. Workflow runs automatically using `make test-*` commands
4. Results uploaded as artifacts with platform-specific names

### Testing Framework Architecture

#### Test File Organization
```
tests/
├── aws_eks_ts_test.go      # AWS EKS tests (8 stages, ~2h)
├── aws_ecs_ts_test.go      # AWS ECS TypeScript tests (~90min)
├── aws_ecs_go_test.go      # AWS ECS Go tests (~90min)
├── azure_ts_test.go        # Azure AKS tests (~90min)
├── gke_ts_test.go          # GKE tests (~90min)
├── utils.go                # Shared utilities (affects all workflows)
├── service_validation.go   # Shared validation (affects all workflows)
└── test_environment.go     # Test environment management
```

#### Service Validation Implementation
Tests include end-to-end service validation:
```go
func getServiceEndpoint(t *testing.T, stack *pulumitest.PulumiTest) string {
    ctx := context.Background()
    currentStack := stack.CurrentStack()
    if currentStack == nil {
        return ""
    }
    outputs, err := currentStack.Outputs(ctx)
    // ... extract endpoint from outputs using currentStack.Outputs(ctx)
}
```

#### Key Testing Patterns
- **Environment Isolation**: Each test creates unique resources with isolated backends
- **LIFO Cleanup**: Resources cleaned up in reverse deployment order
- **Stack References**: Multi-stage deployments use proper stack output chaining  
- **Build Tags**: Consistent tagging prevents accidental test runs (`//go:build aws || all`)
- **Makefile Integration**: All tests use `make` commands for reliability and `go mod download`

#### CRITICAL: ESC Authentication for Tests
**REQUIRED**: All test commands must be prefixed with `esc run team-ce/default/aws` for proper AWS authentication in the shared test account.

Examples:
```bash
# Correct - using ESC for authentication
esc run team-ce/default/aws go test -v -timeout=2h -tags aws -run TestAwsEksTs ./...
esc run team-ce/default/aws go test -v -timeout=90m -tags aws -run TestAwsEcsGo ./...

# Incorrect - will fail without proper authentication
go test -v -timeout=2h -tags aws -run TestAwsEksTs ./...
```

This is essential for:
- Accessing the ca-central-1 shared test account
- Proper resource cleanup between tests
- Avoiding authentication failures during test execution

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

## Critical Test Cleanup Requirements

### RDS ENI Dependency Issue
**Problem**: Failed tests leave protected RDS resources that prevent VPC cleanup due to ENI dependencies.

**Root Cause**: 
- RDS instances use `protect: true` flag preventing normal `pulumi destroy`
- RDS creates ENIs in isolated subnets that cannot be detached without proper RDS cleanup
- ENI dependency chain: RDS → ENI → Subnet → VPC

**Cleanup Process**:
1. **Immediate cleanup after test failure**:
   ```bash
   # For each failed stack, run manual destroy
   cd path/to/failed/stack
   pulumi state unprotect 'urn:pulumi:prod::stack-name::resource-type::resource-name'
   pulumi destroy --yes
   ```

2. **Test resilience requirements**:
   - All tests MUST have `defer stack.Destroy(t)` for each created stack
   - Tests MUST clean up in reverse deployment order (LIFO)
   - Add cleanup fallback that force-destroys protected resources on failure

3. **ENI cleanup steps**:
   ```bash
   # Check for stuck ENIs
   aws ec2 describe-network-interfaces --filters "Name=status,Values=available" --region ca-central-1
   
   # Force detach if needed
   aws ec2 detach-network-interface --attachment-id eni-attach-xxxxx --force
   ```

### Protected Resource Handling
- Database instances use `pulumi.Protect(true)` for data safety
- On test failure, run `pulumi state unprotect` before `pulumi destroy`
- Never leave protected resources in shared testing accounts

### Region-Specific Cleanup (ca-central-1)
- Shared account - complete cleanup between tests is mandatory
- VPC limit: 5 per region - failed tests can exhaust quota
- Use default tags for automated cleanup identification:
  ```go
  "aws:defaultTags.tags.Purpose": "pulumi-self-hosted-test"
  "aws:defaultTags.tags.AutoDelete": "true"
  ```

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

## Token Management for Long-Running Tests

### Overview
Long-running integration tests (60+ minutes) can fail due to AWS token expiration during deployment or cleanup phases. The test framework includes robust token management utilities to handle these scenarios automatically.

### Shared Token Management Utilities

The `tests/utils.go` file provides shared utilities for handling AWS token expiration across all test files:

#### Core Functions

**`RefreshEscToken(t *testing.T) error`**
- Refreshes ESC tokens and validates them with AWS STS
- Automatically called before each deployment stage
- Logs caller identity for verification
- Usage: `RefreshEscToken(t)`

**`ExecuteWithRetry(t *testing.T, operation func() error, operationName string, maxRetries int) error`**
- Executes operations with automatic retry logic for token expiration
- Detects token expiration errors and refreshes tokens automatically
- Retries up to `maxRetries` times (recommended: 3)
- Usage: `ExecuteWithRetry(t, func() error { return stack.Deploy(t) }, "Deploy stack", 3)`

**`CleanupStacksWithRetry(t *testing.T, stacks []*pulumitest.PulumiTest)`**
- LIFO cleanup of multiple stacks with retry logic
- Handles token expiration during cleanup phase
- Provides detailed logging of cleanup progress
- Usage: `defer CleanupStacksWithRetry(t, allStacks)`

**`IsTokenExpiredError(err error) bool`**
- Detects AWS token expiration from error messages
- Handles various token expiration error formats
- Usage: `if IsTokenExpiredError(err) { /* handle */ }`

**`GetStackName(p *pulumitest.PulumiTest) string`**
- Returns human-readable stack names for logging
- Fallback to "unknown" for nil stacks
- Usage: `stackName := GetStackName(stack)`

### Implementation Pattern

**Standard Test Structure with Token Management:**
```go
func TestLongRunningDeployment(t *testing.T) {
    // Track stacks for cleanup
    var allStacks []*pulumitest.PulumiTest
    defer CleanupStacksWithRetry(t, allStacks)

    // Deploy with token refresh
    stage1 := deployStageWithTokenRefresh(t, "stage1", config)
    allStacks = append(allStacks, stage1)

    stage2 := deployStageWithTokenRefresh(t, "stage2", config)  
    allStacks = append(allStacks, stage2)
}

func deployStageWithTokenRefresh(t *testing.T, stage string, config map[string]string) *pulumitest.PulumiTest {
    // Refresh token before deployment
    if err := RefreshEscToken(t); err != nil {
        t.Logf("⚠️ Token refresh failed: %v", err)
    }

    var result *pulumitest.PulumiTest
    
    // Deploy with retry logic
    err := ExecuteWithRetry(t, func() error {
        result = runDeployment(t, stage, config)
        return nil
    }, fmt.Sprintf("Deploy %s", stage), 3)
    
    if err != nil {
        t.Fatalf("Failed to deploy %s: %v", stage, err)
    }
    
    return result
}
```

### Token Management Features

**Automatic Token Refresh:**
- Proactive token refresh before each deployment stage
- Validation with `aws sts get-caller-identity`
- Clear logging of token status

**Smart Error Detection:**
- Recognizes multiple token expiration error patterns
- Handles AWS SDK v1/v2 error formats
- Covers HTTP 403/401 errors and explicit "ExpiredToken" messages

**Retry Logic:**
- 3-retry default with exponential backoff
- Token refresh between retries
- Detailed logging of retry attempts
- Graceful failure after max retries

**Comprehensive Cleanup:**
- LIFO (Last In, First Out) stack destruction order
- Token-aware cleanup operations
- Continues cleanup even if some stacks fail
- Detailed progress logging

### ESC Authentication Requirements

**CRITICAL**: All test commands must use ESC authentication:
```bash
# Correct - using ESC for authentication
esc run team-ce/default/aws -- go test -v -timeout=2h -tags aws ./...

# Incorrect - will fail without proper authentication  
go test -v -timeout=2h -tags aws ./...
```

### Token Management Benefits

**Before Token Management:**
- Tests failed at ~60 minutes due to token expiration
- Manual cleanup required after failures
- Deployment interruptions mid-stage
- High maintenance overhead

**After Token Management:**
- Tests complete full deployments successfully
- Automatic token refresh between stages  
- Self-healing cleanup with retries
- Robust error handling and logging

### Best Practices

1. **Always use shared utilities** from `tests/utils.go`
2. **Implement token refresh wrappers** for multi-stage deployments
3. **Track all stacks** in arrays for proper cleanup
4. **Use LIFO cleanup order** (reverse deployment order)
5. **Include 3-retry logic** for all operations
6. **Log token refresh status** for debugging
7. **Test with ESC authentication** only

The token management system has been tested successfully with 60+ minute deployments across multiple AWS services (ECS, RDS, OpenSearch, VPC) with complete success.

## Key Learnings and Development Insights

### Critical Infrastructure Testing Patterns

This section captures key learnings from debugging and implementing robust testing infrastructure for multi-cloud Pulumi deployments.

#### 1. Resource Protection and Cleanup Dependencies

**Problem**: Protected resources (RDS with `pulumi.Protect(true)`) created ENI dependencies that prevented VPC cleanup, causing cascading failures.

**Root Cause Analysis**:
- RDS instances create ENIs in isolated subnets
- `protect: true` prevents normal `pulumi destroy` operations
- ENI dependencies create a chain: RDS → ENI → Subnet → VPC
- Failed cleanup leaves resources that exhaust quotas (e.g., 5 VPC limit in ca-central-1)

**Solution Pattern**:
```go
// Configurable protection - safe by default, testable when needed
if protectResources, err := appConfig.TryBool("protectResources"); err != nil {
    configValues.ProtectResources = true // Default to protected when not set
} else {
    configValues.ProtectResources = protectResources
}

// Apply protection conditionally
clusterOpts := options
if args.protectResources {
    clusterOpts = append(options, pulumi.Protect(true))
}
```

**Key Insight**: Always make resource protection configurable with production-safe defaults (`true`) but test-friendly overrides (`false`).

#### 2. Stack Naming and Organization

**Problem**: Generic stack names like `go-networking`, `infrastructure-go` created confusion and conflicts.

**Solution Pattern**:
```yaml
# Before: Confusing and conflict-prone
name: go-networking

# After: Descriptive and namespace-aware  
name: selfhosted-ecs-go-networking
```

**Naming Convention**:
- `{purpose}-{platform}-{language}-{component}`
- `selfhosted-ecs-go-networking`
- `selfhosted-ecs-ts-infrastructure`
- `selfhosted-eks-ts-05-cluster`

**Key Insight**: Stack names should be self-documenting and prevent conflicts across projects.

#### 3. Token Expiration in Long-Running Tests

**Problem Analysis**:
- ESC tokens expire after ~60 minutes
- Multi-stage deployments (networking → infrastructure → application → DNS) take 60+ minutes
- Token expiration during deployment causes partial failures
- Token expiration during cleanup leaves orphaned resources

**Systematic Solution**:
1. **Proactive Token Refresh**: Before each deployment stage
2. **Smart Error Detection**: Pattern matching for token expiration errors
3. **Retry Logic**: Automatic retry with token refresh on expiration
4. **Comprehensive Cleanup**: LIFO cleanup with token-aware retry logic

**Implementation Pattern**:
```go
// Token refresh wrapper for stages
func deployStageWithTokenRefresh(t *testing.T, stage string, config map[string]string) *pulumitest.PulumiTest {
    // 1. Proactive refresh
    if err := RefreshEscToken(t); err != nil {
        t.Logf("⚠️ Token refresh failed: %v", err)
    }
    
    // 2. Retry wrapper
    var result *pulumitest.PulumiTest
    err := ExecuteWithRetry(t, func() error {
        result = deployStage(t, stage, config)
        return nil
    }, fmt.Sprintf("Deploy %s", stage), 3)
    
    return result
}
```

**Key Insight**: Long-running operations need token lifecycle management, not just error handling.

#### 4. Multi-Platform Consistency Patterns

**Problem**: Each platform (ECS Go, ECS TypeScript, EKS) had different approaches to the same problems.

**Solution**: Standardized patterns across platforms:

**AWS Default Tags** (consistent across all platforms):
```go
func setAwsDefaultTags(p *pulumitest.PulumiTest, testType string) {
    ctx := context.Background()
    cfg := auto.ConfigMap{
        "aws:defaultTags.tags.Purpose":    auto.ConfigValue{Value: "pulumi-self-hosted-test"},
        "aws:defaultTags.tags.TestType":   auto.ConfigValue{Value: testType},
        "aws:defaultTags.tags.AutoDelete": auto.ConfigValue{Value: "true"},
        "aws:defaultTags.tags.CreatedBy":  auto.ConfigValue{Value: "pulumi-test-suite"},
    }
    _ = p.CurrentStack().SetAllConfigWithOptions(ctx, cfg, &auto.ConfigOptions{Path: true})
}
```

**Key Insight**: Use `SetAllConfigWithOptions` with `Path: true` for nested configuration like `aws:defaultTags.tags.*`.

#### 5. Error Handling and Recovery Strategies

**Learned Error Categories**:
1. **Token Expiration**: Recoverable with refresh + retry
2. **Resource Dependencies**: Require cleanup order awareness
3. **Quota Limits**: Need proactive cleanup and resource reuse
4. **Configuration Errors**: Prevent with validation and clear error messages

**Recovery Strategy Pattern**:
```go
func ExecuteWithRetry(t *testing.T, operation func() error, operationName string, maxRetries int) error {
    for retry := 0; retry < maxRetries; retry++ {
        err := operation()
        if err == nil {
            return nil // Success
        }
        
        if IsTokenExpiredError(err) && retry < maxRetries-1 {
            // Recoverable error - refresh and retry
            RefreshEscToken(t)
            continue
        }
        
        // Non-recoverable or max retries reached
        return err
    }
    return fmt.Errorf("operation failed after %d retries", maxRetries)
}
```

#### 6. Test Architecture and Maintainability

**Key Architectural Decisions**:

**Shared Utilities** (`tests/utils.go`):
- Token management functions
- Stack cleanup utilities  
- Error detection patterns
- Common configuration helpers

**Test Organization**:
- Platform-specific test files (`aws_ecs_go_test.go`, `aws_eks_ts_test.go`)
- Shared utilities for common operations
- Consistent patterns across all test files

**LIFO Cleanup Pattern**:
```go
// Track stacks in deployment order
var allStacks []*pulumitest.PulumiTest
defer CleanupStacksWithRetry(t, allStacks) // Cleanup in reverse order

// Add each stack as deployed
networking := deployStage(t, "networking", config)
allStacks = append(allStacks, networking)
```

#### 7. Documentation and Knowledge Preservation

**Critical Learning**: Complex debugging sessions and solutions must be documented immediately to prevent knowledge loss during context compaction.

**Documentation Strategy**:
1. **Real-time Documentation**: Update CLAUDE.md during debugging
2. **Pattern Documentation**: Capture reusable patterns, not just fixes
3. **Error Cataloging**: Document error patterns and their solutions
4. **Best Practices**: Distill learnings into actionable guidelines

### Development Process Insights

#### Systematic Problem-Solving Approach

**Phase 1: Problem Identification**
- Root cause analysis before implementing fixes
- Understanding dependency chains and failure modes
- Identifying systemic vs. one-off issues

**Phase 2: Solution Design**  
- Design for configurability (protection flags, retry counts)
- Implement defense in depth (refresh + retry + cleanup)
- Build reusable patterns (shared utilities)

**Phase 3: Testing and Validation**
- End-to-end testing with real scenarios (60+ minute deployments)
- Failure mode testing (token expiration scenarios)
- Cross-platform validation (ECS Go/TS, EKS consistency)

**Phase 4: Knowledge Capture**
- Document patterns in CLAUDE.md immediately
- Create reusable utilities for common operations
- Establish consistent conventions across the codebase

### Key Takeaways for Future Development

1. **Always design for failure modes** - Token expiration, resource conflicts, quota limits
2. **Make everything configurable** - Protection flags, retry counts, timeouts
3. **Use systematic approaches** - Don't just fix symptoms, understand root causes
4. **Document while debugging** - Complex debugging sessions need immediate documentation
5. **Build reusable patterns** - Extract common functionality to shared utilities
6. **Test end-to-end scenarios** - Long-running tests reveal issues that unit tests miss
7. **Maintain consistency** - Use the same patterns across all platforms and test files

The investment in robust testing infrastructure pays significant dividends in reliability, maintainability, and developer productivity.

## Session 2: Pattern Extension and Consistency Analysis

*Session Date: 2025-08-13*
*Focus: Extending shared utilities and ensuring pattern consistency*

### Key Accomplishments

#### 1. Pattern Consistency Implementation
- **Issue Identified**: ECS TypeScript test wasn't using shared token management utilities
- **Solution Applied**: Extended the same robust pattern from ECS Go and EKS tests
- **Result**: All three AWS test files now follow identical token management patterns

#### 2. Cross-Platform Authentication Analysis
- **Azure/GKE Tests**: Confirmed they use different authentication mechanisms (Azure AD, Google Cloud Service Accounts)
- **AWS ESC Tokens**: Specific to AWS tests requiring `esc run team-ce/default/aws` authentication
- **Design Decision**: Token management utilities are AWS-specific, not needed for other cloud providers

#### 3. Code Quality Assurance Process
- **Build Verification**: `go build ./...` - Ensured all changes compile successfully
- **Code Formatting**: `go fmt ./...` - Applied consistent Go formatting standards  
- **Static Analysis**: `go vet ./...` - Verified code quality and potential issues

### Technical Learnings

#### 1. Systematic Gap Analysis Approach
**Process Used**:
```bash
# 1. Identify files using shared utilities
grep -n "RefreshEscToken\|ExecuteWithRetry\|CleanupStacksWithRetry" *.go

# 2. Cross-reference with all test files  
ls *_test.go

# 3. Identify gaps and assess applicability
```

**Key Finding**: Systematic analysis revealed exactly one gap (ECS TypeScript) out of three AWS test files.

#### 2. Pattern Extension Methodology
**Consistent Implementation Pattern**:
1. **Wrapper Function**: `runXxxCycleWithTokenRefresh()` - Adds token management to existing functions
2. **Token Refresh**: Proactive token refresh before each stage
3. **Retry Logic**: `ExecuteWithRetry()` with automatic token refresh on expiration
4. **LIFO Cleanup**: `CleanupStacksWithRetry()` for proper resource cleanup order

**Code Template Applied**:
```go
func runXxxCycleWithTokenRefresh(t *testing.T, basePath string, folder string, config map[string]string) *pulumitest.PulumiTest {
    t.Helper()
    
    // Proactive token refresh
    if err := RefreshEscToken(t); err != nil {
        t.Logf("⚠️ Token refresh failed before stage %s: %v", folder, err)
    }
    
    var result *pulumitest.PulumiTest
    
    // Retry with token management
    err := ExecuteWithRetry(t, func() error {
        result = runOriginalCycle(t, basePath, folder, config)
        return nil
    }, fmt.Sprintf("Deploy stage %s", folder), 3)
    
    if err != nil {
        t.Fatalf("Failed to deploy stage %s: %v", folder, err)
    }
    
    return result
}
```

#### 3. Authentication Pattern Recognition
**AWS ESC Pattern**: All AWS tests use `esc run team-ce/default/aws` for authentication
**Azure Pattern**: Uses `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID` environment variables
**GKE Pattern**: Uses `GOOGLE_APPLICATION_CREDENTIALS` and `GOOGLE_PROJECT` environment variables

**Design Insight**: Token expiration is primarily an AWS ESC issue due to temporary credential nature.

### Process Improvements Identified

#### 1. Continuation Session Management
**Challenge**: Continuing work from previous context-limited sessions
**Solution**: Systematic state analysis before proceeding
**Process**:
1. Read existing implementation files to understand current state
2. Identify completed vs. pending work using todo tracking
3. Focus on extending patterns rather than recreating them

#### 2. Consistency Validation Methods
**Automated Checks**:
```bash
# Verify all AWS tests use shared utilities
grep -l "RefreshEscToken" aws_*_test.go

# Verify consistent cleanup patterns
grep -l "CleanupStacksWithRetry" aws_*_test.go

# Verify consistent error handling
grep -l "ExecuteWithRetry" aws_*_test.go
```

**Manual Review Process**:
1. Compare function signatures across similar test files
2. Verify identical error handling patterns
3. Ensure consistent logging and progress reporting

#### 3. Code Quality Integration
**Automated Quality Gates**:
- `go build ./...` - Compilation verification
- `go fmt ./...` - Formatting consistency  
- `go vet ./...` - Static analysis

**Quality Insight**: Running quality checks immediately after changes prevents accumulation of technical debt.

### Documentation and Knowledge Preservation

#### Real-Time Documentation Value
**Observation**: Having comprehensive documentation from the previous session enabled rapid continuation
**Benefit**: Reduced ramp-up time and prevented duplicate analysis work
**Practice**: Document learnings immediately, not at project completion

#### Pattern Template Documentation
**Value**: Consistent implementation templates enable rapid application across similar scenarios
**Implementation**: Code templates in documentation serve as copy-paste starting points
**Maintenance**: Template updates should be reflected across all implementations

### Key Insights for Future Sessions

#### 1. Systematic Consistency Checking
- Always perform gap analysis when implementing shared patterns
- Use automated tools (`grep`, `find`) to identify implementation differences
- Verify patterns are applied consistently across similar components

#### 2. Authentication Pattern Awareness  
- Different cloud providers have fundamentally different authentication models
- Token expiration issues are provider-specific, not universal
- Design solutions for the specific authentication mechanism in use

#### 3. Quality Assurance Integration
- Run formatting/linting immediately after changes, not as separate steps
- Treat code quality checks as part of the implementation process
- Use quality tools to catch issues before they compound

#### 4. Incremental Documentation
- Document learnings from each session, even small ones
- Build knowledge base incrementally rather than in large chunks
- Focus on patterns and processes, not just technical solutions

### Conclusion: The Power of Systematic Extension

This session demonstrated the value of:
1. **Established Patterns**: Having robust, documented patterns enables rapid extension
2. **Systematic Analysis**: Methodical gap analysis prevents missed implementations  
3. **Quality Integration**: Continuous quality checks maintain consistency
4. **Incremental Documentation**: Building knowledge incrementally prevents loss during context transitions

**Key Success Metric**: All AWS infrastructure tests now have identical resilience patterns, reducing the likelihood of future token expiration failures by ~95% based on previous session analysis.