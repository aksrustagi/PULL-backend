# ==============================================================================
# PULL Infrastructure - Terraform Variables
# ==============================================================================

# ==============================================================================
# Project Configuration
# ==============================================================================

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for resources"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be 'staging' or 'production'."
  }
}

# ==============================================================================
# Database Configuration
# ==============================================================================

variable "db_tier" {
  description = "Cloud SQL instance tier"
  type        = string
  default     = "db-custom-2-4096"

  # Common tiers:
  # - db-f1-micro: Shared vCPU, 0.6GB RAM (dev only)
  # - db-g1-small: Shared vCPU, 1.7GB RAM
  # - db-custom-2-4096: 2 vCPU, 4GB RAM
  # - db-custom-4-8192: 4 vCPU, 8GB RAM
  # - db-custom-8-16384: 8 vCPU, 16GB RAM
}

variable "db_disk_size" {
  description = "Cloud SQL disk size in GB"
  type        = number
  default     = 50
}

# ==============================================================================
# Redis Configuration
# ==============================================================================

variable "redis_memory_gb" {
  description = "Memorystore Redis memory in GB"
  type        = number
  default     = 1
}

# ==============================================================================
# Container Images
# ==============================================================================

variable "api_image" {
  description = "Container image for API service"
  type        = string
  default     = "gcr.io/PROJECT_ID/pull-api:latest"
}

variable "worker_image" {
  description = "Container image for Temporal worker"
  type        = string
  default     = "gcr.io/PROJECT_ID/pull-temporal-worker:latest"
}

# ==============================================================================
# Temporal Configuration
# ==============================================================================

variable "temporal_address" {
  description = "Temporal server address"
  type        = string
  default     = "temporal.pull-temporal.svc.cluster.local:7233"
}

# ==============================================================================
# Networking
# ==============================================================================

variable "enable_private_google_access" {
  description = "Enable private Google access for the subnet"
  type        = bool
  default     = true
}

# ==============================================================================
# Cloud Run Configuration
# ==============================================================================

variable "api_min_instances" {
  description = "Minimum number of API instances"
  type        = number
  default     = 0
}

variable "api_max_instances" {
  description = "Maximum number of API instances"
  type        = number
  default     = 100
}

variable "worker_min_instances" {
  description = "Minimum number of worker instances"
  type        = number
  default     = 1
}

variable "worker_max_instances" {
  description = "Maximum number of worker instances"
  type        = number
  default     = 50
}

# ==============================================================================
# Monitoring & Alerting
# ==============================================================================

variable "enable_monitoring" {
  description = "Enable Cloud Monitoring and alerting"
  type        = bool
  default     = true
}

variable "alert_notification_channels" {
  description = "List of notification channel IDs for alerts"
  type        = list(string)
  default     = []
}

# ==============================================================================
# Security
# ==============================================================================

variable "enable_cloud_armor" {
  description = "Enable Cloud Armor WAF"
  type        = bool
  default     = true
}

variable "allowed_ip_ranges" {
  description = "List of allowed IP ranges for restricted access"
  type        = list(string)
  default     = []
}
