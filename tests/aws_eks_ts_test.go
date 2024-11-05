//go:build nodejs || all
// +build nodejs all

package tests

import (
	"path/filepath"
	"testing"

	"github.com/pulumi/providertest/pulumitest"
	"github.com/pulumi/pulumi/sdk/v3/go/auto/optpreview"
	"github.com/pulumi/pulumi/sdk/v3/go/auto/optrefresh"
)

func TestAwsEksTsExamples(t *testing.T) {
	tests := []string{"01-iam"}
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
		p := pulumitest.NewPulumiTest(t, "../eks-hosted")
		for _, item := range tests {
			p.UpdateSource(filepath.Join(basePath, item))
			// if test.additionalConfig != nil {
			// 	for key, value := range test.additionalConfig {
			// 		p.SetConfig(t, key, value)
			// 	}
			// }
			p.Up(t)
			p.Preview(t, optpreview.ExpectNoChanges())
			p.Refresh(t, optrefresh.ExpectNoChanges())
		}
	})
}
