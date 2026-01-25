# ==============================================================================
# PULL Infrastructure - Main Terraform Configuration
# ==============================================================================
# This Terraform configuration provisions the cloud infrastructure for PULL
# on Google Cloud Platform (GCP). The configuration is designed for production
# workloads with:
#   - High availability across zones
#   - Customer-managed encryption keys (CMEK) for data at rest
#   - Comprehensive backup and disaster recovery
#   - Network security with private connectivity
#   - Monitoring and alerting
#
# Usage:
#   terraform init
#   terraform plan -var-file="environments/production.tfvars"
#   terraform apply -var-file="environments/production.tfvars"
# ==============================================================================

# ==============================================================================
# Local Values
# ==============================================================================
# Centralized values used across multiple resources for consistency

locals {
  # Environment-based naming prefix for all resources
  environment = var.environment
  name_prefix = "pull-${var.environment}"

  # Standard labels applied to all resources for organization and cost tracking
  common_labels = {
    project       = "pull"
    environment   = var.environment
    managed_by    = "terraform"
    cost_center   = var.cost_center
    owner         = var.owner
    data_class    = var.data_classification
    backup_policy = var.environment == "production" ? "daily" : "weekly"
  }

  # Determine if this is a production environment for conditional configuration
  is_production = var.environment == "production"

  # Cloud SQL connection string format
  db_connection_string = "postgresql://${google_sql_user.main.name}:${random_password.db_password.result}@${google_sql_database_instance.main.private_ip_address}:5432/${google_sql_database.main.name}?sslmode=require"
}

# ==============================================================================
# Data Sources
# ==============================================================================
# Fetch existing resources and configuration from GCP

# Get the current project details
data "google_project" "current" {
  project_id = var.project_id
}

# Get available zones in the region for multi-zone deployments
data "google_compute_zones" "available" {
  project = var.project_id
  region  = var.region
}

# Get the default compute service account for IAM bindings
data "google_compute_default_service_account" "default" {
  project = var.project_id
}

# ==============================================================================
# KMS - Customer-Managed Encryption Keys
# ==============================================================================
# CMEK provides additional control over encryption of data at rest.
# All storage resources (Cloud SQL, Redis, GCS) use these keys.

# KMS Keyring - Container for all encryption keys
resource "google_kms_key_ring" "main" {
  name     = "${local.name_prefix}-keyring"
  location = var.region
  project  = var.project_id
}

# Encryption key for Cloud SQL database
# Rotation: Automatic every 90 days for production, 180 days for staging
resource "google_kms_crypto_key" "cloudsql" {
  name            = "${local.name_prefix}-cloudsql-key"
  key_ring        = google_kms_key_ring.main.id
  rotation_period = local.is_production ? "7776000s" : "15552000s" # 90 or 180 days
  purpose         = "ENCRYPT_DECRYPT"

  version_template {
    algorithm        = "GOOGLE_SYMMETRIC_ENCRYPTION"
    protection_level = local.is_production ? "HSM" : "SOFTWARE"
  }

  labels = local.common_labels

  lifecycle {
    prevent_destroy = true
  }
}

# Encryption key for Cloud Storage buckets
resource "google_kms_crypto_key" "storage" {
  name            = "${local.name_prefix}-storage-key"
  key_ring        = google_kms_key_ring.main.id
  rotation_period = local.is_production ? "7776000s" : "15552000s"
  purpose         = "ENCRYPT_DECRYPT"

  version_template {
    algorithm        = "GOOGLE_SYMMETRIC_ENCRYPTION"
    protection_level = local.is_production ? "HSM" : "SOFTWARE"
  }

  labels = local.common_labels

  lifecycle {
    prevent_destroy = true
  }
}

# Encryption key for Secret Manager
resource "google_kms_crypto_key" "secrets" {
  name            = "${local.name_prefix}-secrets-key"
  key_ring        = google_kms_key_ring.main.id
  rotation_period = local.is_production ? "7776000s" : "15552000s"
  purpose         = "ENCRYPT_DECRYPT"

  version_template {
    algorithm        = "GOOGLE_SYMMETRIC_ENCRYPTION"
    protection_level = local.is_production ? "HSM" : "SOFTWARE"
  }

  labels = local.common_labels

  lifecycle {
    prevent_destroy = true
  }
}

