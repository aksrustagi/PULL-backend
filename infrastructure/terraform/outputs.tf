# ==============================================================================
# PULL Infrastructure - Terraform Outputs
# ==============================================================================
# This file defines output values that are useful for:
#   - CI/CD pipelines (deployment targets, URLs)
#   - Application configuration (connection strings, endpoints)
#   - Documentation and operational reference
#   - Cross-module/cross-workspace references
#
# Security Note:
#   - Sensitive outputs are marked and won't display in logs
#   - Use `terraform output -json` to access sensitive values programmatically
# ==============================================================================

# ==============================================================================
# Project Information
# ==============================================================================

output "project_id" {
  description = "The GCP project ID where resources are deployed"
  value       = var.project_id
}

output "project_number" {
  description = "The GCP project number (used for service account references)"
  value       = data.google_project.current.number
}

output "region" {
  description = "The primary GCP region for deployed resources"
  value       = var.region
}

output "environment" {
  description = "The deployment environment (staging, production)"
  value       = var.environment
}

# ==============================================================================
# Network Information
# ==============================================================================

output "vpc_id" {
  description = "The self-link of the VPC network"
  value       = google_compute_network.main.id
}

output "vpc_name" {
  description = "The name of the VPC network"
  value       = google_compute_network.main.name
}

output "subnet_main_id" {
  description = "The self-link of the main compute subnet"
  value       = google_compute_subnetwork.main.id
}

output "subnet_main_cidr" {
  description = "The CIDR range of the main compute subnet"
  value       = google_compute_subnetwork.main.ip_cidr_range
}

output "subnet_data_id" {
  description = "The self-link of the data services subnet"
  value       = google_compute_subnetwork.data.id
}

output "vpc_connector_id" {
  description = "The ID of the Serverless VPC Access connector"
  value       = google_vpc_access_connector.main.id
}

output "nat_ip_addresses" {
  description = "The external IP addresses used by Cloud NAT for egress traffic"
  value       = google_compute_router_nat.main.nat_ips
}

# ==============================================================================
# Database Outputs
# ==============================================================================

output "database_instance_name" {
  description = "The name of the Cloud SQL instance"
  value       = google_sql_database_instance.main.name
}

output "database_instance_connection_name" {
  description = "The connection name for Cloud SQL Proxy (project:region:instance)"
  value       = google_sql_database_instance.main.connection_name
}

output "database_private_ip" {
  description = "The private IP address of the Cloud SQL instance"
  value       = google_sql_database_instance.main.private_ip_address
}

output "database_name" {
  description = "The name of the primary database"
  value       = google_sql_database.main.name
}

output "database_user" {
  description = "The username for database connections"
  value       = google_sql_user.main.name
}

output "database_connection_string" {
  description = "The PostgreSQL connection string (password redacted)"
  value       = "postgresql://${google_sql_user.main.name}:****@${google_sql_database_instance.main.private_ip_address}:5432/${google_sql_database.main.name}?sslmode=require"
}

output "database_replica_ip" {
  description = "The private IP address of the read replica (if enabled)"
  value       = var.enable_read_replica && local.is_production ? google_sql_database_instance.read_replica[0].private_ip_address : null
}

# ==============================================================================
# Redis Outputs
# ==============================================================================

output "redis_host" {
  description = "The hostname of the Redis instance"
  value       = google_redis_instance.main.host
}

output "redis_port" {
  description = "The port number of the Redis instance"
  value       = google_redis_instance.main.port
}

output "redis_current_location_id" {
  description = "The current zone where Redis is located"
  value       = google_redis_instance.main.current_location_id
}

output "redis_connection_string" {
  description = "The Redis connection string (auth string redacted)"
  value       = "redis://:****@${google_redis_instance.main.host}:${google_redis_instance.main.port}"
}

# ==============================================================================
# Cloud Run Services
# ==============================================================================

output "api_service_name" {
  description = "The name of the API Cloud Run service"
  value       = google_cloud_run_v2_service.api.name
}

output "api_service_url" {
  description = "The auto-generated URL of the API service"
  value       = google_cloud_run_v2_service.api.uri
}

output "api_service_latest_revision" {
  description = "The latest revision name of the API service"
  value       = google_cloud_run_v2_service.api.latest_ready_revision
}

output "worker_service_name" {
  description = "The name of the Temporal worker Cloud Run service"
  value       = google_cloud_run_v2_service.worker.name
}

output "worker_service_url" {
  description = "The URL of the worker service (internal only)"
  value       = google_cloud_run_v2_service.worker.uri
}

output "worker_service_latest_revision" {
  description = "The latest revision name of the worker service"
  value       = google_cloud_run_v2_service.worker.latest_ready_revision
}

# ==============================================================================
# Storage Outputs
# ==============================================================================

output "backup_bucket_name" {
  description = "The name of the backup storage bucket"
  value       = google_storage_bucket.backups.name
}

output "backup_bucket_url" {
  description = "The URL of the backup storage bucket"
  value       = google_storage_bucket.backups.url
}

output "assets_bucket_name" {
  description = "The name of the assets storage bucket"
  value       = google_storage_bucket.assets.name
}

