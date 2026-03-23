# EKS Hosted — AWS Elastic Kubernetes Service

8-stage microstack deployment of the Self-Hosted Pulumi Service on Amazon EKS.
Each numbered directory is an independent Pulumi project; deploy in strict
sequence.

## Deployment sequence

| Stage | Directory | Creates |
| --- | --- | --- |
| 1 | `01-iam/` | IAM roles and policies for EKS, ALB controller, service accounts |
| 2 | `02-networking/` | VPC, subnets, security groups |
| 3 | `05-eks-cluster/` | EKS cluster, managed node groups, OIDC provider |
| 4 | `10-cluster-svcs/` | ALB ingress controller (Helm) |
| 5 | `15-state-policies-mgmt/` | S3 buckets for state and policy pack storage |
| 6 | `20-database/` | RDS Aurora MySQL cluster |
| 7 | `25-insights/` | OpenSearch domain (**optional** — Pulumi Insights license) |
| 8 | `30-esc/` | S3 bucket for ESC (**optional** — ESC license) |
| 9 | `90-pulumi-service/` | Pulumi API + Console (Kubernetes Deployments + ALB Ingress) |

Stages 25 and 30 can be skipped if not licensed. Stage 90 reads outputs from
all preceding stages.

## Key files per stage

| File | Purpose |
| --- | --- |
| `Pulumi.README.yaml` | All required and optional config keys (template — do not edit) |
| `config.ts` | Validates and exposes config via `pulumi.Config` |
| `index.ts` | Main resource deployment logic |
| `{feature}.ts` | Feature-specific modules (e.g., `encryptionService.ts`) |

## Commands (per stage directory)

- Install: `npm install`
- Type-check: `tsc --noEmit`
- Preview (safe): `pulumi preview`
- Deploy: **`pulumi up` — requires explicit user approval; runs against real AWS**
- Destroy: **`pulumi destroy` — requires explicit user approval; destructive**

## BYO (Bring-Your-Own) infrastructure — non-obvious

When BYO is configured, **still run the stack**; skipping breaks stack reference
chains. The stack creates dummy resources that re-export existing ARNs/IDs as
outputs.

BYO config example (01-iam):

```yaml
config:
  eksServiceRoleArn: arn:aws:iam::123456789012:role/existing-eks-service-role
  eksInstanceRoleArn: arn:aws:iam::123456789012:role/existing-eks-instance-role
```

## Stack references

Downstream stacks read outputs via `pulumi.StackReference`. Stack output names
are a **public contract** — renaming an output in an early stage silently breaks
all stages that consume it.

Reference format: `new pulumi.StackReference("organization/project-{stage}/stack")`

## Resource naming convention

All resources use `${baseName}-{purpose}-{disambiguator}` (e.g.,
`pulumiselfhost-eks-cluster`, `pulumiselfhost-db-subnet-group`). `baseName` is
set in config, typically `pulumiselfhost`.

## Version notes

- Kubernetes 1.31.0 as of installer v3.1 (Feb 2025)
- v3.0 migrated to managed node groups (from self-managed) — breaking change
- v3.1 migrated off deprecated `@pulumi/kubernetesx` — check README before upgrading

## Escalate immediately if

- A change renames or removes a stack output
- `pulumi preview` shows resource **replacements** in EKS cluster or database
- Changes affect both API and Console in stage 90 simultaneously
- Optional stages (25-insights, 30-esc) are involved and licensing scope is unclear

## Change triggers

| Changed | Run |
| --- | --- |
| Any `.ts` file | `tsc --noEmit` from that stage directory |
| `package.json` in any stage | `npm install` and commit `package-lock.json` |
| Stack output names in any stage | Update all downstream stages that consume that output |
| `Pulumi.README.yaml` | Do not edit — it is the config documentation template |
