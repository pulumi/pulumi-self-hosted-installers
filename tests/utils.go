package tests

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/pulumi/providertest/pulumitest"
	auto "github.com/pulumi/pulumi/sdk/v3/go/auto"
	"github.com/pulumi/pulumi/sdk/v3/go/auto/optpreview"
)

const (
	EnvAwsAPIKey                    = "AWS_ACCESS_KEY_ID"
	EnvAwsSecretKey                 = "AWS_SECRET_ACCESS_KEY"
	EnvAzureClientId                = "ARM_CLIENT_ID"
	EnvAzureClientSecret            = "ARM_CLIENT_SECRET"
	EnvAzureTenantId                = "ARM_TENANT_ID"
	EnvAzureSubscriptionId          = "ARM_SUBSCRIPTION_ID"
	EnvAzureOidcToken               = "ARM_OIDC_TOKEN"
	EnvAzureUseOidc                 = "ARM_USE_OIDC"
	EnvGoogleApplicationCredentials = "GOOGLE_APPLICATION_CREDENTIALS"
	EnvGoogleProject                = "GOOGLE_PROJECT"
)

//nolint:unused // Used in build-tagged test files
func checkEnvVars(t *testing.T, envVar string) {
	value := os.Getenv(envVar)
	if value == "" {
		t.Fatalf("Skipping test due to missing %s environment variable", envVar)
	}
}

//nolint:unused // Used in build-tagged test files
func checkAwsEnvVars(t *testing.T) {
	checkEnvVars(t, EnvAwsAPIKey)
	checkEnvVars(t, EnvAwsSecretKey)
}

//nolint:unused // Used in build-tagged test files
func checkAzureEnvVars(t *testing.T) {
	checkEnvVars(t, EnvAzureClientId)
	checkEnvVars(t, EnvAzureTenantId)
	checkEnvVars(t, EnvAzureSubscriptionId)

	// Check for either client secret or OIDC token authentication
	useOidc := os.Getenv(EnvAzureUseOidc)
	if useOidc == "true" {
		checkEnvVars(t, EnvAzureOidcToken)
	} else {
		checkEnvVars(t, EnvAzureClientSecret)
	}
}

//nolint:unused // Used in build-tagged test files
func checkGoogleEnvVars(t *testing.T) {
	checkEnvVars(t, EnvGoogleApplicationCredentials)
	checkEnvVars(t, EnvGoogleProject)
}

// CopyFile copies a file from src to dst.
// It returns an error if there is any issue during the copy.
func CopyFile(src, dst string) error {
	// Open the source file
	sourceFile, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("failed to open source file '%s': %w", src, err)
	}
	defer func() {
		if err := sourceFile.Close(); err != nil {
			fmt.Printf("Warning: failed to close source file '%s': %v\n", src, err)
		}
	}()

	// Create the destination file
	destinationFile, err := os.Create(dst)
	if err != nil {
		return fmt.Errorf("failed to create destination file '%s': %w", dst, err)
	}
	defer func() {
		if err := destinationFile.Close(); err != nil {
			fmt.Printf("Warning: failed to close destination file '%s': %v\n", dst, err)
		}
	}()

	// Copy the contents from the source to the destination
	_, err = io.Copy(destinationFile, sourceFile)
	if err != nil {
		return fmt.Errorf("failed to copy contents from '%s' to '%s': %w", src, dst, err)
	}

	// Optionally, you can also set the permissions of the destination file
	srcInfo, err := os.Stat(src)
	if err != nil {
		return fmt.Errorf("failed to get file info for source file '%s': %w", src, err)
	}
	err = os.Chmod(dst, srcInfo.Mode())
	if err != nil {
		return fmt.Errorf("failed to set permissions on destination file '%s': %w", dst, err)
	}

	return nil
}

// =============================================================================
// Token Management Utilities
// =============================================================================

