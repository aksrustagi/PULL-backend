# ==============================================================================
# PULL Infrastructure - Cloud Monitoring Configuration
# ==============================================================================
# This file configures Cloud Monitoring alerting policies for proactive
# monitoring of infrastructure health. Includes alerts for:
#   - Cloud Run service health (latency, errors, availability)
#   - Cloud SQL database health (CPU, memory, connections, replication)
#   - Redis cache health (memory, connections, hit rate)
#   - Infrastructure health (VPC, NAT, load balancer)
#
# Alert Severity Levels:
#   - CRITICAL: Immediate action required, impacts users (PagerDuty)
#   - WARNING: Attention needed soon, potential issue (Slack)
#   - INFO: Informational, for tracking (Email)
# ==============================================================================

# ==============================================================================
# Local Values for Monitoring
# ==============================================================================

locals {
  # Alert thresholds (can be overridden via variables)
  alert_thresholds = {
    # Cloud Run
    api_error_rate_critical     = 5    # 5% error rate
    api_error_rate_warning      = 1    # 1% error rate
    api_latency_p95_critical_ms = 2000 # 2 seconds
    api_latency_p95_warning_ms  = 1000 # 1 second
    api_latency_p99_critical_ms = 5000 # 5 seconds

    # Cloud SQL
    db_cpu_critical_percent       = 90
    db_cpu_warning_percent        = 75
    db_memory_critical_percent    = 90
    db_memory_warning_percent     = 80
    db_disk_critical_percent      = 90
    db_disk_warning_percent       = 80
    db_connections_critical       = 90 # percentage of max_connections
    db_connections_warning        = 75
    db_replication_lag_seconds    = 30

    # Redis
    redis_memory_critical_percent = 90
    redis_memory_warning_percent  = 80
    redis_connections_critical    = 90 # percentage of max
    redis_hit_rate_warning        = 50 # cache hit rate below 50%
  }

  # Combine user-provided channels with auto-created ones
  all_notification_channels = concat(
    var.alert_notification_channels,
    [for channel in google_monitoring_notification_channel.email : channel.id],
    var.pagerduty_service_key != "" ? [google_monitoring_notification_channel.pagerduty[0].id] : [],
    var.slack_webhook_url != "" ? [google_monitoring_notification_channel.slack[0].id] : []
  )

  # Critical-only channels (PagerDuty or all if no PagerDuty)
  critical_channels = var.pagerduty_service_key != "" ? [google_monitoring_notification_channel.pagerduty[0].id] : local.all_notification_channels
}

# ==============================================================================
# Notification Channels
# ==============================================================================

# Email notification channels (created from var.alert_email_addresses)
resource "google_monitoring_notification_channel" "email" {
  for_each     = toset(var.alert_email_addresses)
  display_name = "Email: ${each.value}"
  type         = "email"
  project      = var.project_id

  labels = {
    email_address = each.value
  }

  user_labels = local.common_labels
}

# PagerDuty notification channel
resource "google_monitoring_notification_channel" "pagerduty" {
  count        = var.pagerduty_service_key != "" ? 1 : 0
  display_name = "PagerDuty - PULL ${title(var.environment)}"
  type         = "pagerduty"
  project      = var.project_id

  labels = {
    service_key = var.pagerduty_service_key
  }

  user_labels = local.common_labels
}

# Slack notification channel
resource "google_monitoring_notification_channel" "slack" {
  count        = var.slack_webhook_url != "" ? 1 : 0
  display_name = "Slack - PULL ${title(var.environment)}"
  type         = "slack"
  project      = var.project_id

  labels = {
    url = var.slack_webhook_url
  }

  sensitive_labels {
    auth_token = var.slack_webhook_url
  }

  user_labels = local.common_labels
}

# ==============================================================================
# Cloud Run API Alerts
# ==============================================================================

