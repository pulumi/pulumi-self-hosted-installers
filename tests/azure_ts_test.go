//go:build azure || all
// +build azure all

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

func runAzureCycle(t *testing.T, basePath string, folder string, additionalConfig map[string]string) *pulumitest.PulumiTest {
	fmt.Printf("Testing Azure AKS Program: %s", folder)
	// PulumiTest with UseAmbientBackend() automatically handles backend setup
	p := pulumitest.NewPulumiTest(t, filepath.Join(basePath, folder), opttest.StackName("prod"), opttest.SkipInstall(), opttest.UseAmbientBackend())

	// Azure projects may have different config file names - check for common patterns
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

	// Set required Azure configuration
	p.SetConfig(t, "azure-native:location", "East US")
	// Set minimum required config for Azure AKS infrastructure
	if folder == "01-infrastructure" {
		p.SetConfig(t, "subnetCidr", "10.0.1.0/24")
		p.SetConfig(t, "dbSubnetCidr", "10.0.2.0/24")
		p.SetConfig(t, "networkCidr", "10.0.0.0/16")
	}

	for key, value := range additionalConfig {
		p.SetConfig(t, key, value)
	}
	p.Install(t)
	p.Up(t)
	p.Preview(t, optpreview.ExpectNoChanges())
	return p
}

func TestAzureAksTsExamples(t *testing.T) {
	t.Run("TestAzureAksTs", func(t *testing.T) {
		checkAzureEnvVars(t)
		basePath := "../aks-hosted"
		var emptyConfig map[string]string

		// Stage 1: Infrastructure (VNet, AKS, Database, Storage, Active Directory)
		infrastructure := runAzureCycle(t, basePath, "01-infrastructure", emptyConfig)
		defer infrastructure.Destroy(t)

		// Stage 2: Kubernetes (cert-manager, ingress, identity, cluster configuration)
		kubernetes := runAzureCycle(t, basePath, "02-kubernetes", emptyConfig)
		defer kubernetes.Destroy(t)

		// Stage 3: Application (Pulumi Service deployment, secrets, certificates)
		application := runAzureCycle(t, basePath, "03-application", emptyConfig)
		defer application.Destroy(t)
	})
}
