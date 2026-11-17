/*
Optional outbound HTTP proxy for the Pulumi API (config httpsProxy / noProxy).
The API reaches the internet, eg- an OIDC issuer's JWKS, only through the proxy. Everything inside the VPC and every AWS
endpoint it uses stays off the proxy through NO_PROXY.
*/
export interface ProxySettings {
    // value for HTTPS_PROXY and HTTP_PROXY; private mode opens its port (proxyPort) to the VPC CIDR blocks
    url: string;
    // value for NO_PROXY
    noProxy: string;
}

export interface ProxyArgs {
    httpsProxy: string;
    extraNoProxy: string[];
    region: string;
    vpcCidrBlocks: string[];
    dbClusterEndpoint: string;
    openSearchEndpoint?: string;
    apiHost: string;
    consoleHost: string;
}

// Validates the httpsProxy config value; called while reading config so a bad value fails before any resource is created
export function parseProxyUrl(value: string | undefined): string | undefined {
    if (!value) {
        return undefined;
    }

    let proxyUrl: URL;
    try {
        proxyUrl = new URL(value);
    } catch {
        throw new Error(`httpsProxy must be a URL such as http://proxy.internal:3128, got "${value}"`);
    }
    if (proxyUrl.protocol !== "http:" && proxyUrl.protocol !== "https:") {
        throw new Error(`httpsProxy must use http:// or https://, got "${value}"`);
    }

    return value;
}

// TCP port of a proxy URL: the explicit port, else the scheme default (http 80, https 443)
export function proxyPort(url: string): number {
    const proxyUrl = new URL(url);
    return proxyUrl.port !== "" ? Number(proxyUrl.port) : proxyUrl.protocol === "https:" ? 443 : 80;
}

export function buildProxySettings(args: ProxyArgs): ProxySettings {
    const entries = [
        "localhost",
        "127.0.0.1",
        // EC2 instance metadata, and ECS task metadata and credentials; the AWS SDK fetches task role credentials here
        "169.254.169.254",
        "169.254.170.2",
        ...args.vpcCidrBlocks,
        // AWS endpoints the API calls, reached through the S3 gateway endpoint and interface endpoints
        "s3.amazonaws.com",
        `s3.${args.region}.amazonaws.com`,
        `kms.${args.region}.amazonaws.com`,
        `secretsmanager.${args.region}.amazonaws.com`,
        hostOf(args.dbClusterEndpoint),
        ...(args.openSearchEndpoint ? [hostOf(args.openSearchEndpoint)] : []),
        args.apiHost,
        args.consoleHost,
        ...args.extraNoProxy,
    ];

    return {
        url: args.httpsProxy,
        noProxy: [...new Set(entries.filter(entry => entry !== ""))].join(","),
    };
}

// hostname of a URL or host[:port]
function hostOf(endpoint: string): string {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(endpoint) ? endpoint : `tcp://${endpoint}`;
    try {
        return new URL(withScheme).hostname;
    } catch {
        return endpoint;
    }
}
