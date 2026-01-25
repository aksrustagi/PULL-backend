# ==============================================================================
# PULL Infrastructure - Terraform Variables
# ==============================================================================
# This file defines all input variables for the PULL infrastructure.
# Variables are organized by category for easier navigation.
#
# Usage:
#   terraform plan -var-file="environments/production.tfvars"
#   terraform apply -var-file="environments/production.tfvars"
#
# Variable Naming Convention:
#   - Use snake_case for variable names
#   - Prefix with resource type where applicable (e.g., db_, redis_, api_)
#   - Use descriptive names that indicate purpose
# ==============================================================================

# ==============================================================================
# Project Configuration
# ==============================================================================
# Core project settings that apply across all resources.

variable "project_id" {
  description = "The GCP project ID where resources will be created. Must be an existing project with billing enabled."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "Project ID must be 6-30 characters, start with a letter, and contain only lowercase letters, numbers, and hyphens."
  }
}

variable "region" {
  description = "The GCP region for regional resources (Cloud SQL, Redis, Cloud Run). Choose based on user proximity and compliance requirements."
  type        = string
  default     = "us-central1"

  validation {
    condition     = can(regex("^[a-z]+-[a-z]+[0-9]+$", var.region))
    error_message = "Region must be a valid GCP region (e.g., us-central1, europe-west1)."
  }
}

variable "zone" {
  description = "The GCP zone for zonal resources. Should be within the specified region."
  type        = string
  default     = "us-central1-a"

  validation {
    condition     = can(regex("^[a-z]+-[a-z]+[0-9]+-[a-z]$", var.zone))
    error_message = "Zone must be a valid GCP zone (e.g., us-central1-a)."
  }
}

variable "environment" {
  description = "The deployment environment. Controls resource sizing, redundancy, and security settings."
  type        = string

  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be 'development', 'staging', or 'production'."
  }
}

# ==============================================================================
# Resource Labeling / Tagging
# ==============================================================================
# Labels for cost allocation, ownership tracking, and resource organization.

variable "cost_center" {
  description = "Cost center code for billing allocation. Used for chargeback and cost tracking."
  type        = string
  default     = "engineering"

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.cost_center))
    error_message = "Cost center must contain only lowercase letters, numbers, and hyphens."
  }
}

variable "owner" {
  description = "Team or individual responsible for this infrastructure. Used for operational contact."
  type        = string
  default     = "platform-team"

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.owner))
    error_message = "Owner must contain only lowercase letters, numbers, and hyphens."
  }
}

variable "data_classification" {
  description = "Data sensitivity classification. Affects encryption and access control settings."
  type        = string
  default     = "confidential"

  validation {
    condition     = contains(["public", "internal", "confidential", "restricted"], var.data_classification)
    error_message = "Data classification must be 'public', 'internal', 'confidential', or 'restricted'."
  }
}

# ==============================================================================
# Database Configuration (Cloud SQL PostgreSQL)
# ==============================================================================
# Settings for the primary PostgreSQL database instance.

variable "db_tier" {
  description = <<-EOT
    Cloud SQL machine tier. Common options:
    - db-f1-micro: Shared vCPU, 0.6GB RAM (dev only, not for production)
    - db-g1-small: Shared vCPU, 1.7GB RAM (staging)
    - db-custom-2-4096: 2 vCPU, 4GB RAM (small production)
    - db-custom-4-8192: 4 vCPU, 8GB RAM (medium production)
    - db-custom-8-16384: 8 vCPU, 16GB RAM (large production)
    - db-custom-16-32768: 16 vCPU, 32GB RAM (enterprise)
  EOT
  type        = string
  default     = "db-custom-2-4096"

  validation {
    condition     = can(regex("^db-(f1-micro|g1-small|custom-[0-9]+-[0-9]+)$", var.db_tier))
    error_message = "Database tier must be a valid Cloud SQL machine type."
  }
}

variable "db_disk_size" {
  description = "Initial disk size in GB for the Cloud SQL instance. Minimum 10GB, auto-resize enabled."
  type        = number
  default     = 50

  validation {
    condition     = var.db_disk_size >= 10 && var.db_disk_size <= 65536
    error_message = "Disk size must be between 10GB and 65536GB."
  }
}

