# ==============================================================================
# PULL Infrastructure - Provider Configuration
# ==============================================================================
# This file configures the providers used by this Terraform configuration.
# All provider-specific settings are centralized here for maintainability.
#
# Authentication:
# - For local development: Use `gcloud auth application-default login`
# - For CI/CD: Use Workload Identity Federation or service account key
# - For GKE: Use Workload Identity
#
# Best Practices:
# - Always specify project, region, and zone explicitly
# - Use default_labels for consistent resource tagging
# - Enable request batching for better API efficiency
# ==============================================================================

# ==============================================================================
# Google Cloud Platform Provider (GA)
# ==============================================================================
# Primary provider for stable GCP resources.

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone

  # Default labels applied to all resources that support labels
  # These can be overridden at the resource level
  default_labels = {
    project     = "pull"
    environment = var.environment
    managed_by  = "terraform"
    cost_center = var.cost_center
    owner       = var.owner
  }

  # Request batching for improved API efficiency
  # Reduces quota consumption and improves performance
  batching {
    enable_batching = true
    send_after      = "10s"
  }

  # User-agent suffix for tracking Terraform usage
  user_project_override = true

  # Request timeout and retry settings
  request_timeout = "60s"
}

# ==============================================================================
# Google Cloud Platform Provider (Beta)
# ==============================================================================
# Beta provider for preview features that are not yet GA.
# Use sparingly - beta features may have breaking changes.
#
# Resources using beta provider:
# - google_compute_security_policy (adaptive_protection_config)
# - Some Cloud Run v2 features
# ==============================================================================

provider "google-beta" {
  project = var.project_id
  region  = var.region
  zone    = var.zone

  default_labels = {
    project     = "pull"
    environment = var.environment
    managed_by  = "terraform"
    cost_center = var.cost_center
    owner       = var.owner
  }

  batching {
    enable_batching = true
    send_after      = "10s"
  }

  user_project_override = true
  request_timeout       = "60s"
}

# ==============================================================================
# Random Provider
# ==============================================================================
# Used for generating secure random values for passwords, suffixes, etc.
# Values are stored in state and remain consistent across applies.

provider "random" {}

# ==============================================================================
# Null Provider
# ==============================================================================
# Used for resource dependencies, triggers, and provisioners.

provider "null" {}

# ==============================================================================
# Time Provider
# ==============================================================================
# Used for time-based resources and introducing delays.

provider "time" {}

# ==============================================================================
# Provider Aliases (Optional)
# ==============================================================================
# Aliases can be used for multi-region deployments or cross-project resources.
# Uncomment and configure as needed.
#
# Example: Provider for DR region
# provider "google" {
#   alias   = "dr"
#   project = var.project_id
#   region  = var.dr_region
#   zone    = "${var.dr_region}-a"
# }
#
# Example: Provider for shared services project
# provider "google" {
#   alias   = "shared"
#   project = var.shared_services_project_id
#   region  = var.region
# }
# ==============================================================================
