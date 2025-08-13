//go:build aws || all
// +build aws all

package tests

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/pulumi/providertest/pulumitest"
	"github.com/pulumi/providertest/pulumitest/opttest"
	auto "github.com/pulumi/pulumi/sdk/v3/go/auto"
	"github.com/pulumi/pulumi/sdk/v3/go/auto/optpreview"
)

func setAwsDefaultTagsTs(p *pulumitest.PulumiTest, testType string) {
	ctx := context.Background()
	cfg := auto.ConfigMap{
		"aws:defaultTags.tags.Purpose":    auto.ConfigValue{Value: "pulumi-self-hosted-test"},
		"aws:defaultTags.tags.TestType":   auto.ConfigValue{Value: testType},
		"aws:defaultTags.tags.AutoDelete": auto.ConfigValue{Value: "true"},
		"aws:defaultTags.tags.CreatedBy":  auto.ConfigValue{Value: "pulumi-test-suite"},
	}
	_ = p.CurrentStack().SetAllConfigWithOptions(ctx, cfg, &auto.ConfigOptions{Path: true})
}

// runEcsTsCycleWithTokenRefresh wraps runEcsTsCycle with token management
func runEcsTsCycleWithTokenRefresh(t *testing.T, basePath string, folder string, additionalConfig map[string]string) *pulumitest.PulumiTest {
	t.Helper()

	// Refresh token before starting the stage
	if err := RefreshEscToken(t); err != nil {
		t.Logf("⚠️ Token refresh failed before stage %s: %v", folder, err)
	}

	var result *pulumitest.PulumiTest

	// Execute with retry logic for token expiration
	err := ExecuteWithRetry(t, func() error {
		result = runEcsTsCycle(t, basePath, folder, additionalConfig)
		return nil
	}, fmt.Sprintf("Deploy stage %s", folder), 3)

	if err != nil {
		t.Fatalf("Failed to deploy stage %s: %v", folder, err)
	}

	return result
}

func runEcsTsCycle(t *testing.T, basePath string, folder string, additionalConfig map[string]string) *pulumitest.PulumiTest {
	fmt.Printf("Testing ECS TypeScript Program: %s\n", folder)
	// PulumiTest with UseAmbientBackend() automatically handles backend setup
	p := pulumitest.NewPulumiTest(t, filepath.Join(basePath, folder), opttest.StackName("prod"), opttest.SkipInstall(), opttest.UseAmbientBackend())

	// ECS projects may have different config file names - check for common patterns
	configSrc := filepath.Join(p.WorkingDir(), "Pulumi.README.yaml")
	if _, err := os.Stat(configSrc); os.IsNotExist(err) {
		// Try alternative config file names
		configSrc = filepath.Join(p.WorkingDir(), "Pulumi.EXAMPLE.yaml")
	}

	configDst := filepath.Join(p.WorkingDir(), "Pulumi.prod.yaml")
	if _, err := os.Stat(configSrc); err == nil {
		if err := CopyFile(configSrc, configDst); err != nil {
			t.Fatalf("Failed to copy config file: %v", err)
		}
	}

	p.SetConfig(t, "aws:region", "ca-central-1")
	// Set default tags for easy resource cleanup
	setAwsDefaultTagsTs(p, "ecs-ts")
	for key, value := range additionalConfig {
		p.SetConfig(t, key, value)
	}
	p.Install(t)
	p.Up(t)
	p.Preview(t, optpreview.ExpectNoChanges())
	return p
}

func TestAwsEcsTsExamples(t *testing.T) {
	t.Run("TestAwsEcsTs", func(t *testing.T) {
		checkAwsEnvVars(t)
		basePath := "../ecs-hosted/ts"
		var emptyConfig map[string]string

		// Track all stacks for proper cleanup
		var allStacks []*pulumitest.PulumiTest
		defer func() {
			// Use shared utility for comprehensive stack cleanup
			CleanupStacksWithRetry(t, allStacks)
		}()

		// Stage 0: Create basic networking infrastructure (VPC, subnets)
		networking := runEcsTsCycleWithTokenRefresh(t, basePath, "networking", emptyConfig)
		allStacks = append(allStacks, networking)

		// Get networking outputs to configure infrastructure stage
		ctx := context.Background()
		outputs, err := networking.CurrentStack().Outputs(ctx)
		if err != nil {
			t.Fatalf("Failed to get networking outputs: %v", err)
		}

		// Extract networking values from outputs (OutputValue has a Value field)
		vpcId := outputs["vpcId"].Value.(string)
		publicSubnetIds := outputs["publicSubnetIds"].Value.([]interface{})
		privateSubnetIds := outputs["privateSubnetIds"].Value.([]interface{})
		isolatedSubnetIds := outputs["isolatedSubnetIds"].Value.([]interface{})

		// Convert interface{} slices to JSON strings for Pulumi config
		publicSubnetsJSON, _ := json.Marshal(publicSubnetIds)
		privateSubnetsJSON, _ := json.Marshal(privateSubnetIds)
		isolatedSubnetsJSON, _ := json.Marshal(isolatedSubnetIds)

		infraConfig := map[string]string{
			"vpcId":             vpcId,
			"publicSubnetIds":   string(publicSubnetsJSON),
			"privateSubnetIds":  string(privateSubnetsJSON),
			"isolatedSubnetIds": string(isolatedSubnetsJSON),
			"protectResources":  "false", // Disable protection for tests to allow cleanup
		}

		// Also set protection config for application stage
		appConfig := map[string]string{
			"protectResources": "false", // Disable protection for tests to allow cleanup
		}

		// Stage 1: Infrastructure (ECS Cluster, RDS, OpenSearch)
		infrastructure := runEcsTsCycleWithTokenRefresh(t, basePath, "infrastructure", infraConfig)
		allStacks = append(allStacks, infrastructure)

		// Stage 2: Application (ECS Services, Load Balancers, Tasks)
		application := runEcsTsCycleWithTokenRefresh(t, basePath, "application", appConfig)
		allStacks = append(allStacks, application)

		// Stage 3: DNS (Route53 configuration)
		dns := runEcsTsCycleWithTokenRefresh(t, basePath, "dns", emptyConfig)
		allStacks = append(allStacks, dns)

		t.Log("✅ All ECS TypeScript stages completed successfully")
	})
}
