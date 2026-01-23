package tests

import (
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/pulumi/pulumi/pkg/v3/testing/integration"
)

func TestAwsEcsTs(t *testing.T) {
	checkAwsEnvVars(t)

	basePath, err := filepath.Abs("../ecs-hosted/ts")
	if err != nil {
		t.Fatalf("Failed to get absolute path: %v", err)
	}

	baseConfig := mergeMaps(map[string]string{
		"aws:region": "ca-central-1",
	}, getAwsDefaultTags("ecs-ts"))

	// Variables to pass outputs between stages
	var vpcId string
	var publicSubnetIds, privateSubnetIds, isolatedSubnetIds []interface{}

	// Refresh token before starting
	if err := RefreshEscToken(t); err != nil {
		t.Logf("Warning: Token refresh failed: %v", err)
	}

	// Stage 1: Networking
	t.Log("Stage 1: Deploying networking...")
	integration.ProgramTest(t, &integration.ProgramTestOptions{
		Dir:              filepath.Join(basePath, "networking"),
		StackName:        "prod",
		Quick:            true,
		DestroyOnCleanup: true,
		Config:           baseConfig,
		PrepareProject:   copyConfigFiles,
		ExtraRuntimeValidation: func(t *testing.T, stack integration.RuntimeValidationStackInfo) {
			vpcId = stack.Outputs["vpcId"].(string)
			publicSubnetIds = stack.Outputs["publicSubnetIds"].([]interface{})
			privateSubnetIds = stack.Outputs["privateSubnetIds"].([]interface{})
			isolatedSubnetIds = stack.Outputs["isolatedSubnetIds"].([]interface{})
			t.Logf("Networking outputs captured - VPC: %s", vpcId)
		},
	})

	// Refresh token before next stage
	if err := RefreshEscToken(t); err != nil {
		t.Logf("Warning: Token refresh failed: %v", err)
	}

	// Stage 2: Infrastructure - uses outputs from networking
	t.Log("Stage 2: Deploying infrastructure...")
	publicJSON, _ := json.Marshal(publicSubnetIds)
	privateJSON, _ := json.Marshal(privateSubnetIds)
	isolatedJSON, _ := json.Marshal(isolatedSubnetIds)

	infraConfig := mergeMaps(baseConfig, map[string]string{
		"vpcId":             vpcId,
		"publicSubnetIds":   string(publicJSON),
		"privateSubnetIds":  string(privateJSON),
		"isolatedSubnetIds": string(isolatedJSON),
		"protectResources":  "false",
	})

	integration.ProgramTest(t, &integration.ProgramTestOptions{
		Dir:              filepath.Join(basePath, "infrastructure"),
		StackName:        "prod",
		Quick:            true,
		DestroyOnCleanup: true,
		Config:           infraConfig,
		PrepareProject:   copyConfigFiles,
	})

	// Refresh token before next stage
	if err := RefreshEscToken(t); err != nil {
		t.Logf("Warning: Token refresh failed: %v", err)
	}

	// Stage 3: Application
	t.Log("Stage 3: Deploying application...")
	appConfig := mergeMaps(baseConfig, map[string]string{
		"protectResources": "false",
	})

	integration.ProgramTest(t, &integration.ProgramTestOptions{
		Dir:              filepath.Join(basePath, "application"),
		StackName:        "prod",
		Quick:            true,
		DestroyOnCleanup: true,
		Config:           appConfig,
		PrepareProject:   copyConfigFiles,
	})

	// Refresh token before next stage
	if err := RefreshEscToken(t); err != nil {
		t.Logf("Warning: Token refresh failed: %v", err)
	}

	// Stage 4: DNS
	t.Log("Stage 4: Deploying DNS...")
	integration.ProgramTest(t, &integration.ProgramTestOptions{
		Dir:              filepath.Join(basePath, "dns"),
		StackName:        "prod",
		Quick:            true,
		DestroyOnCleanup: true,
		Config:           baseConfig,
		PrepareProject:   copyConfigFiles,
	})

	t.Log("All ECS TypeScript stages completed successfully")
}
