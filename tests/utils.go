package tests

import (
	"fmt"
	"io"
	"os"
	"testing"
)

const (
	EnvAwsAPIKey                    = "AWS_ACCESS_KEY_ID"
	EnvAwsSecretKey                 = "AWS_SECRET_ACCESS_KEY"
	EnvAzureClientId                = "AZURE_CLIENT_ID"
	EnvAzureClientSecret            = "AZURE_CLIENT_SECRET"
	EnvAzureTenantId                = "AZURE_TENANT_ID"
	EnvAzureSubscriptionId          = "AZURE_SUBSCRIPTION_ID"
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
	checkEnvVars(t, EnvAzureClientSecret)
	checkEnvVars(t, EnvAzureTenantId)
	checkEnvVars(t, EnvAzureSubscriptionId)
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
