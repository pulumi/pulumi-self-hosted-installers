// pulumi_config.cue
package config

import "list"

// Reusable patterns
CIDR = =~"^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$"
DomainName = =~"^[a-zA-Z0-9.-]+$"
EmailAddress = =~"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
IPv4 = =~"^([0-9]{1,3}\.){3}[0-9]{1,3}$"
AWSRegion = =~"^[a-z]{2}-[a-z]+-[0-9]$"
AwsSubnetID = =~"^subnet-[a-zA-Z0-9]+$"
AwsVpcID = =~"^vpc-[a-zA-Z0-9]+$"
ACMCertificateARN = =~"^arn:aws:acm:[a-z0-9-]+:[0-9]+:certificate/[a-zA-Z0-9-]+$"

import "config"

// Deployment options
deploymentOptions: config.deploymentOptions

// Selected deployment pattern
deploymentPattern: {
  // Cloud provider (aws, azure, gcp)
  provider: string & list.Contains(deploymentOptions, _)
  // Deployment platform (e.g., eks, aks, gke)
  platform: string & list.Contains(deploymentOptions[_provider].platforms.name, _)
  // Selected services for deployment
  services: [string] & [ for _, service in _ { service & list.Contains(deploymentOptions[_provider].services, service) }]
}

// Global configuration
global: {
  // User-selected deployment options
  selectedDeploymentOptions: {
    // Cloud provider (aws, azure, gcp)
    provider: string & list.Contains(deploymentOptions, _)
    // Deployment platform (e.g., eks, aks, gke)
    platform: string & list.Contains(deploymentOptions[_provider].platforms.name, _)
    // Selected services for deployment
    services: {
      [service: string]: {
        deployment: string & list.Contains(deploymentOptions[_provider].services, service)
      }
    }
  }
  // Azure location (e.g., eastus)
  location: string & =~"^[a-zA-Z0-9_-]+$"
  network: {
    // CIDR block for VNet
    cidr: *"10.2.0.0/16" | CIDR
    subnet: {
      // CIDR block for subnet
      cidr: *"10.2.1.0/24" | CIDR
      // CIDR block for DB subnet
      dbCidr: *"10.2.2.0/24" | CIDR
    }
  }
  dns: {
    // Azure DNS Zone Name
    zoneName: string & =~"^[a-zA-Z0-9_-]+$"
    // Azure DNS Zone Resource Group
    resourceGroup: string & =~"^[a-zA-Z0-9_-]+$"
  }
  domain: {
    // Domain for API
    api: string & DomainName
    // Domain for Console
    console: string & DomainName
  }
  // Pulumi License Key
  license: string
  smtp: {
    // SMTP Server with port
    server: string & =~"^[a-zA-Z0-9._-]+:[0-9]{1,5}$"
    // SMTP Username
    username: string
    // SMTP Password
    password: string
    // SMTP From Address
    fromAddress: string & EmailAddress
  }
  recaptcha: {
    // ReCAPTCHA Site Key
    siteKey: string & len > 0
    // ReCAPTCHA Secret Key
    secretKey: string & len > 0
  }
  // SAML SSO Enabled
  saml: enabled: *false | bool
  // CIDR Allow List for Ingress
  ingress: allowList: [CIDR]
  // Cert Manager Email for Let's Encrypt
  certManager: email: string & EmailAddress
}

// Conditional configuration based on deployment options
config: {
  // Image tag for container images
  imageTag: "latest" | string & =~"^[a-zA-Z0-9._-]+$"

  // AWS specific configurations
  aws?: {
    // AWS region (e.g., us-west-2)
    region: string & AWSRegion
    vpc: {
      // VPC ID
      id: string & AwsVpcID
      subnets: {
        // List of public subnet IDs
        public: [AwsSubnetID]
        // List of private subnet IDs
        private: [AwsSubnetID]
        // List of isolated subnet IDs
        isolated: [AwsSubnetID]
      }
    }
    // Base stack reference
    baseStackReference: string & len > 0
    // ACM Certificate ARN
    acmCertificateArn: string & ACMCertificateARN
    // KMS Service Key ID
    kmsServiceKeyId: string & len > 0

    // Additional configurations for specific services
    db?: {
      // DB instance type for AWS RDS
      instanceType: string & len > 0 if global.selectedDeploymentOptions.services.db?.deployment == "awsRDS"
    }
    opensearch?: {
      // Instance type for AWS OpenSearch
      instanceType: string & len > 0  if global.selectedDeploymentOptions.services.opensearch?.deployment, "awsOpensearch")
    }
  }

  // Azure specific configurations
  azure?: {
    stackNames: {
      // Stack name for infrastructure
      infrastructure: string & len > 0
      // Stack name for Kubernetes
      kubernetes: string & len > 0
      // Stack name for application
      application: string & len > 0
    }
    virtualNetwork: {
      // Existing Azure Virtual Network Name
      name?: string & =~"^[a-zA-Z0-9_-]+$"
      // Resource Group for Existing Virtual Network
      resourceGroup?: string & =~"^[a-zA-Z0-9_-]+$"
    }
    // Disable Azure DNS Cert Management
    disableDnsCertManagement: bool
    // Private IP Address from VNet
    privateIpAddress?: string & IPv4

    // Additional configurations for specific services
    db?: {
      // DB instance type for Azure DB
      instanceType: string & len > 0  if global.selectedDeploymentOptions.services.db?.deployment, "azureDB")
    }
  }

  // GCP specific configurations
  gcp?: {
    // GCP project name
    project: string & len > 0
    // GCP region
    region: string & len > 0
    // GCP zone
    zone: string & len > 0
    stackNames: {
      // Stack name for infrastructure
      infrastructure: string & len > 0
      // Stack name for Kubernetes
      kubernetes: string & len > 0
      // Stack name for application
      application: string & len > 0
    }
    // Common name for resources
    commonName?: string & len > 0

    // Additional configurations for specific services
    db?: {
      // DB instance type for GCP DB
      instanceType: string & len > 0  if global.selectedDeploymentOptions.services.db?.deployment, "gcpDB")
    }
  }
}
