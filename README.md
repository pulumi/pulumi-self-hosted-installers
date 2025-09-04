# Self-Hosted Pulumi Service Installers

This repository contains installation guides for deploying the [Self-Hosted Pulumi Service](https://www.pulumi.com/product/self-hosted/) into a variety of different target environments.  The components of the Pulumi Service and general guidance on deploying and operating the service are documented in the [Self-Hosted Pulumi Service documentation](https://www.pulumi.com/docs/guides/self-hosted/).  Each guide details how to deploy the set of supporting cloud infrastructure on which the Pulumi Service can run, as well as how to deploy the container images needed to run the Pulumi Service.

The following guides are currently available:
* Quickstart ([Docker Compose](./quickstart-docker-compose))
* AWS ([EKS](./eks-hosted) or [ECS](./ecs-hosted))
* Azure ([AKS](./aks-hosted))
* Docker ([Docker Engine](./local-docker))
* Google Cloud ([GKE](./gke-hosted))
* VMware (Coming soon!)

Learn more about how to self-host Pulumi for your organization [here](https://www.pulumi.com/docs/guides/self-hosted/).

## Contributing

### Code Review Workflows

This repository uses automated Claude AI code review workflows for quality assurance:

#### Platform-Specific Reviews
- **EKS**: `.github/workflows/claude-eks-review.yml` - Reviews changes to `eks-hosted/**`
- **ECS**: `.github/workflows/claude-ecs-review.yml` - Reviews changes to `ecs-hosted/**` 
- **AKS**: `.github/workflows/claude-aks-review.yml` - Reviews changes to `aks-hosted/**`
- **GKE**: `.github/workflows/claude-gke-review.yml` - Reviews changes to `gke-hosted/**`
- **Components**: `.github/workflows/claude-components-review.yml` - Reviews changes to `components-microstacks/**`

#### General Code Review
- **All Changes**: `.github/workflows/claude-code-review.yml` - Reviews repository-wide changes
- **Interactive**: `.github/workflows/claude.yml` - Triggered by `@claude` mentions in PR comments

#### Review Process
1. **Automatic**: Platform-specific workflows trigger on relevant path changes
2. **Manual**: Use `@claude` in PR comments for targeted reviews
3. **Scope**: Each workflow focuses on platform-specific best practices and patterns
4. **Security**: Workflows automatically exclude bot PRs (`dependabot[bot]`, `pulumi-renovate[bot]`)

For questions about the review process, see the individual workflow files in `.github/workflows/`.

