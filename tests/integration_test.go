// Copyright 2016-2021, Pulumi Corporation.  All rights reserved.

package tests

import (
	"context"
	"github.com/pulumi/pulumi/sdk/v3/go/common/workspace"
	"io"
	"io/ioutil"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/pulumi/pulumi/sdk/v3/go/auto"
	"github.com/pulumi/pulumi/sdk/v3/go/auto/optup"
)

func TestStackUpdate(t *testing.T) {
	ctx := context.Background()
	proj := auto.Project(workspace.Project{
		Backend: &workspace.ProjectBackend{
			URL: "http://localhost:8080",
		},
	})

	envVars := auto.EnvVars(map[string]string{
		"PULUMI_ACCESS_TOKEN": testAccountAccessToken,
	})

	w, err := auto.NewLocalWorkspace(ctx, auto.WorkDir("test-pulumi-app"), proj, envVars)
	if err != nil {
		t.Fatalf("Error creating local workspace: %v", err)
	}

	stack, err := auto.NewStack(ctx, "dev", w)
	if err != nil {
		t.Fatalf("Error creating a new stack: %v", err)
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
