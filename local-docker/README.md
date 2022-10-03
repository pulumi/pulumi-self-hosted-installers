# Virtual Machine Architecture

> :warning: Before proceeding, please take the provided installation code and commit it **as-is** to your own source control. As you make changes or customize it, please commit these to your repo as well. This will help keep track of customizations and updates.

> :information_source: You will likely want to use one of the [Self-Managed Backends](https://www.pulumi.com/docs/intro/concepts/state/#logging-into-a-self-managed-backend) as the state storage for this installer. Please document this (in the repo your store this code, an internal wiki, etc) so that future updates will be straightforward for you and your colleagues.

This project contains a Pulumi project to provision and orchestrate the following components:
- API container
- Console container
- Migrations container
- **(optional)** Nginx container for Load Balancing and TLS termination 
    - This can be disabled with `pulumi config set disableNginxProxy true`
    - If disabled, you must provide your own Load Balancing and TLS termination solution.

## Prerequisites

- You must have a license key from your sales contact.

## Requirements

The following are requirements of this deployment option:
- Virtual machine or physical server with Docker Engine installed
    - At least 2 CPU cores w/ 8 GB memory
    - At least 20GB SSD storage space
- MySQL 5.7 database
    - At least 20GB SSD storage space
    - A databaser user that has the following grants:
        - `GRANT ALL PRIVILEGES ON 'pulumi'.* TO 'pulumi'@'%'`
        - `GRANT CREATE USER ON *.* TO 'pulumi'@'%' WITH GRANT OPTION`
- Object storage (for example, Minio)
    - At least 200GB SSD storage space
- [Pulumi CLI](https://www.pulumi.com/docs/get-started/install/)

## Setup

1. CLI configuration
    1. `pulumi login --local`
        - or [other self-managed backend](https://www.pulumi.com/docs/intro/concepts/state/#backends)
    1. `pulumi stack init`
        - :information_source: Document the state location and passphrase for your stack in your internal documentation system or update this README to contain it.
1. Service and registry configuration
    1. `pulumi config set licenseKey --secret {licenseKey}`
    1. (optional) - if you're pulling images from registry other than docker hub:
        - `pulumi config set imageRegistryAddress {registry address}`
        - `pulumi config set imageRegistryUsername {registry username}`
        - `pulumi config set imageRegistryAccessToken --secret {registry access token}`
    1. `pulumi config set imageTag {imageTag}`
        - see https://hub.docker.com/orgs/pulumi for the available tags. Pick the latest tag in the form of `DATE-NUMBER-signed`.
    1. create the local directory for config file storage:
        - `mkdir -p ~/pulumi-ee/data`
        - **or optionally**, set a custom base path with:
            - `pulumi config set dataPath {custom path}`
    1. `pulumi config set localKeysValue --secret {local keys value}`
        - :information_source: this value is used as the backing encryption key for the [default secrets provider](https://www.pulumi.com/docs/intro/concepts/secrets/#configuring-secrets-encryption) (e.g. the Selfhosted Service). The value should be at least 32 random characters - e.g. `head -c 32 /dev/random | sha256sum | head -c 32 | pulumi config set localKeysValue --secret --`
1. Database configuration
    1. `pulumi config set dbHost {db host}`
    1. (optional) - if your database is listening on an alternative port
        - `pulumi config set dbPort 3306`
    1. `pulumi config set dbUsername {db username}`
    1. `pulumi config set dbUserPassword --secret {db password}`
    1. :warning: (optional) if you are running Selfhosted Pulumi across multiple servers for High Availability, the `migrations` container must only run on **_one_** of the servers. You can disable the `migrations` container on all other servers with the following config:
        1. `pulumi config set disableDbMigrations true`
1. Object storage configuration
    1. `pulumi config set storageAccessKey {storage access key}`
    1. `pulumi config set storageSecretKey --secret {storage secret key}`
    1. `pulumi config set storageCheckpointBucket {storage checkpoint bucket}`
        - e.g. `s3://pulumi-checkpoints?endpoint=192.168.1.47:9000&s3ForcePathStyle=true`
        - Note: the `endpoint=IP:PORT` and `s3ForcePathStyle=true` query parameters are **required** if using an S3 compatible API for object storage.
    1. `pulumi config set storagePolicyPackBucket {storage policypack bucket}`
        - e.g. `s3://pulumi-policypacks?endpoint=192.168.1.47:9000&s3ForcePathStyle=true`
        - Note: the `endpoint=IP:PORT` and `s3ForcePathStyle=true` query parameters are **required** if using an S3 compatible API for object storage.
1. Domain configuration
    1. `pulumi config set apiDomain {domain for api}`
    1. `pulumi config set consoleDomain {domain for console}`
1. Nginx proxy configuration
    1. (optional) - this can be handled via your own load balancing solution if you prefer
    1. to disable the nginx proxy and TLS termination:
        1. `pulumi config set disableNginxProxy true` 
1. TLS Certification configuration
    1. :information_source: skip this section if you have disabled the Nginx proxy or are handling this via an external load balancer or don't want to enable TLS
    1. `cat {path to api key file} | pulumi config set apiTlsKey --secret --` (on a mac or linux machine)
    1. `cat {path to api cert file} | pulumi config set apiTlsCert --secret --` (on a mac or linux machine)
    1. `cat {path to console key file} | pulumi config set consoleTlsKey --secret --` (on a mac or linux machine)
    1. `cat {path to console cert file} | pulumi config set consoleTlsCert --secret --` (on a mac or linux machine)
1. Miscellaneous configuration
    1. (optional) - expose the containers directly for troubleshooting purposes or for integrating with an external load balancer
        - `pulumi config set exposeContainerPorts true`
1. SSO/SAML Configuration - once set email access is not available
    1. `pulumi config set samlSsoEnabled true`
1. SMTP Configuration - required for "reset password" and invite emails
    1. `pulumi config set smtpServer {smtp server}`
    1. `pulumi config set smtpUsername {smtp username}`
    1. `pulumi config set smtpPassword {smtp password} --secret`
    1. `pulumi config set smtpFromAddress {smtp from address}` (email address that the outgoing emails come from)
1. Recaptcha configuration - for protecting "forgot password" form
    1. `pulumi config set recaptchaSiteKey {recaptchaSiteKey}` (this must be a v2 type recaptcha)
    1. `pulumi config set recaptchaSecretKey {recaptchaSecretKey} --secret`
1. `pulumi up`

### Configure DNS

Create DNS A record entries for `{domain for api}` and `{domain for console}` that point to the IP address of the virtual machine or physical server.

### Pulumi Login

Login to your Self-Hosted Pulumi Service with the following command:

```
pulumi login {domain for api}
```

Or from the project directory:

```
pulumi login $(pulumi stack output apiEndpoint)
```

## Destroying the stacks

1. `pulumi destroy`

> Note: Files in `~/pulumi-ee/data` (or the path specified by the `dataPath` config value) will not be removed during the `destroy`.

## End User and Client Connectivity

End users of the Pulumi Console must have network connectivity to the running API and Console containers via the included Nginx proxy or an external load balancer solution. CLI users require the same connectivity as well as connectivity to the object storage buckets specifically for publishing and using Policy Packs (via signed URLs).

## Administration

### Upgrades

New features and bugfixes are generally released on a weekly or bi-weekly schedule. They are released in the form of updated Docker images on https://hub.docker.com/orgs/pulumi.

To upgrade:
1. `pulumi config set imageTag {imageTag}`
1. `pulumi up`

During the upgrade via `pulumi up`, the pulumi project will replace running Docker containers. There may be a brief interruption while the containers restart and the nginx load balancer configuration (if not disabled) is updated.

### Logging

All application logs are written to stdout/stderr and available via [`docker logs`](https://docs.docker.com/engine/reference/commandline/logs/). Centralized logging can be configured with additional [`logging drivers`](https://docs.docker.com/config/containers/logging/configure/).

### Backup

All state and data is stored in the external MySQL database and object storage. Data backups should be peformed on a regular schedule using the system-specific backup tooling.

### High Availability

The Selfhosted Pulumi can be run in a highly available configuration by running the configuration across multiple virtual machines or physical servers. When run in this configuration an external load balancer must be used to load balance and/or failover between the additional hosts.

> :warning: If you are running Selfhosted Pulumi across multiple servers for High Availability, the `migrations` container must only run on **_one_** of the servers. You can disable the `migrations` container with the following config for all _other_ servers:
> - `pulumi config set disableDbMigrations true`

## Miscellaneous Notes

* The Pulumi project will create and write to multiple files in `~/pulumi-ee/data`. These files should not be manually edited or deleted. This path can be customized with the `dataPath` stack configuration value.
* The SSO certificate has the `currentYear()` in the name. This means that it will get replaced during the first deployment of each calendar year. The expiry date on the certificate is set to 400 days so that although a deployment may not happen each year, it will be necessary to do so otherwise the certificate will expire.
