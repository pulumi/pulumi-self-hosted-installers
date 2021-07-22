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
    CLONE_DIR="${GOPATH}/src/github.com/pulumi/golang-migrate"
    git clone git@github.com:pulumi/golang-migrate.git "${CLONE_DIR}"
    pushd "${CLONE_DIR}"
    # https://github.com/golang-migrate/migrate/blob/master/CONTRIBUTING.md
    INSTALL_DEST=${GOBIN:-$(go env GOPATH)/bin}

    # If GOOS (read Go OS) is not set, then try and determine if this is a linux-like environment.
    if [ -z "${GOOS:-}" ]; then
        case $(uname) in
            "Linux") GOOS="linux";;
            "Darwin") GOOS="darwin";;
            *)
                echo "Unknown OS"
                exit 1
                ;;
        esac
    fi

    GOOS="${GOOS}" DATABASE=mysql SOURCE=file CLI_BUILD_OUTPUT=${INSTALL_DEST}/migratecli make build-cli
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

DB_QUERY_STRING=
# Check to see if we should connect to the database using TLS. We do this by checking to see if the DATABASE_CA_CERTIFICATE
# environment variable is set. If it is we assume the user would like to connect via TLS using the provided CA certificate.
# This environment variable needs to be set to the value of the certificate and not a filepath. This was done this way in
# order to be consistent with the way the database certificates are passed into the API service container, i.e. the value
# of the cert not the file path. As now this relies on a fork of the golang-migrate tool - github.com/pulumi/golang-migrate
# that we made to put in a fix to enable this functionality. We will attempt to get the fix merged to the upstream repo in
# the future.
if [ ! -z "${DATABASE_CA_CERTIFICATE:-}" ]; then
    echo "${DATABASE_CA_CERTIFICATE}" > cacert.pem
    DB_QUERY_STRING="?tls=custom&x-tls-ca=cacert.pem"
fi

# URL encode the connection string since it might contain special chars.
# See https://github.com/golang-migrate/migrate#database-urls
URL_ENCODED_DB_PASSWORD=$(python3 -c "import sys, urllib.parse as ul; \
    print (ul.quote_plus(sys.argv[1]))" "${DB_PASSWORD}")

DB_CONNECTION_STRING="mysql://${DB_USER}:${URL_ENCODED_DB_PASSWORD}@tcp(${PULUMI_LOCAL_DATABASE_ENDPOINT})/pulumi${DB_QUERY_STRING}"

if [ -z "${MIGRATIONS_DIR:-}" ]; then
    MIGRATIONS_DIR=migrations
fi

# Force the migration to 1 if the option to skip creation of the
# pulumi_service DB user is set.
if [ -n "${SKIP_CREATE_DB_USER:-}" ]; then
    current_version=$(migratecli -path "${MIGRATIONS_DIR}" -database "${DB_CONNECTION_STRING}")
    if [ "${current_version}" = "0" ]; then
        echo "NOTE: Skipping the first migration script. You will need to set the PULUMI_DATABASE_USER_NAME and PULUMI_DATABASE_USER_PASSWORD environment variables in the API container, to specify a custom database user name and password for your service instance."
        migratecli -path "${MIGRATIONS_DIR}" -database "${DB_CONNECTION_STRING}" force 1
    else
        echo "Current migration version is not 0. Will not force version to 1."
    fi
fi

# Options are only recognized if they come *before* the command.
migratecli -path "${MIGRATIONS_DIR}" -database "${DB_CONNECTION_STRING}" up
