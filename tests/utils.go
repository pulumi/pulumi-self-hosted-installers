package tests

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pulumi/pulumi/pkg/v3/engine"
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

func checkEnvVars(t *testing.T, envVar string) {
	value := os.Getenv(envVar)
	if value == "" {
		t.Fatalf("Skipping test due to missing %s environment variable", envVar)
	}
}

func checkAwsEnvVars(t *testing.T) {
	checkEnvVars(t, EnvAwsAPIKey)
	checkEnvVars(t, EnvAwsSecretKey)
}

func checkAzureEnvVars(t *testing.T) {
	checkEnvVars(t, EnvAzureClientId)
	checkEnvVars(t, EnvAzureTenantId)
	checkEnvVars(t, EnvAzureSubscriptionId)

	useOidc := os.Getenv(EnvAzureUseOidc)
	if useOidc == "true" {
		checkEnvVars(t, EnvAzureOidcToken)
	} else {
		checkEnvVars(t, EnvAzureClientSecret)
	}
}

func checkGoogleEnvVars(t *testing.T) {
	checkEnvVars(t, EnvGoogleApplicationCredentials)
	checkEnvVars(t, EnvGoogleProject)
}

// CopyFile copies a file from src to dst.
func CopyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("failed to open source file '%s': %w", src, err)
	}
	defer sourceFile.Close()

	destinationFile, err := os.Create(dst)
	if err != nil {
		return fmt.Errorf("failed to create destination file '%s': %w", dst, err)
	}
	defer destinationFile.Close()

	_, err = io.Copy(destinationFile, sourceFile)
	if err != nil {
		return fmt.Errorf("failed to copy contents from '%s' to '%s': %w", src, dst, err)
	}

	srcInfo, err := os.Stat(src)
	if err != nil {
		return fmt.Errorf("failed to get file info for source file '%s': %w", src, err)
	}
	return os.Chmod(dst, srcInfo.Mode())
}

// =============================================================================
// Config File Helpers
// =============================================================================

// copyConfigFiles is a PrepareProject hook for config file setup
func copyConfigFiles(info *engine.Projinfo) error {
	candidates := []string{"Pulumi.README.yaml", "Pulumi.EXAMPLE.yaml"}

	for _, candidate := range candidates {
		src := filepath.Join(info.Root, candidate)
		if _, err := os.Stat(src); err == nil {
			dst := filepath.Join(info.Root, "Pulumi.prod.yaml")
			return CopyFile(src, dst)
		}
	}
	return nil
}

// mergeMaps combines two config maps (second overrides first)
func mergeMaps(base, override map[string]string) map[string]string {
	result := make(map[string]string)
	for k, v := range base {
		result[k] = v
	}
	for k, v := range override {
		result[k] = v
	}
	return result
}

// getAwsDefaultTags returns a map of AWS default tags for test resources
func getAwsDefaultTags(testType string) map[string]string {
	return map[string]string{
		"aws:defaultTags:tags:Purpose":    "pulumi-self-hosted-test",
		"aws:defaultTags:tags:TestType":   testType,
		"aws:defaultTags:tags:AutoDelete": "true",
		"aws:defaultTags:tags:CreatedBy":  "pulumi-test-suite",
	}
}

// =============================================================================
// Token Management Utilities (for AWS ESC)
// =============================================================================

// RefreshEscToken refreshes the ESC token and validates it with AWS STS
func RefreshEscToken(t *testing.T) error {
	t.Helper()
	t.Log("Refreshing ESC token...")

	cmd := exec.Command("esc", "run", "team-ce/default/aws", "--", "aws", "sts", "get-caller-identity")
	output, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("failed to refresh ESC token: %v", err)
	}

	t.Logf("ESC token refreshed successfully: %s", strings.TrimSpace(string(output)))
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
func ExecuteWithRetry(t *testing.T, operation func() error, operationName string, maxRetries int) error {
	t.Helper()

	for retry := 0; retry < maxRetries; retry++ {
		err := operation()
		if err == nil {
			return nil
		}

		if IsTokenExpiredError(err) && retry < maxRetries-1 {
			t.Logf("Warning: %s failed due to token expiration (attempt %d/%d): %v", operationName, retry+1, maxRetries, err)
			t.Log("Refreshing token and retrying...")

			if refreshErr := RefreshEscToken(t); refreshErr != nil {
				t.Logf("Failed to refresh token: %v", refreshErr)
				return fmt.Errorf("%s failed and token refresh failed: %v", operationName, refreshErr)
			}

			t.Logf("Retrying %s...", operationName)
			continue
		}

		return fmt.Errorf("%s failed after %d attempts: %v", operationName, retry+1, err)
	}

	return fmt.Errorf("%s failed after %d retries", operationName, maxRetries)
}
