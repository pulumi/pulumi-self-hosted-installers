#!/bin/bash

# This script sets up a docker bridge network called pulumi-ee,
# then starts a MySQL v5.6 container in that network.
# Lastly, it runs migrations against the MySQL instance running in the container.

set -e

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
    # Note that this container is started with a volume option (-v) set to
    # /tmp/pulumi-db/data.
    # The volume mounted can be any stable/persistent file system.
    MYSQL_CONT=$(docker run \
        --name pulumi-db -p 3306:3306 --rm -d \
        --network pulumi-ee \
        -e MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD}" \
        -e MYSQL_DATABASE=pulumi \
        -v /tmp/pulumi-db/data:/var/lib/mysql \
        mysql:5.6)
fi

echo "MySQL container ID: $MYSQL_CONT"
echo "    to kill: docker kill $MYSQL_CONT"

# Initialize the database with our scripts.
RUN_MIGRATIONS_EXTERNALLY=true \
    ./scripts/init-db-container.sh
