# ==============================================================================
# PULL Infrastructure - Terraform Configuration
# ==============================================================================
# This Terraform configuration provisions the cloud infrastructure for PULL
# on Google Cloud Platform (GCP).
# ==============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  backend "gcs" {
    bucket = "pull-terraform-state"
    prefix = "terraform/state"
  }
}

# ==============================================================================
# Provider Configuration
# ==============================================================================

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# ==============================================================================
# Local Values
# ==============================================================================

locals {
  environment = var.environment
  name_prefix = "pull-${var.environment}"

  common_labels = {
    project     = "pull"
    environment = var.environment
    managed_by  = "terraform"
  }
}

# ==============================================================================
# VPC Network
# ==============================================================================

resource "google_compute_network" "main" {
  name                    = "${local.name_prefix}-vpc"
  auto_create_subnetworks = false
  project                 = var.project_id
}

resource "google_compute_subnetwork" "main" {
  name          = "${local.name_prefix}-subnet"
  ip_cidr_range = "10.0.0.0/24"
  region        = var.region
  network       = google_compute_network.main.id

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.1.0.0/16"
  }

  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.2.0.0/20"
  }

  private_ip_google_access = true
}

# ==============================================================================
# Cloud SQL (PostgreSQL)
# ==============================================================================

resource "google_sql_database_instance" "main" {
  name             = "${local.name_prefix}-postgres"
  database_version = "POSTGRES_16"
  region           = var.region
  project          = var.project_id

  settings {
    tier              = var.db_tier
    availability_type = var.environment == "production" ? "REGIONAL" : "ZONAL"
    disk_size         = var.db_disk_size
    disk_type         = "PD_SSD"
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.main.id
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = var.environment == "production"
      start_time                     = "03:00"
      location                       = var.region
      transaction_log_retention_days = 7

      backup_retention_settings {
        retained_backups = var.environment == "production" ? 30 : 7
        retention_unit   = "COUNT"
      }
    }

    maintenance_window {
      day          = 7 # Sunday
      hour         = 4
      update_track = "stable"
    }

    database_flags {
      name  = "max_connections"
      value = "200"
    }

    database_flags {
      name  = "log_statement"
      value = "all"
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
      record_client_address   = true
    }
  }

  deletion_protection = var.environment == "production"

  labels = local.common_labels
}

resource "google_sql_database" "main" {
  name     = "pull"
  instance = google_sql_database_instance.main.name
  project  = var.project_id
}

resource "random_password" "db_password" {
  length  = 32
  special = true
}

resource "google_sql_user" "main" {
  name     = "pull"
  instance = google_sql_database_instance.main.name
  password = random_password.db_password.result
  project  = var.project_id
}

# ==============================================================================
# Memorystore (Redis)
# ==============================================================================

resource "google_redis_instance" "main" {
  name               = "${local.name_prefix}-redis"
  tier               = var.environment == "production" ? "STANDARD_HA" : "BASIC"
  memory_size_gb     = var.redis_memory_gb
  region             = var.region
  project            = var.project_id
  authorized_network = google_compute_network.main.id

  redis_version = "REDIS_7_0"
  display_name  = "PULL Redis Cache"

  redis_configs = {
    maxmemory-policy = "allkeys-lru"
  }

  maintenance_policy {
    weekly_maintenance_window {
      day = "SUNDAY"
      start_time {
        hours   = 4
        minutes = 0
      }
    }
  }

  labels = local.common_labels
}

# ==============================================================================
# Cloud Run - API Service
# ==============================================================================

resource "google_cloud_run_v2_service" "api" {
  name     = "${local.name_prefix}-api"
  location = var.region
  project  = var.project_id

  template {
    scaling {
      min_instance_count = var.environment == "production" ? 2 : 0
      max_instance_count = var.environment == "production" ? 100 : 10
    }

    containers {
      image = var.api_image

      resources {
        limits = {
          cpu    = var.environment == "production" ? "2" : "1"
          memory = var.environment == "production" ? "2Gi" : "512Mi"
        }
      }

      env {
        name  = "NODE_ENV"
        value = var.environment
      }

      env {
        name  = "REDIS_URL"
        value = "redis://${google_redis_instance.main.host}:${google_redis_instance.main.port}"
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
        name = "CONVEX_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.convex_url.secret_id
            version = "latest"
          }
        }
      }

      startup_probe {
        http_get {
          path = "/health"
          port = 3001
        }
        initial_delay_seconds = 10
        timeout_seconds       = 5
        period_seconds        = 10
        failure_threshold     = 3
      }

      liveness_probe {
        http_get {
          path = "/health"
          port = 3001
        }
        initial_delay_seconds = 30
        timeout_seconds       = 5
        period_seconds        = 30
        failure_threshold     = 3
      }
    }

    vpc_access {
      connector = google_vpc_access_connector.main.id
      egress    = "ALL_TRAFFIC"
    }

    service_account = google_service_account.api.email
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  labels = local.common_labels
}

