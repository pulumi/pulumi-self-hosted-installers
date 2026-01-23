package tests

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pulumi/pulumi/pkg/v3/testing/integration"
)

func TestAwsEcsGo(t *testing.T) {
	checkAwsEnvVars(t)

	basePath, err := filepath.Abs("../ecs-hosted/go")
	if err != nil {
		t.Fatalf("Failed to get absolute path: %v", err)
	}

	baseConfig := mergeMaps(map[string]string{
		"aws:region": "ca-central-1",
	}, getAwsDefaultTags("ecs-go"))

	// Variables to pass outputs between stages
	var vpcId string
	var publicSubnetIds, privateSubnetIds, isolatedSubnetIds []interface{}
	var infraOutputs map[string]interface{}

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

	// Stage 2: Infrastructure
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
		ExtraRuntimeValidation: func(t *testing.T, stack integration.RuntimeValidationStackInfo) {
			infraOutputs = stack.Outputs
			t.Logf("Infrastructure outputs captured")
		},
	})

	// Refresh token before KMS key creation
	if err := RefreshEscToken(t); err != nil {
		t.Logf("Warning: Token refresh failed: %v", err)
	}

	// Create KMS key for testing
	t.Log("Creating KMS key for testing...")
	var realKMSKeyId string
	err = ExecuteWithRetry(t, func() error {
		createKeyCmd := exec.Command("esc", "run", "team-ce/default/aws", "--", "aws", "kms", "create-key",
			"--region", "ca-central-1", "--description", "Test KMS key for Pulumi self-hosted installer",
			"--key-usage", "ENCRYPT_DECRYPT", "--key-spec", "SYMMETRIC_DEFAULT",
			"--tags", "TagKey=Purpose,TagValue=pulumi-self-hosted-test",
			"TagKey=TestType,TagValue=ecs-go", "TagKey=AutoDelete,TagValue=true",
			"TagKey=CreatedBy,TagValue=pulumi-test-suite", "--query", "KeyMetadata.Arn", "--output", "text")

		kmsOutput, cmdErr := createKeyCmd.Output()
		if cmdErr != nil {
			return fmt.Errorf("failed to create KMS key: %v", cmdErr)
		}

		realKMSKeyId = strings.TrimSpace(string(kmsOutput))
		return nil
	}, "Create KMS key", 3)

	if err != nil {
		t.Fatalf("Failed to create KMS key after retries: %v", err)
	}
	t.Logf("Created KMS key: %s", realKMSKeyId)

	// Cleanup KMS key at end
	defer func() {
		if realKMSKeyId == "" {
			return
		}
		keyId := realKMSKeyId[strings.LastIndex(realKMSKeyId, "/")+1:]
		t.Logf("Scheduling KMS key %s for deletion...", keyId)

		cleanupErr := ExecuteWithRetry(t, func() error {
			deleteCmd := exec.Command("esc", "run", "team-ce/default/aws", "--", "aws", "kms", "schedule-key-deletion",
				"--region", "ca-central-1", "--key-id", keyId, "--pending-window-in-days", "7")
			return deleteCmd.Run()
		}, fmt.Sprintf("Delete KMS key %s", keyId), 3)

		if cleanupErr != nil {
			t.Logf("Warning: Failed to schedule KMS key deletion: %v", cleanupErr)
		} else {
			t.Logf("Scheduled KMS key %s for deletion", keyId)
		}
	}()

	// Stage 3: Application
	t.Log("Stage 3: Deploying application...")
	dummyACMArn := "arn:aws:acm:ca-central-1:123456789012:certificate/test-certificate-id"
	dummyStackRef := "team-ce/selfhosted-ecs-go-infrastructure/prod"

	appConfig := mergeMaps(baseConfig, map[string]string{
		"protectResources":   "false",
		"acmCertificateArn":  dummyACMArn,
		"kmsServiceKeyId":    realKMSKeyId,
		"licenseKey":         "dummy-license-key",
		"imageTag":           "3.154.0",
		"baseStackReference": dummyStackRef,
		"domainName":         "test.example.com",
		"vpcId":              infraOutputs["vpcId"].(string),
		"publicSubnetIds":    string(publicJSON),
		"privateSubnetIds":   string(privateJSON),
		"isolatedSubnetIds":  string(isolatedJSON),
		"dbClusterEndpoint":  infraOutputs["dbClusterEndpoint"].(string),
		"dbPort":             fmt.Sprintf("%v", infraOutputs["dbPort"]),
		"dbName":             infraOutputs["dbName"].(string),
		"dbUsername":         infraOutputs["dbUsername"].(string),
		"dbSecurityGroupId":  infraOutputs["dbSecurityGroupId"].(string),
	})

	// Add endpoint security group if present
	if sgId, ok := infraOutputs["endpointSecurityGroupId"]; ok {
		appConfig["endpointSecurityGroupId"] = sgId.(string)
	}

	// Add OpenSearch outputs if present
	if endpoint, ok := infraOutputs["opensearchEndpoint"]; ok && endpoint != nil && endpoint.(string) != "" {
		appConfig["opensearchEndpoint"] = endpoint.(string)
		if domainName, ok := infraOutputs["opensearchDomainName"]; ok {
			appConfig["opensearchDomainName"] = domainName.(string)
		}
		if user, ok := infraOutputs["opensearchUser"]; ok {
			appConfig["opensearchUser"] = user.(string)
		}
	}

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

	t.Log("All ECS Go stages completed successfully")
}
