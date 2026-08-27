package service

import (
	"testing"
)

// Absent and empty are different: the console treats an unset
// PULUMI_HIDE_EMAIL_* as "show it".
func envValue(env []map[string]any, name string) (string, bool) {
	for _, e := range env {
		if e["name"] == name {
			value, ok := e["value"].(string)
			if !ok {
				return "", true
			}
			return value, true
		}
	}
	return "", false
}

func assertHideVar(t *testing.T, env []map[string]any, name string, want bool) {
	t.Helper()

	value, present := envValue(env, name)
	if present != want {
		t.Errorf("%s present = %v, want %v", name, present, want)
		return
	}
	if present && value != "true" {
		t.Errorf("%s = %q, want %q", name, value, "true")
	}
}

func TestConsoleEnvironmentVariablesEmailToggles(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		login      bool
		signup     bool
		wantLogin  bool
		wantSignup bool
	}{
		{name: "neither set", login: false, signup: false, wantLogin: false, wantSignup: false},
		{name: "login only", login: true, signup: false, wantLogin: true, wantSignup: false},
		{name: "signup only", login: false, signup: true, wantLogin: false, wantSignup: true},
		{name: "both set", login: true, signup: true, wantLogin: true, wantSignup: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			env := newConsoleEnvironmentVariables(&ConsoleContainerServiceArgs{
				HideEmailLogin:  tt.login,
				HideEmailSignup: tt.signup,
			}, "")

			assertHideVar(t, env, "PULUMI_HIDE_EMAIL_LOGIN", tt.wantLogin)
			assertHideVar(t, env, "PULUMI_HIDE_EMAIL_SIGNUP", tt.wantSignup)
		})
	}
}