// RefreshEscToken refreshes the ESC token and validates it with AWS STS
// This helps prevent token expiration during long-running tests
func RefreshEscToken(t *testing.T) error {
	t.Helper()
	t.Log("🔄 Refreshing ESC token...")

	// Test the token by making a simple AWS call
	cmd := exec.Command("esc", "run", "team-ce/default/aws", "--", "aws", "sts", "get-caller-identity")
	output, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("failed to refresh ESC token: %v", err)
	}

	t.Logf("✅ ESC token refreshed successfully: %s", strings.TrimSpace(string(output)))
	return nil
}

// IsTokenExpiredError checks if an error is related to AWS token expiration
func IsTokenExpiredError(err error) bool {
	if err == nil {
		return false
	}
	errStr := strings.ToLower(err.Error())
	return strings.Contains(errStr, "expiredtoken") ||
		strings.Contains(errStr, "expired") ||
		strings.Contains(errStr, "403") ||
		strings.Contains(errStr, "unauthorized")
}

// ExecuteWithRetry executes an operation with retry logic for token expiration
// It will refresh the ESC token and retry up to maxRetries times on token expiration
func ExecuteWithRetry(t *testing.T, operation func() error, operationName string, maxRetries int) error {
	t.Helper()

	for retry := 0; retry < maxRetries; retry++ {
		err := operation()
		if err == nil {
			return nil // Success
		}

		if IsTokenExpiredError(err) && retry < maxRetries-1 {
			t.Logf("⚠️ %s failed due to token expiration (attempt %d/%d): %v", operationName, retry+1, maxRetries, err)
			t.Log("🔄 Refreshing token and retrying...")

			if refreshErr := RefreshEscToken(t); refreshErr != nil {
				t.Logf("❌ Failed to refresh token: %v", refreshErr)
				return fmt.Errorf("%s failed and token refresh failed: %v", operationName, refreshErr)
			}

			t.Logf("🔁 Retrying %s...", operationName)
			continue
		}

		// Non-token error or max retries reached
		return fmt.Errorf("%s failed after %d attempts: %v", operationName, retry+1, err)
	}

	return fmt.Errorf("%s failed after %d retries", operationName, maxRetries)
}

// ExecuteWithRetryAndTimeout executes an operation with retry logic and timeout
func ExecuteWithRetryAndTimeout(t *testing.T, operation func() error, operationName string, maxRetries int, timeoutMinutes int) error {
	t.Helper()

	for retry := 0; retry < maxRetries; retry++ {
		var err error

		// If timeout is specified, wrap the operation with timeout
		if timeoutMinutes > 0 {
			done := make(chan error, 1)

			go func() {
				done <- operation()
			}()

			select {
			case err = <-done:
				// Operation completed (successfully or with error)
			case <-time.After(time.Duration(timeoutMinutes) * time.Minute):
				err = fmt.Errorf("operation timed out after %d minutes", timeoutMinutes)
				t.Logf("⏰ %s timed out after %d minutes", operationName, timeoutMinutes)
			}
		} else {
			err = operation()
		}

		if err == nil {
			return nil // Success
		}

		if IsTokenExpiredError(err) && retry < maxRetries-1 {
			t.Logf("⚠️ %s failed due to token expiration (attempt %d/%d): %v", operationName, retry+1, maxRetries, err)
			t.Log("🔄 Refreshing token and retrying...")

			if refreshErr := RefreshEscToken(t); refreshErr != nil {
				t.Logf("❌ Failed to refresh token: %v", refreshErr)
				return fmt.Errorf("%s failed and token refresh failed: %v", operationName, refreshErr)
			}

			t.Logf("🔁 Retrying %s...", operationName)
			continue
		}

		// Non-token error or max retries reached
		return fmt.Errorf("%s failed after %d attempts: %v", operationName, retry+1, err)
	}

	return fmt.Errorf("%s failed after %d retries", operationName, maxRetries)
}

// GetStackName returns a human-readable stack name for logging
func GetStackName(p *pulumitest.PulumiTest) string {
	if p == nil {
		return "unknown"
	}
	// Use the working directory to identify the stack
	workDir := p.WorkingDir()
	if workDir == "" {
		return "unknown"
	}
	return filepath.Base(workDir)
}