# Grant Cloud SQL service account access to use the encryption key
resource "google_kms_crypto_key_iam_binding" "cloudsql" {
  crypto_key_id = google_kms_crypto_key.cloudsql.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"

  members = [
    "serviceAccount:service-${data.google_project.current.number}@gcp-sa-cloud-sql.iam.gserviceaccount.com",
  ]
}

# Grant storage service account access to the storage encryption key
resource "google_kms_crypto_key_iam_binding" "storage" {
  crypto_key_id = google_kms_crypto_key.storage.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"

  members = [
    "serviceAccount:service-${data.google_project.current.number}@gs-project-accounts.iam.gserviceaccount.com",
  ]
}

# ==============================================================================
# Cloud SQL (PostgreSQL)
# ==============================================================================
# Primary database for PULL application data. Configured with:
#   - High availability (regional) for production
#   - Point-in-time recovery for disaster recovery
#   - Customer-managed encryption keys
#   - Automated backups with configurable retention
#   - Query insights for performance monitoring

resource "google_sql_database_instance" "main" {
  name             = "${local.name_prefix}-postgres"
  database_version = "POSTGRES_16"
  region           = var.region
  project          = var.project_id

  # Use CMEK for encryption at rest
  encryption_key_name = google_kms_crypto_key.cloudsql.id

  settings {
    # Instance sizing - varies by environment
    tier              = var.db_tier
    availability_type = local.is_production ? "REGIONAL" : "ZONAL"
    disk_size         = var.db_disk_size
    disk_type         = "PD_SSD"
    disk_autoresize   = true
    disk_autoresize_limit = var.db_max_disk_size

    # Network configuration - private IP only for security
    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.main.id
      enable_private_path_for_google_cloud_services = true

      # SSL enforcement for all connections
      ssl_mode = "ENCRYPTED_ONLY"
    }

    # Backup configuration - critical for disaster recovery
    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = local.is_production
      start_time                     = "03:00" # UTC - off-peak hours
      location                       = var.backup_location
      transaction_log_retention_days = local.is_production ? 7 : 3

      backup_retention_settings {
        retained_backups = local.is_production ? var.db_backup_retention_days : 7
        retention_unit   = "COUNT"
      }
    }

    # Maintenance window - Sunday early morning UTC
    maintenance_window {
      day          = 7 # Sunday
      hour         = 4 # 4 AM UTC
      update_track = local.is_production ? "stable" : "canary"
    }

    # Database flags for performance and security
    database_flags {
      name  = "max_connections"
      value = var.db_max_connections
    }

    database_flags {
      name  = "log_statement"
      value = local.is_production ? "ddl" : "all"
    }

    database_flags {
      name  = "log_min_duration_statement"
      value = "1000" # Log queries taking more than 1 second
    }

    database_flags {
      name  = "log_checkpoints"
      value = "on"
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }

    database_flags {
      name  = "log_disconnections"
      value = "on"
    }

    database_flags {
      name  = "log_lock_waits"
      value = "on"
    }

    # Prevent accidental data loss with pgaudit
    database_flags {
      name  = "cloudsql.enable_pgaudit"
      value = "on"
    }

    database_flags {
      name  = "pgaudit.log"
      value = "all"
    }

    # Query Insights for performance monitoring
    insights_config {
      query_insights_enabled  = true
      query_string_length     = 4096
      record_application_tags = true
      record_client_address   = true
      query_plans_per_minute  = local.is_production ? 20 : 5
    }

    # Active Directory integration (if configured)
    dynamic "active_directory_config" {
      for_each = var.ad_domain != "" ? [1] : []
      content {
        domain = var.ad_domain
      }
    }

    # Deny maintenance period for critical business times
    dynamic "deny_maintenance_period" {
      for_each = local.is_production ? [1] : []
      content {
        start_date = var.deny_maintenance_start
        end_date   = var.deny_maintenance_end
        time       = "00:00:00"
      }
    }

    user_labels = local.common_labels
  }

  # Prevent accidental deletion of production database
  deletion_protection = local.is_production

  # Ensure KMS key exists before creating instance
  depends_on = [google_kms_crypto_key_iam_binding.cloudsql]

  lifecycle {
    prevent_destroy = true
  }
}

# Primary database for the application
resource "google_sql_database" "main" {
  name     = "pull"
  instance = google_sql_database_instance.main.name
  project  = var.project_id

  # Use UTF-8 encoding for international character support
  charset   = "UTF8"
  collation = "en_US.UTF8"
}

