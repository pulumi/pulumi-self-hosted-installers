// Copyright 2016-2021, Pulumi Corporation.  All rights reserved.

//go:build minio

package tests

import (
	"context"
	"io"
	"os"
	"path"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/pulumi/pulumi/sdk/v3/go/auto"
	"github.com/pulumi/pulumi/sdk/v3/go/auto/optup"
	ptesting "github.com/pulumi/pulumi/sdk/v3/go/common/testing"
)

func TestStackUpdateForMinioStorage(t *testing.T) {
	ctx := context.Background()

	checkpointStorageEndpoint := os.Getenv("PULUMI_CHECKPOINT_BLOB_STORAGE_ENDPOINT")
	if !strings.HasPrefix(checkpointStorageEndpoint, "s3://") {
		t.Fatalf("Checkpoint storage endpoint is not an S3-compatible endpoint instead it was %s", checkpointStorageEndpoint)
	}

	// testApp is the name of the folder and it just so happens the Pulumi
	// project name is the same too in Pulumi.yaml.
	testApp := "test-pulumi-app"
	testAppPath := path.Join(".", testApp)

	// Initialize a new local environment using the integration test framework
	// which makes it easy to also run commands to restore deps etc.
	testEnv := ptesting.NewEnvironment(t)
	testEnv.ImportDirectory(testAppPath)
	_, _, npmErr := testEnv.GetCommandResults("npm", "ci")
	if npmErr != nil {
		t.Fatalf("Error running npm ci command: %v", npmErr)
	}

	envVars := auto.EnvVars(map[string]string{
		"PULUMI_BACKEND_URL": pulumiAPIURI,
	})

	runStackUpdate := func(t *testing.T, stackName string) {
		// Upsert will create or select the stack.
		stack, err := auto.UpsertStackLocalSource(ctx, stackName, testEnv.CWD, envVars)
		if err != nil {
			t.Fatalf("Error creating a stack: %v", err)
		}

		progressStreams := []io.Writer{os.Stdout}
		result, err := stack.Up(ctx, optup.ProgressStreams(progressStreams...))
		if err != nil {
			t.Fatalf("Stack update failed: error: %v", err)
		}

		outputResult, ok := result.Outputs["result"]
		assert.True(t, ok)
		assert.True(t, outputResult.Secret)

		valueStr, ok := outputResult.Value.(string)
		assert.True(t, ok)
		assert.NotEmpty(t, valueStr)

		_, err = stack.Export(ctx)
		if err != nil {
			t.Fatalf("Error exporting stack: %v", err)
		}
	}

	t.Run("StackUpdate", func(t *testing.T) {
		stackName := "dev"
		runStackUpdate(t, stackName)
	})

	t.Run("StackUpdateWithPolicyPack", func(t *testing.T) {
		orgName := publishPolicyPack(t)
		if orgName == "" || t.Failed() {
			t.FailNow()
		}

		fqsn := auto.FullyQualifiedStackName(orgName, testApp, "dev")
		runStackUpdate(t, fqsn)
	})
}