// CleanupStacksWithRetry cleans up multiple Pulumi stacks in LIFO order with retry logic
// This ensures proper cleanup even when tokens expire during the cleanup phase
func CleanupStacksWithRetry(t *testing.T, stacks []*pulumitest.PulumiTest) {
	t.Helper()
	t.Log("🧹 Starting comprehensive stack cleanup...")

	for i := len(stacks) - 1; i >= 0; i-- {
		stack := stacks[i]
		if stack != nil {
			stackName := GetStackName(stack)
			t.Logf("🗑️  Destroying stack: %s", stackName)

			// Use retry logic with timeout for cleanup operations (15 minute timeout per attempt)
			err := ExecuteWithRetryAndTimeout(t, func() error {
				destroyStackWithProgress(t, stack, stackName)
				return nil
			}, fmt.Sprintf("Destroy stack %s", stackName), 3, 15)

			if err != nil {
				t.Logf("❌ Failed to destroy stack %s: %v", stackName, err)

				// Attempt force cleanup as a last resort
				t.Logf("🔥 Attempting force cleanup for stuck stack: %s", stackName)
				forceErr := ForceCleanupStack(t, stack, stackName)
				if forceErr != nil {
					t.Logf("💥 Force cleanup also failed for stack %s: %v", stackName, forceErr)
				} else {
					t.Logf("✅ Force cleanup succeeded for stack: %s", stackName)
				}
			} else {
				t.Logf("✅ Successfully destroyed stack: %s", stackName)
			}
		}
	}
	t.Log("✅ All stacks cleanup completed")
}

// ForceCleanupStack attempts to forcefully clean up a stack when normal destroy fails
func ForceCleanupStack(t *testing.T, stack *pulumitest.PulumiTest, stackName string) error {
	t.Helper()
	t.Logf("🔥 Attempting force cleanup for stack: %s", stackName)

	// First, try to cancel any stuck operations to clear locks
	t.Logf("🔓 Force cancelling any stuck operations for stack: %s", stackName)
	func() {
		defer func() {
			if r := recover(); r != nil {
				t.Logf("⚠️  Force cancel operation panicked (continuing): %v", r)
			}
		}()
		cancelStackOperations(t, stack, stackName)
	}()

	// Try refreshing and then destroying with refresh
	err := ExecuteWithRetryAndTimeout(t, func() error {
		stack.Refresh(t)
		return nil
	}, fmt.Sprintf("Refresh stack %s", stackName), 2, 5)

	if err != nil {
		t.Logf("⚠️ Failed to refresh stack %s, proceeding with force destroy: %v", stackName, err)
	}

	// Try destroying with --skip-pending-deletes flag if possible
	// This is done by setting environment variable that some providers check
	if err := os.Setenv("PULUMI_SKIP_PENDING_DELETES", "true"); err != nil {
		t.Logf("⚠️ Failed to set PULUMI_SKIP_PENDING_DELETES: %v", err)
	}
	defer func() {
		if err := os.Unsetenv("PULUMI_SKIP_PENDING_DELETES"); err != nil {
			t.Logf("⚠️ Failed to unset PULUMI_SKIP_PENDING_DELETES: %v", err)
		}
	}()

	return ExecuteWithRetryAndTimeout(t, func() error {
		// Cancel again before each destroy attempt in case locks got re-created
		func() {
			defer func() {
				if r := recover(); r != nil {
					t.Logf("⚠️  Pre-destroy cancel panicked (continuing): %v", r)
				}
			}()
			cancelStackOperations(t, stack, stackName)
		}()
		stack.Destroy(t)
		return nil
	}, fmt.Sprintf("Force destroy stack %s", stackName), 2, 10)
}

