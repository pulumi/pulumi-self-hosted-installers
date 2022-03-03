package tests

import (
	"net/http"
	"testing"
)

// createOrganizationRequest is the request to create an organization in the service.
type createOrganizationRequest struct {
	Product  string `json:"product"`
	Interval string `json:"interval"`
	MaxUnits int    `json:"maxUnits"`
	// OrgName is the Pulumi organization backed by a GitHub (or GitLab etc.) organization.
	// The name may not match the login name of the backing organization.
	OrgName string `json:"orgName"`

	// Backend provenance information.

	// IdentityProvider is the source of the backing organization, e.g. "github.com", "SAML".
	IdentityProvider string `json:"idProvider"`
	// BackingOrgName is the login of the backing (GitHub, GitLab etc.) organization.
	BackingOrgName string `json:"backingOrgName"`

	// Other fields have been intentionally omitted for testing.
}

func createPulumiOrganization(t *testing.T, req createOrganizationRequest) {
	assertRequestWithBodySuccess(t, http.MethodPost, "/console/actions/new-organization", req, http.StatusOK)
}