variable "db_max_disk_size" {
  description = "Maximum disk size in GB for auto-resize. Set to 0 to disable auto-resize limit."
  type        = number
  default     = 500

  validation {
    condition     = var.db_max_disk_size >= 0 && var.db_max_disk_size <= 65536
    error_message = "Max disk size must be between 0GB (unlimited) and 65536GB."
  }
}

variable "db_max_connections" {
  description = "Maximum number of concurrent database connections. Increase for high-traffic applications."
  type        = string
  default     = "500"

  validation {
    condition     = tonumber(var.db_max_connections) >= 25 && tonumber(var.db_max_connections) <= 5000
    error_message = "Max connections must be between 25 and 5000."
  }
}

variable "db_backup_retention_days" {
  description = "Number of days to retain automated backups. Minimum 7 for production workloads."
  type        = number
  default     = 30

  validation {
    condition     = var.db_backup_retention_days >= 1 && var.db_backup_retention_days <= 365
    error_message = "Backup retention must be between 1 and 365 days."
  }
}

variable "backup_location" {
  description = "Geographic location for database backups. Use multi-region for disaster recovery (e.g., 'us' or 'eu')."
  type        = string
  default     = "us"

  validation {
    condition     = contains(["us", "eu", "asia"], var.backup_location) || can(regex("^[a-z]+-[a-z]+[0-9]+$", var.backup_location))
    error_message = "Backup location must be a multi-region (us, eu, asia) or a specific region."
  }
}

variable "enable_read_replica" {
  description = "Enable read replica for production workloads. Useful for read-heavy applications and reporting."
  type        = bool
  default     = false
}

variable "replica_region" {
  description = "Region for the read replica. Leave empty to use the same region as the primary instance."
  type        = string
  default     = ""
}

variable "ad_domain" {
  description = "Active Directory domain for Cloud SQL integration. Leave empty if not using AD authentication."
  type        = string
  default     = ""
}

variable "deny_maintenance_start" {
  description = "Start date for maintenance deny period (YYYY-MM-DD). Used to prevent maintenance during critical business periods."
  type        = string
  default     = "2024-12-20"
}

variable "deny_maintenance_end" {
  description = "End date for maintenance deny period (YYYY-MM-DD). Must be within 90 days of start date."
  type        = string
  default     = "2025-01-05"
}

# ==============================================================================
# Redis Configuration (Memorystore)
# ==============================================================================
# Settings for the Redis cache instance.

variable "redis_memory_gb" {
  description = "Memory size in GB for the Redis instance. Minimum 1GB, maximum 300GB."
  type        = number
  default     = 1

  validation {
    condition     = var.redis_memory_gb >= 1 && var.redis_memory_gb <= 300
    error_message = "Redis memory must be between 1GB and 300GB."
  }
}

# ==============================================================================
# Container Images
# ==============================================================================
# Docker image references for Cloud Run services.

variable "api_image" {
  description = "Container image URI for the API service. Should include tag or digest for reproducibility."
  type        = string
  default     = "gcr.io/PROJECT_ID/pull-api:latest"

  validation {
    condition     = can(regex("^(gcr\\.io|[a-z]+-docker\\.pkg\\.dev|docker\\.io)/", var.api_image))
    error_message = "Image must be from a valid container registry (gcr.io, Artifact Registry, or Docker Hub)."
  }
}

variable "worker_image" {
  description = "Container image URI for the Temporal worker service. Should include tag or digest for reproducibility."
  type        = string
  default     = "gcr.io/PROJECT_ID/pull-temporal-worker:latest"

  validation {
    condition     = can(regex("^(gcr\\.io|[a-z]+-docker\\.pkg\\.dev|docker\\.io)/", var.worker_image))
    error_message = "Image must be from a valid container registry (gcr.io, Artifact Registry, or Docker Hub)."
  }
}

variable "api_commit_sha" {
  description = "Git commit SHA for the API deployment. Used for tracking and rollback."
  type        = string
  default     = "unknown"
}

variable "worker_commit_sha" {
  description = "Git commit SHA for the worker deployment. Used for tracking and rollback."
  type        = string
  default     = "unknown"
}

# ==============================================================================
# Temporal Configuration
# ==============================================================================
# Settings for Temporal workflow orchestration.

