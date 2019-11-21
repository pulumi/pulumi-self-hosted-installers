#!/bin/bash

# Bring the DB instance up-to-date with all current migrations.
# Set MIGRATE_AS_SUPERUSER to run migrations that require higher privileges,
# e.g. creating users.

set -o nounset -o errexit -o pipefail
cd "$(dirname "${BASH_SOURCE}")/.."

echo "Running migrations"

# Ensure that the migratecli tool is installed already.
# When this script is run inside the `pulumi/migrations` container,
# this tool is pre-installed as part of creating the container image.
which migratecli >/dev/null || {
    echo "migratecli tool not found in the PATH. Will install it now..."
    # Install the migrate tool. Use `go build -o` so we can name the binary
    # `migratecli` instead of the much less useful `cli`.
    go get -u -d github.com/mattes/migrate/cli github.com/go-sql-driver/mysql
    INSTALL_DEST=${GOBIN:-$(go env GOPATH)/bin}
    go build -tags mysql -o "${INSTALL_DEST}/migratecli" github.com/mattes/migrate/cli
    echo "Successfully installed migratecli"

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

DB_CONNECTION_STRING="mysql://${DB_USER}:${DB_PASSWORD}@tcp(${PULUMI_LOCAL_DATABASE_ENDPOINT})/pulumi"

if [ -z "${MIGRATIONS_DIR:-}" ]; then
    MIGRATIONS_DIR=migrations
fi

# Options are only recognized if they come *before* the command.
migratecli -path "${MIGRATIONS_DIR}" -database "${DB_CONNECTION_STRING}" up
