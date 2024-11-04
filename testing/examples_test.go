package examples

import (
	"os"
	"testing"

	"github.com/pulumi/pulumi/pkg/v3/testing/integration"
)

const (
	EnvMistAPIKey = "MIST_API_TOKEN"
	EnvMistOrgID  = "MIST_ORG_ID"
	EnvMistHost   = "MIST_HOST"
	EnvClaimCode1 = "MIST_CLAIM_CODE_1"
	EnvClaimCode2 = "MIST_CLAIM_CODE_2"
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

func checkBaseEnvVars(t *testing.T) {
	checkEnvVars(t, EnvMistOrgID)
	checkEnvVars(t, EnvMistAPIKey)
	checkEnvVars(t, EnvMistHost)
}
