#!/usr/bin/env bash
#
# Exercises the migrate-tool discovery/build logic in migrate-db.sh in
# isolation (no real database), by stubbing `migrate` and `go` on PATH.
# Guards against a regression to the old `migratecli` binary name.

set -o nounset -o errexit -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE}")" && pwd)"
MIGRATE_SCRIPT="${SCRIPT_DIR}/migrate-db.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }

# A fake `migrate` binary: logs its argv (one line, space-joined) to
# $MIGRATE_CALL_LOG and exits 0.
write_migrate_stub() {
    local dest="$1"
    cat > "${dest}" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "${MIGRATE_CALL_LOG}"
exit 0
STUB
    chmod +x "${dest}"
}

# --- scenario 1: `migrate` already on PATH -> no build step, invoked directly ---
test_preinstalled_migrate() {
    local workdir; workdir=$(mktemp -d "${TMPDIR:-/tmp}/migrate-db-test.XXXXXX")
    local bindir="${workdir}/bin"
    mkdir -p "${bindir}"
    write_migrate_stub "${bindir}/migrate"

    MIGRATE_CALL_LOG="${workdir}/calls" \
    PULUMI_LOCAL_DATABASE_NAME=pulumi \
    PATH="${bindir}:${PATH}" \
        bash "${MIGRATE_SCRIPT}" > "${workdir}/stdout" 2>&1 || {
            cat "${workdir}/stdout" >&2
            fail "script exited non-zero with 'migrate' already on PATH"
        }

    grep -q "Building 'migrate' from source" "${workdir}/stdout" && \
        fail "script tried to build migrate even though it was already on PATH"

    grep -qE '^-path .* up$' "${workdir}/calls" || \
        fail "expected a 'migrate -path ... up' invocation, got: $(cat "${workdir}/calls" 2>/dev/null || echo '<no calls>')"

    echo "PASS: pre-installed 'migrate' is used as-is (no build, no migratecli)"
}

# --- scenario 2: `migrate` missing -> falls back to `go install`, then uses the result ---
test_build_from_source() {
    local workdir; workdir=$(mktemp -d "${TMPDIR:-/tmp}/migrate-db-test.XXXXXX")
    local gobin="${workdir}/gobin"
    local gostubdir="${workdir}/gostub"
    mkdir -p "${gobin}" "${gostubdir}"

    # What `go install` "produces": reuse the same logging stub as scenario 1.
    local migrate_template="${workdir}/migrate-template"
    write_migrate_stub "${migrate_template}"

    cat > "${gostubdir}/go" <<STUB
#!/usr/bin/env bash
if [ "\$1" = "env" ] && [ "\$2" = "GOPATH" ]; then
    echo "${workdir}/gopath"
    exit 0
fi
if [ "\$1" = "install" ]; then
    mkdir -p "\${GOBIN}"
    cp "${migrate_template}" "\${GOBIN}/migrate"
    exit 0
fi
echo "unexpected go invocation: \$*" >&2
exit 1
STUB
    chmod +x "${gostubdir}/go"

    MIGRATE_CALL_LOG="${workdir}/calls" \
    GOBIN="${gobin}" \
    PULUMI_LOCAL_DATABASE_NAME=pulumi \
    PATH="${gostubdir}:${PATH}" \
        bash "${MIGRATE_SCRIPT}" > "${workdir}/stdout" 2>&1 || {
            cat "${workdir}/stdout" >&2
            fail "script exited non-zero while building 'migrate' from source"
        }

    grep -q "Building 'migrate' from source" "${workdir}/stdout" || \
        fail "expected the build-from-source path to run when 'migrate' isn't on PATH"

    [ -x "${gobin}/migrate" ] || \
        fail "go install did not produce a binary named 'migrate' (regression to 'migratecli'?)"
    [ -e "${gobin}/migratecli" ] && \
        fail "go install (or the script) produced a stray 'migratecli' binary — rename incomplete"

    grep -qE '^-path .* up$' "${workdir}/calls" || \
        fail "expected the freshly built 'migrate' binary to be invoked, got: $(cat "${workdir}/calls" 2>/dev/null || echo '<no calls>')"

    echo "PASS: build-from-source path installs and invokes 'migrate' (not 'migratecli')"
}

test_preinstalled_migrate
test_build_from_source
