# Using Your Own Infrastructure to Deploy Pulumi Self-Hosted

This folder and sub-folders contain the three Pulumi programs to use and deploy the containers necessary to run Pulumi's self-hosted backend onto one's own infrastructure. Specifically, whereas the other "self-hosted installers" deploy the base infrastructure (e.g. S3, SQL, K8s) and then deploys the Pulumi service on that infrastructure, this installer assumes you have built your own S3(compatible) storage, your own MySQL server, and your own K8s cluster. The primary purpose of this installer is then to deploy the Pulumi service onto that existing infrastructure.

> ⚠️ Before proceeding, please take the provided installation code and commit it **as-is** to your own source control. As you make changes or customize it, please commit these to your repo as well. This will help you keep track of customizations and updates.

> ℹ️ You will likely want to use one of the [Self-Managed Backends](https://www.pulumi.com/docs/intro/concepts/state/#logging-into-a-self-managed-backend) as the state storage for this installer. Please document this (in the repo your store this code, an internal wiki, etc.) so that future updates will be straightforward for you and your colleagues.

## Installer Revision History
Version ID | Date | K8s Version Supported | Note
---|---|---|--
0.1 | September 12, 2022 | 1.24.1 | Initial version. This version is based on the GKE installer and keeps the different projects even though 01-infrastructure and 02-kubernetes are for the most part just passing through config values.

## Prerequisites
* K8s Cluster
* MySQL 8.0 database server
  * At least 20GB SSD storage space
  * A database user that has the following grants:
    * `GRANT ALL PRIVILEGES ON 'pulumi'.* TO 'pulumi'@'%'`
    * `GRANT CREATE USER ON *.* TO 'pulumi'@'%' WITH GRANT OPTION`
  * Create a database named `pulumi` on the server.
  * The MySQL server must have inbound ICMP (ping) enabled.
* S3-compatible Object storage (for example, Minio)
  * At least 200GB SSD storage space
* Domain name and access to create two endpoints:
  * api.{domain} - e.g. api.pulumi.example.com
  * app.{domain} - e.g. app.pulumi.example.com
* TLS certificates for each domain endpoint.
  * See [Creating and Using Self-Signed Certificates](#creating-and-using-self-signed-certificates) below if you wish to use self-signed certificates.
* SMTP Server
  * Not needed for testing but required to enable invitation and "forgot-password" workflows.

## What does each Pulumi program do?

### 01-infrastructure
This program DOES NOT DEPLOY any infrastructure.
Instead, this project is simply used to set config values that are then passed as stack outputs for other stacks to consume. This allows the installer to follow the same pattern as the other installers.
See [Deploy 01-infrastructure](#deploy_01_infrastructure)

### 02-kubernetes

This program deploys the following:

* Ingress Controller

See [Deploy 02-kubernetes](#deploy_02_kuberenetes)

> ℹ️ If your infrastructure already has an ingress controller configured, modify the `02-kubernetes/index.ts` to export the ingress controller namespace and ingress controller service IP for use by `03-application`.

### 03-application

This program creates and deploys the following:

* SAML/SSO Certificate used for SAML/SSO if set up in the service.
* Encryption Services
  *Currently sets up a "Local keys" encryption service as per: https://www.pulumi.com/docs/guides/self-hosted/components/api/#encryption-services.
  * This service is used to encrypt Pulumi config values and outputs. This will be migrated to GCP Secrets Manager when this issue is closed: https://github.com/pulumi/pulumi-service/issues/8785
* API and Console service containers that run the Pulumi service.

See [Deploy 03-application](#deploy_03_application)

## Deploying the System

Pulumi is used to deploy Pulumi. To that end, you will need a state backend - see: https://www.pulumi.com/docs/intro/concepts/state/#logging-into-a-self-managed-backend. And specifically, you will likely use GCP storage for the state backend as per: https://www.pulumi.com/docs/intro/concepts/state/#logging-into-the-google-cloud-storage-backend.

### Naming the stacks

To ensure that the Pulumi program can access variables between the three deployments, you'll need to specify unique stack names. In the instructions below these are names `{stackName1}`, `{stackName2}` and `{stackName3}`. They can be whatever you want them to be, but they need to be consistent when asked for in the instructions.

<a id="deploy_01_infrastructure"></a>
### Deploy 01-infrastructure
1. `cd 01-infrastructure`
1. `npm install`
1. `pulumi stack init {stackName1}`
1. `pulumi config set storageAccessKey {storage access key}`
1. `pulumi config set storageSecretKey --secret {storage secret key}`
1. `pulumi config set storageCheckpointBucket {storage checkpoint bucket}`
    - e.g. `"s3://pulumi-checkpoints?endpoint=192.168.1.47:9000&s3ForcePathStyle=true&region=us-east-1"`
    - Note: the `endpoint=IP:PORT` and `s3ForcePathStyle=true` query parameters are **required** if using an S3 compatible API for object storage (vs using S3 itself).
1. `pulumi config set storagePolicyPackBucket {storage policypack bucket}`
    - e.g. `s3://pulumi-policypacks?endpoint=192.168.1.47:9000&s3ForcePathStyle=true`
    - Note: the `endpoint=IP:PORT` and `s3ForcePathStyle=true` query parameters are **required** if using an S3 compatible API for object storage.
1. `pulumi config set dbHost {db host}`
1. (optional) - if your database is listening on an alternative port
    - `pulumi config set dbPort 3306`
1. `pulumi config set dbUsername {db username}`
1. `pulumi config set dbUserPassword --secret {db password}`
1. `pulumi up` - Wait to complete before proceeding.

<a id="deploy_02_kubernetes"></a>
### Deploy 02-kubernetes
1. `cd ../02-kubernetes`
1. `npm install`
1. `pulumi stack init {stackName2}`
1. `pulumi config set stackName1 {stackName1}` - the full stack name for the "01-infrastructure" stack.
1. `pulumi config set kubeconfig --secret {kubeconfig}` - the kubeconfig for accessing the K8s cluster
Optional settings (will use default values if not set)
1. `pulumi config set commonName {common base name to use for resources}` - uses "pulumiselfhosted" if not set
1. `pulumi up` - Wait to complete before proceeding.

<a id="deploy_03_application"></a>
### Deploy 03-application
1. `cd ../03-application`
1. `npm install`
1. `pulumi stack init {stackName3}`
1. `pulumi config set stackName1 {stackName1}` - the full stack name for the "01-infrastructure" stack.
1. `pulumi config set stackName2 {stackName2}` - the full stack name for the "02-kubernetes" stack.
1. `pulumi config set apiDomain {domain for api}` - e.g. api.pulumi.example.com (must start with "api")
1. `pulumi config set consoleDomain {domain for console}` - e.g. app.pulumi.example.com (must start with "app")
1. `pulumi config set licenseKey {licenseKey} --secret` - the license key is available from your Pulumi contact.
1. `pulumi config set agGridLicenseKey {agGridLicenseKey} --secret` - the license key is available from your Pulumi contact.
1. `pulumi config set imageTag {imageTag}` - use "latest" or find the latest tag to pin to here: https://hub.docker.com/r/pulumi/service
1. `cat {path to api key file} | pulumi config set apiTlsKey --secret --` (on a mac or linux machine)
1. `cat {path to api cert file} | pulumi config set apiTlsCert --secret --` (on a mac or linux machine)
1. `cat {path to console key file} | pulumi config set consoleTlsKey --secret --` (on a mac or linux machine)
1. `cat {path to console cert file} | pulumi config set consoleTlsCert --secret --` (on a mac or linux machine)
Optional settings, but highly recommended for production.
If not set, "forgot password" and email invites will not work but direct sign ups and general functionality will still work. So you can skip these settings for basic testing.
1. `pulumi config set smtpServer {smtp server:port}` (for example: smtp.domain.com:587)
1. `pulumi config set smtpUsername {smtp username}`
1. `pulumi config set smtpPassword {smtp password} --secret`
1. `pulumi config set smtpFromAddress {smtp from address}` (email address that the outgoing emails come from)
1. `pulumi config set recaptchaSiteKey {recaptchaSiteKey}` (this must be a Cloudflare Turnstile widget Site Key)
1. `pulumi config set recaptchaSecretKey {recaptchaSecretKey} --secret` (this must be a Cloudflare Turnstile widget Secret Key)
Optional setting will use default value if not set.
1. `pulumi config set samlSsoEnabled true` - set to false by default.
1. `pulumi up`

### Configure DNS

To get the IP address output for the cluster, run the following in the `02-kubernetes` folder:

```
pulumi stack output ingressServiceIp
```

Create DNS A record entries for `{domain for api}` and `{domain for console}` that point to the IP returned from the above command.

### Pulumi Login

Login to your Self-Hosted Pulumi Service with the following command:

```
pulumi login {domain for api}
```

Or from the `03-application` directory:

```
pulumi login $(pulumi stack output apiUrl)
```

## Destroying the stacks

> ⚠️ Note that this will destroy all state and data for stacks deployed via the self-hosted service. So, be sure to take any backups you feel are necessary.

Due to the dependencies between the stacks, you'll need to reverse the order that you deployed them in:

1. `cd 03-application`
1. `pulumi destroy`
1. `cd ../02-kubernetes`
1. `pulumi state unprotect --all`
1. `pulumi destroy`
1. `cd ../01-infrastructure`
1. `pulumi state unprotect --all`
1. `pulumi destroy`

## Notes

* The SSO certificate has the `currentYear()` in the name. This means that it will get replaced during the first deployment of each calendar year. The expiry date on the certificate is set to 400 days so that although a deployment may not happen each year, it will be necessary to do so otherwise the certificate will expire.

## Creating and Using Self-Signed Certificates
### Creating Self-Signed Certificates
You can use the following to create self-signed certs:
  ```
  openssl \
  req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem \
  -days { days_until_expiration } -nodes -subj "/CN={ common_name }" \
  -addext "subjectAltName = DNS:{ common_name }"
  ```
  Where `{ days_until_expiration }` is set to a number of days for the cert (e.g. 365).
  And, `{ common_name }` is set to `api.{domain}` for the api cert and key and set to `app.{domain}` for the console cert and key (e.g. api.example.com and app.example.com, respectively).

For example, if creating certs for names using the `pulumi.example.com` domain:
```
openssl \
  req -x509 -newkey rsa:4096 -keyout app.key.pem -out app.cert.pem \
  -days 365 -nodes -subj "/CN=app.pulumi.example.com" \
  -addext "subjectAltName = DNS:app.pulumi.example.com"

openssl \
  req -x509 -newkey rsa:4096 -keyout api.key.pem -out api.cert.pem \
  -days 365 -nodes -subj "/CN=api.pulumi.example.com" \
  -addext "subjectAltName = DNS:api.pulumi.example.com"
```
The resultant X.key.pem and X.cert.pem files will be used when configuring the `03-application` stack.

### Configuring Self-Signed Certificates on Workstation
  > ⚠️ If using self-signed certificates, you will need to load both the `app.` and `api.` certs into your workstation (e.g. MacOS Keychain Access) so that browser access and the `pulumi` CLI work correctly.
#### MacOS
1. Launch the system as described above.
1. `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain <APP-CERT-PEM-FILE>`
1. `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain <API-CERT-PEM-FILE>`
