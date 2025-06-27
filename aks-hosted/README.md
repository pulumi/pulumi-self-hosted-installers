# Deploying Pulumi Self Hosted to Azure

This folder and sub folders contain the three Pulumi programs to build the infrastructure and deploy the containers
necessary to run Pulumi' self hosted backend onto Azure Kubernetes Service (AKS).

Relevant Documentation:

* [Self-Hosted Pulumi Service](https://www.pulumi.com/docs/guides/self-hosted/)
* [AKS-Hosted Install](https://www.pulumi.com/docs/guides/self-hosted/aks-hosted/)

> ⚠️ Before proceeding, please take the provided installation code and commit it **as-is** to your own source control.
As you make changes or customize it, please commit these to your repo as well. This will help keep track of customizations
 and updates.
> ℹ️ You will likely want to use one of the [Self-Managed Backends](https://www.pulumi.com/docs/intro/concepts/state/#logging-into-a-self-managed-backend)
 as the state storage for this installer. Please document this (in the repo your store this code, an internal wiki, etc)
 so that future updates will be straightforward for you and your colleagues.

## Prerequisites

* Domain name and access to create two endpoints:
  * api.{domain} - e.g. api.pulumi.example.com
  * app.{domain} - e.g. app.pulumi.example.com
* TLS certificates for each domain endpoint.  
You can use the following to create self-signed certs:

```bash
openssl \
req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem \
-days { days_until_expiration } -nodes -subj "/CN={ common_name }" \
-addext "subjectAltName = DNS:{ common_name }"
```

Where `{ days_until_expiration }` is set to a number of days for the cert (e.g. 365).
And, `{ common_name }` is set to `api.{domain}` for the api cert and key and set to `app.{domain}` for the console cert
and key (e.g. api.example.com and app.example.com, respectively).

> ⚠️ If using self-signed certificates, you will need to load the cert into your workstation (e.g. MacOS Keychain Access
so that browser and `pulumi` CLI access work correctly.

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

To ensure that the Pulumi program can access variables between the three deployments, you'll need to specify unique
stack names. In the instructions below these are names `{stackName1}`, `{stackName2}` and `{stackName3}`.
They can be whatever you want them to be, but they need to be consistent when asked for in the instructions.
**NOTE** The stack names should not include a number as it seems that blob container names can't have numbers in them.

To deploy entire stack, run the following in your terminal:

## 01-infrastructure

* `cd 01-infrastructure`
* `npm install`
* `pulumi stack init {stackName1}` - see note above about NO NUMBERS in stack name
* `pulumi config set azure-native:location {azure region}`
* `pulumi config set networkCidr 10.2.0.0/16` - this should be set to what you want your VNet cidr block to be  
* **Note** if you elect to provide an existing Azure VirtualNetwork, instead of `networkCidr` you'll be required to
 provide the following:`pulumi config set virtualNetworkName someVnet && pulumi config set virtualNetworkResourceGroup vnetResourceGroup`
* `pulumi config set subnetCidr 10.2.1.0/24` - this should be set to what you want your subnet cidr block to be
* `pulumi config set dbSubnetCidr 10.2.2.0/24` - this should be set to what you want your DB subnet cidr block to be
* `az login` - to avoid the following error: `Could not create service principal: graphrbac.ServicePrincipalsClient#Create:Failure`)
* `pulumi up`

## 02-kubernetes

* `cd ../02-kubernetes`

* `npm install`
* `pulumi stack init {stackName2}` - see note above about NO NUMBERS in stack name
* `pulumi config set azure-native:location {azure region}`
* `pulumi config set azureDnsZoneName {DNS_ZONE_NAME}`
* `pulumi config set azureDnsZoneResourceGroupName {DNS_ZONE_RESOURCE_GROUP_NAME}`
* `pulumi config set stackName1 {stackName1}`
  
The following settings are optional.

* `pulumi config set disableAzureDnsCertManagement true`
**NOTE** this disables the cert-manager deployment which handles SSL certificates. 03-application will need TLS certificates.
* `pulumi config set privateIpAddress {private_ip_from_vnet}` - this will disable the ingress services public IP address
 and deploy an internal load balancer. This blocks all public access to the Pulumi self-hosted app.

* `pulumi up`

## 03-application

* `cd ../03-application`

* `npm install`
* `pulumi stack init {stackName3}` - see note above about NO NUMBERS in stack name
* `pulumi config set stackName1 {stackName1}`
* `pulumi config set stackName2 {stackName2}`
* `pulumi config set apiDomain {domain for api}`
* `pulumi config set consoleDomain {domain for console}`
* `pulumi config set licenseKey {licenseKey} --secret`
* `pulumi config set imageTag {imageTag}`
* `pulumi config set samlEnabled {true | false}` - If not configuring SAML SSO initially, skip or set to false.

The following settings are optional.  
Note if not set, "forgot password" and email invites will not work but sign ups and general functionality will still work.

* `pulumi config set smtpServer {smtp server:port}` (for example: smtp.domain.com:587)
* `pulumi config set smtpUsername {smtp username}`
* `pulumi config set smtpPassword {smtp password} --secret`
* `pulumi config set smtpFromAddress {smtp from address}` (email address that the outgoing emails come from)
* `pulumi config set recaptchaSiteKey {recaptchaSiteKey}` (this must be a v2 type recaptcha)
* `pulumi config set recaptchaSecretKey {recaptchaSecretKey} --secret`
* `pulumi config set ingressAllowList {cidr range list}` (allow list of IPv4 CIDR ranges to allow access to the self-hosted
    Pulumi Cloud. Not setting this will allow the set up to be open to the internet). Proper formatting can be seen [here](https://github.com/kubernetes/ingress-nginx/blob/main/docs/user-guide/nginx-configuration/annotations.md#whitelist-source-range)
* `pulumi config set certManagerEmail {email}` (email address that will be used for certificate expirations
 purposes from letsencrypt)

{< /*<!-- markdownlint-disable MD034 -->*/ >}}
**IF CERT-MANAGER IS NOT ENABLED (on a mac or linux machine)**

* `cat {path to api key file} | pulumi config set apiTlsKey --secret --`
* `cat {path to api cert file} | pulumi config set apiTlsCert --secret --`
* `cat {path to console key file} | pulumi config set consoleTlsKey --secret --`
* `cat {path to console cert file} | pulumi config set consoleTlsCert --secret --`
**END**

* `pulumi up`

### Configure DNS

To get the IP address output for the cluster, run the following in the `02-kubernetes` folder:

```bash

pulumi stack output ingressIp
```

Create DNS A record entries for `{domain for api}` and `{domain for console}` that point to the IP returned from the
    above command.

### Pulumi Login

Login to your Self-Hosted Pulumi Service with the following command:

```bash

pulumi login {domain for api}
```

Or from the `03-application` directory:

```bash

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

* The SSO certificate has the `currentYear()` in the name. This means that it will get replaced during the first deployment
 of each calendar year. The expiry date on the certificate is set to 400 days so that although a deployment may not
 happen each year, it will be necessary to do so otherwise the certificate will expire.

## Architecture Diagrams

### Overview - Deployment Flow
```mermaid
%%{init: {'theme':'base', 'themeVariables': {'fontSize': '24px', 'fontFamily': 'Arial, sans-serif'}}}%%
graph LR
    classDef stage fill:#0078D4,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:20px
    
    INFRA[01-infrastructure<br/>Foundation Services]:::stage
    K8S[02-kubernetes<br/>AKS Cluster]:::stage
    APP[03-application<br/>Pulumi Services]:::stage
    
    INFRA --> K8S
    INFRA --> APP
    K8S --> APP
```

### Infrastructure Layer - Azure Foundation Services
```mermaid
%%{init: {'theme':'base', 'themeVariables': {'fontSize': '22px', 'fontFamily': 'Arial, sans-serif'}}}%%
graph TD
    classDef azure fill:#0078D4,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    classDef storage fill:#00BCF2,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    classDef network fill:#7FBA00,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    classDef security fill:#FFB900,stroke:#232F3E,stroke-width:3px,color:#000000,font-size:18px
    
    subgraph INFRA["01-infrastructure: Foundation Services"]
        subgraph AD["Azure Active Directory"]
            AD_PRINCIPAL[Azure AD Service Principal<br/>AKS Authentication<br/>Client Credentials<br/>RBAC Integration]:::security
            AD_ADMIN[Azure AD Admin Group<br/>User Assignment<br/>Role Mapping<br/>Access Control]:::security
        end
        
        subgraph NET["Azure Virtual Network"]
            VNET[Azure Virtual Network<br/>Custom or Existing VNet<br/>Regional Deployment<br/>Private Networking]:::network
            AKS_SUBNET[AKS Subnet<br/>10.2.1.0/24<br/>Kubernetes Nodes<br/>Azure CNI]:::network
            DB_SUBNET[Database Subnet<br/>10.2.2.0/24<br/>Delegated to MySQL<br/>Private Access]:::network
        end
        
        subgraph DB["Azure Database for MySQL"]
            MYSQL[MySQL Flexible Server<br/>Private DNS Zone<br/>VNet-only Access<br/>SSL Configuration]:::storage
            DB_PULUMI[MySQL Database<br/>Name: pulumi<br/>Application Schema<br/>Required Database]:::storage
        end
    end
    
    VNET --> AKS_SUBNET
    VNET --> DB_SUBNET
    DB_SUBNET --> MYSQL
    AD_PRINCIPAL --> VNET
```

### Storage & Security Layer - Azure Foundation
```mermaid
%%{init: {'theme':'base', 'themeVariables': {'fontSize': '22px', 'fontFamily': 'Arial, sans-serif'}}}%%
graph TD
    classDef storage fill:#00BCF2,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    classDef security fill:#FFB900,stroke:#232F3E,stroke-width:3px,color:#000000,font-size:18px
    
    subgraph STORAGE["Azure Storage & Security"]
        subgraph BLOB["Azure Storage Account"]
            STORAGE_ACCOUNT[Azure Storage Account<br/>General Purpose v2<br/>Blob Containers<br/>Access Control]:::storage
            CHECKPOINT_CONTAINER[Blob Container<br/>Checkpoints<br/>Pulumi State Storage<br/>Versioning Support]:::storage
            POLICY_CONTAINER[Blob Container<br/>Policy Packs<br/>Policy Storage<br/>Access Policies]:::storage
        end
        
        KEY_VAULT[Azure Key Vault<br/>RSA Encryption Key<br/>Access Policies<br/>Crypto Operations]:::security
    end
    
    STORAGE_ACCOUNT --> CHECKPOINT_CONTAINER
    STORAGE_ACCOUNT --> POLICY_CONTAINER
```

### Kubernetes Layer - Azure Kubernetes Service
```mermaid
%%{init: {'theme':'base', 'themeVariables': {'fontSize': '22px', 'fontFamily': 'Arial, sans-serif'}}}%%
graph TD
    classDef k8s fill:#326CE5,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    classDef network fill:#7FBA00,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    classDef security fill:#FFB900,stroke:#232F3E,stroke-width:3px,color:#000000,font-size:18px
    
    subgraph K8S["02-kubernetes: AKS Cluster & Services"]
        subgraph CLUSTER["Azure Kubernetes Service"]
            AKS[Azure Kubernetes Service<br/>Managed Kubernetes<br/>v1.29.4<br/>Azure AD + RBAC + CNI]:::k8s
            NODE_POOL[AKS Node Pool<br/>2x Standard_DS3_v2<br/>30GB OS Disks<br/>Auto-scaling Enabled]:::k8s
        end
        
        subgraph INGRESS["Ingress Components"]
            NGINX[NGINX Ingress Controller<br/>Helm Chart v4.6.1<br/>Static IP Assignment<br/>External Traffic Policy Local]:::k8s
            LOAD_BALANCER[Azure Load Balancer<br/>Public/Private Option<br/>Standard SKU<br/>Zone-redundant]:::network
        end
    end
    
    subgraph NET_REF["From Infrastructure"]
        VNET_REF[Azure Virtual Network<br/>AKS Subnet Reference<br/>Stack Dependencies<br/>Network Integration]:::network
        AD_REF[Azure AD Principal<br/>Authentication Reference<br/>RBAC Configuration<br/>Identity Integration]:::security
    end
    
    VNET_REF --> AKS
    AD_REF --> AKS
    AKS --> NODE_POOL
    AKS --> NGINX
    NGINX --> LOAD_BALANCER
```

### Certificate Management - Optional Automation
```mermaid
%%{init: {'theme':'base', 'themeVariables': {'fontSize': '22px', 'fontFamily': 'Arial, sans-serif'}}}%%
graph TD
    classDef security fill:#FFB900,stroke:#232F3E,stroke-width:3px,color:#000000,font-size:18px
    classDef azure fill:#0078D4,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    classDef k8s fill:#326CE5,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    
    subgraph CERT["Certificate Management - Optional"]
        subgraph AUTO["Automated Certificate Management"]
            CERT_MANAGER[cert-manager<br/>Helm Chart v1.12.1<br/>Azure DNS Integration<br/>ACME DNS01 Challenge]:::k8s
            
            MANAGED_ID[Azure Managed Identity<br/>Workload Identity<br/>OIDC Integration<br/>Federated Credentials]:::azure
            
            FED_CRED[Federated Identity Credential<br/>DNS Challenge Auth<br/>AKS Service Account<br/>Token Exchange]:::security
        end
        
        subgraph MANUAL["Manual Certificate Option"]
            TLS_MANUAL[External TLS Certificates<br/>Let's Encrypt<br/>Custom CA<br/>Self-signed Certificates]:::security
        end
    end
    
    subgraph EXT["External Dependencies"]
        DNS_ZONE[Azure DNS Zone<br/>DNS01 Challenge<br/>Automatic Validation<br/>Domain Control]:::azure
    end
    
    DNS_ZONE --> CERT_MANAGER
    MANAGED_ID --> FED_CRED
    FED_CRED --> CERT_MANAGER
```

### Application Layer - Pulumi Services
```mermaid
%%{init: {'theme':'base', 'themeVariables': {'fontSize': '22px', 'fontFamily': 'Arial, sans-serif'}}}%%
graph TD
    classDef pulumi fill:#8A63D2,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    classDef storage fill:#00BCF2,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    classDef security fill:#FFB900,stroke:#232F3E,stroke-width:3px,color:#000000,font-size:18px
    classDef network fill:#7FBA00,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    
    subgraph APP["03-application: Pulumi Services"]
        subgraph APPS["Kubernetes Deployments"]
            API_SERVICE[Pulumi API Service<br/>pulumi/service Image<br/>2048m CPU, 1024Mi Memory<br/>Init Container Migrations]:::pulumi
            CONSOLE_SERVICE[Pulumi Console Service<br/>pulumi/console Image<br/>1024m CPU, 512Mi Memory<br/>Web Interface]:::pulumi
        end
        
        subgraph SEARCH["Optional Search"]
            OPENSEARCH[OpenSearch StatefulSet<br/>Persistent Volume Claims<br/>Azure Disk Storage<br/>Resource Search Engine]:::storage
            OS_DASHBOARD[OpenSearch Dashboards<br/>Management Interface<br/>Search Analytics<br/>Query Interface]:::storage
        end
        
        subgraph INGRESS_CFG["NGINX Ingress Configuration"]
            INGRESS_RULES[Kubernetes Ingress<br/>api.domain + app.domain<br/>TLS Termination<br/>SSL Redirect]:::network
            IP_ALLOWLIST[Optional IP Allowlisting<br/>CIDR-based Access<br/>Security Annotations<br/>Network Policies]:::security
        end
    end
    
    subgraph SEC["Security Configuration"]
        DB_SECRETS[Database Credentials<br/>MySQL Connection<br/>Private Access Only<br/>Secure Storage]:::security
        TLS_SECRETS[TLS Certificates<br/>Manual or cert-manager<br/>Let's Encrypt Support<br/>Domain Validation]:::security
        LICENSE_SECRET[License Key<br/>Pulumi Enterprise<br/>Feature Enablement<br/>Service Activation]:::security
    end
    
    TLS_SECRETS --> INGRESS_RULES
    INGRESS_RULES --> API_SERVICE
    INGRESS_RULES --> CONSOLE_SERVICE
    IP_ALLOWLIST --> INGRESS_RULES
    
    DB_SECRETS --> API_SERVICE
    LICENSE_SECRET --> API_SERVICE
    OPENSEARCH --> API_SERVICE
```

### Data Flow - Service Interactions
```mermaid
%%{init: {'theme':'base', 'themeVariables': {'fontSize': '22px', 'fontFamily': 'Arial, sans-serif'}}}%%
graph TD
    classDef storage fill:#00BCF2,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    classDef pulumi fill:#8A63D2,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    classDef network fill:#7FBA00,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    classDef external fill:#FFA500,stroke:#FFFFFF,stroke-width:3px,color:#FFFFFF,font-size:18px
    classDef security fill:#FFB900,stroke:#232F3E,stroke-width:3px,color:#000000,font-size:18px
    
    subgraph FLOW["Data Flow Patterns"]
        API[Pulumi API Service<br/>Kubernetes Deployment<br/>State Management<br/>Resource Operations]:::pulumi
        CONSOLE[Pulumi Console<br/>Web Interface<br/>User Management<br/>Dashboard Views]:::pulumi
        MIGRATION[Database Migration<br/>Init Container<br/>Schema Updates<br/>Version Management]:::pulumi
        
        MYSQL_DB[Azure Database for MySQL<br/>Private Connection<br/>Application Database<br/>VNet-only Access]:::storage
        BLOB_STORAGE[Azure Blob Storage<br/>Checkpoint Storage<br/>Policy Packs<br/>Object Storage]:::storage
        KEY_VAULT_ENC[Azure Key Vault<br/>Encryption Keys<br/>Crypto Operations<br/>Secret Management]:::security
        
        AZURE_LB[Azure Load Balancer<br/>Public/Private Option<br/>Traffic Distribution<br/>Health Probes]:::network
        
        DNS_EXT[Domain Registration<br/>DNS Management<br/>api.domain.com<br/>app.domain.com]:::external
        SMTP_EXT[SMTP Service<br/>Office 365 / External<br/>Email Notifications<br/>Password Reset]:::external
    end
    
    API -.->|Private Connection| MYSQL_DB
    API -.->|Blob Storage API| BLOB_STORAGE
    API -.->|Encryption Operations| KEY_VAULT_ENC
    API -.->|Email Notifications| SMTP_EXT
    
    CONSOLE -.->|Internal API| API
    MIGRATION -.->|Schema Updates| MYSQL_DB
    
    AZURE_LB -.->|HTTPS Traffic| API
    AZURE_LB -.->|HTTPS Traffic| CONSOLE
    DNS_EXT -.->|DNS Resolution| AZURE_LB
```
