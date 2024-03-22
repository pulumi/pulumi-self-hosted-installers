# Self-Hosted Pulumi on AWS

Deploys the Pulumi API Service and Console in Kubernetes using AWS.

> ⚠️ Before proceeding, please take the provided installation code and commit it **as-is** to your own source control. As you make changes or customize it, please commit these to your repo as well. This will help keep track of customizations and updates.

> ℹ️ You will likely want to use one of the [Self-Managed Backends](https://www.pulumi.com/docs/intro/concepts/state/#logging-into-a-self-managed-backend) as the state storage for this installer. Please document this (in the repo your store this code, an internal wiki, etc) so that future updates will be straightforward for you and your colleagues.

## Installer Revision History
Version ID | Date | K8s Version Supported | Note
---|---|---|--
1.0 | N/A | 1.18 | Original installer version.
2.0 | December 7, 2021 | 1.21 | Changes Ingress controller deployment code.
2.1 | January 10, 2022 | 1.21 | Implements email-login disablement options. Changes default SAML-SSO behavior to be DISABLED. NOTE: if you are currently using SAML SSO, be sure to update your config file to explicitly enable SAML SSO.
2.2 | April 25, 2022 | 1.22 | Updated and pinned package versions. 
2.3 | July 19, 2022 | 1.22 | Updated and pinned package versions to address deprecation of earlier alpha version.
3.0 | January 20, 2023 | 1.22 | MySQL 8 support and version updates for external-dns service.
3.1 | April 20, 2023 | 1.22-1.24 | Updated external-dns config and added note about using legacy stack naming for S3 backend.
3.2 | February 19, 2024 | 1.24 |  Updated package versions and related resources and README instructions.


> ℹ️ See the **Updates and Upgrades** section below for how to upgrade from earlier versions of the installer and k8s and Pulumi service images.


## User Guides:

- [Self-Hosted Pulumi Service][self-hosted-pulumi-user-guide]
- [Self-Hosted EKS Installer][self-hosted-eks-user-guide]

## Requirements

- [Get Started with Pulumi and AWS][get-started-aws].
- [Get Started with Pulumi and Kubernetes][get-started-k8s].
- [S3 State Backend][s3-backend]
  - Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.
  - Set AWS_PROFILE to your AWS profile of choice as defined in ~/.aws/config
  - Set PULUMI_CONFIG_PASSPHRASE to some secret passphrase for handling secrets.

## Services used

- [EKS][eks] - Managed Kubernetes Cluster.
- [RDS Aurora][rds] - Managed MySQL DB for persistent state, with automated
  replication and snapshotting.
- [S3][s3] - Object storage for checkpoints and policy packs.
- [CloudWatch Logs][cloudwatch-logs] - Centralized logging for all cluster pods.
- [Route53][r53] - Managed DNS records.
- [ALB][alb] - Managed L7 / application traffic and SSL termination.
- [ACM][acm] - Managed public TLS certificates.

## Architecture

The architecture is split up by functional responsibilities in separate
Pulumi projects to decouple the cluster, its required services,
and the Pulumi service from each other.

This setup provides benefits such as swapping out the Kubernetes cluster
configuration if bringing your own cluster, or if using alternative managed
services.

1. [01-cluster-configuration](./01-cluster-configuration)

   IAM, networking, EKS, and in-cluster resources.

1. [02-cluster-services](./02-cluster-services)

   Deploy cluster and application scoped services to run the Pulumi services.

   - Database - [RDS Aurora][rds]
   - Logging - [fluentd-cloudwatch][fluentd-cloudwatch]
   - DNS - [external-dns][external-dns]
   - Ingress - [ALB ingress controller][alb-ingress]

1. [03-apps](./03-apps)

   Deploy the Pulumi API service and Console in Kubernetes.

> For more architecture details see [Crosswalk for Kubernetes][cw-k8s].

### Design considerations

The Pulumi services operate in Kubernetes with the following app properties.

- **Stateless**: Uses RDS and S3 for state management, which allows for rolling updates
  of the API and Console to occur with ease.
- **Highly-Available**: API and Console pods are scheduled to target particular
  node groups intended only for their use, spread across multiple availability zones
  so that no two pods of the same set are co-located on the same node.
- **Eviction Aware**: Manages voluntary cluster eviction actions
  using [disruption budgets][pdb]. This ensures a minimum availability of the services
  during events like node draining and migrations.

## Setup

1.  Clone the repo and install dependencies:

    ```bash
    git clone https://github.com/pulumi/pulumi-self-hosted-installers.git 
    cd eks-hosted
    npm install
    ```

1.  Login to your [Self-Managed Backend](https://www.pulumi.com/docs/intro/concepts/state/#logging-into-a-self-managed-backend).

    ```bash
    pulumi login s3://<bucket-name>
    ```

1. Enable legacy self managed stack naming to avoid using `org/project/stack` format before running the installer.
    ```bash
    export PULUMI_SELF_MANAGED_STATE_LEGACY_LAYOUT=true
    ```

## Using the Self-Hosted Installer
See [Deploy Self-Hosted Pulumi](#deploy-self-hosted-pulumi) for step-by step instructions.

This installer is an all-in-one installer based on the [Pulumi Automation API][pulumi-automation-api] to
initialize, configure, and deploy the self-hosted Pulumi. Alternatively, you can manually manage each Pulumi project if you choose.

### Usage

```bash
npm run installer -- <options>
```

Options:

```bash
index.js <cmd> [args]

Commands:
index.js init [project]           initialize the project stack(s)
index.js update [project]         update the project stack(s)
index.js destroy [project]        destroy the project stack(s)
index.js unprotect-all [project]  unprotect resources in the project stack(s)

Options:
--version  Show version number                                                                               [boolean]
--help     Show help                                                                                         [boolean]
```

## Deploy Self-Hosted Pulumi
1. Create a [Configuration File](#configuration-file).

1. Deploy Pulumi

    ```bash
    npm run installer -- init --config-file my_configuration_file.yaml

    npm run installer -- update --config-file my_configuration_file.yaml
    ```

    After ~45 minutes, all stacks will be deployed and the Pulumi endpoints
    will be configured with the subdomain and hosted zone provided.

    The endpoints will be exposed at the following URLs:

    - Console: `https://app.<route53Subdomain>.<route53Zone>`
    - API: `https://api.<route53Subdomain>.<route53Zone>`

    Example, as displayed in the Pulumi app stack output.

    ```bash
    Outputs:
      checkpointsS3BucketName: "pulumi-checkpoints-3ee87c0"
      consoleEndpoint        : "https://app.pulumi.example.com"
      policyPacksS3BucketName: "pulumi-policypacks-2424c2a"
      serviceEndpoint        : "https://api.pulumi.example.com"
    ```

## Use self-hosted Pulumi

### Organization Setup

1. Open `consoleEndpoint` in your browser.
1. Sign up for a new user.
1. Add an Organization.
1. Optionally, complete SSO setup under your organization settings page.

### Login

Login with the `pulumi` CLI tool into the newly provisioned Pulumi API service at the
configured endpoint.

```bash
pulumi login https://api.pulumi.example.com
```

See the [pulumi login][pulumi-login-docs] docs for more details.

### Create an example

[Get started][aws-ts-get-started] with a simple and new AWS Typescript project.


## Configuration File
### Required Configuration

> Note: All configuration properties shown in this section are **required**.

The installer requires a YAML configuration file with the following configuration properties:

```yaml
region: us-west-2
licenseFilePath: pulumi-selfhosted-company.license
route53Zone: example.com
route53Subdomain: pulumi
imageTag: 20201201-13317-signed
clusterConfig:
  stackName: my-selfhosted-01-cluster
clusterServicesConfig:
  stackName: my-selfhosted-02-cluster-services
appsConfig:
  stackName: my-selfhosted-03-apps

```

> Note: Assumes `example.com` is an existing public hosted zone in Route53.

### Optional Configuration

Configuration properties can be passed for SMTP and SSO support as well as to the individual sub-projects through the same YAML file under the
`clusterConfig`, `clusterServicesConfig`, and `appsConfig` sections. For example:

```yaml
region: us-west-2
licenseFilePath: pulumi-selfhosted-company.license
route53Zone: example.com
route53Subdomain: pulumi
imageTag: 20201201-13317-signed

# Optional SMTP Settings
smtpServer: smtp.example.com:587  # If using SES be sure to use port 587
smtpUsername: johndoe
smtpPassword: abcdefghi
smtpGenericSender: sender@domain.com  # Be sure this email is allowed to send emails via your SMTP server.

# Optional reCAPTCHA settings
# reCAPTCHA is used if too many incorrect passwords are entered or if the user clicks the forgot password link.
# If not set, default "test" values will be used to allow these flows to work.
# See: https://developers.google.com/recaptcha/docs/faq#id-like-to-run-automated-tests-with-recaptcha-what-should-i-do
recaptchaSiteKey: abcdefghijklmno
recaptchaSecretKey: pqrstuvwxyzabc

# Optional SSO SAML configuration
# Once set to true, the user will be presented with the SSO-organization login page. 
# If you need to login via email (unless the "HIDE EMAIL" settings below are set to true) go to
# https://app.YOURSERVICENAME/signin/email
samlSsoEnabled: false

# Optional Email Sign-up and Login Settings  
# See: https://www.pulumi.com/docs/guides/self-hosted/console/#email-identity  
consoleHideEmailSignup: false # false = makes email signup available on console; true = hides email sign up option on console  
consoleHideEmailLogin: false  # false = allows email login on console; true = hides email login on console   
# See: https://www.pulumi.com/docs/guides/self-hosted/api/#other-env-vars  
apiDisableEmailSignup: false # false = service api allows email signup; true = service api disallows email signup.  
apiDisableEmailLogin: false # false = service api allows email login; true = service api disabllows email signup.   

# overrides for 01-cluster-configuration
clusterConfig:
  stackName: my-selfhosted-01-cluster
  clusterVersion:
    value: "1.21"

# overrides for 02-cluster-services
clusterServicesConfig:
  stackName: my-selfhosted-02-cluster-services
  dbReplicas:
    value: 1
  dbInstanceType:
    value: db.t3.medium

# overrides for 03-apps
appsConfig:
  stackName: my-selfhosted-03-apps
  apiReplicas:
    value: 1
  consoleReplicas:
    value: 1
```

See the following files to see which values can be overridden for each sub-project:

- `clusterConfig` - `01-cluster-configuration/config.ts`
- `clusterServicesConfig` - `02-cluster-services/config.ts`
- `appsConfig` - `03-apps/config.ts`

# Updates and Upgrades

## Updating the Pulumi Service Images
* Update the main configuration file to point at the latest pulumi docker image tags.
* Run the **Deploy Pulumi** steps described above.

The "03-apps" stack will update as it deploys the latest version of the pulumi images.  
You will see various update messages. Once complete, the service will be running on the new version.
```bash
...
 ~  kubernetes:apps/v1:Deployment pulumi-api updating [diff: ~spec]
 ~  kubernetes:apps/v1:Deployment pulumi-api updating [diff: ~spec]; [1/2] Waiting for app ReplicaSet be marked available (0/1 Pods available)
 ~  kubernetes:apps/v1:Deployment pulumi-api updated [diff: ~spec]; Deployment initialization complete
 ...
 ~  kubernetes:apps/v1:Deployment pulumi-console updating [diff: ~spec]
 ~  kubernetes:networking.k8s.io/v1beta1:Ingress pulumi-api updating [1/3] Finding a matching service for each Ingress path
 ~  kubernetes:networking.k8s.io/v1beta1:Ingress pulumi-api updating [2/3] Waiting for update of .status.loadBalancer with hostname/IP
 ~  kubernetes:apps/v1:Deployment pulumi-console updating [diff: ~spec]; [1/2] Waiting for app ReplicaSet be marked available (0/1 Pods available)
 ~  kubernetes:apps/v1:Deployment pulumi-console updating [diff: ~spec]; Deployment initialization complete
 ~  kubernetes:apps/v1:Deployment pulumi-console updated [diff: ~spec]; Deployment initialization complete
 ~  kubernetes:networking.k8s.io/v1beta1:Ingress pulumi-console updating [2/3] Waiting for update of .status.loadBalancer with hostname/IP
 ...
```

## Upgrading from a Pre-2.0 Self-Hosted Installer
If upgrading from a pre-2.0 self-hosted installer, special steps are needed to upgrade the installer before updating the k8s version.
> **Note:** It is suggested to backup the RDS database and S3 buckets.
> **Note** These steps will cause a service outage of about an hour and so should be executed during a maintenance window.
* Using the existing installer installation do the following:
  * `cd 03-apps`
  * Edit `index.ts` and comment out the TWO ingress declarations (i.e.`apiIngress` and `consoleIngress`) at the bottom of the file.
  * `pulumi up`
    * This will clean up the ingress configuration before moving to the later version of the installer.
```bash      
            pulumi:pulumi:Stack                              ABCDEFGHIJK-03-apps             
            ├─ kubernetes:networking.k8s.io/v1beta1:Ingress  pulumi-console    deleted 
            └─ kubernetes:networking.k8s.io/v1beta1:Ingress  pulumi-api        deleted 
``` 

* Get the updated v2.0+ of the self-hosted installer and do the following:
  * `cd 03-apps`
  * Edit `index.ts` and comment out the TWO ingress declarations at the bottom of the file.
  * Copy the main configuration file to the new installer folder.
  * `npm run installer -- init --config-file CONFIG_FILE`
  * `npm run installer -- update --config-file CONFIG_FILE`
  * This will update the "02-cluster-services" stack as follows:
```bash
        ...
        ~  aws:iam:Policy alb-ing-cntlr updated [diff: ~policy]
        +  kubernetes:helm.sh/v3:Release alb-ing-cntlr created
        -  kubernetes:apps/v1:Deployment alb-ing-cntlr deleted
        ...
        Resources:
          + 1 created
          ~ 1 updated
          - 1 deleted
          3 changes. 36 unchanged
```

* DO NOT UPDATE `03-apps/index.ts` to uncomment the ingresses, yet.
* Update to K8s version 1.19 (if not already on 1.19)
  * Update the configuration file to reference cluster version "1.19"
  * `npm run installer -- init --config-file CONFIG_FILE`
  * `npm run installer -- update --config-file CONFIG_FILE` 
  * This will update the EKS K8s and node group versions. It takes a solid 30-45 minutes for AWS to update the EKS cluster.
```bash
        ~  aws:eks:Cluster pulumi-selfhosted-01-cluster-configuration-eksCluster updating [diff: ~version]
        ~  aws:eks:Cluster pulumi-selfhosted-01-cluster-configuration-eksCluster updated [diff: ~version]
        ...
        ++ aws:ec2:LaunchConfiguration pulumi-selfhosted-01-cluster-configuration-ng-standard-nodeLaunchConfiguration creating replacement [diff: ~imageId]
        ++ aws:ec2:LaunchConfiguration pulumi-selfhosted-01-cluster-configuration-ng-standard-pulumi-nodeLaunchConfiguration creating replacement [diff: ~imageId]
        ~  aws:eks:Cluster pulumi-selfhosted-01-cluster-configuration-eksCluster updated [diff: ~version]; Cluster is ready
        ...
        ++ aws:ec2:LaunchConfiguration pulumi-selfhosted-01-cluster-configuration-ng-standard-nodeLaunchConfiguration created replacement [diff: ~imageId]
        +- aws:ec2:LaunchConfiguration pulumi-selfhosted-01-cluster-configuration-ng-standard-nodeLaunchConfiguration replacing [diff: ~imageId]
        +- aws:ec2:LaunchConfiguration pulumi-selfhosted-01-cluster-configuration-ng-standard-nodeLaunchConfiguration replaced [diff: ~imageId]
        ~  aws:cloudformation:Stack pulumi-selfhosted-01-cluster-configuration-ng-standard-nodes updating [diff: ~templateBody]
        ++ aws:ec2:LaunchConfiguration pulumi-selfhosted-01-cluster-configuration-ng-standard-pulumi-nodeLaunchConfiguration created replacement [diff: ~imageId]
        +- aws:ec2:LaunchConfiguration pulumi-selfhosted-01-cluster-configuration-ng-standard-pulumi-nodeLaunchConfiguration replacing [diff: ~imageId]
        +- aws:ec2:LaunchConfiguration pulumi-selfhosted-01-cluster-configuration-ng-standard-pulumi-nodeLaunchConfiguration replaced [diff: ~imageId]
        ~  aws:cloudformation:Stack pulumi-selfhosted-01-cluster-configuration-ng-standard-pulumi-nodes updating [diff: ~templateBody]
        ~  aws:cloudformation:Stack pulumi-selfhosted-01-cluster-configuration-ng-standard-nodes updated [diff: ~templateBody]
        ~  aws:cloudformation:Stack pulumi-selfhosted-01-cluster-configuration-ng-standard-pulumi-nodes updated [diff: ~templateBody]
        -- aws:ec2:LaunchConfiguration pulumi-selfhosted-01-cluster-configuration-ng-standard-nodeLaunchConfiguration deleting original [diff: ~imageId]
        -- aws:ec2:LaunchConfiguration pulumi-selfhosted-01-cluster-configuration-ng-standard-pulumi-nodeLaunchConfiguration deleting original [diff: ~imageId]
        -- aws:ec2:LaunchConfiguration pulumi-selfhosted-01-cluster-configuration-ng-standard-nodeLaunchConfiguration deleted original [diff: ~imageId]
        -- aws:ec2:LaunchConfiguration pulumi-selfhosted-01-cluster-configuration-ng-standard-pulumi-nodeLaunchConfiguration deleted original [diff: ~imageId]
        ...
        Resources:
          ~ 3 updated
          +-2 replaced
          5 changes. 84 unchanged
        Duration: 27m53s
```
  * Once the pulumi update is complete
    * Review the AWS EKS cluster in the UI and confirm the Nodes and Workloads have redeployed successfully.
* Once the upgrade to 1.19 has completed and the workloads are redeployed, do the following:
  * `cd 03-apps`
  * Edit `index.ts` and uncomment the ingress declarations that were commented out earlier.
  * `pulumi up`
```bash
      Updating (mitch-pulumi-selfhosted-03-apps):
        Type                            Name                               Status      
        pulumi:pulumi:Stack             ABCDEFGHI-03-apps              
        +   ├─ kubernetes:networking.k8s.io/v1:Ingress  pulumi-api         created     
        +   └─ kubernetes:networking.k8s.io/v1:Ingress  pulumi-console          created     
      Resources:
        + 2 created
        25 unchanged
```
  * Check that you can access the console once again.
    * You may have to wait a up to 5 minutes for the AWS load balancer plumbing to become ready.
* At this point, you are on Installer V2.0+ and can upgrade the k8s version as per the next section.

## Upgrading K8s Version Using Installer V2.0+
EKS requires that you upgrade k8s version incrementally.  
So, going from, say, 1.19 to 1.21 requires going 1.19 -> 1.20 -> 1.21.  
Each update will take about 30-45 minutes but the service will be accessible during the updates.
* Modify the cluster version in the main configuration file.
* Run the installer update commands.
  * `npm run installer -- init --config-file CONFIG_FILE`
  * `npm run installer -- update --config-file CONFIG_FILE` 
* Each run takes about 30 minutes to complete:
```bash
  ~  aws:eks:Cluster pulumi-selfhosted-01-cluster-configuration-eksCluster updated [diff: ~version]
  ~  aws:eks:Cluster pulumi-selfhosted-01-cluster-configuration-eksCluster updated [diff: ~version]; Cluster is ready
  ++ aws:ec2:LaunchConfiguration pulumi-selfhosted-01-cluster-configuration-ng-standard-nodeLaunchConfiguration created replacement [diff: ~imageId]
  +- aws:ec2:LaunchConfiguration pulumi-selfhosted-01-cluster-configuration-ng-standard-pulumi-nodeLaunchConfiguration replaced [diff: ~imageId]
  -- aws:ec2:LaunchConfiguration pulumi-selfhosted-01-cluster-configuration-ng-standard-pulumi-nodeLaunchConfiguration deleted original [diff: ~imageId]
  Resources:
    ~ 3 updated
    +-2 replaced
    5 changes. 84 unchanged
  Duration: 27m32s
```
# Clean up

Run the following command to destroy and delete all of the stacks and resources
deployed for self-hosted Pulumi.

> **Note:** This command cannot be undone and will erase all data.

```bash
npm run installer -- unprotect-all --config-file <config-file>

npm run installer -- destroy --config-file <config-file>
```

You may see an error about deleting the S3 buckets.
In which case, manually delete the checkpoints and policy buckets and rerun the destroy command.

# Troubleshooting

## Set up kubeconfig file to access K8s cluster

### Use Pulumi Stack Output
To set up the kubeconfig to allow kubectl use with the EKS cluster:
```bash
cd 01-cluster-configuration
echo `pulumi stack output kubeconfig` > ./kubeconfig.txt
export KUBECONFIG=./kubeconfig.txt

# Test kubectl works
kubectl cluster-info
```
### Use AWS CLI
Run the following command (substituting REGION and EKS_NAME accordingly):
`aws eks --region REGION update-kubeconfig --name EKS_NAME`

This will set up default kubeconfig file for `kubectl`.

## Dump Pulumi service logs
This is for dumping logs from the main "API" service of the system.  
Similar steps can be used to dump logs from the "Console" service.

Find the name of the namespace that is of the form "apps-xxxxx"
```bash
kubectl get namespaces
```

Find the pod in the "apps-xxxxx" namespace with a name of the form "pulumi-api-xxxxx"
```bash
kubectl get pods -n apps-xxxxx
```

Tail logs for the pod
```bash
kubectl logs -f -n apps-xxxx pulmi-api-xxxx
```

## Failed to decrypt encrypted configuration value ...

- cd to the directory for the problematic stack
- Confirm the stack has no resources:
  - `pulumi stack`
- Remove the stack:
  - `pulumi stack rm`
- Re-run commands:
  - `npm run installer -- init --config-file XXXXXX`
  - `npm run installer -- update --config-file XXXXX`

[cw-k8s]: https://www.pulumi.com/crosswalk/kubernetes/
[get-started-aws]: https://www.pulumi.com/docs/get-started/aws/
[get-started-k8s]: https://www.pulumi.com/docs/get-started/kubernetes/
[s3-backend]: https://www.pulumi.com/docs/intro/concepts/state/#logging-into-the-aws-s3-backend
[eks]: https://aws.amazon.com/eks/
[r53]: https://aws.amazon.com/route53/
[rds]: https://aws.amazon.com/rds/aurora/
[s3]: https://aws.amazon.com/s3/
[acm]: https://aws.amazon.com/certificate-manager/
[alb]: https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html
[external-dns]: https://github.com/kubernetes-sigs/external-dns
[alb-ingress]: https://github.com/kubernetes-sigs/aws-alb-ingress-controller
[cloudwatch-logs]: https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/WhatIsCloudWatchLogs.html
[fluentd-cloudwatch]: https://github.com/helm/charts/tree/master/incubator/fluentd-cloudwatch
[pdb]: https://kubernetes.io/docs/tasks/run-application/configure-pdb/
[aws-ts-get-started]: https://www.pulumi.com/docs/get-started/aws/create-project/
[pulumi-login-docs]: https://www.pulumi.com/docs/get-started/aws/create-project/
[pulumi-automation-api]: https://www.pulumi.com/blog/automation-api/
[self-hosted-pulumi-user-guide]: https://www.pulumi.com/docs/guides/self-hosted/
[self-hosted-eks-user-guide]: https://www.pulumi.com/docs/guides/self-hosted/eks-hosted
[pulumi-api-service-user-guide]: https://www.pulumi.com/docs/guides/self-hosted/components/api/
[pulumi-console-service-user-guide]: https://www.pulumi.com/docs/guides/self-hosted/components/console/