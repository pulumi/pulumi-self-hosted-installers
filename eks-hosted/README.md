# EKS Installer

This version of the EKS installer for Pulumi self-hosted is broken into smaller, individual stacks.

This new architecture is being implemented to meet the following requirements:

- Allow users to bring their own infrastructure for sections of the solution.
  - For example IAM is managed as a separate stack since some customers cannot allow the installer to create and manage the IAM resources needed for the service infrastructure. Similarly, networking may be handled by a different team, etc.
- Support mixing and matching capabilities based on the license. Different features such as insights, ESC, deployments etc. require their own infrastructure.
- Make it easier to maintain and test the overall solution. By breaking the overall deployment into smaller stacks, it makes it easier to test the different parts of the solution since individual stacks can be upped and destroyed.

This architecture does impose some design requirements:

- Make each stack as self-contained as possible.
- In those cases where the provided installer is not used (i.e. the user stands up the resources on their own), then a mechanism is needed to pass in the ids, etc for that externally managed infrastructure while still supporting those cases where the infra is managed by the installers.

## Installer Revision History

Version ID | Date | K8s Version Supported | Note
---|---|---|--
1.0 | Oct, 2024 | 1.30.3 | Initial version of the new eks installer.

## How to Use

### State Management

It is generally assumed one is using an S3 state backend.
See [AWS S3 state Backend](https://www.pulumi.com/docs/iac/concepts/state-and-backends/#aws-s3) for instructions on how to set up and login to an s3 backend.
That said, one can use Pulumi Cloud for the state backend as well. However, these instructions will generally assume an S3 backend is being used.

### Configuration

Each project has its own configuration requirements. Each project folder has a `Pulumi.README.yaml` file that includes instructions for setting up the configuration and can be used as a template for the actual stack config file (see [Pulumi stack config](https://www.pulumi.com/docs/iac/concepts/config/)).

### Deployment Order

Each subfolder is it's own Pulumi project (and by extension stack). The numbering represents the order of deployment.

### Using Existing Infrastructure

In some cases, you may need to use existing infrastructure.
Currently, the following installer projects support the case where the infrastructure already exists:

- 01-iam: IAM resources
- 02-networking: VPC and subnets
- 15-state-policies-mgmt: S3 buckets for state and policy storage.
- 30-esc: S3 bucket for ESC-related storage

If using pre-existing resources, you will still run the given stacks (i.e. `01-iam` and `02-networking`) but you will provide the values for the resources your created - see the project's `Pulumi.README.yaml` for details.
The stack will skip creating the relevant resources and pass the input values through to stack outputs so that downstream stacks can use the values as needed.

- Review the `Pulumi.README.yaml` file to understand the inputs for the given stack.
- Review `index.ts` and any related files to understand how the given infrastructure is created.

### Deployment Instructions

These instructions assume you are using "prod" for the name of your stacks. Of course you can name the stack anything you want.
The process is the same for each microstack:

- cd to the given project folder (e.g. `01-iam`)
- `npm install` to install the package dependencies
- Run `pulumi stack init prod` (or whatever name of stack you want to use). This will create a new empty stack, and will create a stack config file with the "encryptionsalt" key (if using the passphrase secrets provider).
- copy the contents of the "Pulumi.README.yaml" file into the new "Pulumi.prod.yaml" stack config file, with the "config" key at the top level.
- edit "Pulumi.prod.yaml" and follow the instructions in the file about setting configuration values.
  - In a number of cases you can use the default values copied from "Pulumi.README.yaml".
- Run `pulumi up` to deploy the infrastructure.
- Move to the next project folder and repeat the above steps.

#### Helpful Tips about Stack Dependencies

The following stacks manage stateful resources or resources that are foundational to other stacks, so think carefully before destroying them:

- 01-iam
- 02-networking
- 05-eks-cluster
- 15-state-policies-mgmt
- 20-database
- 30-esc

The following stacks do not manage stateful resources and so can be destroyed/re-created without losing data. Destroying/recreating these stacks will cause a service disruption but no permanent data loss:
<!-- TODO: what about deployments? -->
- 25-insights: If restarted, use the service UI "selfhosted" page to reindex the searchcluster.. See: [Re-index opensearch](https://www.pulumi.com/docs/pulumi-cloud/admin/self-hosted/components/search/#backfilling-data)
- 90-pulumi-service
