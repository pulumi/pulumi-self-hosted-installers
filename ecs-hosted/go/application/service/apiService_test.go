package service

import (
	"testing"

	"github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/infrastructure/application/config"
)

func envValues(env []map[string]any) map[string]string {
	values := map[string]string{}
	for _, v := range env {
		values[v["name"].(string)] = v["value"].(string)
	}
	return values
}

func TestRegistryEnvVarsOnlyWithRegistryBuckets(t *testing.T) {
	base := ApiContainerEnvironment{ApiContainerArgs: &ApiContainerServiceArgs{SamlArgs: &config.SamlArgs{}}}

	off := envValues(newApiEnvironmentVariables(base))
	for _, name := range []string{"PULUMI_REGISTRY_PUBLIC_BLOB_STORAGE_ENDPOINT", "PULUMI_REGISTRY_PRIVATE_BLOB_STORAGE_ENDPOINT"} {
		if _, ok := off[name]; ok {
			t.Errorf("%s is set without registry buckets", name)
		}
	}

	on := base
	on.RegistryPublicBucket = "registry-public"
	on.RegistryPrivateBucket = "registry-private"
	values := envValues(newApiEnvironmentVariables(on))
	if got := values["PULUMI_REGISTRY_PUBLIC_BLOB_STORAGE_ENDPOINT"]; got != "s3://registry-public" {
		t.Errorf("PULUMI_REGISTRY_PUBLIC_BLOB_STORAGE_ENDPOINT = %q, want s3://registry-public", got)
	}
	if got := values["PULUMI_REGISTRY_PRIVATE_BLOB_STORAGE_ENDPOINT"]; got != "s3://registry-private" {
		t.Errorf("PULUMI_REGISTRY_PRIVATE_BLOB_STORAGE_ENDPOINT = %q, want s3://registry-private", got)
	}
	if len(values) != len(off)+2 {
		t.Errorf("registry buckets added %d variables, want 2", len(values)-len(off))
	}
}
