package tests

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pulumi/providertest/pulumitest"
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

			// Use retry logic for cleanup operations
			err := ExecuteWithRetry(t, func() error {
				stack.Destroy(t)
				return nil
			}, fmt.Sprintf("Destroy stack %s", stackName), 3)

			if err != nil {
				t.Logf("❌ Failed to destroy stack %s: %v", stackName, err)
			} else {
				t.Logf("✅ Successfully destroyed stack: %s", stackName)
			}
		}
	}
	t.Log("✅ All stacks cleanup completed")
}
