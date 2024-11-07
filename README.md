# Self-Hosted Pulumi Service Installers

This repository contains installation guides for deploying the [Self-Hosted Pulumi Service](https://www.pulumi.com/product/self-hosted/) into a variety of different target environments.  The components of the Pulumi Service and general guidance on deploying and operating the service are documented in the [Self-Hosted Pulumi Service documentation](https://www.pulumi.com/docs/guides/self-hosted/).  Each guide details how to deploy the set of supporting cloud infrastructure on which the Pulumi Service can run, as well as how to deploy the container images needed to run the Pulumi Service.

The following guides are currently available:
* Quickstart ([Docker Compose](./quickstart-docker-compose))
* AWS ([EKS](./eks-hosted) or [ECS](./ecs-hosted))
* Azure ([AKS](./aks-hosted))
* Docker ([Docker Engine](./local-docker))
* Google Cloud ([GKE](./gke-hosted))
* VMware (Coming soon!)

Learn more about how to self-host Pulumi for your organization [here](https://www.pulumi.com/docs/guides/self-hosted/).

## Contributing

### Code Review Workflows

This repository uses automated Claude AI code review workflows for quality assurance:

#### Platform-Specific Reviews
- **EKS**: `.github/workflows/claude-eks-review.yml` - Reviews changes to `eks-hosted/**`
- **ECS**: `.github/workflows/claude-ecs-review.yml` - Reviews changes to `ecs-hosted/**`
- **AKS**: `.github/workflows/claude-aks-review.yml` - Reviews changes to `aks-hosted/**`
- **GKE**: `.github/workflows/claude-gke-review.yml` - Reviews changes to `gke-hosted/**`
- **Components**: `.github/workflows/claude-components-review.yml` - Reviews changes to `components-microstacks/**`

#### General Code Review
- **All Changes**: `.github/workflows/claude-code-review.yml` - Reviews repository-wide changes
- **Interactive**: `.github/workflows/claude.yml` - Triggered by `@claude` mentions in PR comments

#### Review Process
1. **Automatic**: Platform-specific workflows trigger on relevant path changes
2. **Manual**: Use `@claude` in PR comments for targeted reviews
3. **Scope**: Each workflow focuses on platform-specific best practices and patterns
4. **Security**: Workflows automatically exclude bot PRs (`dependabot[bot]`, `pulumi-renovate[bot]`)

For questions about the review process, see the individual workflow files in `.github/workflows/`.

## Testing

This repository includes comprehensive integration tests for all installation guides. The tests validate end-to-end deployment and functionality across all supported platforms.

### Prerequisites

Before running tests, ensure you have:
- Go 1.23+ installed
- Pulumi CLI installed
- Cloud provider credentials configured:
  - **AWS**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
  - **Azure**: `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
  - **GCP**: `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_PROJECT`

### Running Tests

Use the provided Makefile targets to run tests for specific platforms:

```bash
# Show all available commands
make help

# Code quality and build
make fmt-go            # Format Go code
make vet-go            # Run go vet
make build-go          # Build all Go packages
make lint-go           # Run golangci-lint (requires golangci-lint installed)

# Run all tests
make test-all          # Run all platform tests (includes AWS, Azure, GKE, integration tests)

# Individual platform tests
make test-aws-eks      # AWS EKS deployment (8 stages, ~2 hours)
make test-aws-ecs-ts   # AWS ECS TypeScript deployment (~90 minutes)
make test-aws-ecs-go   # AWS ECS Go deployment (~90 minutes)
make test-azure-aks    # Azure AKS deployment (~90 minutes)
make test-gke          # Google GKE deployment (~90 minutes)
make test-integration  # Parallel integration tests (~2 hours)

# Cleanup
make clean             # Clean build artifacts
```

**Build Tags**: All tests now use consistent build tags:
- **AWS tests**: `//go:build aws || all`
- **Azure tests**: `//go:build azure || all`
- **GKE tests**: `//go:build gke || all`
- **Integration tests**: `//go:build integration`

Each Makefile target includes `go mod download` and the appropriate build tags for reliable, isolated test execution.

### Test Architecture

- **Isolated Environments**: Each test creates isolated resources with unique identifiers
- **Sequential Deployment**: Tests follow the numbered stage dependencies (01-iam → 02-networking → etc.)
- **Service Validation**: End-to-end validation with API health checks and user creation
- **Automatic Cleanup**: LIFO cleanup pattern ensures proper resource destruction

### Individual Platform Testing (GitHub Actions)

Each platform has its own GitHub Actions workflow that can be triggered on pull requests:

#### Available Workflows
- **AWS EKS**: `.github/workflows/test-aws-eks.yml` (2 hour timeout)
- **AWS ECS TypeScript**: `.github/workflows/test-aws-ecs-ts.yml` (90 min timeout)
- **AWS ECS Go**: `.github/workflows/test-aws-ecs-go.yml` (90 min timeout)
- **Azure AKS**: `.github/workflows/test-azure-aks.yml` (90 min timeout)
- **GKE**: `.github/workflows/test-gke.yml` (90 min timeout)

#### Triggering Logic (AND Condition)
Workflows use **AND logic** requiring **both** conditions:
1. **File changes** in relevant paths (e.g., `eks-hosted/**`, `tests/*eks*`)
2. **AND** appropriate label on the PR (e.g., `test:aws-eks`)

#### Usage Examples

**Trigger EKS tests on PR:**
1. Make changes to files in `eks-hosted/` or `tests/*eks*`
2. Add the `test:aws-eks` label to your PR
3. → AWS EKS tests run automatically

**Test multiple platforms:**
1. Make changes to shared files like `tests/utils.go`
2. Add multiple labels: `test:aws-eks`, `test:gke`
3. → Both EKS and GKE tests run

#### Available Labels
- `test:aws-eks` - Trigger AWS EKS tests
- `test:aws-ecs-ts` - Trigger AWS ECS TypeScript tests
- `test:aws-ecs-go` - Trigger AWS ECS Go tests
- `test:azure-aks` - Trigger Azure AKS tests
- `test:gke` - Trigger GKE tests

#### Benefits
- **Resource Efficiency**: Tests only run when explicitly requested
- **Precise Control**: Each platform can be tested independently
- **Cost Management**: No accidental expensive test runs
- **Clear Intent**: PR labels show which platforms are being tested

### Nightly Testing

The repository also includes comprehensive nightly testing via GitHub Actions that:
- Runs tests across all platforms in parallel
- Provides detailed failure reporting
- Supports manual triggering with platform selection
- Includes comprehensive test result summaries

Tests are designed to catch regressions and ensure installation guides remain functional across cloud platform updates.

