#!/usr/bin/env bash

# This script update a DB instance running inside a
# container by running the DB migrations against it.

# Set PULUMI_DATABASE_PING_ENDPOINT to be the hostname of the DB instance you wish to migrate.
# If not provided, the default value depends on a non-empty value of the
# RUN_MIGRATIONS_EXTERNALLY var.

set -e

echo "Waiting for MySQL to come alive ..."

if [ -z "${MYSQL_ROOT_USERNAME:-}" ]; then
    MYSQL_ROOT_USERNAME=root
fi

if [ -z "${MYSQL_PORT:-}" ]; then
    MYSQL_PORT=3306
fi

# If PULUMI_DATABASE_PING_ENDPOINT is not defined, then the "default" ping endpoint value
# is determined using the RUN_MIGRATIONS_EXTERNALLY var.
if [ -z "${PULUMI_DATABASE_PING_ENDPOINT:-}" ]; then
    # If RUN_MIGRATIONS_EXTERNALLY is not set then it means this script is running in a container
    # inside the same network as the DB.
    if [ -z "${RUN_MIGRATIONS_EXTERNALLY:-}" ]; then
        PULUMI_DATABASE_PING_ENDPOINT=pulumi-db
    else
        # Otherwise, the default is that the script is run on the same host as the DB that is
        # accessible on the local loopback address.
        PULUMI_DATABASE_PING_ENDPOINT="0.0.0.0"
    fi
fi

# mysqladmin has been renamed to mariadb-admin and the old name produces deprecation warnings on newer releases.
# Use mariadb-admin if present
if command -v mariadb-admin >/dev/null 2>&1; then
    while ! mariadb-admin ping -h "${PULUMI_DATABASE_PING_ENDPOINT}" -P "${MYSQL_PORT}" --user="${MYSQL_ROOT_USERNAME}" --password="${MYSQL_ROOT_PASSWORD}" --skip-ssl --silent; do sleep 1; done
# Fall back to using mysqladmin
elif command -v mysqladmin >/dev/null 2>&1; then
    while ! mysqladmin ping -h "${PULUMI_DATABASE_PING_ENDPOINT}" -P "${MYSQL_PORT}" --user="${MYSQL_ROOT_USERNAME}" --password="${MYSQL_ROOT_PASSWORD}" --silent; do sleep 1; done
else
    echo "Neither mariadb-admin nor mysqladmin is available in the PATH."
    exit 1
fi

echo "MySQL is running!"

if [ -z "${PULUMI_DATABASE_ENDPOINT:-}" ]; then
    echo "Please set the PULUMI_DATABASE_ENDPOINT environment variable."
    exit 1
fi

# Initialize the database with our scripts.
PULUMI_LOCAL_DB_SUPERUSER="${MYSQL_ROOT_USERNAME}" \
    PULUMI_LOCAL_DB_PASSWORD="${MYSQL_ROOT_PASSWORD}" \
    MIGRATE_AS_SUPERUSER=true \
    PULUMI_LOCAL_DATABASE_NAME="${PULUMI_DATABASE_NAME:-pulumi}" \
    PULUMI_LOCAL_DATABASE_ENDPOINT="${PULUMI_DATABASE_ENDPOINT}" \
    ./quickstart-docker-compose/scripts/migrate-db.sh

echo "Database migrations completed!"
