# Pulumi Self-Hosted Installers

Pulumi IaC installers for the Self-Hosted Pulumi Service on AWS (EKS, ECS),
Azure (AKS), and Google Cloud (GKE), plus Docker Compose quick-start options.
Each platform is a multi-stage Pulumi project; stages must be deployed in
numbered order.

## Start here

- `AGENTS.md` — this file
- `eks-hosted/AGENTS.md` — EKS-specific guidance (8-stage architecture)
- `ecs-hosted/AGENTS.md` — ECS guidance (dual TypeScript + Go implementations)
- `quickstart-docker-compose/AGENTS.md` — Docker quick-start and integration tests
- `components-microstacks/` — shared Kubernetes TypeScript components (EKS + others)
- `package.json` — root dev tools (markdown lint, mermaid validation/generation)

## Platform map

| Directory | Platform | Language | Stages |
| --- | --- | --- | --- |
| `eks-hosted/` | AWS EKS | TypeScript | 8 (01→02→05→10→15→20→25→30→90) |
| `ecs-hosted/ts/` | AWS ECS | TypeScript | 3 (infrastructure→application→dns) |
| `ecs-hosted/go/` | AWS ECS | Go | 3 (infrastructure→application→dns) |
| `aks-hosted/` | Azure AKS | TypeScript | 3 (01→02→03) |
| `gke-hosted/` | Google GKE | TypeScript | 3 (01→02→03) |
| `quickstart-docker-compose/` | Docker | N/A | All-in-one |
| `local-docker/` | Docker (single node) | TypeScript | 1 |
| `byo-infra/` | Multi-cloud | TypeScript | 3 |
| `components-microstacks/` | Shared K8s components | TypeScript | — |

## Command canon

### Documentation (root only)

- Lint markdown: `npm run lint`
- Validate mermaid diagrams: `npm run validate:standalone`
- Generate SVG diagrams: `npm run generate:diagrams`

### TypeScript stages (per stage directory)

- Install deps: `npm install`
- Type-check: `tsc --noEmit`
- Preview deployment: `pulumi preview` (safe, read-only)

### Go (root module at `ecs-hosted/go/`, `quickstart-docker-compose/tests/`)

- Format: `go fmt ./...`
- Vet: `go vet ./...`
- Unit tests: `go test ./common/` from `ecs-hosted/go/`
- Integration tests: `go test -tags=minio ./...` from `quickstart-docker-compose/tests/`
  (requires running service — see `quickstart-docker-compose/AGENTS.md`)

## Forbidden actions

- `pulumi up` — deploys real cloud infra; **never run without explicit user approval**
- `pulumi destroy` — destroys real cloud infra; **never run without explicit user approval**
- Edit `.svg` files directly — they are generated from `.mmd` sources
- Edit `node_modules/` or `package-lock.json` by hand — use `npm install`
- Skip `npm run validate:standalone` before committing `.mmd` changes
- Run `go test` in `quickstart-docker-compose/tests/` without a running service
- Modify `components-microstacks/` without noting that EKS stage 90 consumes it

## Architecture

### Multi-stage deployment pattern

Each stage is an **independent** Pulumi project (own `Pulumi.yaml`,
`package.json`/`go.mod`). Stages pass values to subsequent stages via
`pulumi.StackReference`. Renaming a stage's output breaks all downstream stages.

### BYO (Bring-Your-Own) infrastructure — non-obvious

When a user provides existing infrastructure (existing VPC, IAM roles, S3
buckets), the pattern is:

1. **Still run the installer stack** — never skip it
2. Provide existing resource IDs in config
3. The stack creates "dummy" placeholder resources and re-exports existing values
4. Downstream stacks consume outputs normally (unaware of BYO vs real)

Supported BYO: EKS 01-iam (roles), 02-networking (VPC),
15-state-policies-mgmt (S3), 30-esc (S3).

### Diagram update workflow

1. Edit `.mmd` file in the platform's `diagrams/` directory
2. `npm run validate:standalone` — check syntax
3. `npm run generate:diagrams` — regenerate all `.svg` files
4. Commit both `.mmd` and `.svg` files

### Mermaid diagram standards

| Property | Value |
| --- | --- |
| Look/theme | `neo` / `base` (YAML frontmatter, not `%%{init}%%`) |
| Pulumi blue | `#4d5bd9` |
| Pulumi yellow | `#f7bf2a` |
| AWS orange | `#FF9900` |
| Azure blue | `#0078D4` |
| GCP blue | `#4285F4` |
| Border width | `stroke-width:4px` |
| Typography | `font-weight:bold` on all class definitions |

### Domain requirements

Every deployment needs two DNS entries: `api.{domain}` (Pulumi API) and
`app.{domain}` (Pulumi Console).

## Escalate immediately if

- A change modifies stack output names — downstream stacks break silently
- A change touches `components-microstacks/` — multiple platforms depend on it
- `pulumi preview` shows unexpected resource **replacements**
- Requirements are ambiguous about which platform or stage is in scope
- Integration tests require `PULUMI_LICENSE_KEY` you don't have

## Generated code

| Generated file | Source | Regenerate |
| --- | --- | --- |
| `{platform}/diagrams/*.svg` | `{platform}/diagrams/*.mmd` | `npm run generate:diagrams` |
| TypeScript compiled JS | `*.ts` | `tsc` per stage |

## Change triggers

| Changed file/pattern | Run |
| --- | --- |
| Any `.mmd` file | `npm run validate:standalone && npm run generate:diagrams` |
| Any `.md` file | `npm run lint` |
| Any `.ts` file in a stage | `tsc --noEmit` from that stage directory |
| Any `.go` in `ecs-hosted/go/` | `go fmt ./... && go vet ./... && go test ./common/` from `ecs-hosted/go/` |
| `package.json` in any stage | `npm install` and commit `package-lock.json` |
| `go.mod` or `go.sum` | `go mod tidy` and commit both |
| `components-microstacks/*.ts` | `tsc --noEmit` in `components-microstacks/` and notify reviewer |

## Nested AGENTS.md files

- `eks-hosted/AGENTS.md` — 8-stage sequence, BYO scenarios, version matrix
- `ecs-hosted/AGENTS.md` — dual TypeScript + Go, Go ARN partition handling
- `quickstart-docker-compose/AGENTS.md` — Docker all-in-one, integration test requirements
