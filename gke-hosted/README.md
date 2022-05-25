# WORK IN PROGRESS
Status: Although the service is not fully operational, the various resources are created and key connections (e.g. to DB and Buckets) are working. However, service is not working yet - errors are thrown when trying to sign up.

TODOs:
- Get Console Service to API Service connectivity working: Devtools in browser show problems when signing up.
  - Need to test and dig into the connectivity between the services.
  - May be a CORs thing?
- Remove public access to MySQL DB: Limit access for API pod.
- Remove public access to Buckets (not actually sure it's enabled but need to make sure it is not): limit access to only for API pod




# Deploying Pulumi Self Hosted to Azure

This folder and sub folders contain the three Pulumi programs to build the infrastructure and deploy the containers necessary to run Pulumi' self hosted backend onto Google Kubernetes Engine (GKE).

> ⚠️ Before proceeding, please take the provided installation code and commit it **as-is** to your own source control. As you make changes or customize it, please commit these to your repo as well. This will help keep track of customizations and updates.

> ℹ️ You will likely want to use one of the [Self-Managed Backends](https://www.pulumi.com/docs/intro/concepts/state/#logging-into-a-self-managed-backend) as the state storage for this installer. Please document this (in the repo your store this code, an internal wiki, etc) so that future updates will be straightforward for you and your colleagues.

## Prerequisites
* Domain name and access to create two endpoints:
  * api.{domain} - e.g. api.pulumi.example.com
  * app.{domain} - e.g. app.pulumi.example.com
* TLS certificates for each domain endpoint.  
You can use the following to create self-signed certs:
  ```
  openssl \
  req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem \
  -days { days_until_expiration } -nodes -subj "/CN={ common_name }" \
  -addext "subjectAltName = DNS:{ common_name }"
  ```
  Where `{ days_until_expiration }` is set to a number of days for the cert (e.g. 365).  
  And, `{ common_name }` is set to `api.{domain}` for the api cert and key and set to `app.{domain}` for the console cert and key (e.g. api.example.com and app.example.com, respectively).

  > ⚠️ If using self-signed certificates, you will need to load the cert into your workstation (e.g. MacOS Keychain Access) so that browser and `pulumi` CLI access work correctly.

## What does each Pulumi program do?

### 01-infrastructure

This contains the base infrastructure needed to run the cluster and application including: 

* Networking
* MySQL server and database
* Buckets for state and policy storage

### 02-kubernetes

This program contains the program to deploy GKE cluster, alongside the ingress controller.

### 03-application

This program is to deploy the applications to the GKE cluster and also apply the Ingress resource.

## Deployment

### Naming the stacks

To ensure that the Pulumi program can access variables between the three deployments, you'll need to specify unique stack names. In the instructions below these are names `{stackName1}`, `{stackName2}` and `{stackName3}`. They can be whatever you want them to be, but they need to be consistent when asked for in the instructions.

To deploy entire stack, run the following in your terminal:

1. `cd 01-infrastructure`
1. `npm install`
1. `pulumi stack init {stackName1}` 
1. `pulumi config set gcp:project {GCP project name}`
1. `pulumi config set gcp:region {GCP region}` - e.g. us-east1
1. `pulumi config set gcp:zone {GCP zone}` - e.g. us-east1-a
Optional settings (will use default values if not set)
1. `pulumi config set commonName {common base name to use for resources}` - uses "pulumiselfhosted" if not set
1. `pulumi config set dbInstanceType {GCP SQL DB instance type}` - uses "db-g1-small" if not set
1. `pulumi config set dbUser {user name for SQL DB}` - uses "pulumiadmin" if not set
1. `pulumi up` - Wait to complete before proceeding.
1. `cd ../02-kubernetes`
1. `npm install`
1. `pulumi stack init {stackName2}` 
1. `pulumi config set gcp:project {GCP project name}`
1. `pulumi config set gcp:region {GCP region}` - e.g. us-east1
1. `pulumi config set gcp:zone {GCP zone}` - e.g. us-east1-a
1. `pulumi config set stackName1 {stackName1}` - the full stack name for the "01-infrastructure" stack.
Optional settings (will use default values if not set)
1. `pulumi config set commonName {common base name to use for resources}` - uses "pulumiselfhosted" if not set
1. `pulumi config set clusterVersion {Kubernetes cluster version to use}` - defaults to latest version currently supported by the installer.
1. `pulumi up` - Wait to complete before proceeding.
1. `cd ../03-application`
1. `npm install`
1. `pulumi stack init {stackName3}` 
1. `pulumi config set stackName1 {stackName1}` - the full stack name for the "01-infrastructure" stack.
1. `pulumi config set stackName2 {stackName2}` - the full stack name for the "02-kubernetes" stack.
1. `pulumi config set apiDomain {domain for api}` - e.g. api.pulumi.example.com (must start with "api")
1. `pulumi config set consoleDomain {domain for console}` - e.g. app.pulumi.example.com (must start with "app")
1. `pulumi config set licenseKey {licenseKey} --secret`
1. `pulumi config set imageTag {imageTag}` - use "latest" or find the latest tag to pin to here: https://hub.docker.com/r/pulumi/service
1. `cat {path to api key file} | pulumi config set apiTlsKey --secret --` (on a mac or linux machine)
1. `cat {path to api cert file} | pulumi config set apiTlsCert --secret --` (on a mac or linux machine)
1. `cat {path to console key file} | pulumi config set consoleTlsKey --secret --` (on a mac or linux machine)
1. `cat {path to console cert file} | pulumi config set consoleTlsCert --secret --` (on a mac or linux machine)
Semi-optional settings.
If not set, "forgot password" and email invites will not work but direct sign ups and general functionality will still work.
1. `pulumi config set smtpServer {smtp server:port}` (for example: smtp.domain.com:587)
1. `pulumi config set smtpUsername {smtp username}`
1. `pulumi config set smtpPassword {smtp password} --secret`
1. `pulumi config set smtpFromAddress {smtp from address}` (email address that the outgoing emails come from)
1. `pulumi config set recaptchaSiteKey {recaptchaSiteKey}` (this must be a v2 type recaptcha)
1. `pulumi config set recaptchaSecretKey {recaptchaSecretKey} --secret`
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

Due to the dependencies between the stacks, you'll need to reverse the order that you deployed them in:

1. `cd 03-application`
1. `pulumi destroy` 
1. `cd ../02-kubernetes`
1. `pulumi destroy`
1. `cd ../01-infrastructure`
1. `pulumi destroy`

## Notes

* The SSO certificate has the `currentYear()` in the name. This means that it will get replaced during the first deployment of each calendar year. The expiry date on the certificate is set to 400 days so that although a deployment may not happen each year, it will be necessary to do so otherwise the certificate will expire.