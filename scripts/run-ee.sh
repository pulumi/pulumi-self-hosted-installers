#!/bin/bash
# This script is the main entrypoint to running the containers required for the Pulumi platform.
# By default, this script will use the docker-compose.yml file (and an override file, if present) in the root
# directory of pulumi-ee.
#
# Any arguments passed to this script will be passed to the docker-compose CLI.
# To specify alternate compose files, simply pass the compose files using the -f flag and they will be passed
# to the `docker-compose up` command. For example,
# ./scripts/run-ee.sh -f ./all-in-one/docker-compose.yml -f ./all-in-one/docker-compose.override.yml

set -e

# PULUMI_DATA_PATH is a stable filesystem path where Pulumi will store the 
# checkpoint objects.
if [ -z "${PULUMI_DATA_PATH:-}" ]; then
    export PULUMI_DATA_PATH=/tmp/pulumi-ee/data
    echo "PULUMI_DATA_PATH was not set. Defaulting to ${PULUMI_DATA_PATH}"
fi

if [ ! -d "$PULUMI_DATA_PATH" ]; then
    mkdir -p ${PULUMI_DATA_PATH}
fi

export PULUMI_LOCAL_KEYS=${PULUMI_DATA_PATH}/localkeys
if [ -f "$PULUMI_LOCAL_KEYS" ]; then
    echo "Using local key from $PULUMI_LOCAL_KEYS"
else
    echo "Configuring new key for local object store encryption"
    head -c 32 /dev/random >$PULUMI_LOCAL_KEYS
fi

if docker network inspect pulumi-ee >/dev/null 2>&1; then
    echo "pulumi-ee network exists already"
else
    echo "Creating pulumi-ee network"
    docker network create pulumi-ee
fi

if [ -z "${PULUMI_LOCAL_DATABASE_NAME:-}" ]; then
    PULUMI_LOCAL_DATABASE_NAME=pulumi-db
fi

if [ -z "${PULUMI_LOCAL_DATABASE_PORT:-}" ]; then
    PULUMI_LOCAL_DATABASE_PORT=3306
fi

export PULUMI_DATABASE_ENDPOINT="${PULUMI_LOCAL_DATABASE_NAME}:${PULUMI_LOCAL_DATABASE_PORT}"

trap "docker-compose -f $COMPOSE_FILE stop" SIGINT SIGTERM ERR EXIT

if [ $# -eq 0 ]; then
    exec docker-compose up --build
else
    exec docker-compose "$@" up --build
fi
