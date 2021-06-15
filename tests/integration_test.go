// Copyright 2016-2021, Pulumi Corporation.  All rights reserved.

package tests

import (
	"context"
	"io"
	"io/ioutil"
	"os"
	"path"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/pulumi/pulumi/sdk/v3/go/auto"
	"github.com/pulumi/pulumi/sdk/v3/go/auto/optup"
	ptesting "github.com/pulumi/pulumi/sdk/v3/go/common/testing"
)

func TestStackUpdate(t *testing.T) {
	ctx := context.Background()

	testApp := "test-pulumi-app"
	testAppPath := path.Join(".", testApp)
	testEnv := ptesting.NewEnvironment(t)
	testEnv.ImportDirectory(testAppPath)
	_, _, npmErr := testEnv.GetCommandResults("npm", "ci")
	if npmErr != nil {
		t.Fatalf("Error running npm ci command: %v", npmErr)
	}

	envVars := auto.EnvVars(map[string]string{
		"PULUMI_ACCESS_TOKEN": testAccountAccessToken,
		"PULUMI_BACKEND_URL":  pulumiAPIURI,
	})

	// Upsert will create or select the stack.
	stack, err := auto.UpsertStackLocalSource(ctx, "dev", testEnv.CWD, envVars)
	if err != nil {
		t.Fatalf("Error creating a stack: %v", err)
	}

	// create a temp file that we can tail during while our program runs
	tmp, _ := ioutil.TempFile(os.TempDir(), "")
	// optup.ProgressStreams allows us to stream incremental output to stdout, a file to tail, etc.
	//this gives us incremental status over time
	progressStreams := []io.Writer{os.Stdout, tmp}
	// this update will incrementally stream unstructured progress messages to stdout and our temp file
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

	t.Run("StackExport", func(t *testing.T) {
		_, err := stack.Export(ctx)
		if err != nil {
			t.Fatalf("Error exporting stack: %v", err)
		}

		// TODO: deserialize deployment to ensure stack checkpoint is valid.
	})
}
