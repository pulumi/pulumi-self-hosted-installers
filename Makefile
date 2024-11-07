.PHONY: help lint-go fmt-go vet-go build-go test-all test-aws-eks test-aws-ecs-ts test-aws-ecs-go test-azure-aks test-gke clean

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

# Run all tests
test-all:
	@echo "Running all platform tests..."
	cd tests && go mod download
	cd tests && PULUMITEST_RETAIN_FILES_ON_FAILURE=false go test -v -timeout=2h ./...

# Individual platform tests (by test function name)
test-aws-eks:
	@echo "Running AWS EKS tests..."
	cd tests && go mod download
	cd tests && PULUMITEST_RETAIN_FILES_ON_FAILURE=false go test -v -timeout=2h -run TestAwsEksTs ./...

test-aws-ecs-ts:
	@echo "Running AWS ECS TypeScript tests..."
	cd tests && go mod download
	cd tests && PULUMITEST_RETAIN_FILES_ON_FAILURE=false go test -v -timeout=90m -run TestAwsEcsTs ./...

test-aws-ecs-go:
	@echo "Running AWS ECS Go tests..."
	cd tests && go mod download
	cd tests && PULUMITEST_RETAIN_FILES_ON_FAILURE=false go test -v -timeout=90m -run TestAwsEcsGo ./...

test-azure-aks:
	@echo "Running Azure AKS tests..."
	cd tests && go mod download
	cd tests && PULUMITEST_RETAIN_FILES_ON_FAILURE=false go test -v -timeout=90m -run TestAzureAksTs ./...

test-gke:
	@echo "Running GKE tests..."
	cd tests && go mod download
	cd tests && PULUMITEST_RETAIN_FILES_ON_FAILURE=false go test -v -timeout=90m -run TestGkeTs ./...

# Cleanup
clean:
	@echo "Cleaning build artifacts..."
	cd tests && go clean ./...
