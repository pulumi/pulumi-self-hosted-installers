# Pull Request

## Summary

<!-- What changed and why. Link to issue if applicable.
     Which platform(s) are affected? -->

## Validation

<!-- Commands you ran and their output. Copy-paste, don't paraphrase. -->

- [ ] `npm run lint` (markdown — no issues)
- [ ] `npm run validate:standalone` (mermaid — if `.mmd` files changed)
- [ ] `npm run generate:diagrams` + committed `.svg` files (if `.mmd` changed)
- [ ] `tsc --noEmit` (TypeScript stages affected)
- [ ] `go fmt ./... && go vet ./... && go test ./...` (Go ECS — if Go files changed)
- [ ] `pulumi preview` output reviewed (if IaC logic changed)

## Risk

<!-- What could break? Which downstream stages consume outputs from changed stages? -->

## Platform scope

<!-- Check all platforms touched by this change -->

- [ ] EKS (`eks-hosted/`)
- [ ] ECS TypeScript (`ecs-hosted/ts/`)
- [ ] ECS Go (`ecs-hosted/go/`)
- [ ] AKS (`aks-hosted/`)
- [ ] GKE (`gke-hosted/`)
- [ ] Docker Compose (`quickstart-docker-compose/`)
- [ ] Shared components (`components-microstacks/`)
- [ ] Documentation only
