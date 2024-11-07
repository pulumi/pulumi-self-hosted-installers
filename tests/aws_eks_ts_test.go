package tests

import (
	"os"

	"github.com/pulumi/providertest/pulumitest"

	"path/filepath"
	"testing"

	"github.com/pulumi/providertest/pulumitest/opttest"
	"github.com/pulumi/pulumi/sdk/v3/go/auto/optpreview"
)

func runCycle(t *testing.T, basePath string, folder string, additionalConfig map[string]string) *pulumitest.PulumiTest {
	os.MkdirAll("/tmp/.pulumi", os.FileMode(0777))
	os.Setenv("PULUMI_BACKEND_URL", "file:///tmp/.pulumi")
	p := pulumitest.NewPulumiTest(t, filepath.Join(basePath, folder), opttest.StackName("prod"), opttest.SkipInstall(), opttest.UseAmbientBackend())
	CopyFile(filepath.Join(p.WorkingDir(), "Pulumi.README.yaml"), filepath.Join(p.WorkingDir(), "Pulumi.prod.yaml"))
	p.SetConfig(t, "aws:region", "us-west-2")
	if additionalConfig != nil {
		for key, value := range additionalConfig {
			p.SetConfig(t, key, value)
		}
	}
	p.Install(t)
	p.Up(t)
	p.Preview(t, optpreview.ExpectNoChanges())
	return p
}
func TestAwsEksTsExamples(t *testing.T) {
	// "15-state-policies-mgmt",
	// "20-database",
	// "25-insights",
	// "30-esc",
	// "35-deployments",
	// "90-pulumi-service"

	t.Run("TestAwsEksTs", func(t *testing.T) {
		checkAwsEnvVars(t)
		basePath := "../eks-hosted"
		var emptyConfig map[string]string
		iam := runCycle(t, basePath, "01-iam", emptyConfig)
		defer iam.Destroy(t)
		networking := runCycle(t, basePath, "02-networking", emptyConfig)
		defer networking.Destroy(t)
		eksCluster := runCycle(t, basePath, "05-eks-cluster", emptyConfig)
		defer eksCluster.Destroy(t)
		clusterSvcs := runCycle(t, basePath, "10-cluster-svcs", emptyConfig)
		defer clusterSvcs.Destroy(t)
	})
}
