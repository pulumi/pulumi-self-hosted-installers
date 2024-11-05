package tests

import (
	"github.com/pulumi/providertest/pulumitest"

	"path/filepath"
	"testing"

	"github.com/pulumi/providertest/pulumitest/opttest"
	"github.com/pulumi/pulumi/sdk/v3/go/auto/optpreview"
)

func runCycle(t *testing.T, basePath string, folder string) *pulumitest.PulumiTest {
	p := pulumitest.NewPulumiTest(t, filepath.Join(basePath, "01-iam"), opttest.StackName("prod"), opttest.SkipInstall())
	p.UpdateSource(t, filepath.Join(basePath, folder))
	CopyFile(filepath.Join(p.WorkingDir(), "Pulumi.README.yaml"), filepath.Join(p.WorkingDir(), "Pulumi.prod.yaml"))
	p.SetConfig(t, "aws:region", "us-east-1")
	p.Install(t)
	p.Up(t)
	p.Preview(t, optpreview.ExpectNoChanges())
	return p
}
func TestAwsEksTsExamples(t *testing.T) {
	// "01-iam"
	// "02-networking",
	// "05-eks-cluster",
	// "10-cluster-svcs",
	// "15-state-policies-mgmt",
	// "20-database",
	// "25-insights",
	// "30-esc",
	// "35-deployments",
	// "90-pulumi-service"

	t.Run("TestAwsEksTs", func(t *testing.T) {
		checkAwsEnvVars(t)
		basePath := "../eks-hosted"
		iam := runCycle(t, basePath, "01-iam")
		networking := runCycle(t, basePath, "02-networking")
		// p01 := pulumitest.NewPulumiTest(t, filepath.Join(basePath, "01-iam"), opttest.StackName("prod"), opttest.SkipInstall())
		// CopyFile(filepath.Join(p01.WorkingDir(), "Pulumi.README.yaml"), filepath.Join(p01.WorkingDir(), "Pulumi.prod.yaml"))
		// p01.SetConfig(t, "aws:region", "us-east-1")
		// p01.Install(t)
		// p01.Up(t)
		// p01.Preview(t, optpreview.ExpectNoChanges())
		defer networking.Destroy(t)
		defer iam.Destroy(t)
	})
}
