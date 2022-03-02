# Deploying Pulumi Self Hosted to Azure

This folder and sub folders contain the three Pulumi programs to build the infrastructure and deploy the containers necessary to run Pulumi' self hosted backend onto Azure Kubernetes Service (AKS).

> ⚠️ Before proceeding, please take the provided installation code and commit it **as-is** to your own source control. As you make changes or customize it, please commit these to your repo as well. This will help keep track of customizations and updates.

> ℹ️ You will likely want to use one of the [Self-Managed Backends](https://www.pulumi.com/docs/intro/concepts/state/#logging-into-a-self-managed-backend) as the state storage for this installer. Please document this (in the repo your store this code, an internal wiki, etc) so that future updates will be straightforward for you and your colleagues.

## What does each Pulumi program do?

### 01-infrastructure

This contains the base infrastructure needed to run the cluster and application including: 

* Active directory application
* Networking
* MySQL server and database
* Storage account and blob storage containers

### 02-kubernetes

This program contains the program to deploy an AKS cluster, alongside the ingress controller.

### 03-application

This program is to deploy the applications to the AKS cluster and also apply the Ingress resource.

## Deployment

### Naming the stacks

To ensure that the Pulumi program can access variables between the three deployments, you'll need to specify unique stack names. In the instructions below these are names `{stackName1}`, `{stackName2}` and `{stackName3}`. They can be whatever you want them to be, but they need to be consistent when asked for in the instructions. **NOTE** The stack names should not include a number as it seems that blob container names can't have numbers in them.

To deploy entire stack, run the following in your terminal:

1. `cd fully-managed-azure/01-infrastructure`
1. `npm install`
1. `pulumi stack init {stackName1}`
1. `pulumi config set azure-native:location {azure region}`
1. `pulumi config set networkCidr 10.2.0.0/16` - this should be set to what you want your VNet cidr block to be
1. `pulumi config set subnetCidr 10.2.1.0/24` - this should be set to what you want your subnet cidr block to be
1. `az login` (to avoid the following error: Could not create service principal: graphrbac.ServicePrincipalsClient#Create: Failure )
1. `pulumi up`
1. `cd ../02-kubernetes`
1. `npm install`
1. `pulumi stack init {stackName2}`
1. `pulumi config set stackName1 {stackName1}`
1. `pulumi up`
1. `cd ../03-application`
1. `npm install`
1. `pulumi stack init {stackName3}`
1. `pulumi config set stackName1 {stackName1}`
1. `pulumi config set stackName2 {stackName2}`
1. `pulumi config set apiDomain {domain for api}`
1. `pulumi config set consoleDomain {domain for console}`
1. `pulumi config set licenseKey {licenseKey} --secret`
1. `pulumi config set dockerHubUsername {dockerhub username}`
1. `pulumi config set dockerHubAccessToken {dockerhub accesstoken} --secret`
1. `pulumi config set imageTag {imageTag}`
1. `cat {path to api key file} | pulumi config set apiTlsKey --secret --` (on a mac or linux machine)
1. `cat {path to api cert file} | pulumi config set apiTlsCert --secret --` (on a mac or linux machine)
1. `cat {path to console key file} | pulumi config set consoleTlsKey --secret --` (on a mac or linux machine)
1. `cat {path to console cert file} | pulumi config set consoleTlsCert --secret --` (on a mac or linux machine)
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