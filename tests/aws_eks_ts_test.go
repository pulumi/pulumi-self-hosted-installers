package tests

import (
	"fmt"
	"math/rand"
	"path/filepath"
	"testing"
	"time"

	"github.com/pulumi/pulumi/pkg/v3/testing/integration"
)

func TestAwsEksTs(t *testing.T) {
	checkAwsEnvVars(t)

	basePath, err := filepath.Abs("../eks-hosted")
	if err != nil {
		t.Fatalf("Failed to get absolute path: %v", err)
	}

	// Generate unique cluster name for this test run
	timestamp := time.Now().Format("20060102150405")
	randomSuffix := fmt.Sprintf("%04d", rand.Intn(10000))
	clusterName := fmt.Sprintf("pulumiselfhost-eks-%s-%s", timestamp, randomSuffix)

	baseConfig := mergeMaps(map[string]string{
		"aws:region": "us-east-1",
	}, getAwsDefaultTags("eks-ts"))

	testConfig := mergeMaps(baseConfig, map[string]string{
		"protectResources": "false",
	})

	networkingConfig := mergeMaps(baseConfig, map[string]string{
		"eksClusterName":   clusterName,
		"protectResources": "false",
	})

	// Variable for service endpoint validation
	var apiEndpoint string

	// Refresh token before starting
	if err := RefreshEscToken(t); err != nil {
		t.Logf("Warning: Token refresh failed: %v", err)
	}

	// Stage 1: IAM roles and policies
	t.Log("Stage 1: Deploying IAM...")
	integration.ProgramTest(t, &integration.ProgramTestOptions{
		Dir:              filepath.Join(basePath, "01-iam"),
		StackName:        "prod",
		Quick:            true,
		DestroyOnCleanup: true,
		Config:           testConfig,
		PrepareProject:   copyConfigFiles,
	})

	// Refresh token before next stage
	if err := RefreshEscToken(t); err != nil {
		t.Logf("Warning: Token refresh failed: %v", err)
	}

	// Stage 2: VPC and networking
	t.Log("Stage 2: Deploying networking...")
	integration.ProgramTest(t, &integration.ProgramTestOptions{
		Dir:              filepath.Join(basePath, "02-networking"),
		StackName:        "prod",
		Quick:            true,
		DestroyOnCleanup: true,
		Config:           networkingConfig,
		PrepareProject:   copyConfigFiles,
	})

	// Refresh token before next stage
	if err := RefreshEscToken(t); err != nil {
		t.Logf("Warning: Token refresh failed: %v", err)
	}

	// Stage 3: EKS cluster
	t.Log("Stage 3: Deploying EKS cluster...")
	integration.ProgramTest(t, &integration.ProgramTestOptions{
		Dir:              filepath.Join(basePath, "05-eks-cluster"),
		StackName:        "prod",
		Quick:            true,
		DestroyOnCleanup: true,
		Config:           testConfig,
		PrepareProject:   copyConfigFiles,
	})

	// Refresh token before next stage
	if err := RefreshEscToken(t); err != nil {
		t.Logf("Warning: Token refresh failed: %v", err)
	}

	// Stage 4: Cluster services (ingress, DNS)
	t.Log("Stage 4: Deploying cluster services...")
	integration.ProgramTest(t, &integration.ProgramTestOptions{
		Dir:              filepath.Join(basePath, "10-cluster-svcs"),
		StackName:        "prod",
		Quick:            true,
		DestroyOnCleanup: true,
		Config:           testConfig,
		PrepareProject:   copyConfigFiles,
	})

	// Refresh token before next stage
	if err := RefreshEscToken(t); err != nil {
		t.Logf("Warning: Token refresh failed: %v", err)
	}

	// Stage 5: State management and policies
	t.Log("Stage 5: Deploying state policies management...")
	integration.ProgramTest(t, &integration.ProgramTestOptions{
		Dir:              filepath.Join(basePath, "15-state-policies-mgmt"),
		StackName:        "prod",
		Quick:            true,
		DestroyOnCleanup: true,
		Config:           testConfig,
		PrepareProject:   copyConfigFiles,
	})

	// Refresh token before next stage
	if err := RefreshEscToken(t); err != nil {
		t.Logf("Warning: Token refresh failed: %v", err)
	}

	// Stage 6: Database (RDS)
	t.Log("Stage 6: Deploying database...")
	integration.ProgramTest(t, &integration.ProgramTestOptions{
		Dir:              filepath.Join(basePath, "20-database"),
		StackName:        "prod",
		Quick:            true,
		DestroyOnCleanup: true,
		Config:           testConfig,
		PrepareProject:   copyConfigFiles,
	})

	// Refresh token before next stage
	if err := RefreshEscToken(t); err != nil {
		t.Logf("Warning: Token refresh failed: %v", err)
	}

	// Stage 7: Insights and monitoring
	t.Log("Stage 7: Deploying insights...")
	integration.ProgramTest(t, &integration.ProgramTestOptions{
		Dir:              filepath.Join(basePath, "25-insights"),
		StackName:        "prod",
		Quick:            true,
		DestroyOnCleanup: true,
		Config:           testConfig,
		PrepareProject:   copyConfigFiles,
	})

	// Refresh token before next stage
	if err := RefreshEscToken(t); err != nil {
		t.Logf("Warning: Token refresh failed: %v", err)
	}

	// Stage 8: ESC (Environments, Secrets, Configuration)
	t.Log("Stage 8: Deploying ESC...")
	integration.ProgramTest(t, &integration.ProgramTestOptions{
		Dir:              filepath.Join(basePath, "30-esc"),
		StackName:        "prod",
		Quick:            true,
		DestroyOnCleanup: true,
		Config:           testConfig,
		PrepareProject:   copyConfigFiles,
	})

	// Refresh token before next stage
	if err := RefreshEscToken(t); err != nil {
		t.Logf("Warning: Token refresh failed: %v", err)
	}

	// Stage 9: Pulumi Service deployment
	t.Log("Stage 9: Deploying Pulumi Service...")
	integration.ProgramTest(t, &integration.ProgramTestOptions{
		Dir:              filepath.Join(basePath, "90-pulumi-service"),
		StackName:        "prod",
		Quick:            true,
		DestroyOnCleanup: true,
		Config:           testConfig,
		PrepareProject:   copyConfigFiles,
		ExtraRuntimeValidation: func(t *testing.T, stack integration.RuntimeValidationStackInfo) {
			// Try to extract API endpoint from stack outputs
			possibleOutputs := []string{"apiEndpoint", "api_endpoint", "apiUrl", "api_url", "serviceUrl", "service_url"}
			for _, outputName := range possibleOutputs {
				if endpoint, ok := stack.Outputs[outputName]; ok {
					if endpointStr, ok := endpoint.(string); ok && endpointStr != "" {
						apiEndpoint = endpointStr
						t.Logf("Found API endpoint: %s", apiEndpoint)
						break
					}
				}
			}
		},
	})

	// Service validation
	if apiEndpoint != "" {
		t.Log("Running service validation...")
		config := ServiceValidationConfig{
			APIEndpoint: apiEndpoint,
			Timeout:     5 * time.Minute,
		}
		ValidatePulumiService(t, config)
	} else {
		t.Log("Service validation skipped - API endpoint not available")
	}

	t.Log("All EKS TypeScript stages completed successfully")
	t.Logf("Manual cleanup hint - EKS cluster name: %s", clusterName)
}
