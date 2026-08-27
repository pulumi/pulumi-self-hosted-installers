# Self-Hosted Pulumi Service Installers

[![Latest images](https://github.com/pulumi/pulumi-self-hosted-installers/actions/workflows/test-latest-images.yml/badge.svg?branch=master)](https://github.com/pulumi/pulumi-self-hosted-installers/actions/workflows/test-latest-images.yml)

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

### Code Review

Review guidance lives in `AGENTS.md` files: the root `AGENTS.md` covers repository-wide
concerns, and each platform directory (`eks-hosted/`, `ecs-hosted/`, `aks-hosted/`,
`gke-hosted/`, `components-microstacks/`) carries its own with a platform-specific
"Code Review Guidance" section. AI reviewers and coding agents pick these up
automatically; human reviewers can use the same checklists.
