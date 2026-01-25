# ==============================================================================
# PULL Infrastructure - Terraform Version Constraints
# ==============================================================================
# This file specifies the required Terraform version and provider versions
# to ensure consistent deployments across all environments.
#
# Version Pinning Strategy:
# - Terraform core: Pin to minor version (~>) for stability
# - Providers: Pin to minor version for feature compatibility
# - Update versions regularly after testing in staging
# ==============================================================================

terraform {
  # Require Terraform 1.6+ for latest features and security patches
  required_version = ">= 1.6.0, < 2.0.0"

  required_providers {
    # Google Cloud Platform provider
    # https://registry.terraform.io/providers/hashicorp/google/latest
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }

    # Google Cloud Platform Beta provider (for preview features)
    # Required for some Cloud Armor and Cloud Run features
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }

    # Random provider for generating secure passwords and IDs
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }

    # Null provider for resource dependencies and triggers
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }

    # Time provider for time-based resources and delays
    time = {
      source  = "hashicorp/time"
      version = "~> 0.10"
    }
  }

  # ==============================================================================
  # Backend Configuration
  # ==============================================================================
  # Remote state storage in Google Cloud Storage for team collaboration
  # and state locking to prevent concurrent modifications.
  #
  # Initialize with: terraform init -backend-config="bucket=BUCKET_NAME"
  # ==============================================================================
  backend "gcs" {
    # Bucket name configured via -backend-config or environment
    # bucket  = "pull-terraform-state-ENVIRONMENT"
    prefix = "terraform/state"

    # State locking is automatic with GCS backend
  }
}

# ==============================================================================
# Lifecycle Management
# ==============================================================================
# Define lifecycle rules that apply globally across resources.
# Individual resources can override these as needed.
#
# Best Practices:
# - Use prevent_destroy for stateful resources (databases, storage)
# - Use create_before_destroy for zero-downtime updates
# - Use ignore_changes for fields managed outside Terraform
# ==============================================================================

# Note: Lifecycle blocks must be defined within resources.
# This comment serves as documentation for the project's lifecycle strategy.
#
# Critical Resources (prevent_destroy = true):
# - google_sql_database_instance.main
# - google_redis_instance.main
# - google_kms_crypto_key.*
# - google_storage_bucket.backups
#
# Zero-Downtime Resources (create_before_destroy = true):
# - google_compute_managed_ssl_certificate.*
# - google_cloud_run_v2_service.*
#
# Externally Managed Fields (ignore_changes):
# - Cloud Run container images (updated by CI/CD)
# - Secret Manager secret versions (updated manually)
