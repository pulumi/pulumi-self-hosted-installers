# EKS Installer (microstacks)

**NOTE NOTE NOTE**   
**THIS IS VERY MUCH A WORK IN PROGRESS AND SHOULD NOT BE USED AT THIS TIME**

This version of the EKS installer for Pulumi self-hosted is broken into smaller, individual stacks.

This new architecture is being implemented to meet the following requirements:
- Allow users to bring their own infrastructure for sections of the solution. 
  - For example IAM is managed as a separate stack since some customers cannot allow the installer to create and manage the IAM resources needed for the service infrastructure. Similarly, networking may be handled by a different team, etc.
- Support mixing and matching capabilities based on the license. Different features such as insights, ESC, deployments etc. require their own infrastructure. 
- Make it easier to maintain and test the overall solution. By breaking the overall deployment into smaller stacks, it makes it easier to test the different parts of the solution since individual stacks can be upped and destroyed. 

This architecture does impose some design requirements:
- Make each stack as self-contained as possible.
- In those cases where the provided installer is not used (i.e. the user stands up the resources on their own), then a mechanism is needed to pass in the ids, etc for that externally managed infrastructure while still supporting those cases where the infra is managed by the installers.

## How to Use

### State Management

It is generally assumed one is using an S3 state backend (see [AWS S3 state Backend](https://www.pulumi.com/docs/iac/concepts/state-and-backends/#aws-s3)). That said, one can use Pulumi Cloud for the state backend as well. However, these instructions will assume an S3 backend is being used.

### Configuration

Each project has its own configuration requirements. Each project folder has a `Pulumi.EXAMPLE.yaml` file that includes instructions for setting up the configuration and can be used as a template for the actual stack config file (see [Pulumi stack config](https://www.pulumi.com/docs/iac/concepts/config/)). 

### Deployment Order

Each subfolder is it's own Pulumi project (and by extension stack). The numbering represents the order of deployment. 

### BYO Infrastructure Notes

If you are skipping some of the installer stacks and deploying the analogous infrastructure outside of Pulumi, then you'll want to look at the following for the given project you are skipping:
- Review the `Pulumi.EXAMPLE.yaml` file to understand some of the inputs for the given stack.
- Review `index.ts` and any related files to understand how the given infrastructure is created.

### Deployment Instructions

These instructions assume you are using "prod" for the name of your stacks.
The process is the same for each microstack:
- cd to the given project folder (e.g. `01-iam`)
- `npm install` to install the package dependencies
- Run `pulumi stack init prod` (or whatever name of stack you want to use)
- copy "Pulumi.README.yaml" to a file where "README" is replaced with the name of your stack.
  - For example, if you are naming the stacks "prod", then you would run `cp Pulumi.README.yaml Pulumi.prod.yaml`
- edit "Pulumi.prod.yaml" and follow the instructions in the file about setting configuration values.
- Run `pulumi up` to deploy the infrastructure.
- Move to the next project folder and repeat the above steps.


