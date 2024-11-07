package tests

import (
	"os"
	"testing"
	"time"
)

// TestServiceValidationStandalone is a standalone test for service validation
// This test can be run against any deployed Pulumi Service endpoint
func TestServiceValidationStandalone(t *testing.T) {
	// Get API endpoint from environment variable
	apiEndpoint := os.Getenv("PULUMI_SERVICE_ENDPOINT")
	if apiEndpoint == "" {
		t.Skip("⏭️  Skipping standalone service validation - PULUMI_SERVICE_ENDPOINT not set")
	}

	t.Logf("🎯 Running standalone service validation against: %s", apiEndpoint)

	config := ServiceValidationConfig{
		APIEndpoint: apiEndpoint,
		Timeout:     10 * time.Minute, // Allow longer timeout for external services
	}

	ValidatePulumiService(t, config)
}

// Example usage:
// export PULUMI_SERVICE_ENDPOINT=https://api.pulumi.example.com
// go test -run TestServiceValidationStandalone -v ./...
