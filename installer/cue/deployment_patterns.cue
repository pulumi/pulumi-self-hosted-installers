// deployment_patterns.cue
package config

deploymentOptions: {
  aws: {
    platforms: ["eks", "ecs", "byoK8s"]
    services: {
      opensearch: ["image", "awsOpensearch"]
      opensearchDashboards: ["image"]
      api: ["image"]
      console: ["image"]
      db: ["image", "awsRDS"]
      migration: ["image"]
    }
  }
  azure: {
    platforms: ["aks", "byoK8s"]
    services: {
      opensearch: ["image"]
      opensearchDashboards: ["image"]
      api: ["image"]
      console: ["image"]
      db: ["image", "azureDB"]
      migration: ["image"]
    }
  }
  gcp: {
    platforms: ["gke", "byoK8s"]
    services: {
      opensearch: ["image"]
      opensearchDashboards: ["image"]
      api: ["image"]
      console: ["image"]
      db: ["image", "gcpDB"]
      migration: ["image"]
    }
  }
}
