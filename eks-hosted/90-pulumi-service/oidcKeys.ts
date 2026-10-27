import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as tls from "@pulumi/tls";

/**
 * An RSA signing key for one of the Pulumi Service's OIDC issuers. Mirrors the `WebKey` component that Pulumi's SaaS
 * infrastructure uses to seed the same environment variables.
 *
 * Both child resources are protected: replacing either one rotates the issuer's signing key, and tokens signed with
 * the old key stop verifying.
 */
export class OidcWebKey extends pulumi.ComponentResource {
    public readonly keyId: pulumi.Output<string>;
    public readonly privateKeyPem: pulumi.Output<string>;

    constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
        super("selfhosted:oidc:WebKey", name, {}, opts);

        const keyId = new random.RandomId(`${name}-key-id`, {
            byteLength: 32,
        }, { parent: this, protect: true });
        this.keyId = keyId.hex;

        // privateKeyPem is PKCS#1 ("RSA PRIVATE KEY"), the only PEM type the service accepts.
        const keyPair = new tls.PrivateKey(`${name}-key-pair`, {
            algorithm: "RSA",
            rsaBits: 4096,
        }, { parent: this, protect: true });
        this.privateKeyPem = keyPair.privateKeyPem;

        this.registerOutputs({ keyId: this.keyId });
    }
}

/** The values of the Pulumi Service's two OIDC signing key set environment variables. */
export interface OidcKeySets {
    /** The value of OIDC_KEYS, which signs tokens for the v1 issuer at `/oidc`. */
    v1: pulumi.Output<string>;
    /** The value of OIDC_KEYS_V2, which signs tokens for the v2 issuer at `/oidc/v2`. */
    v2: pulumi.Output<string>;
}

/**
 * Generates one signing key for each of the Pulumi Service's OIDC issuers and serializes each into the
 * `[{"kid":...,"privateKeyPem":...}]` document that the service parses from OIDC_KEYS and OIDC_KEYS_V2.
 *
 * Without OIDC_KEYS the service creates a v1 key in its database on first use, but it never creates a v2 key, so the
 * v2 issuer (and the OIDC providers that sign with it) only work when OIDC_KEYS_V2 is set.
 */
export function createOidcKeySets(): OidcKeySets {
    return {
        v1: keySetJSON([new OidcWebKey("oidc-jwk-0")]),
        v2: keySetJSON([new OidcWebKey("oidc-v2-jwk-0")]),
    };
}

function keySetJSON(keys: OidcWebKey[]): pulumi.Output<string> {
    const keySet = pulumi.all(keys.map((k) => ({ kid: k.keyId, privateKeyPem: k.privateKeyPem })));
    return pulumi.secret(keySet.apply((ks) => JSON.stringify(ks)));
}
