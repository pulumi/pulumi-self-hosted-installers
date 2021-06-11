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

	"github.com/pkg/errors"
)

var testAccountAccessToken string

const pulumiAPI = "http://localhost:8080"

type utmParameters struct {
	Campaign string `json:"campaign"`
	Source   string `json:"source"`
	Medium   string `json:"medium"`
}

// emailUserSignupRequest mirrors the type defined in the service repo's
// pkg/apitype/login.go.
type emailUserSignupRequest struct {
	Name      string `json:"name"`
	LoginName string `json:"loginName"`
	Email     string `json:"email"`
	Password  string `json:"password"`

	// The reCAPTCHA response token that needs to be verified by the service.
	Token *string `json:"token,omitempty"`

	// Other fields are intentionally omitted since we don't need them at this time.
}

func TestMain(m *testing.M) {
	if err := createPulumiEmailUser(); err != nil {
		panic(fmt.Sprintf("Error creating email-based user: %v", err))
	}

	exitCode := m.Run()
	os.Exit(exitCode)
}

type loginWithGitHubResponse struct {
	PulumiAccessToken string `json:"pulumiAccessToken"`

	// Other fields are intentionally omitted since we don't need them at this time.
}

func createPulumiEmailUser() error {
	emailUserSignupRequest := emailUserSignupRequest{
		Name:      "Pulumi EE Test User",
		LoginName: "pulumi-ee-test",
		Email:     "pulumi-ee-test@pulumi-test.test",
		Password:  "fake-password",
	}

	b, err := json.Marshal(emailUserSignupRequest)
	if err != nil {
		return errors.Wrap(err, "marshaling signup request")
	}

	resp, err := http.Post(pulumiAPI, "application/json", bytes.NewReader(b))
	if err != nil {
		return errors.Wrap(err, "creating test user")
	}

	if resp.StatusCode != http.StatusOK {
		return errors.Errorf("Unexpected response status code: %v", resp.StatusCode)
	}

	var signupResponse loginWithGitHubResponse
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return errors.Wrap(err, "reading response from signup request")
	}

	if err := json.Unmarshal(body, &signupResponse); err != nil {
		return errors.Wrap(err, "unmarshaling the response body")
	}

	testAccountAccessToken = signupResponse.PulumiAccessToken

	return nil
}
