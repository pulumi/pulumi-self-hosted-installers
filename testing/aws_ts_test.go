//go:build nodejs || all
// +build nodejs all

package testing

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/pulumi/providertest/pulumitest"
	"github.com/pulumi/providertest/pulumitest/opttest"
	"github.com/pulumi/pulumi/sdk/v3/go/auto/optpreview"
	"github.com/pulumi/pulumi/sdk/v3/go/auto/optrefresh"
)

func TestTsExamples(t *testing.T) {
	tests := map[string]struct {
		directoryName    string
		additionalConfig map[string]string
	}{
		"TestAwsEksTs":          {directoryName: "../eks-hosted"},
		"TestAwsEcsTs":			 {directoryName: "../ecs-hosted/ts"}
	}
	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			checkAwsEnvVars(t)
			p := pulumitest.NewPulumiTest(t, test.directoryName,
				opttest.LocalProviderPath("pulumi-junipermist", filepath.Join(getCwd(t), "..", "bin")),
				opttest.YarnLink("@pulumi/juniper-mist"),
			)
			p.SetConfig(t, "organizationId", os.Getenv(EnvMistOrgID))
			if test.additionalConfig != nil {
				for key, value := range test.additionalConfig {
					p.SetConfig(t, key, value)
				}
			}
			p.Up(t)
			p.Preview(t, optpreview.ExpectNoChanges())
			p.Refresh(t, optrefresh.ExpectNoChanges())
		})
	}
}
