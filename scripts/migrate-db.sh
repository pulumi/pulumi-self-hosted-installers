#!/bin/bash

# Bring the DB instance up-to-date with all current migrations.
# Migrations will be executed as the password-less pulumi_service DB user unless
# MIGRATE_AS_SUPERUSER is set to true then PULUMI_LOCAL_DB_SUPERUSER and PULUMI_LOCAL_DB_PASSWORD
# are used as the credentials. PULUMI_LOCAL_DB_SUPERUSER and PULUMI_LOCAL_DB_PASSWORD, by default,
# are set to the MYSQL_ROOT_USER and MYSQL_ROOT_PASSWORD values before this script is called.
#
# Set MIGRATE_AS_SUPERUSER to run migrations that require higher privileges,
# e.g. creating users.

set -o nounset -o errexit -o pipefail
cd "$(dirname "${BASH_SOURCE}")/.."

echo "Running migrations"

# Ensure that the migratecli tool is installed already.
# When this script is run inside the `pulumi/migrations` container,
# this tool is pre-installed as part of creating the container image.
which migratecli >/dev/null || {
    echo "Building 'migratecli' from source."
    GO111MODULE=off go get -u -d github.com/golang-migrate/migrate/cmd/migrate github.com/go-sql-driver/mysql
    INSTALL_DEST=${GOBIN:-$(go env GOPATH)/bin}
    GO111MODULE=off go build -tags mysql -o "${INSTALL_DEST}/migratecli" github.com/golang-migrate/migrate/cmd/migrate

    # Ensure the version we built is on the PATH for the rest of this script
    export PATH="${INSTALL_DEST}:${PATH}"
}

DB_USER=pulumi_service
DB_PASSWORD=

# If MIGRATE_AS_SUPERUSER is not empty then use the superuser credentials from the env vars.
if [ -n "${MIGRATE_AS_SUPERUSER:-}" ]; then
    DB_USER=${PULUMI_LOCAL_DB_SUPERUSER}
    DB_PASSWORD=${PULUMI_LOCAL_DB_PASSWORD}
fi

# Check to see if we should use an alternative database endpoint.
if [ -z "${PULUMI_LOCAL_DATABASE_ENDPOINT:-}" ]; then
    PULUMI_LOCAL_DATABASE_ENDPOINT=localhost:3306
fi

# URL encode the connection string since it might contain special chars.
# See https://github.com/golang-migrate/migrate#database-urls
URL_ENCODED_DB_PASSWORD=$(python3 -c "import sys, urllib.parse as ul; \
    print (ul.quote_plus(sys.argv[1]))" "${DB_PASSWORD}")

DB_CONNECTION_STRING="mysql://${DB_USER}:${URL_ENCODED_DB_PASSWORD}@tcp(${PULUMI_LOCAL_DATABASE_ENDPOINT})/pulumi"

if [ -z "${MIGRATIONS_DIR:-}" ]; then
    MIGRATIONS_DIR=migrations
fi

# Options are only recognized if they come *before* the command.
migratecli -path "${MIGRATIONS_DIR}" -database "${DB_CONNECTION_STRING}" up