# Analytics/read replica database for reporting (production only)
resource "google_sql_database" "analytics" {
  count    = local.is_production ? 1 : 0
  name     = "pull_analytics"
  instance = google_sql_database_instance.main.name
  project  = var.project_id
  charset  = "UTF8"
}

# Generate secure random password for database user
resource "random_password" "db_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"

  # Ensure password changes don't disrupt running services
  lifecycle {
    ignore_changes = all
  }
}

# Primary database user for application connections
resource "google_sql_user" "main" {
  name     = "pull"
  instance = google_sql_database_instance.main.name
  password = random_password.db_password.result
  project  = var.project_id
  type     = "BUILT_IN"
}

# Read replica for production workloads (offload reporting queries)
resource "google_sql_database_instance" "read_replica" {
  count                = local.is_production && var.enable_read_replica ? 1 : 0
  name                 = "${local.name_prefix}-postgres-replica"
  master_instance_name = google_sql_database_instance.main.name
  region               = var.replica_region != "" ? var.replica_region : var.region
  database_version     = "POSTGRES_16"
  project              = var.project_id

  encryption_key_name = google_kms_crypto_key.cloudsql.id

  replica_configuration {
    failover_target = false
  }

  settings {
    tier              = var.db_tier
    availability_type = "ZONAL"
    disk_size         = var.db_disk_size
    disk_type         = "PD_SSD"
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.main.id
      ssl_mode        = "ENCRYPTED_ONLY"
    }

    database_flags {
      name  = "max_connections"
      value = var.db_max_connections
    }

    user_labels = merge(local.common_labels, {
      replica = "true"
    })
  }

  depends_on = [google_sql_database_instance.main]
}

# ==============================================================================
# Memorystore (Redis)
# ==============================================================================
# Redis cache for session storage, rate limiting, and application caching.
# Configured with:
#   - High availability (Standard HA) for production
#   - AUTH for connection security
#   - In-transit encryption
#   - Automatic failover

resource "google_redis_instance" "main" {
  name               = "${local.name_prefix}-redis"
  tier               = local.is_production ? "STANDARD_HA" : "BASIC"
  memory_size_gb     = var.redis_memory_gb
  region             = var.region
  project            = var.project_id
  authorized_network = google_compute_network.main.id

  # Redis version and display name
  redis_version = "REDIS_7_0"
  display_name  = "PULL ${title(var.environment)} Redis Cache"

  # Enable AUTH for connection security
  auth_enabled = true

  # Enable in-transit encryption
  transit_encryption_mode = "SERVER_AUTHENTICATION"

  # Redis configuration for optimal cache performance
  redis_configs = {
    maxmemory-policy  = "allkeys-lru"
    notify-keyspace-events = local.is_production ? "Ex" : "AKE"
    activedefrag      = "yes"
  }

  # Persistence configuration for data durability
  persistence_config {
    persistence_mode    = local.is_production ? "RDB" : "DISABLED"
    rdb_snapshot_period = local.is_production ? "TWELVE_HOURS" : null
  }

  # Maintenance window - Sunday early morning
  maintenance_policy {
    weekly_maintenance_window {
      day = "SUNDAY"
      start_time {
        hours   = 4
        minutes = 0
      }
    }
  }

  # Connect string for application configuration
  # Format: redis://[:password]@host:port
  # Note: Auth string retrieved via google_redis_instance.main.auth_string

  labels = local.common_labels

  lifecycle {
    prevent_destroy = true
  }
}

# ==============================================================================
# Cloud Storage - Backup Bucket
# ==============================================================================
# GCS bucket for application backups, exports, and disaster recovery data.
# Configured with:
#   - Customer-managed encryption keys
#   - Lifecycle policies for cost optimization
#   - Versioning for data protection
#   - Cross-region replication for production

resource "google_storage_bucket" "backups" {
  name          = "${local.name_prefix}-backups-${var.project_id}"
  location      = local.is_production ? "US" : var.region # Multi-region for production
  project       = var.project_id
  storage_class = local.is_production ? "STANDARD" : "NEARLINE"

  # Enable uniform bucket-level access for simplified permissions
  uniform_bucket_level_access = true

  # Enable versioning for data protection
  versioning {
    enabled = true
  }

  # Customer-managed encryption key
  encryption {
    default_kms_key_name = google_kms_crypto_key.storage.id
  }

  # Lifecycle rules for cost optimization
  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type          = "SetStorageClass"
      storage_class = "ARCHIVE"
    }
  }

  # Delete old versions after retention period
  lifecycle_rule {
    condition {
      num_newer_versions = 5
      with_state         = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }

  # Soft delete for accidental deletion protection (production only)
  dynamic "soft_delete_policy" {
    for_each = local.is_production ? [1] : []
    content {
      retention_duration_seconds = 604800 # 7 days
    }
  }

  labels = local.common_labels

  depends_on = [google_kms_crypto_key_iam_binding.storage]
}

