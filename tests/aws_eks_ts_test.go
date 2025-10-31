package tests

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/pulumi/providertest/pulumitest"
)

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
		runCycleWithEnvironment(t, env, basePath, "01-iam", testConfig, "eks-ts", "aws")

		// Stage 2: VPC and networking
		runCycleWithEnvironment(t, env, basePath, "02-networking", networkingConfig, "eks-ts", "aws")

		// Stage 3: EKS cluster
		runCycleWithEnvironment(t, env, basePath, "05-eks-cluster", testConfig, "eks-ts", "aws")

		// Stage 4: Cluster services (ingress, DNS)
		runCycleWithEnvironment(t, env, basePath, "10-cluster-svcs", testConfig, "eks-ts", "aws")

		// Stage 5: State management and policies
		runCycleWithEnvironment(t, env, basePath, "15-state-policies-mgmt", testConfig, "eks-ts", "aws")

		// Stage 6: Database (RDS)
		runCycleWithEnvironment(t, env, basePath, "20-database", testConfig, "eks-ts", "aws")

		// Stage 7: Insights and monitoring
		runCycleWithEnvironment(t, env, basePath, "25-insights", testConfig, "eks-ts", "aws")

		// Stage 8: ESC (Environments, Secrets, Configuration)
		runCycleWithEnvironment(t, env, basePath, "30-esc", testConfig, "eks-ts", "aws")

		// Note: 35-deployments is README-only, not an actual installer

		// Stage 9: Pulumi Service deployment
		pulumiService := runCycleWithEnvironment(t, env, basePath, "90-pulumi-service", testConfig, "eks-ts", "aws")

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
