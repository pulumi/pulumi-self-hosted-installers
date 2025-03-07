#!/bin/bash
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
    chmod -R 777 "${PULUMI_DATA_PATH}"
fi

export PULUMI_LOCAL_KEYS=${PULUMI_DATA_PATH}/localkeys
if [ ! -d "${PULUMI_LOCAL_KEYS}" ]; then
    mkdir -p "${PULUMI_LOCAL_KEYS}"
    chmod 777 "${PULUMI_LOCAL_KEYS}"
fi
if [ -f "$PULUMI_LOCAL_KEYS" ]; then
    echo "Using local key from $PULUMI_LOCAL_KEYS"
else
    echo "Configuring new key for local object store encryption"
    head -c 32 /dev/random >$PULUMI_LOCAL_KEYS
fi

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
if [ ! -d "${PULUMI_LOCAL_OBJECTS}" ]; then
    mkdir -p "${PULUMI_LOCAL_OBJECT}"
    chmod 777 "${PULUMI_LOCAL_OBJECTS}"
fi

if [[ -z "${PULUMI_POLICY_PACK_LOCAL_HTTP_OBJECTS:-}" ]] && [[ -z "${PULUMI_POLICY_PACK_BLOB_STORAGE_ENDPOINT:-}" ]]; then
    echo "Policy pack object storage configuration not found. Defaulting to local path..."
    export PULUMI_POLICY_PACK_LOCAL_HTTP_OBJECTS="${PULUMI_DATA_PATH}/policypacks"
fi
if [ ! -d "${PULUMI_POLICY_PACK_LOCAL_HTTP_OBJECTS}" ]; then
    mkdir -p "${PULUMI_POLICY_PACK_LOCAL_HTTP_OBJECTS}"
    chmod 777 "${PULUMI_POLICY_PACK_LOCAL_HTTP_OBJECTS}"
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
