package tests

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

// assertRequestWithBodySuccess issues an HTTP request to the provided path and asserts that the response
// has a 200 status code, and non-zero response body. It then returns the response for further assertions.
func assertRequestWithBodySuccess(t *testing.T, method, path string, reqBody any, respCode int) *http.Response {
	pulumiAPI := pulumiAPIURI
	pulumiAPI = strings.TrimRight(pulumiAPI, "/")
	path = strings.TrimLeft(path, "/")
	url := fmt.Sprintf("%s/api/%s", pulumiAPI, path)

	body := bytes.NewBuffer(nil)
	if reqBody != nil {
		bodyBytes, err := json.Marshal(reqBody)
		if err != nil {
			t.Errorf("Error marshalling request body: %v", err)
			return nil
		}
		body = bytes.NewBuffer(bodyBytes)
	}

	t.Logf("%s %s", method, url)
	req, err := http.NewRequest(method, url, body)
	assert.NoError(t, err, "creating HTTP request")

	// Apply credentials if provided.
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("token %s", testAccountAccessToken))

	client := &http.Client{}
	resp, err := client.Do(req)
	assert.NoError(t, err, "executing HTTP request")

	if resp == nil {
		t.Errorf("Got nil response")
		return nil
	}

	if resp.StatusCode != respCode {
		bodyBytes, err := ioutil.ReadAll(resp.Body)
		assert.NoError(t, err)
		t.Errorf("Got unexpected status code (%d). Response body:\n%v", resp.StatusCode, string(bodyBytes))
		return nil
	}
	return resp
}