// destroyStackWithProgress wraps stack.Destroy with countdown timer and progress tracking
func destroyStackWithProgress(t *testing.T, stack *pulumitest.PulumiTest, stackName string) {
	t.Helper()

	// Start countdown timer in a separate goroutine
	done := make(chan bool, 1)
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()

		startTime := time.Now()
		progressMessages := []string{
			"🔄 Destroying resources...",
			"🗑️  Cleaning up dependencies...",
			"🧹 Removing cloud resources...",
			"⏳ Waiting for AWS resource cleanup...",
			"🔗 Breaking resource dependencies...",
			"💾 Cleaning up storage resources...",
			"🌐 Removing network resources...",
			"🛡️  Cleaning up security groups...",
			"📋 Finalizing cleanup...",
		}

		messageIndex := 0
		for {
			select {
			case <-done:
				elapsed := time.Since(startTime)
				t.Logf("✅ Stack %s destroyed in %v", stackName, elapsed.Truncate(time.Second))
				return
			case <-ticker.C:
				elapsed := time.Since(startTime)
				minutes := int(elapsed.Minutes())
				seconds := int(elapsed.Seconds()) % 60

				// Cycle through progress messages
				message := progressMessages[messageIndex%len(progressMessages)]
				messageIndex++

				t.Logf("🕒 [%02d:%02d] %s - Stack: %s", minutes, seconds, message, stackName)

				// Give hints about what might be taking time
				if minutes >= 5 {
					t.Logf("💡 Destruction taking longer than expected. Common causes:")
					t.Logf("   - RDS instances (2-5 min deletion)")
					t.Logf("   - OpenSearch domains (10+ min deletion)")
					t.Logf("   - VPC ENI dependencies")
					t.Logf("   - Load balancer cleanup")
				}

				if minutes >= 10 {
					t.Logf("⚠️  Stack destruction has been running for %d minutes. Consider manual cleanup if this continues.", minutes)
				}
			}
		}
	}()

	// Execute the actual destroy operation
	t.Logf("🚀 Starting destruction of stack: %s", stackName)

	// First, try to cancel any stuck operations to clear locks
	t.Logf("🔓 Cancelling any stuck operations for stack: %s", stackName)
	func() {
		defer func() {
			if r := recover(); r != nil {
				t.Logf("⚠️  Cancel operation panicked (continuing): %v", r)
			}
		}()
		cancelStackOperations(t, stack, stackName)
	}()

	// Now attempt destroy
	stack.Destroy(t)

	// Signal that destroy completed
	done <- true
}

// clearStackLocks attempts to clear any stuck stack locks before cleanup
//
//nolint:unused // Used in aws_ecs_go_test.go
func clearStackLocks(t *testing.T, backendURL string) {
	t.Helper()
	t.Logf("🔓 Clearing any stuck stack locks in backend: %s", backendURL)

	// For file-based backends, we can try to clean up lock files directly
	if strings.HasPrefix(backendURL, "file://") {
		backendPath := strings.TrimPrefix(backendURL, "file://")
		lockPath := filepath.Join(backendPath, ".pulumi", "locks")

		if _, err := os.Stat(lockPath); err == nil {
			t.Logf("🧹 Removing lock files from: %s", lockPath)
			if err := os.RemoveAll(lockPath); err != nil {
				t.Logf("⚠️  Failed to remove lock files: %v", err)
			} else {
				t.Logf("✅ Successfully cleared lock files")
			}
		}
	}

	// Also try using pulumi cancel command if we have a specific stack
	// This is more aggressive but sometimes necessary
	t.Log("💡 If locks persist, you may need to run 'pulumi cancel' manually")
}

