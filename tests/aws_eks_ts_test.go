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
	"github.com/pulumi/pulumi/sdk/v3/go/auto/optpreview"
)

func runCycleWithEnvironment(t *testing.T, env *TestEnvironment, basePath string, folder string, additionalConfig map[string]string) *pulumitest.PulumiTest {
	t.Helper()

	fmt.Printf("Testing Pulumi Program: %s with environment %s\n", folder, env.ID)

	// Merge default config with additional config
	config := map[string]string{
		"aws:region": "us-west-2",
	}

	for key, value := range additionalConfig {
		config[key] = value
	}

	// Create PulumiTest with environment isolation
	p := env.SetupPulumiTest(t, filepath.Join(basePath, folder), config)

	// Deploy the stack
	p.Install(t)
	p.Up(t)
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
		var emptyConfig map[string]string

		// Stage 1: IAM roles and policies
		runCycleWithEnvironment(t, env, basePath, "01-iam", emptyConfig)

		// Stage 2: VPC and networking
		runCycleWithEnvironment(t, env, basePath, "02-networking", emptyConfig)

		// Stage 3: EKS cluster
		runCycleWithEnvironment(t, env, basePath, "05-eks-cluster", emptyConfig)

		// Stage 4: Cluster services (ingress, DNS)
		runCycleWithEnvironment(t, env, basePath, "10-cluster-svcs", emptyConfig)

		// Stage 5: State management and policies
		runCycleWithEnvironment(t, env, basePath, "15-state-policies-mgmt", emptyConfig)

		// Stage 6: Database (RDS)
		runCycleWithEnvironment(t, env, basePath, "20-database", emptyConfig)

		// Stage 7: Insights and monitoring
		runCycleWithEnvironment(t, env, basePath, "25-insights", emptyConfig)

		// Stage 8: ESC (Environments, Secrets, Configuration)
		runCycleWithEnvironment(t, env, basePath, "30-esc", emptyConfig)

		// Note: 35-deployments is README-only, not an actual installer

		// Stage 9: Pulumi Service deployment
		pulumiService := runCycleWithEnvironment(t, env, basePath, "90-pulumi-service", emptyConfig)

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