# Bucket for application assets and uploads
resource "google_storage_bucket" "assets" {
  name          = "${local.name_prefix}-assets-${var.project_id}"
  location      = var.region
  project       = var.project_id
  storage_class = "STANDARD"

  uniform_bucket_level_access = true

  versioning {
    enabled = local.is_production
  }

  encryption {
    default_kms_key_name = google_kms_crypto_key.storage.id
  }

  # CORS configuration for web access
  cors {
    origin          = var.cors_origins
    method          = ["GET", "HEAD", "OPTIONS"]
    response_header = ["Content-Type", "Cache-Control"]
    max_age_seconds = 3600
  }

  labels = local.common_labels

  depends_on = [google_kms_crypto_key_iam_binding.storage]
}

# ==============================================================================
# Cloud Run - API Service
# ==============================================================================
# Main API service for the PULL application. Handles all HTTP requests.
# Configured with:
#   - Auto-scaling based on request load
#   - VPC connector for private network access
#   - Health checks for reliability
#   - Secret management for sensitive configuration

resource "google_cloud_run_v2_service" "api" {
  name     = "${local.name_prefix}-api"
  location = var.region
  project  = var.project_id

  # Ingress settings - allow traffic through load balancer only in production
  ingress = local.is_production ? "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER" : "INGRESS_TRAFFIC_ALL"

  template {
    # Revision labels for tracking deployments
    labels = merge(local.common_labels, {
      "commit-sha" = var.api_commit_sha
    })

    # Auto-scaling configuration
    scaling {
      min_instance_count = local.is_production ? var.api_min_instances : 0
      max_instance_count = var.api_max_instances
    }

    # Execution environment - Gen2 for better cold start performance
    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"

    # Container configuration
    containers {
      image = var.api_image

      # Resource allocation
      resources {
        limits = {
          cpu    = local.is_production ? "2" : "1"
          memory = local.is_production ? "2Gi" : "512Mi"
        }
        cpu_idle          = !local.is_production # Allow CPU throttling in non-prod
        startup_cpu_boost = true                 # Faster cold starts
      }

      # Port configuration
      ports {
        container_port = 3001
        name           = "http1"
      }

      # Environment variables - non-sensitive
      env {
        name  = "NODE_ENV"
        value = var.environment
      }

      env {
        name  = "LOG_LEVEL"
        value = local.is_production ? "info" : "debug"
      }

      env {
        name  = "REDIS_HOST"
        value = google_redis_instance.main.host
      }

      env {
        name  = "REDIS_PORT"
        value = tostring(google_redis_instance.main.port)
      }

      env {
        name  = "ENABLE_TRACING"
        value = tostring(var.enable_tracing)
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }

      # Sensitive environment variables from Secret Manager
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "REDIS_AUTH_STRING"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.redis_auth.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "CONVEX_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.convex_url.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "JWT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.jwt_secret.secret_id
            version = "latest"
          }
        }
      }

      # Startup probe - verify service is ready to receive traffic
      startup_probe {
        http_get {
          path = "/health"
          port = 3001
        }
        initial_delay_seconds = 5
        timeout_seconds       = 5
        period_seconds        = 5
        failure_threshold     = 10
      }

      # Liveness probe - verify service is still healthy
      liveness_probe {
        http_get {
          path = "/health"
          port = 3001
        }
        initial_delay_seconds = 15
        timeout_seconds       = 5
        period_seconds        = 30
        failure_threshold     = 3
      }
    }

    # VPC access for private connectivity to Cloud SQL and Redis
    vpc_access {
      connector = google_vpc_access_connector.main.id
      egress    = "ALL_TRAFFIC" # Route all traffic through VPC
    }

    # Service account for API
    service_account = google_service_account.api.email

    # Request timeout
    timeout = "60s"

    # Maximum concurrent requests per instance
    max_instance_request_concurrency = local.is_production ? 80 : 40
  }

  # Traffic routing - all traffic to latest revision
  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  labels = local.common_labels

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image, # Allow CI/CD to update image
    ]
  }
}

