#!/usr/bin/env bash
# This script is the main starting point for the quickstart solutions for self-hosted Pulumi Service.
# By default, this script will use the docker-compose.yml file (and an override file, if present) in the root
# directory of pulumi-self-hosted-installers.
#
# Any arguments passed to this script will be passed to the docker-compose CLI.
# To specify alternate compose files, simply pass the compose files using the -f flag and they will be passed
# to the `docker-compose up` command. For example,
# ./scripts/run-ee.sh -f ./all-in-one/docker-compose.yml -f ./all-in-one/docker-compose.override.yml

set -e

# Any args passed to this script will be passed to the docker-compose command
# at the end of this script.
#
# Run `docker-compose --help` to see which args can be passed.
DOCKER_COMPOSE_ARGS=$@

DEFAULT_DATA_PATH_BASE="${HOME}"
DEFAULT_DATA_PATH="${DEFAULT_DATA_PATH_BASE}/pulumi-self-hosted-installers/data"

if [ -z "${PULUMI_LICENSE_KEY:-}" ]; then
    echo "Please set PULUMI_LICENSE_KEY. If you don't have a license key, please contact sales@pulumi.com."
    exit 1
fi

# PULUMI_DATA_PATH is a stable filesystem path where Pulumi will store the
# checkpoint objects.
if [ -z "${PULUMI_DATA_PATH:-}" ]; then
    echo "PULUMI_DATA_PATH was not set. Defaulting to ${DEFAULT_DATA_PATH}"
    test -w "${DEFAULT_DATA_PATH_BASE}" || {
        echo "Error: Tried to use the default path for the data dir but you lack write permissions to ${DEFAULT_DATA_PATH_BASE}"
        echo ""
        exit 1
    }
    export PULUMI_DATA_PATH="${DEFAULT_DATA_PATH}"
fi

if [ ! -d "${PULUMI_DATA_PATH}" ]; then
    mkdir -p "${PULUMI_DATA_PATH}"
    chmod 777 "${PULUMI_DATA_PATH}"
fi

export PULUMI_LOCAL_KEYS=${PULUMI_DATA_PATH}/localkeys
if [ -f "$PULUMI_LOCAL_KEYS" ]; then
    echo "Using local key from $PULUMI_LOCAL_KEYS"
else
    echo "Configuring new key for local object store encryption"
    head -c 32 /dev/random >$PULUMI_LOCAL_KEYS
    chmod 644 $PULUMI_LOCAL_KEYS
fi

# Prints a one-key OIDC key set: [{"kid":"<hex>","privateKeyPem":"<PEM>"}].
generate_oidc_key_set() {
    local pem
    # The service accepts only a PKCS#1 PEM. OpenSSL 3 needs -traditional for that; LibreSSL and OpenSSL 1.1 reject
    # the flag but emit PKCS#1 by default.
    pem=$(openssl genrsa -traditional 4096 2>/dev/null || openssl genrsa 4096 2>/dev/null) || return 1
    case "${pem}" in
        "-----BEGIN RSA PRIVATE KEY-----"*) ;;
        *) return 1 ;;
    esac
    local kid
    kid=$(openssl rand -hex 32) || return 1
    local pem_json
    pem_json=$(printf '%s\n' "${pem}" | awk 'BEGIN { ORS = "\\n" } { print }')
    printf '[{"kid":"%s","privateKeyPem":"%s"}]' "${kid}" "${pem_json}"
}

# OIDC_KEYS and OIDC_KEYS_V2 hold the signing keys for the API's v1 (/oidc) and v2 (/oidc/v2) OIDC issuers. Each is
# generated once into PULUMI_DATA_PATH and reused; a value already set in the environment wins.
seed_oidc_key_set() {
    local var_name="$1"
    local key_file="$2"
    if [ -n "${!var_name:-}" ]; then
        echo "Using ${var_name} from the environment"
        return
    fi
    if [ ! -f "${key_file}" ]; then
        if ! command -v openssl >/dev/null 2>&1; then
            echo "openssl not found; leaving ${var_name} unset"
            return
        fi
        echo "Generating new OIDC signing key for ${var_name}"
        local key_set
        if ! key_set=$(generate_oidc_key_set); then
            echo "Could not generate an RSA key with openssl; leaving ${var_name} unset"
            return
        fi
        (umask 077 && printf '%s' "${key_set}" >"${key_file}")
    fi
    local value
    value=$(cat "${key_file}")
    if [ -z "${value}" ]; then
        echo "Error: ${key_file} is empty. Delete it to generate a new key."
        exit 1
    fi
    export "${var_name}=${value}"
}

