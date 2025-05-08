package tests

import (
	"io"
	"os"
	"testing"
)

const (
	EnvAwsAPIKey    = "AWS_ACCESS_KEY_ID"
	EnvAwsSecretKey = "AWS_SECRET_ACCESS_KEY"
	EnvAzureKey     = "AZURE_KEY"
	EnvGoogleKey    = "GOOGLE_KEY"
)

func checkEnvVars(t *testing.T, envVar string) {
	value := os.Getenv(envVar)
	if value == "" {
		t.Fatalf("Skipping test due to missing %s environment variable", envVar)
	}
}

func getCwd(t *testing.T) string {
	cwd, err := os.Getwd()
	if err != nil {
		t.FailNow()
	}

	return cwd
}

func checkAwsEnvVars(t *testing.T) {
	checkEnvVars(t, EnvAwsAPIKey)
	checkEnvVars(t, EnvAwsSecretKey)
}

func checkAzureEnvVars(t *testing.T) {
	checkEnvVars(t, EnvAzureKey)
}

func checkGoogleEnvVars(t *testing.T) {
	checkEnvVars(t, EnvGoogleKey)
}

// CopyFile copies a file from src to dst.
// It returns an error if there is any issue during the copy.
func CopyFile(src, dst string) error {
	// Open the source file
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	// Create the destination file
	destinationFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destinationFile.Close()

	// Copy the contents from the source to the destination
	_, err = io.Copy(destinationFile, sourceFile)
	if err != nil {
		return err
	}

	// Optionally, you can also set the permissions of the destination file
	srcInfo, err := os.Stat(src)
	if err != nil {
		return err
	}
	err = os.Chmod(dst, srcInfo.Mode())
	if err != nil {
		return err
	}

	return nil
}
