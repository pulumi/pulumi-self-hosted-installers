package tests

import (
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/pulumi/providertest/pulumitest"
	"github.com/pulumi/providertest/pulumitest/opttest"
)

// TestEnvironment manages isolated test environments for each platform test
type TestEnvironment struct {
	ID           string
	BackendURL   string
	TempDir      string
	StackPrefix  string
	ResourceTags map[string]string
	Cleanup      []func() error
}

// NewTestEnvironment creates a new isolated test environment
func NewTestEnvironment(t *testing.T, platform string) *TestEnvironment {
	t.Helper()

	// Generate unique environment ID using timestamp and random suffix
	timestamp := time.Now().Format("20060102-150405")
	randomSuffix := fmt.Sprintf("%04d", rand.Intn(10000))
	envID := fmt.Sprintf("test-%s-%s-%s", platform, timestamp, randomSuffix)

	// Create isolated temp directory for this test environment
	tempDir := filepath.Join(os.TempDir(), ".pulumi-test-env", envID)
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		t.Fatalf("Failed to create test environment directory: %v", err)
	}

	// Set up file backend URL for complete isolation
	backendURL := fmt.Sprintf("file://%s", tempDir)
	// Set backend URL for this test
	if err := os.Setenv("PULUMI_BACKEND_URL", backendURL); err != nil {
		t.Fatalf("Failed to set PULUMI_BACKEND_URL: %v", err)
	}

	// Create resource tags for tracking and cleanup
	resourceTags := map[string]string{
		"pulumi:test-env":       envID,
		"pulumi:test-platform":  platform,
		"pulumi:test-timestamp": timestamp,
		"pulumi:managed-by":     "pulumi-tests",
	}

	env := &TestEnvironment{
		ID:           envID,
		BackendURL:   backendURL,
		TempDir:      tempDir,
		StackPrefix:  strings.ReplaceAll(envID, "-", ""),
		ResourceTags: resourceTags,
		Cleanup:      []func() error{},
	}

	t.Logf("🏗️  Created isolated test environment: %s", envID)
	t.Logf("📁 Backend: %s", backendURL)

	return env
}

// SetupPulumiTest creates a new PulumiTest with environment isolation
func (env *TestEnvironment) SetupPulumiTest(t *testing.T, projectPath string, additionalConfig map[string]string) *pulumitest.PulumiTest {
	t.Helper()

	// Set backend URL for this test
	if err := os.Setenv("PULUMI_BACKEND_URL", env.BackendURL); err != nil {
		t.Fatalf("Failed to set PULUMI_BACKEND_URL: %v", err)
	}

	// Generate unique stack name
	stackName := fmt.Sprintf("%s-stack", env.StackPrefix)

	// Create PulumiTest with isolated settings
	pulumiTest := pulumitest.NewPulumiTest(
		t,
		projectPath,
		opttest.StackName(stackName),
		// Don't skip install - we need dependencies (npm install for TS, go mod download for Go)
		// Using isolated file-based backend for test isolation
	)

	// Copy configuration files with environment-specific naming
	env.setupConfigFiles(t, pulumiTest, stackName)

	// Apply additional configuration
	for key, value := range additionalConfig {
		pulumiTest.SetConfig(t, key, value)
	}

	// Add resource tags for tracking
	env.applyResourceTags(t, pulumiTest)

	// Register cleanup function
	env.AddCleanup(func() error {
		return env.cleanupPulumiTest(t, pulumiTest)
	})

	return pulumiTest
}

// setupConfigFiles handles configuration file copying with environment isolation
func (env *TestEnvironment) setupConfigFiles(t *testing.T, pulumiTest *pulumitest.PulumiTest, stackName string) {
	t.Helper()

	workingDir := pulumiTest.WorkingDir()

	// Try different config file patterns
	configSources := []string{
		"Pulumi.README.yaml",
		"Pulumi.EXAMPLE.yaml",
		"Pulumi.example.yaml",
	}

	targetConfig := filepath.Join(workingDir, fmt.Sprintf("Pulumi.%s.yaml", stackName))

	for _, source := range configSources {
		sourcePath := filepath.Join(workingDir, source)
		if _, err := os.Stat(sourcePath); err == nil {
			if err := CopyFile(sourcePath, targetConfig); err != nil {
				t.Logf("⚠️  Failed to copy config from %s: %v", source, err)
				continue
			}
			t.Logf("📋 Copied config: %s → %s", source, fmt.Sprintf("Pulumi.%s.yaml", stackName))
			return
		}
	}

	t.Logf("⚠️  No configuration template found in %s", workingDir)
}