// cancelStackOperations attempts to cancel any stuck operations on a stack
func cancelStackOperations(t *testing.T, stack *pulumitest.PulumiTest, stackName string) {
	t.Helper()

	// Use the Pulumi CLI cancel command to clear any stuck operations
	// This runs in the stack's working directory with the proper environment
	workDir := stack.WorkingDir()
	currentStack := stack.CurrentStack()
	if currentStack == nil {
		t.Logf("⚠️  No current stack available for cancel operation")
		return
	}

	// Get the actual stack name from the Pulumi stack
	actualStackName := currentStack.Name()
	t.Logf("🔓 Running 'pulumi cancel' for stack '%s' in directory: %s", actualStackName, workDir)

	// Use exec.Command to run pulumi cancel in the stack's working directory
	// Specify the stack name explicitly to ensure we're cancelling the right stack
	cmd := exec.Command("pulumi", "cancel", "--stack", actualStackName, "--yes")
	cmd.Dir = workDir

	// Copy environment variables (including PULUMI_BACKEND_URL if set)
	cmd.Env = os.Environ()

	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Logf("⚠️  pulumi cancel failed (continuing anyway): %v", err)
		if len(output) > 0 {
			t.Logf("   Cancel output: %s", string(output))
		}

		// Also try using the stack reference format that might be needed for file backends
		t.Logf("🔄 Trying cancel with organization/project/stack format...")
		projectName := getProjectNameFromWorkDir(workDir)
		fullStackRef := fmt.Sprintf("organization/%s/%s", projectName, actualStackName)
		cmd2 := exec.Command("pulumi", "cancel", "--stack", fullStackRef, "--yes")
		cmd2.Dir = workDir
		cmd2.Env = os.Environ()

		output2, err2 := cmd2.CombinedOutput()
		if err2 != nil {
			t.Logf("⚠️  pulumi cancel with full reference also failed: %v", err2)
			if len(output2) > 0 {
				t.Logf("   Cancel output: %s", string(output2))
			}
		} else {
			t.Logf("✅ pulumi cancel with full reference succeeded")
			if len(output2) > 0 {
				t.Logf("   Cancel output: %s", string(output2))
			}
		}
	} else {
		t.Logf("✅ pulumi cancel succeeded")
		if len(output) > 0 {
			t.Logf("   Cancel output: %s", string(output))
		}
	}
}

// getProjectNameFromWorkDir extracts the project name from the working directory
func getProjectNameFromWorkDir(workDir string) string {
	// workDir is typically something like /path/to/ecs-hosted/go/infrastructure
	// We want to extract the project name from the Pulumi.yaml file
	pulumiYamlPath := filepath.Join(workDir, "Pulumi.yaml")
	if content, err := os.ReadFile(pulumiYamlPath); err == nil {
		// Simple parsing - look for "name: projectname"
		lines := strings.Split(string(content), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "name:") {
				parts := strings.Fields(line)
				if len(parts) >= 2 {
					return parts[1]
				}
			}
		}
	}
	// Fallback to directory name
	return filepath.Base(workDir)
}

func setRegionAndDefaultTags(p *pulumitest.PulumiTest, testType string, platform string) {
	ctx := context.Background()
	var cfg auto.ConfigMap
	if platform == "aws" {
		cfg = auto.ConfigMap{
			"aws:region":                      auto.ConfigValue{Value: "ca-central-1"},
			"aws:defaultTags.tags.Purpose":    auto.ConfigValue{Value: "pulumi-self-hosted-test"},
			"aws:defaultTags.tags.TestType":   auto.ConfigValue{Value: testType},
			"aws:defaultTags.tags.AutoDelete": auto.ConfigValue{Value: "true"},
			"aws:defaultTags.tags.CreatedBy":  auto.ConfigValue{Value: "pulumi-test-suite"},
		}
	}
	_ = p.CurrentStack().SetAllConfigWithOptions(ctx, cfg, &auto.ConfigOptions{Path: true})
}

func runCycleWithEnvironment(t *testing.T, env *TestEnvironment, basePath string, folder string, additionalConfig map[string]string, tagTestType string, platform string) *pulumitest.PulumiTest {
	t.Helper()

	fmt.Printf("Testing Pulumi Program: %s with environment %s\n", folder, env.ID)

	// Merge default config with additional config
	config := map[string]string{}

	for key, value := range additionalConfig {
		config[key] = value
	}

	// Create PulumiTest with environment isolation
	p := env.SetupPulumiTest(t, filepath.Join(basePath, folder), config)

	// Set default tags for easy resource cleanup
	setRegionAndDefaultTags(p, tagTestType, platform)

	// Refresh token before deployment
	if err := RefreshEscToken(t); err != nil {
		t.Logf("⚠️ Token refresh failed before stage %s: %v", folder, err)
	}

	// Deploy the stack with retry logic
	defer p.Destroy(t)
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
