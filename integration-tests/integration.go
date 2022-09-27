package integration

import (
	"os"
	"path"
	"testing"

	"github.com/pulumi/pulumi/pkg/v2/testing/integration"
)

var programMap = map[string]string{
	"aks":    "aks-hosted",
	"ecs":    "ecs-hosted",
	"eks":    "eks-hosted",
	"gke":    "gke-hosted",
	"docker": "local-docker",
}

func IntegrationProgram(t *testing.T, programName string, programConfig map[string]string, programValidation func(t *testing.T, stack integration.RuntimeValidationStackInfo)) {
	cwd, err := os.Getwd()
	if err != nil {
		t.FailNow()
	}

	program := programMap[programName]
	if program == "" {
		t.FailNow()
	}

	testOptions := integration.ProgramTestOptions{
		Dir:                    path.Join(cwd, "..", program, "go", "infrastructure"),
		Quick:                  true,
		SkipRefresh:            true,
		Config:                 programConfig,
		ExtraRuntimeValidation: programValidation,
		GoBin:                  path.Join(cwd, "..", program, "go", "common"),
	}

	integration.ProgramTest(t, &testOptions)
}
