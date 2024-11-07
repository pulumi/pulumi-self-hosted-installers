package tests

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/pulumi/pulumi/pkg/v3/testing/integration"
)

func TestGkeTs(t *testing.T) {
	checkGoogleEnvVars(t)

	basePath, err := filepath.Abs("../gke-hosted")
	if err != nil {
		t.Fatalf("Failed to get absolute path: %v", err)
	}

	baseConfig := map[string]string{
		"gcp:region": "us-east1",
		"gcp:zone":   "us-east1-a",
	}

	// Set project if available
	if googleProject := os.Getenv(EnvGoogleProject); googleProject != "" {
		baseConfig["gcp:project"] = googleProject
	}

	// Add sensible defaults
	baseConfig = mergeMaps(baseConfig, map[string]string{
		"commonName":     "pulumitest",
		"dbInstanceType": "db-g1-small",
		"dbUser":         "pulumiadmin",
	})

	// Stage 1: Infrastructure (VPC, GKE, Cloud SQL, GCS, Service Account)
	t.Log("Stage 1: Deploying infrastructure...")
	integration.ProgramTest(t, &integration.ProgramTestOptions{
		Dir:              filepath.Join(basePath, "01-infrastructure"),
		StackName:        "prod",
		Quick:            true,
		DestroyOnCleanup: true,
		Config:           baseConfig,
		PrepareProject:   copyConfigFiles,
	})

	// Stage 2: Kubernetes (NGINX ingress, OpenSearch, cluster configuration)
	t.Log("Stage 2: Deploying Kubernetes components...")
	integration.ProgramTest(t, &integration.ProgramTestOptions{
		Dir:              filepath.Join(basePath, "02-kubernetes"),
		StackName:        "prod",
		Quick:            true,
		DestroyOnCleanup: true,
		Config:           baseConfig,
		PrepareProject:   copyConfigFiles,
	})

	// Stage 3: Application (Pulumi Service deployment, secrets, certificates)
	t.Log("Stage 3: Deploying application...")
	integration.ProgramTest(t, &integration.ProgramTestOptions{
		Dir:              filepath.Join(basePath, "03-application"),
		StackName:        "prod",
		Quick:            true,
		DestroyOnCleanup: true,
		Config:           baseConfig,
		PrepareProject:   copyConfigFiles,
	})

	t.Log("All GKE stages completed successfully")
}