variable "temporal_address" {
  description = "Temporal server address (host:port). Can be Temporal Cloud or self-hosted."
  type        = string
  default     = "temporal.pull-temporal.svc.cluster.local:7233"
}

# ==============================================================================
# Networking Configuration
# ==============================================================================
# VPC, subnet, and connectivity settings.

variable "enable_private_google_access" {
  description = "Enable private Google access for subnets. Required for resources without public IPs to access Google APIs."
  type        = bool
  default     = true
}

variable "subnet_cidr_main" {
  description = "CIDR range for the main compute subnet. Must not overlap with other subnets."
  type        = string
  default     = "10.0.0.0/20"

  validation {
    condition     = can(cidrhost(var.subnet_cidr_main, 0))
    error_message = "Must be a valid CIDR range."
  }
}

variable "subnet_cidr_pods" {
  description = "Secondary CIDR range for GKE pods (if using GKE in future). Must not overlap with other ranges."
  type        = string
  default     = "10.1.0.0/16"

  validation {
    condition     = can(cidrhost(var.subnet_cidr_pods, 0))
    error_message = "Must be a valid CIDR range."
  }
}

variable "subnet_cidr_services" {
  description = "Secondary CIDR range for GKE services (if using GKE in future). Must not overlap with other ranges."
  type        = string
  default     = "10.2.0.0/20"

  validation {
    condition     = can(cidrhost(var.subnet_cidr_services, 0))
    error_message = "Must be a valid CIDR range."
  }
}

variable "subnet_cidr_data" {
  description = "CIDR range for the data services subnet (Cloud SQL, Redis). Isolated for security."
  type        = string
  default     = "10.3.0.0/24"

  validation {
    condition     = can(cidrhost(var.subnet_cidr_data, 0))
    error_message = "Must be a valid CIDR range."
  }
}

variable "subnet_cidr_proxy" {
  description = "CIDR range for the proxy-only subnet (internal load balancers). GCP requirement."
  type        = string
  default     = "10.4.0.0/24"

  validation {
    condition     = can(cidrhost(var.subnet_cidr_proxy, 0))
    error_message = "Must be a valid CIDR range."
  }
}

variable "vpc_connector_cidr" {
  description = "CIDR range for the Serverless VPC Access connector. Must be /28 and not overlap with other ranges."
  type        = string
  default     = "10.5.0.0/28"

  validation {
    condition     = can(cidrhost(var.vpc_connector_cidr, 0)) && can(regex("/28$", var.vpc_connector_cidr))
    error_message = "VPC connector CIDR must be a /28 range."
  }
}

# ==============================================================================
# Cloud Run Configuration
# ==============================================================================
# Scaling and resource settings for Cloud Run services.

variable "api_min_instances" {
  description = "Minimum number of API instances to keep warm. Set to 0 for scale-to-zero (cost savings) or 1+ for low latency."
  type        = number
  default     = 0

  validation {
    condition     = var.api_min_instances >= 0 && var.api_min_instances <= 100
    error_message = "Min instances must be between 0 and 100."
  }
}

variable "api_max_instances" {
  description = "Maximum number of API instances for auto-scaling. Limits costs and prevents runaway scaling."
  type        = number
  default     = 100

  validation {
    condition     = var.api_max_instances >= 1 && var.api_max_instances <= 1000
    error_message = "Max instances must be between 1 and 1000."
  }
}

variable "worker_min_instances" {
  description = "Minimum number of worker instances. Set to 1+ for always-on processing of Temporal workflows."
  type        = number
  default     = 1

  validation {
    condition     = var.worker_min_instances >= 0 && var.worker_min_instances <= 100
    error_message = "Min instances must be between 0 and 100."
  }
}

variable "worker_max_instances" {
  description = "Maximum number of worker instances for handling Temporal workflow load."
  type        = number
  default     = 50

  validation {
    condition     = var.worker_max_instances >= 1 && var.worker_max_instances <= 1000
    error_message = "Max instances must be between 1 and 1000."
  }
}

variable "enable_public_api" {
  description = "Allow public (unauthenticated) access to the API. Protected by Cloud Armor in production."
  type        = bool
  default     = true
}

variable "enable_tracing" {
  description = "Enable Cloud Trace distributed tracing for request correlation and debugging."
  type        = bool
  default     = true
}