# IAM binding to allow public access to API (controlled by Cloud Armor in production)
resource "google_cloud_run_v2_service_iam_member" "api_public" {
  count    = var.enable_public_api ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ==============================================================================
# Cloud Run - Temporal Worker
# ==============================================================================
# Background worker service for processing Temporal workflows.
# Handles async operations like data fetching, notifications, and analytics.

resource "google_cloud_run_v2_service" "worker" {
  name     = "${local.name_prefix}-temporal-worker"
  location = var.region
  project  = var.project_id

  # Workers should not receive external traffic
  ingress = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    labels = merge(local.common_labels, {
      "commit-sha" = var.worker_commit_sha
    })

    # Scaling for worker processes
    scaling {
      min_instance_count = local.is_production ? var.worker_min_instances : 1
      max_instance_count = var.worker_max_instances
    }

    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"

    containers {
      image = var.worker_image

      resources {
        limits = {
          cpu    = local.is_production ? "4" : "2"
          memory = local.is_production ? "4Gi" : "2Gi"
        }
        cpu_idle          = false # Workers need consistent CPU
        startup_cpu_boost = true
      }

      # Environment variables
      env {
        name  = "NODE_ENV"
        value = var.environment
      }

      env {
        name  = "TEMPORAL_ADDRESS"
        value = var.temporal_address
      }

      env {
        name  = "TEMPORAL_NAMESPACE"
        value = "pull-${var.environment}"
      }

      env {
        name  = "TEMPORAL_TASK_QUEUE"
        value = "pull-${var.environment}-queue"
      }

      env {
        name  = "WORKER_MAX_CONCURRENT_ACTIVITIES"
        value = local.is_production ? "100" : "20"
      }

      env {
        name  = "WORKER_MAX_CONCURRENT_WORKFLOWS"
        value = local.is_production ? "50" : "10"
      }

      # Secrets
      env {
        name = "CONVEX_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.convex_url.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "KALSHI_API_KEY_ID"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.kalshi_api_key.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "KALSHI_PRIVATE_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.kalshi_private_key.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "PLAID_CLIENT_ID"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.plaid_client_id.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "PLAID_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.plaid_secret.secret_id
            version = "latest"
          }
        }
      }

      # Startup probe with longer timeout for worker initialization
      startup_probe {
        http_get {
          path = "/health"
          port = 3002
        }
        initial_delay_seconds = 30
        timeout_seconds       = 10
        period_seconds        = 10
        failure_threshold     = 10
      }

      # Liveness probe
      liveness_probe {
        http_get {
          path = "/health"
          port = 3002
        }
        initial_delay_seconds = 60
        timeout_seconds       = 10
        period_seconds        = 60
        failure_threshold     = 3
      }
    }

    # Long timeout for workflow processing
    timeout = "3600s"

    vpc_access {
      connector = google_vpc_access_connector.main.id
      egress    = "ALL_TRAFFIC"
    }

    service_account = google_service_account.worker.email
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  labels = local.common_labels

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
    ]
  }
}

# ==============================================================================
# VPC Access Connector
# ==============================================================================
# Enables Cloud Run services to connect to VPC resources (Cloud SQL, Redis)

resource "google_vpc_access_connector" "main" {
  name          = "${local.name_prefix}-connector"
  region        = var.region
  project       = var.project_id
  network       = google_compute_network.main.name
  ip_cidr_range = var.vpc_connector_cidr

  # Instance configuration for throughput
  min_instances = 2
  max_instances = local.is_production ? 10 : 3

  # Use e2-micro for cost efficiency
  machine_type = local.is_production ? "e2-standard-4" : "e2-micro"
}

# ==============================================================================
# Service Accounts
# ==============================================================================
# Dedicated service accounts for each service following principle of least privilege

# API service account
resource "google_service_account" "api" {
  account_id   = "${local.name_prefix}-api"
  display_name = "PULL API Service Account"
  description  = "Service account for PULL API Cloud Run service"
  project      = var.project_id
}

# Worker service account
resource "google_service_account" "worker" {
  account_id   = "${local.name_prefix}-worker"
  display_name = "PULL Temporal Worker Service Account"
  description  = "Service account for PULL Temporal Worker Cloud Run service"
  project      = var.project_id
}

