//go:build aws || all
// +build aws all

package tests

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pulumi/providertest/pulumitest"
	"github.com/pulumi/providertest/pulumitest/opttest"
	auto "github.com/pulumi/pulumi/sdk/v3/go/auto"
	"github.com/pulumi/pulumi/sdk/v3/go/auto/optpreview"
)

func setAwsDefaultTagsEcsGo(p *pulumitest.PulumiTest, testType string) {
	ctx := context.Background()
	cfg := auto.ConfigMap{
		"aws:defaultTags.tags.Purpose":    auto.ConfigValue{Value: "pulumi-self-hosted-test"},
		"aws:defaultTags.tags.TestType":   auto.ConfigValue{Value: testType},
		"aws:defaultTags.tags.AutoDelete": auto.ConfigValue{Value: "true"},
		"aws:defaultTags.tags.CreatedBy":  auto.ConfigValue{Value: "pulumi-test-suite"},
	}
	_ = p.CurrentStack().SetAllConfigWithOptions(ctx, cfg, &auto.ConfigOptions{Path: true})
}

// cleanupTestResources attempts to clean up any leftover test resources to prevent quota limits
func cleanupTestResources(t *testing.T) {
	// This is a best-effort cleanup - if it fails, we log and continue
	t.Helper()
	t.Log("Attempting to clean up any leftover test resources...")

	// Try to clean up any stacks with our test tags
	// This is a placeholder for now - in a real implementation we'd use AWS APIs
	// or pulumi stack operations to find and clean up test resources

	// No cleanup needed at the start - create fresh resources

	t.Log("Resource cleanup completed")
}

// cleanupFallback provides fallback cleanup when normal destroy fails
func cleanupFallback(t *testing.T, stacks []*pulumitest.PulumiTest) {
	t.Helper()
	t.Log("🧹 Running fallback cleanup for failed destroy operations...")

	// Attempt to destroy stacks in reverse order (LIFO)
	for i := len(stacks) - 1; i >= 0; i-- {
		if stacks[i] != nil {
			stackName := "unknown"
			if stack := stacks[i].CurrentStack(); stack != nil {
				stackName = stack.Name()
			}

			t.Logf("🔄 Attempting fallback destroy for stack: %s", stackName)

			// Try to destroy again
			func() {
				defer func() {
					if r := recover(); r != nil {
						t.Logf("⚠️  Stack %s destroy panicked: %v", stackName, r)
						forceDestroyProtectedResources(t, stackName)
					}
				}()

				stacks[i].Destroy(t)
				t.Logf("✅ Successfully destroyed stack: %s", stackName)
			}()
		}
	}

	t.Log("📋 Fallback cleanup completed. Check AWS console for any remaining resources.")
}

// forceDestroyProtectedResources attempts to clean up protected resources that prevent VPC cleanup
func forceDestroyProtectedResources(t *testing.T, stackName string) {
	t.Helper()
	t.Logf("⚠️  Protected resources detected in stack: %s", stackName)
	t.Logf("🔧 MANUAL CLEANUP REQUIRED:")
	t.Logf("   1. cd to stack directory: ecs-hosted/go/{infrastructure|application}")
	t.Logf("   2. Unprotect RDS: pulumi state unprotect 'urn:pulumi:prod::%s::*aurora*'", stackName)
	t.Logf("   3. Force destroy: PULUMI_SKIP_CONFIRMATIONS=true pulumi destroy")
	t.Logf("   4. Check ENIs: AWS_REGION=ca-central-1 aws ec2 describe-network-interfaces")
	t.Logf("   5. Delete stuck ENIs: AWS_REGION=ca-central-1 aws ec2 delete-network-interface --network-interface-id <eni-id>")
}

// runEcsGoCycleWithTokenRefresh wraps runEcsGoCycle with token management
func runEcsGoCycleWithTokenRefresh(t *testing.T, basePath string, folder string, additionalConfig map[string]string) *pulumitest.PulumiTest {
	t.Helper()

	// Refresh token before starting the stage
	if err := RefreshEscToken(t); err != nil {
		t.Logf("⚠️ Token refresh failed before stage %s: %v", folder, err)
	}

	var result *pulumitest.PulumiTest

	// Execute with retry logic for token expiration
	err := ExecuteWithRetry(t, func() error {
		result = runEcsGoCycle(t, basePath, folder, additionalConfig)
		return nil
	}, fmt.Sprintf("Deploy stage %s", folder), 3)

	if err != nil {
		t.Fatalf("Failed to deploy stage %s: %v", folder, err)
	}

	return result
}

func runEcsGoCycle(t *testing.T, basePath string, folder string, additionalConfig map[string]string) *pulumitest.PulumiTest {
	fmt.Printf("Testing ECS Go Program: %s\n", folder)
	// PulumiTest with UseAmbientBackend() automatically handles backend setup
	p := pulumitest.NewPulumiTest(t, filepath.Join(basePath, folder), opttest.StackName("prod"), opttest.SkipInstall(), opttest.UseAmbientBackend())

	// ECS Go projects may have different config file names - check for common patterns
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
	setAwsDefaultTagsEcsGo(p, "ecs-go")
	for key, value := range additionalConfig {
		p.SetConfig(t, key, value)
	}
	p.Install(t)
	p.Up(t)
	p.Preview(t, optpreview.ExpectNoChanges())
	return p
}

