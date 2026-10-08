package service

import (
	"encoding/json"

	"github.com/pulumi/pulumi-random/sdk/v4/go/random"
	"github.com/pulumi/pulumi-tls/sdk/v5/go/tls"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

// OidcWebKey is an RSA signing key for one of the Pulumi Service's OIDC issuers. It mirrors the WebKey component that
// Pulumi's SaaS infrastructure uses to seed the same environment variables.
//
// Both child resources are protected: replacing either one rotates the issuer's signing key, and tokens signed with
// the old key stop verifying.
type OidcWebKey struct {
	pulumi.ResourceState

	KeyID         pulumi.StringOutput
	PrivateKeyPem pulumi.StringOutput
}

// NewOidcWebKey creates one OIDC signing key: a random 32-byte key ID and an RSA 4096 key pair.
func NewOidcWebKey(ctx *pulumi.Context, name string, opts ...pulumi.ResourceOption) (*OidcWebKey, error) {
	var resource OidcWebKey

	err := ctx.RegisterComponentResource("selfhosted:oidc:WebKey", name, &resource, opts...)
	if err != nil {
		return nil, err
	}

	childOpts := []pulumi.ResourceOption{pulumi.Parent(&resource), pulumi.Protect(true)}

	keyID, err := random.NewRandomId(ctx, name+"-key-id", &random.RandomIdArgs{
		ByteLength: pulumi.Int(32),
	}, childOpts...)
	if err != nil {
		return nil, err
	}

	// PrivateKeyPem is PKCS#1 ("RSA PRIVATE KEY"), the only PEM type the service accepts.
	keyPair, err := tls.NewPrivateKey(ctx, name+"-key-pair", &tls.PrivateKeyArgs{
		Algorithm: pulumi.String("RSA"),
		RsaBits:   pulumi.Int(4096),
	}, childOpts...)
	if err != nil {
		return nil, err
	}

	resource.KeyID = keyID.Hex
	resource.PrivateKeyPem = keyPair.PrivateKeyPem

	err = ctx.RegisterResourceOutputs(&resource, pulumi.Map{
		"keyId": keyID.Hex,
	})
	if err != nil {
		return nil, err
	}

	return &resource, nil
}

// OidcKeySets holds the values of the Pulumi Service's two OIDC signing key set environment variables.
type OidcKeySets struct {
	// V1 is the value of OIDC_KEYS, which signs tokens for the v1 issuer at /oidc.
	V1 pulumi.StringOutput
	// V2 is the value of OIDC_KEYS_V2, which signs tokens for the v2 issuer at /oidc/v2.
	V2 pulumi.StringOutput
}

// NewOidcKeySets generates one signing key for each of the Pulumi Service's OIDC issuers and serializes each into the
// [{"kid":...,"privateKeyPem":...}] document that the service parses from OIDC_KEYS and OIDC_KEYS_V2.
//
// Without OIDC_KEYS the service creates a v1 key in its database on first use, but it never creates a v2 key, so the
// v2 issuer (and the OIDC providers that sign with it) only work when OIDC_KEYS_V2 is set.
func NewOidcKeySets(ctx *pulumi.Context) (*OidcKeySets, error) {
	v1, err := newOidcKeySet(ctx, "oidc-jwk-0")
	if err != nil {
		return nil, err
	}

	v2, err := newOidcKeySet(ctx, "oidc-v2-jwk-0")
	if err != nil {
		return nil, err
	}

	return &OidcKeySets{V1: v1, V2: v2}, nil
}

type oidcKeySetEntry struct {
	KeyID         string `json:"kid"`
	PrivateKeyPem string `json:"privateKeyPem"`
}

func newOidcKeySet(ctx *pulumi.Context, name string) (pulumi.StringOutput, error) {
	key, err := NewOidcWebKey(ctx, name)
	if err != nil {
		return pulumi.StringOutput{}, err
	}

	keySet := pulumi.All(key.KeyID, key.PrivateKeyPem).ApplyT(func(args []any) (string, error) {
		entries := []oidcKeySetEntry{{KeyID: args[0].(string), PrivateKeyPem: args[1].(string)}}
		bytes, err := json.Marshal(entries)
		return string(bytes), err
	}).(pulumi.StringOutput)

	return pulumi.ToSecret(keySet).(pulumi.StringOutput), nil
}
