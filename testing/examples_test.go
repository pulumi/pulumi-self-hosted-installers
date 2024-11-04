package testing

import (
	"os"
	"testing"

	"github.com/pulumi/pulumi/pkg/v3/testing/integration"
)

const (
	EnvAwsAPIKey    = "AWS_ACCESS_KEY_ID"
	EnvAwsSecretKey = "AWS_SECRET_ACCESS_KEY"
	EnvAwsRegion    = "AWS_REGION"
	EnvAzureKey     = "AZURE_KEY"
	EnvGoogleKey    = "GOOGLE_KEY"
)

func checkEnvVars(t *testing.T, envVar string) {
	value := os.Getenv(envVar)
	if value == "" {
		t.Skipf("Skipping test due to missing %s environment variable", envVar)
	}
}

func getCwd(t *testing.T) string {
	cwd, err := os.Getwd()
	if err != nil {
		t.FailNow()
	}

	return cwd
}

func getBaseOptions(t *testing.T) integration.ProgramTestOptions {
	return integration.ProgramTestOptions{
		RunUpdateTest:        false,
		ExpectRefreshChanges: true,
	}
}

func checkAwsEnvVars(t *testing.T) {
	checkEnvVars(t, EnvAwsAPIKey)
	checkEnvVars(t, EnvAwsSecretKey)
	checkEnvVars(t, EnvAwsRegion)
}

func checkAzureEnvVars(t *testing.T) {
	checkEnvVars(t, EnvAzureKey)
}

func checkGoogleEnvVars(t *testing.T) {
	checkEnvVars(t, EnvGoogleKey)
}
