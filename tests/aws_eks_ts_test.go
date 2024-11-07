//go:build aws || all
// +build aws all

package tests

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"github.com/pulumi/providertest/pulumitest"
	auto "github.com/pulumi/pulumi/sdk/v3/go/auto"
	"github.com/pulumi/pulumi/sdk/v3/go/auto/optpreview"
)

func setAwsDefaultTagsEks(p *pulumitest.PulumiTest, testType string) {
	ctx := context.Background()
	cfg := auto.ConfigMap{
		"aws:defaultTags.tags.Purpose":    auto.ConfigValue{Value: "pulumi-self-hosted-test"},
		"aws:defaultTags.tags.TestType":   auto.ConfigValue{Value: testType},
		"aws:defaultTags.tags.AutoDelete": auto.ConfigValue{Value: "true"},
		"aws:defaultTags.tags.CreatedBy":  auto.ConfigValue{Value: "pulumi-test-suite"},
	}
	_ = p.CurrentStack().SetAllConfigWithOptions(ctx, cfg, &auto.ConfigOptions{Path: true})
}

func runCycleWithEnvironment(t *testing.T, env *TestEnvironment, basePath string, folder string, additionalConfig map[string]string) *pulumitest.PulumiTest {
	t.Helper()

	fmt.Printf("Testing Pulumi Program: %s with environment %s\n", folder, env.ID)

	// Merge default config with additional config
	config := map[string]string{
		"aws:region": "us-east-1",
	}

	for key, value := range additionalConfig {
		config[key] = value
	}

	// Create PulumiTest with environment isolation
	p := env.SetupPulumiTest(t, filepath.Join(basePath, folder), config)

	// Set default tags for easy resource cleanup
	setAwsDefaultTagsEks(p, "eks-ts")

	// Refresh token before deployment
	if err := RefreshEscToken(t); err != nil {
		t.Logf("⚠️ Token refresh failed before stage %s: %v", folder, err)
	}

	// Deploy the stack with retry logic
	err := ExecuteWithRetry(t, func() error {
		p.Install(t)
		p.Up(t)
		return nil
	}, fmt.Sprintf("Deploy stage %s", folder), 3)

	if err != nil {
		t.Fatalf("Failed to deploy stage %s: %v", folder, err)
	}
	p.Preview(t, optpreview.ExpectNoChanges())

	return p
}

func TestAwsEksTsExamples(t *testing.T) {
	t.Run("TestAwsEksTs", func(t *testing.T) {
		checkAwsEnvVars(t)

		// Create isolated test environment
		env := NewTestEnvironment(t, "aws-eks")
		defer env.Destroy(t)

		basePath := "../eks-hosted"

		// Configuration to disable protection for tests to allow cleanup
		testConfig := map[string]string{
			"protectResources": "false",
		}

		// Configuration for networking stage (needs unique cluster name)
		networkingConfig := map[string]string{
			"eksClusterName":   fmt.Sprintf("pulumiselfhost-eks-%s", env.StackPrefix),
			"protectResources": "false", // Disable protection for tests to allow cleanup
		}

		// Stage 1: IAM roles and policies
		runCycleWithEnvironment(t, env, basePath, "01-iam", testConfig)

		// Stage 2: VPC and networking
		runCycleWithEnvironment(t, env, basePath, "02-networking", networkingConfig)

		// Stage 3: EKS cluster
		runCycleWithEnvironment(t, env, basePath, "05-eks-cluster", testConfig)

		// Stage 4: Cluster services (ingress, DNS)
		runCycleWithEnvironment(t, env, basePath, "10-cluster-svcs", testConfig)

		// Stage 5: State management and policies
		runCycleWithEnvironment(t, env, basePath, "15-state-policies-mgmt", testConfig)

		// Stage 6: Database (RDS)
		runCycleWithEnvironment(t, env, basePath, "20-database", testConfig)

		// Stage 7: Insights and monitoring
		runCycleWithEnvironment(t, env, basePath, "25-insights", testConfig)

		// Stage 8: ESC (Environments, Secrets, Configuration)
		runCycleWithEnvironment(t, env, basePath, "30-esc", testConfig)

		// Note: 35-deployments is README-only, not an actual installer

		// Stage 9: Pulumi Service deployment
		pulumiService := runCycleWithEnvironment(t, env, basePath, "90-pulumi-service", testConfig)

		// Stage 10: Service Validation
		t.Run("ServiceValidation", func(t *testing.T) {
			// Get the API endpoint from the deployed service
			// In a real scenario, this would come from stack outputs
			apiEndpoint := getServiceEndpoint(t, pulumiService)
			if apiEndpoint != "" {
				validateDeployedService(t, apiEndpoint)
			} else {
				t.Log("⚠️  Service validation skipped - API endpoint not available")
			}
		})

		// Log environment metrics
		t.Logf("📊 Environment metrics: %+v", env.GetMetrics())

		// Add cleanup hints for manual cleanup if needed
		clusterName := fmt.Sprintf("pulumiselfhost-eks-%s", env.StackPrefix)
		env.AddAwsCleanupHints(t, clusterName)
	})
}

// getServiceEndpoint extracts the API endpoint from stack outputs
func getServiceEndpoint(t *testing.T, stack *pulumitest.PulumiTest) string {
	t.Helper()

	ctx := context.Background()
	currentStack := stack.CurrentStack()
	if currentStack == nil {
		t.Log("No current stack available")
		return ""
	}

	outputs, err := currentStack.Outputs(ctx)
	if err != nil {
		t.Logf("Could not get stack outputs: %v", err)
		return ""
	}

	// Try common output names for the API endpoint
	possibleOutputs := []string{"apiEndpoint", "api_endpoint", "apiUrl", "api_url", "serviceUrl", "service_url"}

	for _, outputName := range possibleOutputs {
		if endpoint, ok := outputs[outputName]; ok {
			if endpointStr, ok := endpoint.Value.(string); ok && endpointStr != "" {
				t.Logf("📋 Found API endpoint: %s", endpointStr)
				return endpointStr
			}
		}
	}

	t.Log("📋 No API endpoint found in stack outputs")
	return ""
}

// validateDeployedService performs service validation against a deployed endpoint
func validateDeployedService(t *testing.T, apiEndpoint string) {
	t.Helper()

	config := ServiceValidationConfig{
		APIEndpoint: apiEndpoint,
		Timeout:     5 * time.Minute, // Allow 5 minutes for service to become ready
	}

	t.Logf("🔍 Starting service validation for endpoint: %s", apiEndpoint)
	ValidatePulumiService(t, config)
}