# ==============================================================================
# Cloud Run - Temporal Worker
# ==============================================================================

resource "google_cloud_run_v2_service" "worker" {
  name     = "${local.name_prefix}-temporal-worker"
  location = var.region
  project  = var.project_id

  template {
    scaling {
      min_instance_count = var.environment == "production" ? 2 : 1
      max_instance_count = var.environment == "production" ? 50 : 5
    }

    containers {
      image = var.worker_image

      resources {
        limits = {
          cpu    = var.environment == "production" ? "4" : "2"
          memory = var.environment == "production" ? "4Gi" : "2Gi"
        }
      }

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
        name = "CONVEX_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.convex_url.secret_id
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

      startup_probe {
        http_get {
          path = "/health"
          port = 3002
        }
        initial_delay_seconds = 30
        timeout_seconds       = 10
        period_seconds        = 10
        failure_threshold     = 5
      }

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
}

# ==============================================================================
# VPC Access Connector
# ==============================================================================

resource "google_vpc_access_connector" "main" {
  name          = "${local.name_prefix}-connector"
  region        = var.region
  project       = var.project_id
  network       = google_compute_network.main.name
  ip_cidr_range = "10.8.0.0/28"

  min_instances = 2
  max_instances = var.environment == "production" ? 10 : 3
}

# ==============================================================================
# Service Accounts
# ==============================================================================

resource "google_service_account" "api" {
  account_id   = "${local.name_prefix}-api"
  display_name = "PULL API Service Account"
  project      = var.project_id
}

resource "google_service_account" "worker" {
  account_id   = "${local.name_prefix}-worker"
  display_name = "PULL Temporal Worker Service Account"
  project      = var.project_id
}

# ==============================================================================
# IAM Bindings
# ==============================================================================

resource "google_project_iam_member" "api_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "worker_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_project_iam_member" "api_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api.email}"
}

# ==============================================================================
# Secret Manager
# ==============================================================================

resource "google_secret_manager_secret" "database_url" {
  secret_id = "${local.name_prefix}-database-url"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = local.common_labels
}

resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = "postgresql://${google_sql_user.main.name}:${random_password.db_password.result}@${google_sql_database_instance.main.private_ip_address}:5432/${google_sql_database.main.name}"
}

resource "google_secret_manager_secret" "convex_url" {
  secret_id = "${local.name_prefix}-convex-url"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = local.common_labels
}

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
# Cloud Armor (WAF)
# ==============================================================================

resource "google_compute_security_policy" "api" {
  name    = "${local.name_prefix}-api-policy"
  project = var.project_id

  rule {
    action   = "allow"
    priority = "2147483647"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    description = "default rule"
  }

  rule {
    action   = "deny(403)"
    priority = "1000"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('xss-stable')"
      }
    }
    description = "XSS attack protection"
  }

  rule {
    action   = "deny(403)"
    priority = "1001"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('sqli-stable')"
      }
    }
    description = "SQL injection protection"
  }

  rule {
    action   = "throttle"
    priority = "2000"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      rate_limit_threshold {
        count        = 1000
        interval_sec = 60
      }
    }
    description = "Rate limiting"
  }
}

# ==============================================================================
# Outputs
# ==============================================================================

output "api_url" {
  value       = google_cloud_run_v2_service.api.uri
  description = "API service URL"
}

output "worker_url" {
  value       = google_cloud_run_v2_service.worker.uri
  description = "Worker service URL"
}

output "database_instance" {
  value       = google_sql_database_instance.main.connection_name
  description = "Cloud SQL instance connection name"
}

output "redis_host" {
  value       = google_redis_instance.main.host
  description = "Redis instance host"
}

output "redis_port" {
  value       = google_redis_instance.main.port
  description = "Redis instance port"
}
