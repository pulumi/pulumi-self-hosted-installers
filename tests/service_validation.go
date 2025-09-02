package tests

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// ServiceValidationConfig contains configuration for service validation
type ServiceValidationConfig struct {
	APIEndpoint string
	Timeout     time.Duration
}

// EmailUserSignupRequest mirrors the service's signup request structure
type EmailUserSignupRequest struct {
	Name      string  `json:"name"`
	LoginName string  `json:"loginName"`
	Email     string  `json:"email"`
	Password  string  `json:"password"`
	Token     *string `json:"token,omitempty"`
}

// LoginResponse contains the API response from user signup/login
type LoginResponse struct {
	PulumiAccessToken string `json:"pulumiAccessToken"`
}

// CreateOrganizationRequest is the request to create an organization
type CreateOrganizationRequest struct {
	Product          string `json:"product"`
	Interval         string `json:"interval"`
	MaxUnits         int    `json:"maxUnits"`
	OrgName          string `json:"orgName"`
	IdentityProvider string `json:"idProvider"`
	BackingOrgName   string `json:"backingOrgName"`
}

// ValidatePulumiService performs comprehensive validation of a deployed Pulumi Service
func ValidatePulumiService(t *testing.T, config ServiceValidationConfig) {
	t.Helper()

	// Step 1: Wait for API readiness
	waitForAPIReadiness(t, config)

	// Step 2: Create test user and get access token
	accessToken := createTestUser(t, config)

	// Step 3: Test basic API endpoints
	testAPIEndpoints(t, config, accessToken)

	// Step 4: Test organization creation
	testOrganizationCreation(t, config, accessToken)

	// Step 5: Test basic stack operations (if automation API is available)
	testBasicStackOperations(t, config, accessToken)

	t.Logf("✅ Service validation completed successfully for %s", config.APIEndpoint)
}

// waitForAPIReadiness waits for the Pulumi API to become ready
func waitForAPIReadiness(t *testing.T, config ServiceValidationConfig) {
	t.Helper()

	timeout := time.After(config.Timeout)
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	statusURL := fmt.Sprintf("%s/api/status", config.APIEndpoint)
	t.Logf("⏳ Waiting for API readiness at %s", statusURL)

	for {
		select {
		case <-timeout:
			t.Fatalf("❌ Timeout waiting for API to become ready at %s", statusURL)
		case <-ticker.C:
			resp, err := http.Get(statusURL)
			if err != nil {
				t.Logf("API not ready yet: %v", err)
				continue
			}
			if err := resp.Body.Close(); err != nil {
				t.Logf("Warning: failed to close response body: %v", err)
			}

			if resp.StatusCode == http.StatusOK {
				t.Logf("✅ API is ready at %s", statusURL)
				return
			}
			t.Logf("API returned status %d, waiting...", resp.StatusCode)
		}
	}
}

// createTestUser creates a test user and returns an access token
func createTestUser(t *testing.T, config ServiceValidationConfig) string {
	t.Helper()

	// Generate unique test user for this test run with additional randomization
	timestamp := time.Now().Unix()
	randomSuffix := rand.Intn(10000)
	userID := fmt.Sprintf("%d-%04d", timestamp, randomSuffix)

	signupRequest := EmailUserSignupRequest{
		Name:      fmt.Sprintf("Pulumi Test User %d", randomSuffix),
		LoginName: fmt.Sprintf("test-user-%s", userID),
		Email:     fmt.Sprintf("test-user-%s@pulumi-test.local", userID),
		Password:  "test-password-123",
	}

	body, err := json.Marshal(signupRequest)
	assert.NoError(t, err, "marshaling signup request")

	signupURL := fmt.Sprintf("%s/api/console/email/signup", config.APIEndpoint)
	t.Logf("📝 Creating test user at %s", signupURL)

	resp, err := http.Post(signupURL, "application/json", bytes.NewReader(body))
	assert.NoError(t, err, "creating test user")
	defer func() {
		if err := resp.Body.Close(); err != nil {
			t.Logf("Warning: failed to close response body: %v", err)
		}
	}()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		t.Fatalf("❌ Failed to create test user. Status: %d, Body: %s", resp.StatusCode, string(bodyBytes))
	}

	var loginResponse LoginResponse
	bodyBytes, err := io.ReadAll(resp.Body)
	assert.NoError(t, err, "reading signup response")

	err = json.Unmarshal(bodyBytes, &loginResponse)
	assert.NoError(t, err, "unmarshaling signup response")

	assert.NotEmpty(t, loginResponse.PulumiAccessToken, "access token should not be empty")
	t.Logf("✅ Test user created successfully")

	return loginResponse.PulumiAccessToken
}