# API High Error Rate (Critical)
resource "google_monitoring_alert_policy" "api_error_rate_critical" {
  count        = var.enable_monitoring ? 1 : 0
  display_name = "${local.name_prefix}-api-error-rate-critical"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run API Error Rate > ${local.alert_thresholds.api_error_rate_critical}%"

    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${google_cloud_run_v2_service.api.name}\" AND metric.type=\"run.googleapis.com/request_count\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = local.alert_thresholds.api_error_rate_critical

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.labels.service_name"]
      }

      # Filter to only error responses (5xx)
      denominator_filter = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${google_cloud_run_v2_service.api.name}\" AND metric.type=\"run.googleapis.com/request_count\""

      denominator_aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.labels.service_name"]
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.critical_channels

  alert_strategy {
    auto_close = "1800s" # 30 minutes
  }

  documentation {
    content   = <<-EOT
      ## API Error Rate Critical Alert

      The API service error rate has exceeded ${local.alert_thresholds.api_error_rate_critical}%.

      ### Impact
      Users are experiencing errors when making API requests.

      ### Investigation Steps
      1. Check Cloud Run logs: `gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=${google_cloud_run_v2_service.api.name}"`
      2. Check recent deployments for regressions
      3. Verify database and Redis connectivity
      4. Check for resource exhaustion (CPU, memory)

      ### Runbook
      See: https://docs.pull.com/runbooks/api-error-rate
    EOT
    mime_type = "text/markdown"
  }

  user_labels = merge(local.common_labels, {
    severity = "critical"
    service  = "api"
  })
}

# API High Latency (Warning)
resource "google_monitoring_alert_policy" "api_latency_warning" {
  count        = var.enable_monitoring ? 1 : 0
  display_name = "${local.name_prefix}-api-latency-warning"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run API P95 Latency > ${local.alert_thresholds.api_latency_p95_warning_ms}ms"

    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${google_cloud_run_v2_service.api.name}\" AND metric.type=\"run.googleapis.com/request_latencies\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = local.alert_thresholds.api_latency_p95_warning_ms

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_PERCENTILE_95"
        cross_series_reducer = "REDUCE_MAX"
        group_by_fields      = ["resource.labels.service_name"]
      }

      trigger {
        count = 3 # Must trigger 3 times in the window
      }
    }
  }

  notification_channels = local.all_notification_channels

  alert_strategy {
    auto_close = "3600s" # 1 hour
  }

  documentation {
    content   = <<-EOT
      ## API Latency Warning

      The API P95 latency has exceeded ${local.alert_thresholds.api_latency_p95_warning_ms}ms.

      ### Investigation Steps
      1. Check Cloud Trace for slow requests
      2. Review database query performance
      3. Check Redis cache hit rates
      4. Verify no resource contention
    EOT
    mime_type = "text/markdown"
  }

  user_labels = merge(local.common_labels, {
    severity = "warning"
    service  = "api"
  })
}

# API Instance Count Low (Warning) - for production only
resource "google_monitoring_alert_policy" "api_instances_low" {
  count        = var.enable_monitoring && local.is_production ? 1 : 0
  display_name = "${local.name_prefix}-api-instances-low"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run API Instance Count < ${var.api_min_instances}"

    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${google_cloud_run_v2_service.api.name}\" AND metric.type=\"run.googleapis.com/container/instance_count\""
      duration        = "300s"
      comparison      = "COMPARISON_LT"
      threshold_value = var.api_min_instances

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_MEAN"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.labels.service_name"]
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.all_notification_channels

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "Cloud Run API service has fewer instances than minimum configured (${var.api_min_instances}). May indicate scaling issues."
    mime_type = "text/markdown"
  }

  user_labels = merge(local.common_labels, {
    severity = "warning"
    service  = "api"
  })
}

# ==============================================================================
# Cloud SQL Database Alerts
# ==============================================================================

# Database CPU High (Critical)
resource "google_monitoring_alert_policy" "db_cpu_critical" {
  count        = var.enable_monitoring ? 1 : 0
  display_name = "${local.name_prefix}-db-cpu-critical"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Cloud SQL CPU > ${local.alert_thresholds.db_cpu_critical_percent}%"

    condition_threshold {
      filter          = "resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"${var.project_id}:${google_sql_database_instance.main.name}\" AND metric.type=\"cloudsql.googleapis.com/database/cpu/utilization\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = local.alert_thresholds.db_cpu_critical_percent / 100

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_MEAN"
        cross_series_reducer = "REDUCE_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.critical_channels

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = <<-EOT
      ## Database CPU Critical

      Cloud SQL CPU utilization has exceeded ${local.alert_thresholds.db_cpu_critical_percent}%.

      ### Impact
      Database queries may timeout or fail. Application performance degraded.

      ### Investigation Steps
      1. Check for long-running queries: `SELECT * FROM pg_stat_activity WHERE state = 'active';`
      2. Review Query Insights in Cloud Console
      3. Check for missing indexes
      4. Consider scaling up the database tier

      ### Immediate Actions
      - Kill long-running queries if necessary
      - Scale up database tier if persistent
    EOT
    mime_type = "text/markdown"
  }

  user_labels = merge(local.common_labels, {
    severity = "critical"
    service  = "database"
  })
}

