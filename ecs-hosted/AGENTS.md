# ECS Hosted — AWS Elastic Container Service

Two parallel implementations of the 3-stage ECS Fargate deployment: `ts/`
(TypeScript) and `go/` (Go). Both target the same architecture; the Go
implementation additionally supports private load balancers for air-gapped
deployments.

## Implementation comparison

| | TypeScript (`ts/`) | Go (`go/`) |
| --- | --- | --- |
| Module system | `package.json` per stage | `go.mod` at `go/` root; `dns/` has its own `go.mod` |
| Stages | `infrastructure/`, `application/`, `dns/` | same |
| Air-gapped support | No | Yes — private NLB option |
| Unit tests | None | `common/utils_test.go` (ARN partition logic) |

## Deployment sequence (both implementations)

1. `infrastructure/` — VPC, Aurora MySQL, ALB/NLB, VPC Endpoints
2. `application/` — ECS Fargate services (API, Console, Migrations)
3. `dns/` — Route53 DNS records pointing to load balancers

## Go implementation — non-obvious

### Module layout

- `go/go.mod` — root module used by `infrastructure/`, `application/`, `common/`
- `go/dns/go.mod` — separate module for the DNS stage (different dependencies)
- `go/common/` — shared utilities imported by other Go stages

### ARN partition handling

The Go implementation handles non-standard AWS partitions. In US GovCloud or
China regions, IAM policy ARNs use different prefixes:

- Standard: `arn:aws:iam::...`
- US Gov: `arn:aws-us-gov:iam::...`
- China: `arn:aws-cn:iam::...`

`GetIamPolicyArn()` in `common/utils.go` handles this translation.
**Do not hardcode `arn:aws:` prefixes in Go ECS code.**

## Commands

### TypeScript stages (from within each `ts/{stage}/` directory)

- Install: `npm install`
- Type-check: `tsc --noEmit`
- Preview: `pulumi preview`

### Go (from `ecs-hosted/go/` root)

- Format: `go fmt ./...`
- Vet: `go vet ./...`
- Unit tests: `go test ./common/` (tests ARN partition logic)
- DNS stage: `cd dns && go test ./...`

## Forbidden actions

- `pulumi up` / `pulumi destroy` — real AWS infrastructure; requires explicit user approval
- Hardcode `arn:aws:` prefix in Go code — use `GetIamPolicyArn()` from `common/`
- Modify TypeScript and Go stages in the same PR without noting the divergence

## Escalate immediately if

- A change is needed in both TypeScript and Go — clarify if both need updating
- Air-gapped/private deployment is in scope — Go only feature
- Stack output names change — breaks downstream stage references

## Change triggers

| Changed | Run |
| --- | --- |
| Any `.ts` file | `tsc --noEmit` from that stage directory |
| Any `.go` file | `go fmt ./... && go vet ./... && go test ./common/` from `ecs-hosted/go/` |
| `go/common/utils.go` | `go test ./common/` from `ecs-hosted/go/` (ARN partition tests) |
| `go/go.mod` | `go mod tidy` and commit `go.sum` |
| `go/dns/go.mod` | `cd dns && go mod tidy` and commit `dns/go.sum` |