// applyResourceTags adds environment-specific tags to resources
func (env *TestEnvironment) applyResourceTags(t *testing.T, pulumiTest *pulumitest.PulumiTest) {
	t.Helper()

	// Set environment-specific resource naming
	pulumiTest.SetConfig(t, "test:resourcePrefix", env.StackPrefix)
	pulumiTest.SetConfig(t, "test:environmentId", env.ID)

	// Add resource tags as test configuration (not AWS provider config)
	// These can be used by the Pulumi programs to tag their resources
	for key, value := range env.ResourceTags {
		// Convert to test config format - replace colons with hyphens for valid config keys
		tagName := strings.ReplaceAll(strings.TrimPrefix(key, "pulumi:"), ":", "-")
		testTagKey := fmt.Sprintf("test:%s", tagName)
		pulumiTest.SetConfig(t, testTagKey, value)
	}
}

// AddCleanup registers a cleanup function to be called when the environment is destroyed
func (env *TestEnvironment) AddCleanup(cleanup func() error) {
	env.Cleanup = append(env.Cleanup, cleanup)
}

// Destroy cleans up the test environment and all associated resources
func (env *TestEnvironment) Destroy(t *testing.T) {
	t.Helper()

	t.Logf("🧹 Destroying test environment: %s", env.ID)

	// Run cleanup functions in reverse order (LIFO)
	for i := len(env.Cleanup) - 1; i >= 0; i-- {
		if err := env.Cleanup[i](); err != nil {
			t.Logf("⚠️  Cleanup error: %v", err)
		}
	}

	// Remove temporary directory
	if err := os.RemoveAll(env.TempDir); err != nil {
		t.Logf("⚠️  Failed to remove temp directory %s: %v", env.TempDir, err)
	} else {
		t.Logf("🗑️  Removed temp directory: %s", env.TempDir)
	}

	t.Logf("✅ Test environment destroyed: %s", env.ID)
}

// cleanupPulumiTest destroys a Pulumi stack with retry logic for AWS dependencies
func (env *TestEnvironment) cleanupPulumiTest(t *testing.T, pulumiTest *pulumitest.PulumiTest) error {
	t.Helper()

	// Set the backend URL before destroying
	if err := os.Setenv("PULUMI_BACKEND_URL", env.BackendURL); err != nil {
		t.Fatalf("Failed to set PULUMI_BACKEND_URL: %v", err)
	}
	defer func() {
		if r := recover(); r != nil {
			t.Logf("⚠️  Panic during stack destroy: %v", r)
		}
	}()

	// Retry logic for AWS resource dependencies
	maxRetries := 3
	for attempt := 1; attempt <= maxRetries; attempt++ {
		t.Logf("🧹 Destroy attempt %d/%d", attempt, maxRetries)

		err := func() (err error) {
			defer func() {
				if r := recover(); r != nil {
					err = fmt.Errorf("panic during destroy: %v", r)
				}
			}()

			pulumiTest.Destroy(t)
			return nil
		}()

		if err == nil {
			t.Logf("✅ Stack destroyed successfully on attempt %d", attempt)
			return nil
		}

		t.Logf("⚠️  Destroy attempt %d failed: %v", attempt, err)

		if attempt < maxRetries {
			// Wait before retry to allow AWS resources to settle
			waitTime := time.Duration(attempt*30) * time.Second
			t.Logf("⏳ Waiting %v before retry...", waitTime)
			time.Sleep(waitTime)
		}
	}

	t.Logf("❌ All destroy attempts failed - some resources may need manual cleanup")
	return nil // Don't fail the test due to cleanup issues
}

// AddAwsCleanupHints logs cleanup hints for manual AWS resource cleanup
func (env *TestEnvironment) AddAwsCleanupHints(t *testing.T, clusterName string) {
	t.Helper()

	t.Logf("🔧 Manual cleanup may be needed for:")
	t.Logf("   - EKS Cluster: %s", clusterName)
	t.Logf("   - VPC with prefix: %s", env.StackPrefix)
	t.Logf("   - Security Groups with prefix: %s", env.StackPrefix)
	t.Logf("   - IAM Roles with prefix: %s", env.StackPrefix)
	t.Logf("💡 Use AWS CLI commands:")
	t.Logf("   aws eks delete-cluster --name %s --region us-east-1", clusterName)
	t.Logf("   aws ec2 describe-vpcs --filters Name=tag:Name,Values=%s*", env.StackPrefix)
}

// GetResourceTags returns tags that can be applied to cloud resources for tracking
func (env *TestEnvironment) GetResourceTags() map[string]string {
	return env.ResourceTags
}

// GetMetrics returns environment metrics for reporting
func (env *TestEnvironment) GetMetrics() map[string]interface{} {
	return map[string]interface{}{
		"environment_id": env.ID,
		"backend_url":    env.BackendURL,
		"temp_dir":       env.TempDir,
		"stack_prefix":   env.StackPrefix,
		"cleanup_count":  len(env.Cleanup),
	}
}
