# Pulumi Self-Hosted Installers - Test Suite

This directory contains comprehensive tests for all Pulumi Self-Hosted installer platforms, addressing GitHub Issue #44 for nightly testing coverage.

## 🎯 Test Coverage

### Supported Platforms (100% Coverage)
- ✅ **AWS EKS**: 8-stage deployment (01-iam → 90-pulumi-service)
- ✅ **AWS ECS TypeScript**: 3-stage deployment (infrastructure → application → dns)
- ✅ **AWS ECS Go**: 3-stage deployment (infrastructure → application → dns)
- ✅ **Azure AKS**: 3-stage deployment (01-infrastructure → 02-kubernetes → 03-application)
- ✅ **Google GKE**: 3-stage deployment (01-infrastructure → 02-kubernetes → 03-application)

### Test Types
- **Infrastructure Deployment Tests**: Full multi-stage deployment validation
- **Service Health Checks**: API endpoint validation, user creation, organization management
- **Resource Cleanup Verification**: Ensures all resources are properly destroyed
- **Integration Tests**: End-to-end service functionality validation

## 🏃‍♂️ Running Tests

### Prerequisites
- Go 1.22+
- Node.js 20+
- Pulumi CLI
- Cloud provider credentials (see Environment Variables section)

### Individual Platform Tests

```bash
# AWS EKS (requires AWS credentials)
go test -v -run TestAwsEksTsExamples ./...

# AWS ECS TypeScript
go test -v -run TestAwsEcsTsExamples ./...

# AWS ECS Go  
go test -v -run TestAwsEcsGoExamples ./...

# Azure AKS (requires Azure credentials)
go test -v -run TestAzureAksTsExamples ./...

# Google GKE (requires GCP credentials)
go test -v -run TestGkeTsExamples ./...
```

### Service Validation Tests

```bash
# Standalone service validation against any endpoint
export PULUMI_SERVICE_ENDPOINT=https://api.pulumi.example.com
go test -v -run TestServiceValidationStandalone ./...
```

### All Tests
```bash
# Run all tests (requires all cloud credentials)
go test -v -tags "azure gke all" ./...
```

## 🌐 Environment Variables

### AWS Credentials
```bash
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
```

### Azure Credentials
```bash
export AZURE_CLIENT_ID=your_client_id
export AZURE_CLIENT_SECRET=your_client_secret
export AZURE_TENANT_ID=your_tenant_id
export AZURE_SUBSCRIPTION_ID=your_subscription_id
```

### Google Cloud Credentials
```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
export GOOGLE_PROJECT=your-gcp-project-id
```

### Pulumi Configuration
```bash
export PULUMI_ACCESS_TOKEN=your_pulumi_token
```

## 🏗️ Test Architecture

### Test Framework
- **Base Framework**: `github.com/pulumi/providertest/pulumitest`
- **Assertions**: `github.com/stretchr/testify`
- **Backend**: File backend (`file:///tmp/.pulumi`) for isolation
- **Configuration**: Dynamic config copying from example files
- **Cleanup**: Deferred resource destruction with LIFO order

### Key Components

#### Platform Test Files
- `aws_eks_ts_test.go`: AWS EKS 8-stage deployment
- `aws_ecs_ts_test.go`: AWS ECS TypeScript 3-stage deployment  
- `aws_ecs_go_test.go`: AWS ECS Go 3-stage deployment
- `azure_ts_test.go`: Azure AKS 3-stage deployment
- `gke_ts_test.go`: Google GKE 3-stage deployment

#### Service Validation
- `service_validation.go`: Core service validation logic
- `service_validation_test.go`: Standalone service validation tests
- Features: API health checks, user creation, organization management

#### Common Utilities
- `tests_test.go`: Environment variable validation, file utilities
- Build tags for conditional compilation by platform

### Test Flow Pattern
1. **Environment Check**: Validate required credentials
2. **Sequential Deployment**: Deploy stages in dependency order
3. **Service Validation**: Test deployed service functionality (when available)
4. **Resource Cleanup**: Destroy resources in reverse order via defer

## 🤖 Nightly CI Pipeline

### GitHub Actions Workflow
- **Schedule**: Daily at 2 AM UTC
- **Parallel Execution**: All platforms run concurrently
- **Timeout**: 2 hours for EKS, 90 minutes for others
- **Reporting**: Automatic failure notifications and test reports

### Manual Trigger Options
```bash
# Trigger via GitHub CLI
gh workflow run nightly-tests.yml --ref main

# With specific platforms
gh workflow run nightly-tests.yml --ref main \
  -f platforms=aws-eks,azure-aks \
  -f skip_validation=false
```

### Required Secrets
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- `AZURE_CREDENTIALS` (JSON format)
- `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
- `GOOGLE_CREDENTIALS` (Service Account JSON)
- `GOOGLE_PROJECT`
- `PULUMI_ACCESS_TOKEN`
- `SLACK_WEBHOOK_URL` (optional, for notifications)

## 📊 Test Results and Monitoring

### Artifacts
- Test logs and results uploaded as GitHub Actions artifacts
- Test duration and resource usage metrics
- Failure analysis and debugging information

### Notifications
- **GitHub**: Commit comments on failures
- **Slack**: Optional webhook notifications with test summary
- **Email**: GitHub Actions default notifications

## 🔧 Configuration and Customization

### Build Tags
Tests use Go build tags for conditional compilation:
- `azure`: Enable Azure-specific tests
- `gke`: Enable Google Cloud-specific tests  
- `all`: Enable all platform tests

### Test Timeouts
- **AWS EKS**: 2 hours (complex 8-stage deployment)
- **Other Platforms**: 90 minutes (3-stage deployments)
- **Service Validation**: 5-10 minutes (configurable)

### Resource Naming
- Unique names using timestamps to prevent conflicts
- Configurable base names and regions
- Automatic cleanup on test completion or failure

## 🛠️ Development and Debugging

### Adding New Platforms
1. Create new test file: `platform_test.go`
2. Implement `runPlatformCycle` function
3. Add environment variable validation
4. Update CI workflow with new job
5. Add build tags if needed

### Debugging Failed Tests
```bash
# Run with verbose output
go test -v -run TestFailingTest ./...

# Run with race detection
go test -race -run TestFailingTest ./...

# Run with specific timeout
go test -timeout=30m -run TestFailingTest ./...
```

### Local Development
```bash
# Install dependencies
go mod download

# Format code
go fmt ./...

# Lint code  
go vet ./...

# Update vendor (if needed)
go mod vendor
```

## 📈 Metrics and Success Criteria

### Success Metrics
- **100% Platform Coverage**: All supported installers tested
- **Nightly Execution**: Automated daily validation
- **Service Validation**: End-to-end functionality verification
- **Resource Cleanup**: Zero resource leakage
- **Parallel Execution**: Efficient test runtime