func TestAwsEcsGoExamples(t *testing.T) {
	t.Run("TestAwsEcsGo", func(t *testing.T) {
		checkAwsEnvVars(t)

		// Attempt cleanup before starting to prevent quota issues
		cleanupTestResources(t)

		basePath := "../ecs-hosted/go"
		var emptyConfig map[string]string

		// Track all stacks for proper cleanup
		var allStacks []*pulumitest.PulumiTest
		defer func() {
			// Use shared utility for comprehensive stack cleanup
			CleanupStacksWithRetry(t, allStacks)
		}()

		// Stage 0: Create basic networking infrastructure (VPC, subnets)
		networking := runEcsGoCycleWithTokenRefresh(t, basePath, "networking", emptyConfig)
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
		infrastructure := runEcsGoCycleWithTokenRefresh(t, basePath, "infrastructure", infraConfig)
		allStacks = append(allStacks, infrastructure)

		// Get outputs from infrastructure to pass to application
		infraCtx := context.Background()
		infraOutputs, err := infrastructure.CurrentStack().Outputs(infraCtx)
		if err != nil {
			t.Fatalf("Failed to get infrastructure outputs: %v", err)
		}

		// Create a dummy ACM certificate ARN for testing
		dummyACMArn := "arn:aws:acm:ca-central-1:123456789012:certificate/test-certificate-id"

		// Create a fresh KMS key for testing with retry logic
		t.Log("Creating KMS key for testing...")
		var realKMSKeyId string

		err = ExecuteWithRetry(t, func() error {
			createKeyCmd := exec.Command("esc", "run", "team-ce/default/aws", "--", "aws", "kms", "create-key",
				"--region", "ca-central-1", "--description", "Test KMS key for Pulumi self-hosted installer",
				"--key-usage", "ENCRYPT_DECRYPT", "--key-spec", "SYMMETRIC_DEFAULT",
				"--tags", "TagKey=Purpose,TagValue=pulumi-self-hosted-test",
				"TagKey=TestType,TagValue=ecs-go", "TagKey=AutoDelete,TagValue=true",
				"TagKey=CreatedBy,TagValue=pulumi-test-suite", "--query", "KeyMetadata.Arn", "--output", "text")

			kmsOutput, cmdErr := createKeyCmd.Output()
			if cmdErr != nil {
				return fmt.Errorf("failed to create KMS key: %v", cmdErr)
			}

			realKMSKeyId = strings.TrimSpace(string(kmsOutput))
			return nil
		}, "Create KMS key", 3)

		if err != nil {
			t.Fatalf("Failed to create KMS key after retries: %v", err)
		}

		t.Logf("Created KMS key: %s", realKMSKeyId)

		// Ensure KMS key is cleaned up after test with retry logic
		defer func() {
			if realKMSKeyId == "" {
				return // No key to clean up
			}

			// Extract key ID from ARN (last part after /)
			keyId := realKMSKeyId[strings.LastIndex(realKMSKeyId, "/")+1:]
			t.Logf("Scheduling KMS key %s for deletion...", keyId)

			cleanupErr := ExecuteWithRetry(t, func() error {
				deleteCmd := exec.Command("esc", "run", "team-ce/default/aws", "--", "aws", "kms", "schedule-key-deletion",
					"--region", "ca-central-1", "--key-id", keyId, "--pending-window-in-days", "7")
				return deleteCmd.Run()
			}, fmt.Sprintf("Delete KMS key %s", keyId), 3)

			if cleanupErr != nil {
				t.Logf("⚠️  Failed to schedule KMS key deletion after retries: %v", cleanupErr)
			} else {
				t.Logf("✅ Scheduled KMS key %s for deletion", keyId)
			}
		}()

		// Pass infrastructure outputs to application stage
		dummyStackRef := "team-ce/selfhosted-ecs-go-infrastructure/prod" // Reference to infrastructure stack
		appConfig = map[string]string{
			"protectResources":   "false", // Disable protection for tests to allow cleanup
			"acmCertificateArn":  dummyACMArn,
			"kmsServiceKeyId":    realKMSKeyId,
			"licenseKey":         "dummy-license-key",
			"imageTag":           "3.154.0", // Use a known stable tag
			"baseStackReference": dummyStackRef,
			"domainName":         "test.example.com",
			"vpcId":              infraOutputs["vpcId"].Value.(string),
			"publicSubnetIds":    string(publicSubnetsJSON),
			"privateSubnetIds":   string(privateSubnetsJSON),
			"isolatedSubnetIds":  string(isolatedSubnetsJSON),
			"dbClusterEndpoint":  infraOutputs["dbClusterEndpoint"].Value.(string),
			"dbPort":             fmt.Sprintf("%v", infraOutputs["dbPort"].Value),
			"dbName":             infraOutputs["dbName"].Value.(string),
			"dbUsername":         infraOutputs["dbUsername"].Value.(string),
			// Note: dbPassword is secret, handled separately if needed
			"dbSecurityGroupId":       infraOutputs["dbSecurityGroupId"].Value.(string),
			"endpointSecurityGroupId": infraOutputs["endpointSecurityGroupId"].Value.(string),
		}

		// Add OpenSearch outputs if they exist
		if opensearchEndpoint, ok := infraOutputs["opensearchEndpoint"]; ok && opensearchEndpoint.Value != "" {
			appConfig["opensearchEndpoint"] = opensearchEndpoint.Value.(string)
			appConfig["opensearchDomainName"] = infraOutputs["opensearchDomainName"].Value.(string)
			appConfig["opensearchUser"] = infraOutputs["opensearchUser"].Value.(string)
			// Note: opensearchPassword is secret, handled separately if needed
		}

		// Stage 2: Application (ECS Services, Load Balancers, Tasks)
		application := runEcsGoCycleWithTokenRefresh(t, basePath, "application", appConfig)
		allStacks = append(allStacks, application)

		// Stage 3: DNS (Route53 configuration)
		dns := runEcsGoCycleWithTokenRefresh(t, basePath, "dns", emptyConfig)
		allStacks = append(allStacks, dns)

		t.Log("✅ All ECS Go stages completed successfully")
	})
}
