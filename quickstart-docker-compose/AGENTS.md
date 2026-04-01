# Quickstart Docker Compose

All-in-one Docker Compose deployment of the Self-Hosted Pulumi Service for
local evaluation and CI testing. Also contains Go integration tests that run
against a live Pulumi Service instance.

## Important: tests require a running service

The integration tests in `tests/` connect to `http://localhost:8080`. They are
**not standalone unit tests** — they require the Pulumi Service to be running
before execution. Do not run them in isolation.

## Running the service locally

Required environment variable:

- `PULUMI_LICENSE_KEY` — without this, the service will not start

```bash
PULUMI_LICENSE_KEY=<key> ./scripts/run-ee.sh -f ./all-in-one/docker-compose.yml
```

The script waits for both the API (`localhost:8080/api/status` → 200) and
Console (`localhost:3000/index.html`) before returning.

## Running integration tests

After the service is running:

- Standard: `go test ./...` from `quickstart-docker-compose/tests/`
- With Minio object storage: `go test -tags=minio ./...` from the same directory

Minio tests require additional environment variables; see
`.github/workflows/test-with-minio.yml` for the full list.

## Test structure

| File | What it tests |
| --- | --- |
| `tests/integration_test.go` | User signup, login, stack operations via Automation API |
| `tests/orgs_test.go` | Organization management |
| `tests/policy_pack_test.go` | Policy pack upload and enforcement |
| `tests/test-pulumi-app/` | Pulumi program deployed by integration tests |
| `tests/test-policy-pack/` | Policy pack used by integration tests |

## Escalate immediately if

- `PULUMI_LICENSE_KEY` is not available — integration tests cannot run
- The Minio CI workflow fails on env var mapping — check `test-with-minio.yml`

## Change triggers

| Changed | Action |
| --- | --- |
| `docker-compose.yml` | Restart the service and verify health endpoints respond |
| `tests/*.go` | `go test ./...` (with running service) |
| `tests/test-pulumi-app/` | `go test ./...` integration tests use this app |
| `scripts/run-ee.sh` | Manual test: run the script and confirm service starts |