# Scheduler service account for Cloud Scheduler jobs
resource "google_service_account" "scheduler" {
  account_id   = "${local.name_prefix}-scheduler"
  display_name = "PULL Cloud Scheduler Service Account"
  description  = "Service account for Cloud Scheduler to invoke Cloud Run services"
  project      = var.project_id
}

# ==============================================================================
# IAM Bindings
# ==============================================================================
# Granular IAM permissions for each service account

# API service account permissions
resource "google_project_iam_member" "api_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "api_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "api_trace_agent" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "api_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "api_metric_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.api.email}"
}

# Worker service account permissions
resource "google_project_iam_member" "worker_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_project_iam_member" "worker_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_project_iam_member" "worker_trace_agent" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_project_iam_member" "worker_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_project_iam_member" "worker_metric_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_project_iam_member" "worker_storage_admin" {
  project = var.project_id
  role    = "roles/storage.objectAdmin"
  member  = "serviceAccount:${google_service_account.worker.email}"
}

# Scheduler permissions to invoke Cloud Run
resource "google_cloud_run_v2_service_iam_member" "scheduler_invoke_api" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}

# ==============================================================================
# Secret Manager
# ==============================================================================
# Centralized secret management with automatic versioning and rotation support

# Database connection string
resource "google_secret_manager_secret" "database_url" {
  secret_id = "${local.name_prefix}-database-url"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = local.common_labels

  # Rotation reminder (manual rotation required)
  rotation {
    rotation_period = "7776000s" # 90 days
  }
}

resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = local.db_connection_string

  lifecycle {
    ignore_changes = [secret_data] # Allow manual updates
  }
}

# Redis authentication string
resource "google_secret_manager_secret" "redis_auth" {
  secret_id = "${local.name_prefix}-redis-auth"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = local.common_labels
}

resource "google_secret_manager_secret_version" "redis_auth" {
  secret      = google_secret_manager_secret.redis_auth.id
  secret_data = google_redis_instance.main.auth_string
}

# Convex deployment URL
resource "google_secret_manager_secret" "convex_url" {
  secret_id = "${local.name_prefix}-convex-url"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = local.common_labels
}

# JWT signing secret
resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "${local.name_prefix}-jwt-secret"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = local.common_labels

  rotation {
    rotation_period = "15552000s" # 180 days
  }
}

# Kalshi API credentials
resource "google_secret_manager_secret" "kalshi_api_key" {
  secret_id = "${local.name_prefix}-kalshi-api-key"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = local.common_labels
}

resource "google_secret_manager_secret" "kalshi_private_key" {
  secret_id = "${local.name_prefix}-kalshi-private-key"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = local.common_labels
}

# Plaid API credentials
resource "google_secret_manager_secret" "plaid_client_id" {
  secret_id = "${local.name_prefix}-plaid-client-id"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = local.common_labels
}

resource "google_secret_manager_secret" "plaid_secret" {
  secret_id = "${local.name_prefix}-plaid-secret"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = local.common_labels
}

# ==============================================================================
# Cloud Scheduler Jobs
# ==============================================================================
# Scheduled tasks for maintenance and background operations

# Daily database backup export
resource "google_cloud_scheduler_job" "db_backup_export" {
  count       = local.is_production ? 1 : 0
  name        = "${local.name_prefix}-db-backup-export"
  description = "Daily database backup export to Cloud Storage"
  project     = var.project_id
  region      = var.region
  schedule    = "0 5 * * *" # 5 AM UTC daily
  time_zone   = "Etc/UTC"

  retry_config {
    retry_count          = 3
    min_backoff_duration = "30s"
    max_backoff_duration = "3600s"
  }

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.api.uri}/api/admin/backup/export"
    oidc_token {
      service_account_email = google_service_account.scheduler.email
    }
  }
}

# Hourly cache cleanup
resource "google_cloud_scheduler_job" "cache_cleanup" {
  name        = "${local.name_prefix}-cache-cleanup"
  description = "Hourly cache cleanup and maintenance"
  project     = var.project_id
  region      = var.region
  schedule    = "0 * * * *" # Every hour
  time_zone   = "Etc/UTC"

  retry_config {
    retry_count = 2
  }

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.api.uri}/api/admin/cache/cleanup"
    oidc_token {
      service_account_email = google_service_account.scheduler.email
    }
  }
}