seed_oidc_key_set OIDC_KEYS "${PULUMI_DATA_PATH}/oidc-keys.json"
seed_oidc_key_set OIDC_KEYS_V2 "${PULUMI_DATA_PATH}/oidc-keys-v2.json"

if docker network inspect pulumi-self-hosted-installers >/dev/null 2>&1; then
    echo "pulumi-self-hosted-installers network exists already"
else
    echo "Creating pulumi-self-hosted-installers network"
    docker network create pulumi-self-hosted-installers
fi

if [ -z "${PULUMI_LOCAL_DATABASE_HOST:-}" ]; then
    PULUMI_LOCAL_DATABASE_HOST=pulumi-db
fi

if [ -z "${PULUMI_LOCAL_DATABASE_PORT:-}" ]; then
    PULUMI_LOCAL_DATABASE_PORT=3306
fi

export PULUMI_DATABASE_ENDPOINT="${PULUMI_LOCAL_DATABASE_HOST}:${PULUMI_LOCAL_DATABASE_PORT}"

if [ -z "${PULUMI_SEARCH_HOST:-}" ]; then
    PULUMI_SEARCH_HOST="http://opensearch"
fi

if [ -z "${PULUMI_SEARCH_PORT:-}" ]; then
    PULUMI_SEARCH_PORT=9200
fi

export PULUMI_SEARCH_DOMAIN="${PULUMI_SEARCH_HOST}:${PULUMI_SEARCH_PORT}"

if [ -z "${PULUMI_SEARCH_USER:-}" ]; then
    export PULUMI_SEARCH_USER=admin
fi

if [ -z "${PULUMI_SEARCH_PASSWORD:-}" ]; then
    export PULUMI_SEARCH_PASSWORD=admin
fi

if [[ -z "${PULUMI_LOCAL_OBJECTS:-}" ]] && [[ -z "${PULUMI_CHECKPOINT_BLOB_STORAGE_ENDPOINT:-}" ]]; then
    echo "Checkpoint object storage configuration not found. Defaulting to local path..."
    export PULUMI_LOCAL_OBJECTS="${PULUMI_DATA_PATH}/checkpoints"
fi
if [ -n "${PULUMI_LOCAL_OBJECTS:-}" ]; then
    if [ ! -d "${PULUMI_LOCAL_OBJECTS}" ]; then
        mkdir -p "${PULUMI_LOCAL_OBJECTS}"
        chmod 777 "${PULUMI_LOCAL_OBJECTS}"
    fi
fi

if [[ -z "${PULUMI_POLICY_PACK_LOCAL_HTTP_OBJECTS:-}" ]] && [[ -z "${PULUMI_POLICY_PACK_BLOB_STORAGE_ENDPOINT:-}" ]]; then
    echo "Policy pack object storage configuration not found. Defaulting to local path..."
    export PULUMI_POLICY_PACK_LOCAL_HTTP_OBJECTS="${PULUMI_DATA_PATH}/policypacks"
fi
if [ -n "${PULUMI_POLICY_PACK_LOCAL_HTTP_OBJECTS:-}" ]; then
    if [ ! -d "${PULUMI_POLICY_PACK_LOCAL_HTTP_OBJECTS}" ]; then
        mkdir -p "${PULUMI_POLICY_PACK_LOCAL_HTTP_OBJECTS}"
        chmod 777 "${PULUMI_POLICY_PACK_LOCAL_HTTP_OBJECTS}"
    fi
fi


docker_compose_stop() {
    if [ -z "${DOCKER_COMPOSE_ARGS:-}" ]; then
        docker compose stop
    else
        docker compose ${DOCKER_COMPOSE_ARGS} stop
    fi
}

trap docker_compose_stop SIGINT SIGTERM ERR EXIT

if [ -z "${DOCKER_COMPOSE_ARGS:-}" ]; then
    DOCKER_BUILDKIT=1 docker compose up --build
else
    # Don't add quotes around the variable below. We might pass multiple args and the quotes
    # will make multiple args look like a single arg.
    DOCKER_BUILDKIT=1 docker compose ${DOCKER_COMPOSE_ARGS} up --build
fi
