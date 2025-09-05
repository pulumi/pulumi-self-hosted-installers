# Makefile for Pulumi Self-Hosted Installers Test Suite
# This Makefile provides targets for various Go code quality checks and test runs.

# Go code quality targets
.PHONY: fmt-go
fmt-go:
	@echo "Formatting Go code..."
	cd tests && go fmt ./...

.PHONY: vet-go
vet-go:
	@echo "Running go vet..."
	cd tests && go vet ./...

.PHONY: build-go
build-go:
	@echo "Building Go packages..."
	cd tests && go build ./...

.PHONY: lint-go
lint-go:
	@echo "Linting Go code in tests/ directory..."
	cd tests && golangci-lint run

# Individual platform tests
.PHONY: test-aws-eks
test-aws-eks:
	@echo "Running AWS EKS tests..."
	cd tests && go mod download
	cd tests && PULUMITEST_RETAIN_FILES_ON_FAILURE=false go test -v -timeout=2h -run TestAwsEksTsExamples ./...

# Run all tests (currently only EKS)
.PHONY: test-all
test-all: test-aws-eks
	@echo "Running all tests..."

# Cleanup
.PHONY: clean
clean:
	@echo "Cleaning build artifacts..."
	cd tests && go clean ./...