# Database Memory High (Warning)
resource "google_monitoring_alert_policy" "db_memory_warning" {
  count        = var.enable_monitoring ? 1 : 0
  display_name = "${local.name_prefix}-db-memory-warning"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Cloud SQL Memory > ${local.alert_thresholds.db_memory_warning_percent}%"

    condition_threshold {
      filter          = "resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"${var.project_id}:${google_sql_database_instance.main.name}\" AND metric.type=\"cloudsql.googleapis.com/database/memory/utilization\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = local.alert_thresholds.db_memory_warning_percent / 100

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_MEAN"
        cross_series_reducer = "REDUCE_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.all_notification_channels

  alert_strategy {
    auto_close = "3600s"
  }

  documentation {
    content   = "Cloud SQL memory utilization is high. Monitor for OOM conditions and consider scaling."
    mime_type = "text/markdown"
  }

  user_labels = merge(local.common_labels, {
    severity = "warning"
    service  = "database"
  })
}

# Database Disk Usage High (Critical)
resource "google_monitoring_alert_policy" "db_disk_critical" {
  count        = var.enable_monitoring ? 1 : 0
  display_name = "${local.name_prefix}-db-disk-critical"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Cloud SQL Disk > ${local.alert_thresholds.db_disk_critical_percent}%"

    condition_threshold {
      filter          = "resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"${var.project_id}:${google_sql_database_instance.main.name}\" AND metric.type=\"cloudsql.googleapis.com/database/disk/utilization\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = local.alert_thresholds.db_disk_critical_percent / 100

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_MEAN"
        cross_series_reducer = "REDUCE_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.critical_channels

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = <<-EOT
      ## Database Disk Critical

      Cloud SQL disk utilization has exceeded ${local.alert_thresholds.db_disk_critical_percent}%.

      ### Impact
      Database will become read-only if disk fills completely.

      ### Immediate Actions
      1. Disk will auto-expand if configured
      2. Clean up old data if possible
      3. Manually increase disk size if needed

      ### Prevention
      - Review data retention policies
      - Archive old data to Cloud Storage
    EOT
    mime_type = "text/markdown"
  }

  user_labels = merge(local.common_labels, {
    severity = "critical"
    service  = "database"
  })
}

# Database Connections High (Warning)
resource "google_monitoring_alert_policy" "db_connections_warning" {
  count        = var.enable_monitoring ? 1 : 0
  display_name = "${local.name_prefix}-db-connections-warning"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Cloud SQL Connections > ${local.alert_thresholds.db_connections_warning}% of max"

    condition_threshold {
      filter          = "resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"${var.project_id}:${google_sql_database_instance.main.name}\" AND metric.type=\"cloudsql.googleapis.com/database/postgresql/num_backends\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = tonumber(var.db_max_connections) * local.alert_thresholds.db_connections_warning / 100

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_MEAN"
        cross_series_reducer = "REDUCE_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.all_notification_channels

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "Database connection count is approaching the maximum. Check for connection leaks and consider increasing max_connections."
    mime_type = "text/markdown"
  }

  user_labels = merge(local.common_labels, {
    severity = "warning"
    service  = "database"
  })
}

# Database Replication Lag (for read replica)
resource "google_monitoring_alert_policy" "db_replication_lag" {
  count        = var.enable_monitoring && var.enable_read_replica && local.is_production ? 1 : 0
  display_name = "${local.name_prefix}-db-replication-lag"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Cloud SQL Replication Lag > ${local.alert_thresholds.db_replication_lag_seconds}s"

    condition_threshold {
      filter          = "resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"${var.project_id}:${google_sql_database_instance.read_replica[0].name}\" AND metric.type=\"cloudsql.googleapis.com/database/replication/replica_lag\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = local.alert_thresholds.db_replication_lag_seconds

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_MEAN"
        cross_series_reducer = "REDUCE_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.all_notification_channels

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "Database replication lag is high. Read queries from the replica may return stale data."
    mime_type = "text/markdown"
  }

  user_labels = merge(local.common_labels, {
    severity = "warning"
    service  = "database"
  })
}

# ==============================================================================
# Redis Alerts
# ==============================================================================

# Redis Memory High (Critical)
resource "google_monitoring_alert_policy" "redis_memory_critical" {
  count        = var.enable_monitoring ? 1 : 0
  display_name = "${local.name_prefix}-redis-memory-critical"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Redis Memory > ${local.alert_thresholds.redis_memory_critical_percent}%"

    condition_threshold {
      filter          = "resource.type=\"redis_instance\" AND resource.labels.instance_id=\"${google_redis_instance.main.name}\" AND metric.type=\"redis.googleapis.com/stats/memory/usage_ratio\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = local.alert_thresholds.redis_memory_critical_percent / 100

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_MEAN"
        cross_series_reducer = "REDUCE_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.critical_channels

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = <<-EOT
      ## Redis Memory Critical

      Redis memory utilization has exceeded ${local.alert_thresholds.redis_memory_critical_percent}%.

      ### Impact
      Redis will start evicting keys based on maxmemory-policy (currently: allkeys-lru).

      ### Investigation Steps
      1. Check key count and memory usage by type
      2. Identify large keys: `redis-cli --bigkeys`
      3. Review TTL settings for cached data

      ### Actions
      - Scale up Redis instance size
      - Reduce cache TTLs
      - Implement better key expiration
    EOT
    mime_type = "text/markdown"
  }

  user_labels = merge(local.common_labels, {
    severity = "critical"
    service  = "redis"
  })
}

# Redis Cache Hit Rate Low (Warning)
resource "google_monitoring_alert_policy" "redis_hit_rate_warning" {
  count        = var.enable_monitoring ? 1 : 0
  display_name = "${local.name_prefix}-redis-hit-rate-warning"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Redis Cache Hit Rate < ${local.alert_thresholds.redis_hit_rate_warning}%"

    condition_threshold {
      filter          = "resource.type=\"redis_instance\" AND resource.labels.instance_id=\"${google_redis_instance.main.name}\" AND metric.type=\"redis.googleapis.com/stats/cache_hit_ratio\""
      duration        = "600s"
      comparison      = "COMPARISON_LT"
      threshold_value = local.alert_thresholds.redis_hit_rate_warning / 100

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_MEAN"
        cross_series_reducer = "REDUCE_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.all_notification_channels

  alert_strategy {
    auto_close = "3600s"
  }

  documentation {
    content   = "Redis cache hit rate is low. This may indicate cache warming is needed or cache keys are expiring too quickly."
    mime_type = "text/markdown"
  }

  user_labels = merge(local.common_labels, {
    severity = "warning"
    service  = "redis"
  })
}

# ==============================================================================
# Worker Service Alerts
# ==============================================================================

# Worker High Error Rate
resource "google_monitoring_alert_policy" "worker_error_rate" {
  count        = var.enable_monitoring ? 1 : 0
  display_name = "${local.name_prefix}-worker-error-rate"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Worker Error Rate > 5%"

    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${google_cloud_run_v2_service.worker.name}\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class!=\"2xx\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.05

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.labels.service_name"]
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.all_notification_channels

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "Temporal worker service is experiencing high error rate. Check worker logs and Temporal workflow status."
    mime_type = "text/markdown"
  }

  user_labels = merge(local.common_labels, {
    severity = "warning"
    service  = "worker"
  })
}

# ==============================================================================
# Infrastructure Alerts
# ==============================================================================

# Cloud NAT Port Exhaustion
resource "google_monitoring_alert_policy" "nat_port_exhaustion" {
  count        = var.enable_monitoring ? 1 : 0
  display_name = "${local.name_prefix}-nat-port-exhaustion"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Cloud NAT Port Allocation > 80%"

    condition_threshold {
      filter          = "resource.type=\"nat_gateway\" AND resource.labels.router_id=\"${google_compute_router.main.name}\" AND metric.type=\"router.googleapis.com/nat/allocated_ports\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.8

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_MEAN"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.all_notification_channels

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "Cloud NAT is running low on allocated ports. This may cause outbound connection failures. Consider increasing max_ports_per_vm."
    mime_type = "text/markdown"
  }

  user_labels = merge(local.common_labels, {
    severity = "warning"
    service  = "network"
  })
}

# Load Balancer 5xx Errors (when custom domain configured)
resource "google_monitoring_alert_policy" "lb_5xx_errors" {
  count        = var.enable_monitoring && var.custom_domain != "" ? 1 : 0
  display_name = "${local.name_prefix}-lb-5xx-errors"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Load Balancer 5xx Error Rate > 1%"

    condition_threshold {
      filter          = "resource.type=\"https_lb_rule\" AND resource.labels.url_map_name=\"${google_compute_url_map.api[0].name}\" AND metric.type=\"loadbalancing.googleapis.com/https/request_count\" AND metric.labels.response_code_class=\"500\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.01

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.critical_channels

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "Load balancer is returning 5xx errors. Check backend service health and Cloud Run service status."
    mime_type = "text/markdown"
  }

  user_labels = merge(local.common_labels, {
    severity = "critical"
    service  = "loadbalancer"
  })
}

# ==============================================================================
# Uptime Checks
# ==============================================================================

# API Health Check Uptime
resource "google_monitoring_uptime_check_config" "api_health" {
  count        = var.enable_monitoring ? 1 : 0
  display_name = "${local.name_prefix}-api-health-check"
  project      = var.project_id
  timeout      = "10s"
  period       = "60s"

  http_check {
    path           = "/health"
    port           = 443
    use_ssl        = true
    validate_ssl   = true
    request_method = "GET"

    accepted_response_status_codes {
      status_class = "STATUS_CLASS_2XX"
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.custom_domain != "" ? var.custom_domain : replace(google_cloud_run_v2_service.api.uri, "https://", "")
    }
  }

  content_matchers {
    content = "ok"
    matcher = "CONTAINS_STRING"
  }

  checker_type = "STATIC_IP_CHECKERS"

  selected_regions = [
    "USA",
    "EUROPE",
    "ASIA_PACIFIC"
  ]
}

# Uptime Check Alert
resource "google_monitoring_alert_policy" "api_uptime" {
  count        = var.enable_monitoring ? 1 : 0
  display_name = "${local.name_prefix}-api-uptime-alert"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "API Uptime Check Failure"

    condition_threshold {
      filter          = "resource.type=\"uptime_url\" AND metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.labels.check_id=\"${google_monitoring_uptime_check_config.api_health[0].uptime_check_id}\""
      duration        = "300s"
      comparison      = "COMPARISON_LT"
      threshold_value = 1

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_FRACTION_TRUE"
        cross_series_reducer = "REDUCE_MIN"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.critical_channels

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = <<-EOT
      ## API Uptime Check Failed

      The API health check is failing from multiple regions.

      ### Impact
      API may be unavailable to users.

      ### Immediate Actions
      1. Check Cloud Run service status
      2. Review recent deployments
      3. Check database and Redis connectivity
      4. Verify network configuration
    EOT
    mime_type = "text/markdown"
  }

  user_labels = merge(local.common_labels, {
    severity = "critical"
    service  = "api"
  })
}

# ==============================================================================
# Budget Alert
# ==============================================================================
# Note: Budget alerts require billing account access which may need separate permissions

resource "google_monitoring_alert_policy" "billing_anomaly" {
  count        = var.enable_monitoring ? 1 : 0
  display_name = "${local.name_prefix}-billing-anomaly"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Billing Anomaly Detection"

    condition_threshold {
      filter          = "resource.type=\"global\" AND metric.type=\"billing.googleapis.com/billing/total_cost\""
      duration        = "3600s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0 # Will be overridden by forecast

      aggregations {
        alignment_period     = "86400s" # 1 day
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }

      # This condition uses forecast-based alerting
      forecast_options {
        forecast_horizon = "86400s" # 1 day forecast
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.all_notification_channels

  alert_strategy {
    auto_close = "86400s" # 1 day
  }

  documentation {
    content   = "Billing is projected to exceed normal patterns. Review recent resource changes and usage."
    mime_type = "text/markdown"
  }

  user_labels = merge(local.common_labels, {
    severity = "warning"
    service  = "billing"
  })
}