output "assets_bucket_url" {
  description = "The URL of the assets storage bucket"
  value       = google_storage_bucket.assets.url
}

# ==============================================================================
# Service Accounts
# ==============================================================================

output "api_service_account_email" {
  description = "The email of the API service account"
  value       = google_service_account.api.email
}

output "worker_service_account_email" {
  description = "The email of the worker service account"
  value       = google_service_account.worker.email
}

output "scheduler_service_account_email" {
  description = "The email of the Cloud Scheduler service account"
  value       = google_service_account.scheduler.email
}

# ==============================================================================
# Encryption Keys
# ==============================================================================

output "kms_keyring_id" {
  description = "The ID of the KMS keyring"
  value       = google_kms_key_ring.main.id
}

output "kms_cloudsql_key_id" {
  description = "The ID of the Cloud SQL encryption key"
  value       = google_kms_crypto_key.cloudsql.id
}

output "kms_storage_key_id" {
  description = "The ID of the storage encryption key"
  value       = google_kms_crypto_key.storage.id
}

output "kms_secrets_key_id" {
  description = "The ID of the secrets encryption key"
  value       = google_kms_crypto_key.secrets.id
}

# ==============================================================================
# Secret Manager
# ==============================================================================

output "secret_database_url_id" {
  description = "The ID of the database URL secret"
  value       = google_secret_manager_secret.database_url.id
}

output "secret_redis_auth_id" {
  description = "The ID of the Redis auth secret"
  value       = google_secret_manager_secret.redis_auth.id
}

output "secret_convex_url_id" {
  description = "The ID of the Convex URL secret"
  value       = google_secret_manager_secret.convex_url.id
}

output "secret_jwt_secret_id" {
  description = "The ID of the JWT secret"
  value       = google_secret_manager_secret.jwt_secret.id
}

# ==============================================================================
# Load Balancer & DNS (when custom domain is configured)
# ==============================================================================

output "load_balancer_ip" {
  description = "The static IP address of the load balancer (if custom domain configured)"
  value       = var.custom_domain != "" ? google_compute_global_address.api_lb[0].address : null
}

output "api_custom_url" {
  description = "The custom domain URL for the API (if configured)"
  value       = var.custom_domain != "" ? "https://${var.custom_domain}" : null
}

output "dns_zone_name" {
  description = "The name of the private DNS zone"
  value       = google_dns_managed_zone.private.name
}

output "dns_zone_dns_name" {
  description = "The DNS name of the private zone"
  value       = google_dns_managed_zone.private.dns_name
}

# ==============================================================================
# Security
# ==============================================================================

output "cloud_armor_policy_id" {
  description = "The ID of the Cloud Armor security policy"
  value       = google_compute_security_policy.api.id
}

output "cloud_armor_policy_name" {
  description = "The name of the Cloud Armor security policy"
  value       = google_compute_security_policy.api.name
}

# ==============================================================================
# CI/CD Integration Outputs
# ==============================================================================
# These outputs are specifically useful for CI/CD pipelines

output "ci_cd_config" {
  description = "Configuration object for CI/CD pipelines"
  value = {
    project_id        = var.project_id
    region            = var.region
    api_service       = google_cloud_run_v2_service.api.name
    worker_service    = google_cloud_run_v2_service.worker.name
    api_url           = var.custom_domain != "" ? "https://${var.custom_domain}" : google_cloud_run_v2_service.api.uri
    backup_bucket     = google_storage_bucket.backups.name
    assets_bucket     = google_storage_bucket.assets.name
  }
}

# ==============================================================================
# Application Configuration Outputs
# ==============================================================================
# These outputs can be used to generate application configuration files

output "app_config" {
  description = "Application configuration object (non-sensitive)"
  value = {
    environment      = var.environment
    database_host    = google_sql_database_instance.main.private_ip_address
    database_name    = google_sql_database.main.name
    database_user    = google_sql_user.main.name
    redis_host       = google_redis_instance.main.host
    redis_port       = google_redis_instance.main.port
    api_url          = var.custom_domain != "" ? "https://${var.custom_domain}" : google_cloud_run_v2_service.api.uri
    gcp_project      = var.project_id
    gcp_region       = var.region
  }
}

# ==============================================================================
# Sensitive Outputs
# ==============================================================================
# These outputs contain sensitive data and won't be displayed in logs

output "database_password" {
  description = "The password for the database user"
  value       = random_password.db_password.result
  sensitive   = true
}

output "redis_auth_string" {
  description = "The authentication string for Redis"
  value       = google_redis_instance.main.auth_string
  sensitive   = true
}

output "database_connection_string_full" {
  description = "The full PostgreSQL connection string with password"
  value       = local.db_connection_string
  sensitive   = true
}

# ==============================================================================
# Debugging / Troubleshooting Outputs
# ==============================================================================

output "resource_labels" {
  description = "Common labels applied to all resources"
  value       = local.common_labels
}

output "is_production" {
  description = "Whether this is a production environment"
  value       = local.is_production
}

output "terraform_workspace" {
  description = "The current Terraform workspace (if using workspaces)"
  value       = terraform.workspace
}
