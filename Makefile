.PHONY: help lint-go fmt-go vet-go build-go test-all test-aws-eks test-aws-ecs-ts test-aws-ecs-go test-azure-aks test-gke test-integration clean

# Default target
help:
	@echo "Available targets:"
	@echo "  help           - Show this help message"
	@echo "  lint-go        - Run golangci-lint on Go code"
	@echo "  fmt-go         - Format Go code"
	@echo "  vet-go         - Run go vet on Go code"
	@echo "  build-go       - Build Go packages"
	@echo "  test-all       - Run all platform tests"
	@echo "  test-aws-eks   - Run AWS EKS tests"
	@echo "  test-aws-ecs-ts - Run AWS ECS TypeScript tests"
	@echo "  test-aws-ecs-go - Run AWS ECS Go tests"
	@echo "  test-azure-aks - Run Azure AKS tests"
	@echo "  test-gke       - Run Google GKE tests"
	@echo "  test-integration - Run parallel integration tests"
	@echo "  clean          - Clean build artifacts"

# Go code quality targets
fmt-go:
	@echo "Formatting Go code..."
	cd tests && go fmt ./...

vet-go:
	@echo "Running go vet..."
	cd tests && go vet ./...

build-go:
	@echo "Building Go packages..."
	cd tests && go build ./...

lint-go:
	@echo "Linting Go code in tests/ directory..."
	cd tests && golangci-lint run

# Run all tests (with all platforms)
test-all:
	@echo "Running all nightly tests..."
	cd tests && go mod download
	cd tests && go test -v -timeout=2h -tags "aws,azure,gke,integration" ./...

# Individual platform tests
test-aws-eks:
	@echo "Running AWS EKS tests..."
	cd tests && go mod download
	cd tests && go test -v -timeout=2h -tags aws -run TestAwsEksTsExamples ./...

test-aws-ecs-ts:
	@echo "Running AWS ECS TypeScript tests..."
	cd tests && go mod download
	cd tests && go test -v -timeout=90m -tags aws -run TestAwsEcsTsExamples ./...

test-aws-ecs-go:
	@echo "Running AWS ECS Go tests..."
	cd tests && go mod download
	cd tests && go test -v -timeout=90m -tags aws -run TestAwsEcsGoExamples ./...

test-azure-aks:
	@echo "Running Azure AKS tests..."
	cd tests && go mod download
	cd tests && go test -v -timeout=90m -tags azure -run TestAzureAksTsExamples ./...

test-gke:
	@echo "Running GKE tests..."
	cd tests && go mod download
	cd tests && go test -v -timeout=90m -tags gke -run TestGkeTsExamples ./...

test-integration:
	@echo "Running parallel integration tests..."
	cd tests && go mod download
	cd tests && go test -v -timeout=2h -tags integration -run TestParallelIntegration ./...

# Cleanup
clean:
	@echo "Cleaning build artifacts..."
	cd tests && go clean ./...