# ==============================================================================
# Monitoring & Alerting
# ==============================================================================
# Settings for Cloud Monitoring integration and alert policies.

variable "enable_monitoring" {
  description = "Enable Cloud Monitoring alerting policies and dashboards."
  type        = bool
  default     = true
}

variable "alert_notification_channels" {
  description = "List of notification channel IDs for alerting (email, Slack, PagerDuty). Create channels in Cloud Console first."
  type        = list(string)
  default     = []
}

variable "alert_email_addresses" {
  description = "Email addresses to receive alert notifications. Used to create email notification channels."
  type        = list(string)
  default     = []
}

variable "pagerduty_service_key" {
  description = "PagerDuty service integration key for critical alerts. Leave empty to disable PagerDuty integration."
  type        = string
  default     = ""
  sensitive   = true
}

variable "slack_webhook_url" {
  description = "Slack webhook URL for alert notifications. Leave empty to disable Slack integration."
  type        = string
  default     = ""
  sensitive   = true
}

# ==============================================================================
# Security Configuration
# ==============================================================================
# Security-related settings including Cloud Armor WAF.

variable "enable_cloud_armor" {
  description = "Enable Cloud Armor Web Application Firewall for the API. Highly recommended for production."
  type        = bool
  default     = true
}

variable "allowed_ip_ranges" {
  description = "List of IP CIDR ranges allowed to access the API. Leave empty to allow all IPs (use with Cloud Armor)."
  type        = list(string)
  default     = []
}

variable "blocked_ip_ranges" {
  description = "List of IP CIDR ranges to block at the WAF level. Use for known malicious IPs."
  type        = list(string)
  default     = []
}

variable "blocked_countries" {
  description = "List of ISO 3166-1 alpha-2 country codes to block. Use for geo-blocking requirements."
  type        = list(string)
  default     = []
}

variable "rate_limit_requests_per_minute" {
  description = "Maximum requests per minute per IP address. Protects against abuse and DDoS."
  type        = number
  default     = 1000

  validation {
    condition     = var.rate_limit_requests_per_minute >= 10 && var.rate_limit_requests_per_minute <= 100000
    error_message = "Rate limit must be between 10 and 100000 requests per minute."
  }
}

variable "auth_rate_limit_requests_per_minute" {
  description = "Maximum authentication requests per minute per IP. Lower than general rate limit to prevent brute force."
  type        = number
  default     = 20

  validation {
    condition     = var.auth_rate_limit_requests_per_minute >= 1 && var.auth_rate_limit_requests_per_minute <= 1000
    error_message = "Auth rate limit must be between 1 and 1000 requests per minute."
  }
}

# ==============================================================================
# Custom Domain & Load Balancer
# ==============================================================================
# Settings for custom domain and HTTPS load balancer.

variable "custom_domain" {
  description = "Custom domain for the API (e.g., api.pull.com). Leave empty to use Cloud Run default URL."
  type        = string
  default     = ""
}

variable "enable_cdn" {
  description = "Enable Cloud CDN for caching static content. Only applicable when using a custom domain."
  type        = bool
  default     = false
}

variable "cors_origins" {
  description = "List of allowed CORS origins for the API and storage buckets. Include your frontend domains."
  type        = list(string)
  default     = ["*"]
}

# ==============================================================================
# Disaster Recovery
# ==============================================================================
# Settings for backup and disaster recovery.

variable "enable_cross_region_backup" {
  description = "Enable cross-region backup replication for disaster recovery. Increases storage costs."
  type        = bool
  default     = false
}

variable "dr_region" {
  description = "Disaster recovery region for cross-region backups. Should be geographically distant from primary region."
  type        = string
  default     = "us-east1"
}

# ==============================================================================
# Feature Flags
# ==============================================================================
# Toggles for optional features and integrations.

variable "enable_vpc_flow_logs" {
  description = "Enable VPC Flow Logs for network traffic analysis. Increases logging costs."
  type        = bool
  default     = true
}

variable "enable_audit_logging" {
  description = "Enable data access audit logging for compliance. Required for SOC2, HIPAA, etc."
  type        = bool
  default     = true
}

variable "enable_binary_authorization" {
  description = "Enable Binary Authorization for container image verification. Requires additional setup."
  type        = bool
  default     = false
}
