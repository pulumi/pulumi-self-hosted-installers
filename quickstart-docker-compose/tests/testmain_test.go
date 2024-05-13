// Copyright 2016-2021, Pulumi Corporation.  All rights reserved.

package tests

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"testing"
	"time"
)

const pulumiAPIURI = "http://localhost:8080"

// emailUserSignupRequest mirrors the type defined in the service repo's
// pkg/apitype/login.go.
type emailUserSignupRequest struct {
	Name      string `json:"name"`
	LoginName string `json:"loginName"`
	Email     string `json:"email"`
	Password  string `json:"password"`

	// The reCAPTCHA response token that needs to be verified by the service.
	Token *string `json:"token,omitempty"`

	// Other fields are intentionally omitted for testing.
}

var (
	// testAccountAccessToken is the Pulumi user access token for a new
	// user created when the tests run.
	testAccountAccessToken string

	testEmailUserSignupRequest = emailUserSignupRequest{
		Name:      "Pulumi EE Test User",
		LoginName: "pulumi-self-hosted-installers-test",
		Email:     "pulumi-self-hosted-installers-test@pulumi-test.test",
		Password:  "fake-password",
	}
)

func TestMain(m *testing.M) {
	waitForPulumiAPIReadiness()

	if err := createPulumiEmailUser(); err != nil {
		panic(fmt.Sprintf("Error creating email-based user: %v", err))
	}

	os.Setenv("PULUMI_ACCESS_TOKEN", testAccountAccessToken)

	exitCode := m.Run()
	os.Exit(exitCode)
}

func waitForPulumiAPIReadiness() {
	timeout := false
	time.AfterFunc(120*time.Second, func() {
		timeout = true
	})
	fmt.Println("Checking if Pulumi API is ready...")
	for {
		resp, err := http.Get(fmt.Sprintf("%s/api/status", pulumiAPIURI))
		if err != nil {
			panic("Failed calling the API's status endpoint")
		}

		if resp.StatusCode == http.StatusOK {
			fmt.Println("Got 200 status code from /api/status!")
			break
		}
		if timeout {
			panic("Timed out waiting for the API's status endpoint to become ready")
		}
		fmt.Println("Sleeping before trying again...")
		time.Sleep(5 * time.Second)
	}
}

type loginWithGitHubResponse struct {
	PulumiAccessToken string `json:"pulumiAccessToken"`

	// Other fields are intentionally omitted since we don't need them at this time.
}

func createPulumiEmailUser() error {
	b, err := json.Marshal(testEmailUserSignupRequest)
	if err != nil {
		return fmt.Errorf("marshaling signup request %w", err)
	}

	emailUserSignupEndpoint := fmt.Sprintf("%s/api/console/email/signup", pulumiAPIURI)
	resp, err := http.Post(emailUserSignupEndpoint, "application/json", bytes.NewReader(b))
	if err != nil {
		return fmt.Errorf("creating test user: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected response status code: %v", resp.StatusCode)
	}

	var signupResponse loginWithGitHubResponse
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("reading response from signup request: %w", err)
	}

	if err := json.Unmarshal(body, &signupResponse); err != nil {
		return fmt.Errorf("unmarshaling the response body: %w", err)
	}

	testAccountAccessToken = signupResponse.PulumiAccessToken

	return nil
}
