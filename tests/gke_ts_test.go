//go:build gke || all
// +build gke all

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

func runGkeCycle(t *testing.T, basePath string, folder string, additionalConfig map[string]string) *pulumitest.PulumiTest {
	fmt.Printf("Testing GKE Program: %s", folder)
	// PulumiTest with UseAmbientBackend() automatically handles backend setup
	p := pulumitest.NewPulumiTest(t, filepath.Join(basePath, folder), opttest.StackName("prod"), opttest.SkipInstall(), opttest.UseAmbientBackend())

	// GKE projects may have different config file names - check for common patterns
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

	// Set required GCP configuration
	googleProject := os.Getenv(EnvGoogleProject)
	if googleProject != "" {
		p.SetConfig(t, "gcp:project", googleProject)
	}
	p.SetConfig(t, "gcp:region", "us-east1")
	p.SetConfig(t, "gcp:zone", "us-east1-a")

	// Set optional configuration with sensible defaults
	p.SetConfig(t, "commonName", "pulumitest")
	p.SetConfig(t, "dbInstanceType", "db-g1-small")
	p.SetConfig(t, "dbUser", "pulumiadmin")

	for key, value := range additionalConfig {
		p.SetConfig(t, key, value)
	}
	p.Install(t)
	p.Up(t)
	p.Preview(t, optpreview.ExpectNoChanges())
	return p
}

func TestGkeTsExamples(t *testing.T) {
	t.Run("TestGkeTs", func(t *testing.T) {
		checkGoogleEnvVars(t)
		basePath := "../gke-hosted"
		var emptyConfig map[string]string

		// Stage 1: Infrastructure (VPC, GKE, Cloud SQL, GCS, Service Account)
		infrastructure := runGkeCycle(t, basePath, "01-infrastructure", emptyConfig)
		defer infrastructure.Destroy(t)

		// Stage 2: Kubernetes (NGINX ingress, OpenSearch, cluster configuration)
		kubernetes := runGkeCycle(t, basePath, "02-kubernetes", emptyConfig)
		defer kubernetes.Destroy(t)

		// Stage 3: Application (Pulumi Service deployment, secrets, certificates)
		application := runGkeCycle(t, basePath, "03-application", emptyConfig)
		defer application.Destroy(t)
	})
}
