package tests

import (
	"fmt"
	"net/http"
	"path"
	"testing"

	"github.com/pulumi/pulumi/sdk/v3/go/common/apitype"
	ptesting "github.com/pulumi/pulumi/sdk/v3/go/common/testing"
)

func publishPolicyPack(t *testing.T) string {
	newOrgReq := createOrganizationRequest{
		Product:  "enterprise",
		Interval: "year",
		// Enterprise subscriptions require a minimum of 10 units.
		MaxUnits:         10,
		OrgName:          "my-org",
		IdentityProvider: "Pulumi",
		BackingOrgName:   "my-org",
	}
	createPulumiOrganization(t, newOrgReq)
	// Stop going any further if creating the organization has failed.
	if t.Failed() {
		return ""
	}

	testPolicyPack := "test-policy-pack"
	testPolicyPackPath := path.Join(".", testPolicyPack)

	testEnv := ptesting.NewEnvironment(t)
	testEnv.ImportDirectory(testPolicyPackPath)
	testEnv.SetBackend(pulumiAPIURI)
	_, _, npmErr := testEnv.GetCommandResults("npm", "ci")
	if npmErr != nil {
		t.Fatalf("Error running npm ci command: %v", npmErr)
	}

	testOrgName := newOrgReq.OrgName
	// Pack and push a Policy Pack for the organization.
	_, _, npmErr = testEnv.GetCommandResults("pulumi", "policy", "publish", testOrgName)
	if npmErr != nil {
		t.Fatalf("Error publishing policy pack: %v", npmErr)
	}

	req := apitype.UpdatePolicyGroupRequest{
		AddPolicyPack: &apitype.PolicyPackMetadata{
			Name:       testPolicyPack,
			VersionTag: "0.0.1",
		},
	}
	reqPath := fmt.Sprintf("orgs/%s/policygroups/%s", testOrgName, apitype.DefaultPolicyGroup)
	assertRequestWithBodySuccess(t, http.MethodPatch, reqPath, req, http.StatusNoContent)

	return testOrgName
}
