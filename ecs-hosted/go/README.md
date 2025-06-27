# Self-Hosted Pulumi on AWS ECS Fargate - Golang

This Pulumi program deploys the Pulumi API and UI in AWS using ECS Fargate

> ⚠️ Before proceeding, please take the provided installation code and commit it **as-is** to your own source control. As you make changes or customize it, please commit these to your repo as well. This will help keep track of customizations and updates.

> ℹ️ You will likely want to use one of the [Self-Managed Backends](https://www.pulumi.com/docs/intro/concepts/state/#logging-into-a-self-managed-backend) as the state storage for this installer. Please document this (in the repo your store this code, an internal wiki, etc) so that future updates will be straightforward for you and your colleagues.

## Revision History

Version ID | Date | Note
---|---|---
1 | 01/22/2022 | DNS project added; Route53 A records are contained in a separate project to allow a different AWS account to be used, if needed.
2 | 04/15/2022 | Golang application now supports Pulumi Service operating in a private, no public internet access environment. This configuration, which is disabled by default, can be enabled by setting the `enablePrivateLoadBalancerAndLimitEgress` configuration value in both the `application` and `dns` stack configurations.
3 | 05/03/2022 | README.md split into Golang and Typescript specific versions
4 | 05/10/2022 | Optional configuration parameter `imagePrefix` added for the Application project.
5 | 01/20/2023 | MySQL 8 support.
6 | 07/17/2024 | Pulumi [Resource Search](https://www.pulumi.com/blog/self-hosted-search-and-deploy/) now available in Self-Hosted. Resource Search is enabled by setting the `enableOpenSearch` flag in the Infrastructure project. Note, other configuration values, all prefixed OpenSearch are availble.
7 | 10/20/2024 | Add ESC deployment to the installer.

## User Guides

- [Self-Hosted Pulumi Service][self-hosted-pulumi-user-guide]
- [Pulumi API Service][pulumi-api-service-user-guide]
- [Pulumi Console Service][pulumi-console-service-user-guide]

## Requirements

- [Get Started with Pulumi and AWS][get-started-aws].
- [S3 State Backend][s3-backend]
  - Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.
  - Set AWS_PROFILE to your AWS profile of choice as defined in ~/.aws/config
  - Set PULUMI_CONFIG_PASSPHRASE to some secret passphrase for handling secrets.
- [ECR][ecr] repositories which contain Pulumi API (service), Pulumi UI (console), and Pulumi Migration images. NOTE: the below `imageTag` configuration value corresponds to image tag in each ECR repo. Also, by default this program expects the ECR repos to be named after the Pulumi containers. Eg- `pulumi/service`, `pulumi/console`, `pulumi/migrations`.
- [VPC][vpc]
  - At least two public subnet available.
  - At least two private subnet available.
  - At least two isolated subnet available. In this case as `isolated` subnet is one which can only be connected to or from other instances in the same subnet. They do not route traffic to the internet, therefore, they do not require NAT gateways.
- [ACM][acm] certificate that covers the base domain (eg- example.com) and also the subdomain, if one is being utilized (eg- sub.example.com). Lastly, the certificate must cover `app.{sub}.example.com` and `api.{sub}.example.com`. Note: `sub` is optional in this case.
- [Route53][route53] hosted zone which conincides with the above ACM certificate.
- [KMS][kms] key to be used by Pulumi service for encryption/decryption purposes.

## Services used

- [ECS][ecs] - Managed ECS Cluster.
- [Fargate][fargate] - Managed Container Service.
- [RDS Aurora][rds] - Managed MySQL DB for persistent state, with automated
  replication and snapshotting.
- [S3][s3] - Object storage for checkpoints and policy packs.
- [CloudWatch Logs][cloudwatch-logs] - Centralized logging for all cluster pods.
- [Route53][r53] - Managed DNS records.
- [NLB][nlb] - Managed L4 / application traffic and SSL termination.
- [ACM][acm] - Managed public TLS certificates.
- [OpenSearch][OpenSearch] - Managed OpenSearch

## Architecture

1. [base-insfrastructure](./infrastructure)

    Aurora DB, VPC Endpoints, EC2 Security Groups

1. [application-infrastructure](./application)

    Deploy ECS Clusters and Services to run the Pulumi API and Pulumi UI

1. [dns-infrastructure](./dns)

    Deploy Route 53 A Records for the Pulumi API and Pulumi UI

The architecture is split up by functional responsibilities in separate
Pulumi projects to decouple the database, its required services, and the Pulumi service from each other.

### Design considerations

The Pulumi services operate in AWS Elastic Container Service (ECS) with the following app properties.

- **Stateless**: Uses RDS and S3 for state management, which allows for rolling updates
  of the API and Console to occur with ease.
- **Highly-Scalable**: API and Console services are configured to scale up or down on CPU and Memory metrics.
  This ensure the Pulumi services will elastically respond to the needs of your users.
- **Highly-Available**: API and Console services are configured to be deployed across multiple
  availability zones ensuring redudancy in your applications. RDS Database and OpenSearch can also be configured with multiple replicas, across different availability zones.

## Install

1. Clone the repo and install dependencies:

    ```bash
    git clone https://github.com/pulumi/self-hosted
    cd fully-managed-aws-ecs/{ts|go}
    ```

2. Login to your [Self-Managed Backend](https://www.pulumi.com/docs/intro/concepts/state/#logging-into-a-self-managed-backend).

    ```bash
    pulumi login s3://<bucket-name>
    ```

3. Navigate to `infrastructure` directory to initialize, configure, and deploy the base infrastructure resources required.

    ```bash
    cd infrastructure
    npm install
    pulumi stack init # follow prompt
    ```

### Required Configuration

    ```
    region - AWS Region
    vpcId - Valid, pre-existing AWS VPC 
    publicSubnetIds - At least two subnet ID
    privateSubnetIds - At least two private subnet ID
    isolatedSubnetIds - At least two isolated subnet ID
    ```

### Optional Configuration

    ```
    dbInstanceType - RDS Database Instance Type (default is db.t3.small)
    enableOpenSearch - Deploys an AWS OpenSearch Domain as part of the project
    openSearchInstanceType - AWS OpenSearch Instance Type (default is t3.medium.search)
    openSearchInstanceCount - AWS OpenSearch Instance Count (default is 2 && value cannot be less than 2)
    openSearchDomainName - AWS OpenSearch Domain Name (default is pulumi)
    openSearchDedicatedMasterCount - AWS OpenSearch Dedicated Master Count (default is no dedicated master nodes)
    ```

    **Note: below configuration values are examples. Provide your own.**

### Set Configuration Values

    ```bash
    pulumi config set aws:region us-west-2
    pulumi config set vpcId vpc-12345789
    pulumi config set publicSubnetIds '[ "subnet-03fd1ba00d1ff893c","subnet-09a443b2aece32800","subnet-0f89dff186bdd1f56"]'
    pulumi config set privateSubnetIds '["subnet-0323d9d5445d31651","subnet-0e82d2298e8742481","subnet-07ffe683886112c56"]'
    pulumi config set isolatedSubnetIds '[ "subnet-03fd1ba00d1ff893c","subnet-09a443b2aece32800","subnet-0f89dff186bdd1f56"]'
    ```

    Optionally, configure the DB Instance Type of your choice.

### Deploy

    ```bash
    pulumi up
    ```

    Review the resources to be created, if necessary, and select YES or NO. Upon completion of the deployment, information required by the application project, will be outputted the base infrastructure project.

4. Navigate to the `application` directory, to initialize, configure, and deploy the application infrastructure resources required.

    ```bash
    cd ../application
    npm install
    pulumi stack init # follow prompt
    ```

### NOTE

    Pulumi Migrations container, by default, will execute on every `pulumi up` of the `application` project. This behavior can be disabled by setting the environment variable `$PULUMI_EXECUTE_MIGRATIONS` to `false`.

### Required Configuration

    ```
    region - AWS Region
    baseStackReference - Pulumi Stack Reference to base infrastructure Stack. Required for retrieve outputs.
    imageTag - Specific Pulumi docker container image tag to be used for deployment. Note: Existing ECR repo w/ Pulumi images (api, ui, migrations) is required.
    route53ZoneName - Route 53 Hosted Zone Name of zone to be used for DNS records.
    route53Subdomain - Subdomain to be used for DNS records Eg- sub-domain.hosted-zone-domain.com.
    acmCertificateArn - ACM Certificate ARN that covers the Route 53 Hosted Domain.
    kmsServiceKeyId - KMS Key Id of KMS Key that will be used to secure secrets. Note: AWS user performing update will require access to modify key's IAM policy.
    licenseKey - Valid license key to host Pulumi Self-Hosted (Contact Sales to obtain).
    ```

### Optional Configuration

    ```
    samlEnabled - boolean - if enabled, SAML certificates will be created and SAML SSO will be enabled for the Pulumi Service. Note, if user provides their own SAML certificates through samlCertPublicKey and samlCertPrivateKey, those will be respected.
    samlCertPublicKey - public key to be used for SAML SSO interaction
    samlCertPrivateKey - private key to be used for SAML SSO interaction

    apiDesiredNumberTasks - Desired number of ECS tasks for the API. Default is 1.
    apiTaskMemory - ECS Task level Memory. Default is 1024mb.
    apiTaskCpu - ECS Task level CPU. Default is 512mb.
    apiContainerCpu - CPU alloted to the Pulumi API Container. Defaults to Task CPU amount.
    apiContainerMemoryReservation - Memory reserved for the Pulumi API Container. Defaults to Task memory amount.
    apiDisabledEmailLogin - See DISABLE_EMAIL_LOGIN api env variable.
    apiDisabledEmailSignup - See DISABLE_EMAIL_SIGNUP api env variable.

    consoleDesiredNumberTasks - Desired number of ECS tasks for the UI. Default is 1.
    consoleTaskMemory - ECS Task level Memory. Default is 512mb.
    consoleTaskCpu - ECS Task level CPU. Default is 256mb.
    consoleContainerCpu - CPU alloted to the Pulumi UI Container. Defaults to Task CPU amount.
    consoleContainerMemoryReservation - Memory reserved for the Pulumi UI Container. Defaults to Task memory amount.
    consoleHideEmailLogin - See HIDE_EMAIL_LOGIN UI env variable.
    consoleHideEmailSignup - See HIDE_EMAIL_SIGNUP UI env variable.

    smtpServer - Fully qualified address of SMTP server.
    smtpUsername - SMTP username.
    smtpPassword - SMTP password.
    smtpGenericSender - Email to be used for sending emails from Pulumi API.
    
    enablePrivateLoadBalancerAndLimitEgress - boolean - if enabled, internal NLB will be deployed into private subnets and ECS Service Security Groups will have their public internet access (0.0.0.0/0) removed. Note: this additional NLB will use the same ACM certificate provided.

    logType - Type of logs to be used. Default is no logging.
    logArgs - Arguments provided to log configuration. See Logging section below.

    imagePrefix - Prefix which will be prepended to the Pulumi images. Eg- pulumi/service:some-tag will become imagePrefixpulumi/Service:some-tag.
    ```

    **Note: below configuration values are examples. Provide your own.**

### Set Configuration Values

    ```bash
    pulumi config set aws:region us-west-2
    pulumi config set baseStackReference myorg/infrastructure/my-stack # NOTE: in the case of self-hosted S3 backend, use the stack name for the infrastructure stack
    pulumi config set imageTag 20220105-189-signed
    pulumi config set acmCertificateArn arn:aws:acm:us-west-2:052848974346:certificate/ee6d246c-dd3a-4667-b58a-4568a0f72dd6
    pulumi config set kmsServiceKeyId f7f56e09-f568-447c-8540-cef8ba122a79
    pulumi config set licenseKey {value} --secret
    pulumi config set logType awslogs
    pulumi config set logArgs '{"name": "pulumi-selfhosted", "retentionInDays": 3}'
    pulumi config set privateSubnetIds '[ "subnet-03fd1ba00d1ff893c","subnet-09a443b2aece32800","subnet-0f89dff186bdd1f56"]'
    pulumi config set publicSubnetIds '["subnet-0323d9d5445d31651","subnet-0e82d2298e8742481","subnet-07ffe683886112c56"]'
    pulumi config set route53Subdomain my-sub-domain
    pulumi config set route53ZoneName hosted-zone.com
    pulumi config set smtpGenericSender email@email.com
    pulumi config set smtpPassword {some-password} --secret
    pulumi config set smtpServer email-smtp.us-west-2.amazonaws.com:587
    pulumi config set region us-west-2
    ```

### Deploy

    ```bash
    pulumi up
    ```

    Review the resources to be created, if necessary, and select YES or NO. Upon completion of the deployment, information required by the application project, will be retrieved as Stack References from the infrastructure project.

5. Navigate to the `dns` directory initialize and create the route53 A records for the Pulumi API and Pulumi UI

    ```bash
    cd dns
    npm install
    pulumi stack init # follow prompt
    ```

### Required Configuration

    ```
    region - AWS region
    appStackReference - stack reference to the application stack. This will be used to obtain the required ELB values. 
    ```

### Optional Configuration

    enablePrivateLoadBalancerAndLimitEgress - boolean - if enabled, an additional Route 53 A record will be created which allows private routing to the internal, private NLB.

    **Note: below configuration values are examples. Provide your own.**

### Set Configuration Values

    ```bash
    pulumi config set aws-region us-west-2
    pulumi config set appStackReference myorg/application/my-stack # NOTE: in the case of self-hosted S3 backend, use the stack name for the application stack
    ```

### Deploy

    ```bash
    pulumi up
    ```

    Review the resources to be created, if necessary, and select YES or NO. Upon completion of the deployment, information required by the dns project, will be retrieved as Stack Reference Outputs from the application project.

## Logging

To enable logging configurations for your ECS services, you must specify at least one of the following logging configurations in the `application` stack configuration. NOTE: if no configuration is specified, application logging will not be enabled.

- Cloudwatch (awslogs)

  ```bash
  pulumi config set logType awslogs
  pulumi config set logArgs '{"name": "your_log_base_name", "retentionDays": 3}' # NOTE: retentionDays defaults to 7 (days)
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

## Updates and Upgrades

## Updating the Pulumi Service Images

* Update the application project's configuration file to point at the latest pulumi docker image tags (imageTag).

- Run the **Deploy Pulumi** steps described above.

[get-started-aws]: https://www.pulumi.com/docs/get-started/aws/
[s3-backend]: https://www.pulumi.com/docs/intro/concepts/state/#logging-into-the-aws-s3-backend
[ecs]: https://aws.amazon.com/ecs/
[fargate]: https://aws.amazon/fargate/
[r53]: https://aws.amazon.com/route53/
[rds]: https://aws.amazon.com/rds/aurora/
[s3]: https://aws.amazon.com/s3/
[acm]: https://aws.amazon.com/certificate-manager/
[ecr]: https://aws.amazon.com/ecr/
[nlb]: https://docs.aws.amazon.com/elasticloadbalancing/latest/network/introduction.html
[cloudwatch-logs]: https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/WhatIsCloudWatchLogs.html
[aws-ts-get-started]: https://www.pulumi.com/docs/get-started/aws/create-project/
[pulumi-login-docs]: https://www.pulumi.com/docs/get-started/aws/create-project/
[self-hosted-pulumi-user-guide]: https://www.pulumi.com/docs/guides/self-hosted/
[pulumi-api-service-user-guide]: https://www.pulumi.com/docs/guides/self-hosted/api/
[pulumi-console-service-user-guide]: https://www.pulumi.com/docs/guides/self-hosted/console/
[vpc]: https://aws.amazon.com/vpc/
[route53]: https://aws.amazon.com/route53/
[kms]: https://aws.amazon.com/kms/
[opensearch]: https://aws.amazon.com/opensearch-service/

## Architecture Diagrams

### Overview - Deployment Flow
```mermaid
%%{init: {'theme':'base', 'themeVariables': {'fontSize': '24px', 'fontFamily': 'Arial, sans-serif'}}}%%
graph LR
    classDef stage fill:#FF9900,stroke:#232F3E,stroke-width:3px,color:#FFFFFF,font-size:20px
    
    INFRA[infrastructure<br/>Base Resources]:::stage
    APP[application<br/>ECS Services]:::stage
    DNS[dns<br/>Route53 Records]:::stage
    
    INFRA --> |Stack References| APP
    APP --> |Stack References| DNS
```

### Infrastructure Layer - AWS Foundation Services
```mermaid
%%{init: {'theme':'base', 'themeVariables': {'fontSize': '22px', 'fontFamily': 'Arial, sans-serif'}}}%%
graph TD
    classDef storage fill:#3F8624,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    classDef network fill:#E31837,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    classDef aws fill:#FF9900,stroke:#232F3E,stroke-width:3px,color:#FFFFFF,font-size:18px
    
    subgraph INFRA["Infrastructure Stack: Base Resources"]
        AURORA[Amazon Aurora MySQL<br/>Multi-AZ Cluster<br/>MySQL 8.0 Engine<br/>Automated Backups]:::storage
        
        VPC_ENDPOINTS[AWS VPC Endpoints<br/>S3 Gateway Endpoint<br/>ECR Interface Endpoints<br/>Secrets Manager Interface]:::network
        
        OPENSEARCH[Amazon OpenSearch Service<br/>Managed Domain<br/>Resource Search Engine<br/>VPC-based Deployment]:::storage
        
        KMS[AWS Key Management Service<br/>Customer Managed Key<br/>Data Encryption<br/>Service Integration]:::aws
    end
    
    subgraph EXT["External Prerequisites"]
        VPC[Amazon VPC<br/>Public Subnets<br/>Private Subnets<br/>Isolated Subnets]:::network
    end
    
    VPC --> AURORA
    VPC --> VPC_ENDPOINTS  
    VPC --> OPENSEARCH
```

### Application Layer - Amazon ECS Fargate Services
```mermaid
%%{init: {'theme':'base', 'themeVariables': {'fontSize': '22px', 'fontFamily': 'Arial, sans-serif'}}}%%
graph TD
    classDef storage fill:#3F8624,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    classDef network fill:#E31837,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    classDef pulumi fill:#8A63D2,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    classDef aws fill:#FF9900,stroke:#232F3E,stroke-width:3px,color:#FFFFFF,font-size:18px
    
    subgraph APP["Application Stack: ECS Services"]
        subgraph S3["Amazon S3 Storage"]
            S3_CHECKPOINT[S3 Bucket<br/>Pulumi Checkpoints<br/>Versioning Enabled]:::storage
            S3_POLICY[S3 Bucket<br/>Policy Packs<br/>Versioning Enabled]:::storage
            S3_METADATA[S3 Bucket<br/>Service Metadata<br/>Versioning Enabled]:::storage
        end
        
        subgraph ECS["Amazon ECS Fargate"]
            API_SERVICE[ECS Fargate Service<br/>Pulumi API<br/>pulumi/service image<br/>Auto Scaling Enabled]:::pulumi
            CONSOLE_SERVICE[ECS Fargate Service<br/>Pulumi Console<br/>pulumi/console image<br/>Web Interface]:::pulumi
            MIGRATION_TASK[ECS Task Definition<br/>Database Migration<br/>pulumi/migrations image<br/>One-time Execution]:::pulumi
        end
        
        subgraph LB["AWS Load Balancers"]
            PUBLIC_ALB[Application Load Balancer<br/>Internet-facing<br/>SSL Termination<br/>Target Groups]:::network
            PRIVATE_NLB[Network Load Balancer<br/>Internal Only<br/>Private Subnets<br/>Air-gapped Support]:::network
        end
    end
    
    subgraph SEC["Security & Access"]
        IAM_ROLES[AWS IAM Roles<br/>ECS Task Roles<br/>Execution Roles<br/>Service Policies]:::aws
        SECURITY_GROUPS[Amazon EC2<br/>Security Groups<br/>Least Privilege Rules<br/>VPC-based Access]:::network
        SECRETS[AWS Secrets Manager<br/>Database Credentials<br/>SMTP Configuration<br/>License Keys]:::aws
    end
    
    API_SERVICE --> PUBLIC_ALB
    CONSOLE_SERVICE --> PUBLIC_ALB
    API_SERVICE --> PRIVATE_NLB
    S3_CHECKPOINT --> API_SERVICE
    S3_POLICY --> API_SERVICE
    S3_METADATA --> API_SERVICE
```

### DNS Layer - Route 53 & Certificate Management  
```mermaid
%%{init: {'theme':'base', 'themeVariables': {'fontSize': '22px', 'fontFamily': 'Arial, sans-serif'}}}%%
graph TD
    classDef dns fill:#00A1C9,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    classDef aws fill:#FF9900,stroke:#232F3E,stroke-width:3px,color:#FFFFFF,font-size:18px
    classDef network fill:#E31837,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    
    subgraph DNS["DNS Stack: Route 53 Records"]
        ROUTE53[Amazon Route 53<br/>A Records<br/>api.domain.com<br/>app.domain.com<br/>api-internal.domain.com]:::dns
        ACM[AWS Certificate Manager<br/>SSL/TLS Certificates<br/>Domain Validation<br/>Wildcard Support]:::aws
    end
    
    subgraph EXT_DNS["External DNS Requirements"]
        DOMAIN[Domain Registration<br/>Route 53 Hosted Zone<br/>DNS Management<br/>Certificate Coverage]:::dns
        ALB_REF[Application Load Balancer<br/>From Application Stack<br/>DNS Name & Zone ID<br/>Public HTTPS Endpoints]:::network
        NLB_REF[Network Load Balancer<br/>From Application Stack<br/>DNS Name & Zone ID<br/>Private Internal Access]:::network
    end
    
    DOMAIN --> ROUTE53
    ALB_REF --> ROUTE53
    NLB_REF --> ROUTE53
    ACM --> ALB_REF
    ACM --> NLB_REF
```

### Private Network Option - Air-gapped Deployment
```mermaid
%%{init: {'theme':'base', 'themeVariables': {'fontSize': '22px', 'fontFamily': 'Arial, sans-serif'}}}%%
graph TD
    classDef network fill:#E31837,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    classDef pulumi fill:#8A63D2,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    classDef secure fill:#8B0000,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    
    subgraph PRIVATE["Private Network Configuration"]
        PRIVATE_NLB[Network Load Balancer<br/>Internal Only<br/>Private Subnets<br/>No Internet Gateway]:::network
        
        API_PRIVATE[Pulumi API Service<br/>Restricted Security Groups<br/>No Outbound Internet<br/>VPC Endpoint Access Only]:::pulumi
        
        CONSOLE_PRIVATE[Pulumi Console<br/>Restricted Security Groups<br/>Internal Load Balancer<br/>Corporate Network Access]:::pulumi
        
        VPC_ISOLATED[VPC Configuration<br/>Isolated Subnets<br/>No NAT Gateways<br/>Private DNS Resolution]:::secure
        
        INTERNAL_DNS[Internal DNS Records<br/>api-internal.domain.com<br/>Corporate DNS Integration<br/>Private Zone Management]:::secure
    end
    
    subgraph CONFIG["Configuration Flags"]
        PRIVATE_FLAG[enablePrivateLoadBalancerAndLimitEgress<br/>Boolean Configuration<br/>Application Stack<br/>DNS Stack]:::secure
    end
    
    PRIVATE_FLAG --> API_PRIVATE
    PRIVATE_FLAG --> CONSOLE_PRIVATE
    PRIVATE_FLAG --> PRIVATE_NLB
    PRIVATE_FLAG --> INTERNAL_DNS
    
    VPC_ISOLATED --> API_PRIVATE
    VPC_ISOLATED --> CONSOLE_PRIVATE
    PRIVATE_NLB --> INTERNAL_DNS
```

### Data Flow - Service Interactions
```mermaid
%%{init: {'theme':'base', 'themeVariables': {'fontSize': '22px', 'fontFamily': 'Arial, sans-serif'}}}%%
graph TD
    classDef storage fill:#3F8624,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    classDef pulumi fill:#8A63D2,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    classDef external fill:#FFA500,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    
    subgraph FLOW["Data Flow Patterns"]
        API[Pulumi API Service<br/>Container Service<br/>State Management<br/>Resource Operations]:::pulumi
        CONSOLE[Pulumi Console<br/>Web Interface<br/>User Management<br/>Dashboard Views]:::pulumi
        MIGRATION[Database Migration<br/>Schema Updates<br/>Initialization Tasks<br/>Version Management]:::pulumi
        
        AURORA_DB[Amazon Aurora MySQL<br/>Primary Database<br/>Application State<br/>User Data]:::storage
        S3_STATE[Amazon S3 Buckets<br/>Checkpoint Storage<br/>Policy Packs<br/>Metadata]:::storage
        OPENSEARCH_IDX[Amazon OpenSearch<br/>Resource Index<br/>Search Engine<br/>Analytics Data]:::storage
        
        ECR_IMGS[Amazon ECR<br/>Container Images<br/>pulumi/service<br/>pulumi/console]:::external
        SMTP_SVC[SMTP Service<br/>Email Notifications<br/>User Communications<br/>Alert System]:::external
    end
    
    API -.->|Read/Write| AURORA_DB
    API -.->|Store State| S3_STATE
    API -.->|Index Resources| OPENSEARCH_IDX
    API -.->|Send Emails| SMTP_SVC
    
    CONSOLE -.->|API Requests| API
    MIGRATION -.->|Schema Updates| AURORA_DB
    
    ECR_IMGS -.->|Pull Images| API
    ECR_IMGS -.->|Pull Images| CONSOLE
    ECR_IMGS -.->|Pull Images| MIGRATION
```
