package tests

import (
	"path/filepath"
	"testing"

	"github.com/pulumi/pulumi/pkg/v3/testing/integration"
)

func TestAzureAksTs(t *testing.T) {
	checkAzureEnvVars(t)

	basePath, err := filepath.Abs("../aks-hosted")
	if err != nil {
		t.Fatalf("Failed to get absolute path: %v", err)
	}

	baseConfig := map[string]string{
		"azure-native:location": "East US",
	}

	infraConfig := mergeMaps(baseConfig, map[string]string{
		"subnetCidr":   "10.0.1.0/24",
		"dbSubnetCidr": "10.0.2.0/24",
		"networkCidr":  "10.0.0.0/16",
	})

	// Stage 1: Infrastructure (VNet, AKS, Database, Storage, Active Directory)
	t.Log("Stage 1: Deploying infrastructure...")
	integration.ProgramTest(t, &integration.ProgramTestOptions{
		Dir:              filepath.Join(basePath, "01-infrastructure"),
		StackName:        "prod",
		Quick:            true,
		DestroyOnCleanup: true,
		Config:           infraConfig,
		PrepareProject:   copyConfigFiles,
	})

	// Stage 2: Kubernetes (cert-manager, ingress, identity, cluster configuration)
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

	t.Log("All Azure AKS stages completed successfully")
}