// testAPIEndpoints tests basic API endpoints
func testAPIEndpoints(t *testing.T, config ServiceValidationConfig, accessToken string) {
	t.Helper()

	endpoints := []struct {
		path   string
		method string
		desc   string
	}{
		{"/api/status", "GET", "Status endpoint"},
		{"/api/user", "GET", "User info endpoint"},
	}

	for _, endpoint := range endpoints {
		t.Run(endpoint.desc, func(t *testing.T) {
			url := fmt.Sprintf("%s%s", config.APIEndpoint, endpoint.path)
			req, err := http.NewRequest(endpoint.method, url, nil)
			assert.NoError(t, err, "creating request")

			if endpoint.path != "/api/status" {
				req.Header.Set("Authorization", fmt.Sprintf("token %s", accessToken))
			}
			req.Header.Set("Content-Type", "application/json")

			client := &http.Client{Timeout: 30 * time.Second}
			resp, err := client.Do(req)
			assert.NoError(t, err, "executing request")
			defer func() {
				if err := resp.Body.Close(); err != nil {
					t.Logf("Warning: failed to close response body: %v", err)
				}
			}()

			assert.Equal(t, http.StatusOK, resp.StatusCode,
				"endpoint %s should return 200", endpoint.path)

			t.Logf("✅ %s responded correctly", endpoint.desc)
		})
	}
}

// testOrganizationCreation tests organization creation
func testOrganizationCreation(t *testing.T, config ServiceValidationConfig, accessToken string) {
	t.Helper()

	// Add randomization to organization names to prevent conflicts
	timestamp := time.Now().Unix()
	randomSuffix := rand.Intn(10000)
	orgID := fmt.Sprintf("%d-%04d", timestamp, randomSuffix)

	orgRequest := CreateOrganizationRequest{
		Product:          "pulumi-business-critical",
		Interval:         "monthly",
		MaxUnits:         1000,
		OrgName:          fmt.Sprintf("test-org-%s", orgID),
		IdentityProvider: "pulumi",
		BackingOrgName:   fmt.Sprintf("test-org-%s", orgID),
	}

	body, err := json.Marshal(orgRequest)
	assert.NoError(t, err, "marshaling org creation request")

	url := fmt.Sprintf("%s/api/console/actions/new-organization", config.APIEndpoint)
	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	assert.NoError(t, err, "creating org creation request")

	req.Header.Set("Authorization", fmt.Sprintf("token %s", accessToken))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	assert.NoError(t, err, "executing org creation request")
	defer func() {
		if err := resp.Body.Close(); err != nil {
			t.Logf("Warning: failed to close response body: %v", err)
		}
	}()

	assert.Equal(t, http.StatusOK, resp.StatusCode,
		"organization creation should succeed")

	t.Logf("✅ Organization creation test passed")
}

// testBasicStackOperations tests basic stack operations if possible
func testBasicStackOperations(t *testing.T, config ServiceValidationConfig, accessToken string) {
	t.Helper()

	// This is a simplified test - in a full implementation, this would use
	// the Pulumi Automation API to create, update, and delete a test stack

	t.Logf("ℹ️  Basic stack operations test - placeholder for future implementation")
	t.Logf("    This would test: stack create, update, export, delete operations")
	t.Logf("    Using Pulumi Automation API against endpoint: %s", config.APIEndpoint)

	// For now, just verify we can access stack-related endpoints
	url := fmt.Sprintf("%s/api/stacks", config.APIEndpoint)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		t.Logf("⚠️  Could not create stacks API request: %v", err)
		return
	}

	req.Header.Set("Authorization", fmt.Sprintf("token %s", accessToken))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		t.Logf("⚠️  Could not access stacks API: %v", err)
		return
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			t.Logf("Warning: failed to close response body: %v", err)
		}
	}()

	if resp.StatusCode == http.StatusOK {
		t.Logf("✅ Stacks API accessible")
	} else {
		t.Logf("⚠️  Stacks API returned status %d", resp.StatusCode)
	}
}
