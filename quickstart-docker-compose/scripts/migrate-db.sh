#!/usr/bin/env bash

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
    CLONE_DIR="${GOPATH}/src/github.com/pulumi/golang-migrate"
    git clone git@github.com:pulumi/golang-migrate.git "${CLONE_DIR}"
    pushd "${CLONE_DIR}"
    # https://github.com/golang-migrate/migrate/blob/master/CONTRIBUTING.md
    INSTALL_DEST=${GOBIN:-$(go env GOPATH)/bin}

    DATABASE=mysql SOURCE=file CLI_BUILD_OUTPUT=${INSTALL_DEST}/migratecli make build-cli
    popd

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

urlencode () {
    python3 -c "import sys, urllib.parse as ul; \
        print (ul.quote_plus(sys.argv[1]))" "$1"
}

DB_QUERY_STRING=''
# Check to see if we should connect to the database using TLS. We do this by checking to see if the DATABASE_CA_CERTIFICATE
# environment variable is set. If it is we assume the user would like to connect via TLS using the provided CA certificate.
# This environment variable needs to be set to the value of the certificate and not a filepath. This was done this way in
# order to be consistent with the way the database certificates are passed into the API service container, i.e. the value
# of the cert not the file path.
if [ -n "${DATABASE_CA_CERTIFICATE:-}" ]; then
    CA_CERT_PATH=$(mktemp -d)/cacert.pem
    echo "${DATABASE_CA_CERTIFICATE}" > ${CA_CERT_PATH}
    # Need to url encode the path
    CA_CERT_PATH=$(urlencode ${CA_CERT_PATH})
    DB_QUERY_STRING="${DB_QUERY_STRING}&tls=custom&x-tls-ca=${CA_CERT_PATH}"
fi

# If METADATA_LOCK_WAIT_TIMEOUT is set, then enable the special extensions we've added to our fork of
# pulumi/golang-migrate to support timing out if metadata locks are held for too long waiting to start
# the migration.
if [ -n "${METADATA_LOCK_WAIT_TIMEOUT:-}" ]; then
    DB_QUERY_STRING="${DB_QUERY_STRING}&x-metadata-lock-timeout=${METADATA_LOCK_WAIT_TIMEOUT}&x-metadata-lock-retries=${METADATA_LOCK_RETRIES:-20}"
fi

if [ -n "${MIGRATIONS_TABLE_NAME:-}" ]; then
    DB_QUERY_STRING="${DB_QUERY_STRING}&x-migrations-table=${MIGRATIONS_TABLE_NAME}"
fi

# URL encode the connection string since it might contain special chars.
# See https://github.com/golang-migrate/migrate#database-urls
URL_ENCODED_DB_PASSWORD=$(urlencode "${DB_PASSWORD}")

DB_CONNECTION_STRING="mysql://${DB_USER}:${URL_ENCODED_DB_PASSWORD}@tcp(${PULUMI_LOCAL_DATABASE_ENDPOINT})/${PULUMI_LOCAL_DATABASE_NAME}?${DB_QUERY_STRING}"

if [ -z "${MIGRATIONS_DIR:-}" ]; then
    MIGRATIONS_DIR=migrations
fi

skip_first_migration() {
    echo "NOTE: Skipping the first migration script. You will need to set the PULUMI_DATABASE_USER_NAME and PULUMI_DATABASE_USER_PASSWORD environment variables in the API container, to specify a custom database user name and password for your service instance."
    migratecli -path "${MIGRATIONS_DIR}" -database "${DB_CONNECTION_STRING}" force 1
}

# Force the migration to 1 if the option to skip creation of the
# pulumi_service DB user is set.
if [ -n "${SKIP_CREATE_DB_USER:-}" ]; then
    # When there is no prior migration in a database, the `version` command will fail with a "error: no migration".
    # Since this script sets errexit option at the beginning, we should ensure that the command
    # failure is captured properly or the script will stop at the first failed command. Redirecting
    # the output alone is not enough.
    current_version=$(migratecli -path "${MIGRATIONS_DIR}" -database "${DB_CONNECTION_STRING}" version 2>&1) || {
        # Skip the first migration script only if the error is because there isn't a previous
        # migration. We do a regexp search here for the string "no migration".
        if [[ "${current_version}" == *"no migration"* ]]; then
            echo "Fresh DB instance"
            skip_first_migration
        fi
    }

    if [ "${current_version}" = 0 ]; then
        echo "Migration version is 0"
        skip_first_migration
    fi
fi

# Options are only recognized if they come *before* the command.
migratecli -path "${MIGRATIONS_DIR}" -database "${DB_CONNECTION_STRING}" up
