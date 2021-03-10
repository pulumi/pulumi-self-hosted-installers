#!/bin/bash

# This script sets up a docker bridge network called pulumi-ee,
# then starts a MySQL v5.6 container in that network.
# Lastly, it runs migrations against the MySQL instance running in the container.

set -e

# The volume mounted can be any stable/persistent file system.
DEFAULT_DATA_PATH_BASE="${HOME}"
DEFAULT_MYSQL_DATA_PATH="${DEFAULT_DATA_PATH_BASE}/pulumi-standalone-db/data"

if [ -z "${MYSQL_DATA_PATH:-}" ]; then
    echo "MYSQL_DATA_PATH not set. Using the default volume mount path ${DEFAULT_MYSQL_DATA_PATH}."
    test -w "${DEFAULT_DATA_PATH_BASE}" || {
        echo "Tried to use the default path for the data dir but you lack write permissions to ${DEFAULT_DATA_PATH_BASE}"
        echo ""
        exit 1
    }
    export MYSQL_DATA_PATH="${DEFAULT_MYSQL_DATA_PATH}"
fi

exists=$(docker network inspect pulumi-ee)

if [ ${#exists[@]} -eq 0 ]; then
    echo "Creating pulumi-ee network"
    docker network create pulumi-ee
else
    echo "pulumi-ee network exists already"
fi

if [ -z "${MYSQL_ROOT_PASSWORD:-}" ]; then
    echo "Please set the MYSQL_ROOT_PASSWORD environment variable."
    exit 1
fi

MYSQL_CONT=$(docker ps --filter "name=pulumi-db" --format "{{.ID}}")

if [ -z "${MYSQL_CONT:-}" ]; then
    # Boot up a MySQL 5.6 database.
    MYSQL_CONT=$(docker run \
        --name pulumi-db -p 3306:3306 --rm -d \
        --network pulumi-ee \
        -e MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD}" \
        -e MYSQL_DATABASE=pulumi \
        -v "${MYSQL_DATA_PATH}":/var/lib/mysql \
        mysql:5.6)
fi

echo "MySQL container ID: $MYSQL_CONT"
echo "    to kill: docker kill $MYSQL_CONT"

# Initialize the database with our scripts.
RUN_MIGRATIONS_EXTERNALLY=true \
    ./scripts/init-db-container.sh
