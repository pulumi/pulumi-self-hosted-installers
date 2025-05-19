#!/usr/bin/env bash

# This script sets up a docker bridge network called pulumi-self-hosted-installers,
# then starts a MySQL v5.7 container in that network.
# Lastly, it runs migrations against the MySQL instance running in the container.

set -e

# The docker image used for the database.
if [ -z "${DEFAULT_DB_IMAGE:-}" ]; then
  DEFAULT_DB_IMAGE=mysql:8.0
fi

# The port which the database is exposed.
if [ -z "${MYSQL_PORT:-}" ]; then
  MYSQL_PORT=3306
fi

# The volume mounted can be any stable/persistent file system.
DEFAULT_DATA_PATH_BASE="${HOME}"
DEFAULT_MYSQL_DATA_PATH="${DEFAULT_DATA_PATH_BASE}/pulumi-standalone-db/data"

if [ -z "${MYSQL_DATA_PATH:-}" ]; then
    echo "MYSQL_DATA_PATH not set. Using the default volume mount path ${DEFAULT_MYSQL_DATA_PATH}."
    test -w "${DEFAULT_DATA_PATH_BASE}" || {
        echo "Error: Tried to use the default path for the data dir but you lack write permissions to ${DEFAULT_DATA_PATH_BASE}"
        echo ""
        exit 1
    }
    export MYSQL_DATA_PATH="${DEFAULT_MYSQL_DATA_PATH}"
fi

exists=$(docker network inspect pulumi-self-hosted-installers)

if [ ${#exists[@]} -eq 0 ]; then
    echo "Creating pulumi-self-hosted-installers network"
    docker network create pulumi-self-hosted-installers
else
    echo "pulumi-self-hosted-installers network exists already"
fi

if [ -z "${MYSQL_ROOT_PASSWORD:-}" ]; then
    echo "Please set the MYSQL_ROOT_PASSWORD environment variable."
    exit 1
fi

MYSQL_CONT=$(docker ps --filter "name=pulumi-db" --format "{{.ID}}")

if [ -z "${MYSQL_CONT:-}" ]; then
    # Boot up a MySQL 8.0 database.
    MYSQL_CONT=$(docker run \
        --name pulumi-db -p ${MYSQL_PORT}:3306 --rm -d \
        --network pulumi-self-hosted-installers \
        -e MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD}" \
        -e MYSQL_DATABASE="${PULUMI_DATABASE_NAME:-pulumi}" \
        -v "${MYSQL_DATA_PATH}":/var/lib/mysql \
       ${DEFAULT_DB_IMAGE})
fi

echo "MySQL container ID: $MYSQL_CONT"
echo "    to kill: docker kill $MYSQL_CONT"

# Initialize the database with our scripts.
RUN_MIGRATIONS_EXTERNALLY=true \
    ./quickstart-docker-compose/scripts/init-db-container.sh
