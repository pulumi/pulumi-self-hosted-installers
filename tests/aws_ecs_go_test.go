//go:build aws || all
// +build aws all

package tests

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/pulumi/providertest/pulumitest"
	"github.com/pulumi/providertest/pulumitest/opttest"
	"github.com/pulumi/pulumi/sdk/v3/go/auto/optpreview"
)

func runEcsGoCycle(t *testing.T, basePath string, folder string, additionalConfig map[string]string) *pulumitest.PulumiTest {
	fmt.Printf("Testing ECS Go Program: %s", folder)
	// PulumiTest with UseAmbientBackend() automatically handles backend setup
	p := pulumitest.NewPulumiTest(t, filepath.Join(basePath, folder), opttest.StackName("prod"), opttest.SkipInstall(), opttest.UseAmbientBackend())

	// ECS Go projects may have different config file names - check for common patterns
	configSrc := filepath.Join(p.WorkingDir(), "Pulumi.README.yaml")
	if _, err := os.Stat(configSrc); os.IsNotExist(err) {
		// Try alternative config file names
		configSrc = filepath.Join(p.WorkingDir(), "Pulumi.EXAMPLE.yaml")
	}

	configDst := filepath.Join(p.WorkingDir(), "Pulumi.prod.yaml")
	if _, err := os.Stat(configSrc); err == nil {
		if err := CopyFile(configSrc, configDst); err != nil {
			t.Fatalf("Failed to copy config file: %v", err)
		}
	}

	p.SetConfig(t, "aws:region", "us-west-2")
	for key, value := range additionalConfig {
		p.SetConfig(t, key, value)
	}
	p.Install(t)
	p.Up(t)
	p.Preview(t, optpreview.ExpectNoChanges())
	return p
}

func TestAwsEcsGoExamples(t *testing.T) {
	t.Run("TestAwsEcsGo", func(t *testing.T) {
		checkAwsEnvVars(t)
		basePath := "../ecs-hosted/go"
		var emptyConfig map[string]string

		// Stage 1: Infrastructure (VPC, ECS Cluster, RDS, OpenSearch)
		infrastructure := runEcsGoCycle(t, basePath, "infrastructure", emptyConfig)
		defer infrastructure.Destroy(t)

		// Stage 2: Application (ECS Services, Load Balancers, Tasks)
		application := runEcsGoCycle(t, basePath, "application", emptyConfig)
		defer application.Destroy(t)

		// Stage 3: DNS (Route53 configuration)
		dns := runEcsGoCycle(t, basePath, "dns", emptyConfig)
		defer dns.Destroy(t)
	})
}
