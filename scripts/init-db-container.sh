#!/bin/bash

# This script update a DB instance running inside a
# container by running the DB migrations against it.

set -e

echo "Waiting for MySQL to come alive ..."

if [ -z "${MYSQL_ROOT_USERNAME:-}" ]; then
    MYSQL_ROOT_USERNAME=root
fi

# If RUN_MIGRATIONS_EXTERNALLY is set to true, that means the user is providing their own DB.
# We will run the migrations against provided instance by connecting to it externally.
# Connecting to a DB that the user is providing themselves requires the MYSQL_ROOT_PASSWORD.
if [ -z "${RUN_MIGRATIONS_EXTERNALLY:-}" ]; then
    if [ -z "${PULUMI_DATABASE_PING_ENDPOINT:-}" ]; then
        PULUMI_DATABASE_PING_ENDPOINT=pulumi-db
    fi
    while ! mysqladmin ping -h ${PULUMI_DATABASE_PING_ENDPOINT} --user=${MYSQL_ROOT_USERNAME} --password=${MYSQL_ROOT_PASSWORD} --silent; do sleep 1; done
else
    while ! mysqladmin ping -h 0.0.0.0 --user=${MYSQL_ROOT_USERNAME} --password=${MYSQL_ROOT_PASSWORD} --silent; do sleep 1; done
fi
echo "MySQL is running!"

if [ -z "${PULUMI_DATABASE_ENDPOINT:-}" ]; then
    echo "Please set the PULUMI_DATABASE_ENDPOINT environment variable."
    exit 1
fi

# Initialize the database with our scripts.
PULUMI_LOCAL_DB_SUPERUSER=$MYSQL_ROOT_USERNAME \
    PULUMI_LOCAL_DB_PASSWORD=$MYSQL_ROOT_PASSWORD \
    MIGRATE_AS_SUPERUSER=true \
    PULUMI_LOCAL_DATABASE_ENDPOINT=$PULUMI_DATABASE_ENDPOINT \
    ./scripts/migrate-db.sh

echo "Database migrations completed!"
