// deployment_patterns.cue
package config

#ServiceOption: {
  name: string
  description?: string
}

#ServiceType: {
  containerImage: #ServiceOption & {name: "containerImage", description: "Service powered by a container image"}
  awsRDS: #ServiceOption & {name: "awsRDS", description: "AWS Relational Database Service"}
  awsOpensearch: #ServiceOption & {name: "awsOpensearch", description: "AWS Opensearch Service"}
  azureDatabase: #ServiceOption & {name: "azureDatabase", description: "Azure Database for MySQL"}
  gcpDatabase: #ServiceOption & {name: "gcpDatabase", description: "Google Cloud SQL"}
}

#DefaultServices: [#ServiceType.containerImage]

#PlatformOption: {
  name: string
  description: string
}

#DeploymentOption: {
  description: string
  platforms: [...#PlatformOption]
  services: {
    opensearch: [...#ServiceOption]
    opensearchDashboards: [...#ServiceOption]
    api: [...#ServiceOption]
    console: [...#ServiceOption]
    db: [...#ServiceOption]
    migration: [...#ServiceOption]
  }
}

deploymentOptions: {
  minikube: #DeploymentOption & {
    description: *"Local Kubernetes cluster using Minikube" | _
    platforms: [
      #PlatformOption & {name: "minikube", description: "Local Kubernetes cluster"}
    ]
    services: {
      opensearch: #DefaultServices + [#ServiceType.awsOpensearch]
      opensearchDashboards: #DefaultServices
      api: #DefaultServices
      console: #DefaultServices
      db: #DefaultServices
      migration: #DefaultServices
    }
  }
  aws: #DeploymentOption & {
    description: *"Deployment on AWS using various services like EKS, ECS, and EC2" | _
    platforms: [
      #PlatformOption & {name: "eks", description: "AWS Elastic Kubernetes Service"},
      #PlatformOption & {name: "ecs", description: "AWS Elastic Container Service"},
      #PlatformOption & {name: "ec2", description: "AWS EC2 instance"},
      #PlatformOption & {name: "byoK8s", description: "Bring your own Kubernetes cluster"}
    ]
    services: {
      opensearch: #DefaultServices + [#ServiceType.awsOpensearch]
      opensearchDashboards: #DefaultServices
      api: #DefaultServices
      console: #DefaultServices
      db: #DefaultServices + [#ServiceType.awsRDS]
      migration: #DefaultServices
    }
  }
  azure: #DeploymentOption & {
    description: *"Deployment on Azure using AKS and other Azure services" | _
    platforms: [
      #PlatformOption & {name: "aks", description: "Azure Kubernetes Service"},
      #PlatformOption & {name: "byoK8s", description: "Bring your own Kubernetes cluster"}
    ]
    services: {
      opensearch: #DefaultServices
      opensearchDashboards: #DefaultServices
      api: #DefaultServices
      console: #DefaultServices
      db: #DefaultServices + [#ServiceType.azureDatabase]
      migration: #DefaultServices
    }
  }
  gcp: #DeploymentOption & {
    description: *"Deployment on Google Cloud Platform using GKE and other GCP services" | _
    platforms: [
      #PlatformOption & {name: "gke", description: "Google Kubernetes Engine"},
      #PlatformOption & {name: "byoK8s", description: "Bring your own Kubernetes cluster"}
    ]
    services: {
      opensearch: #DefaultServices
      opensearchDashboards: #DefaultServices
      api: #DefaultServices
      console: #DefaultServices
      db: #DefaultServices + [#ServiceType.gcpDatabase]
      migration: #DefaultServices
    }
  }
}
