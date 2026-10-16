# Quickstart Docker Compose

See `AGENTS.md` for running the stack and its tests.

## Running images built from a pulumi-service checkout

`docker-compose.override.yml` (and `all-in-one/docker-compose.override.yml`)
run dev images instead of the published ones. pulumi-service builds its images
with Bazel, and the overrides expect them already loaded in the local docker
daemon under the tags `pulumi-local/<image>:linux-<arch>`. From a pulumi-service
checkout:

```bash
./tools/bazel run //tools/docker:load_service_linux_arm64
./tools/bazel run //tools/docker:load_console_linux_arm64
./tools/bazel run //tools/docker:load_migrations_linux_arm64   # all-in-one only
```

Use `amd64` in place of `arm64` on x86 hosts and set
`PULUMI_DEV_IMAGE_ARCH=amd64` so compose looks for the matching tag (it
defaults to `arm64`). Then pass the override file with the base file, e.g.

```bash
./scripts/run-ee.sh -f ./all-in-one/docker-compose.yml -f ./all-in-one/docker-compose.override.yml
```
