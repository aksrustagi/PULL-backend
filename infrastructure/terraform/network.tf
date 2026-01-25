# ==============================================================================
# PULL Infrastructure - Network Configuration
# ==============================================================================
# This file contains all network-related resources including:
#   - VPC Network and subnets
#   - Cloud NAT for outbound connectivity
#   - Firewall rules for traffic control
#   - Cloud Armor security policies
#   - Private Service Connect for Google APIs
#   - Cloud DNS for internal resolution
# ==============================================================================

# ==============================================================================
# VPC Network
# ==============================================================================
# Custom mode VPC with explicit subnet configuration for full control over
# IP addressing and network segmentation.

resource "google_compute_network" "main" {
  name                            = "${local.name_prefix}-vpc"
  project                         = var.project_id
  auto_create_subnetworks         = false
  routing_mode                    = "REGIONAL"
  delete_default_routes_on_create = false
  mtu                             = 1460

  description = "Primary VPC network for PULL ${var.environment} environment"
}

# ==============================================================================
# Subnets
# ==============================================================================
# Separate subnets for different workload types with appropriate sizing

# Primary subnet for compute resources (Cloud Run, GKE, etc.)
resource "google_compute_subnetwork" "main" {
  name          = "${local.name_prefix}-subnet-main"
  project       = var.project_id
  region        = var.region
  network       = google_compute_network.main.id
  ip_cidr_range = var.subnet_cidr_main

  # Secondary IP ranges for GKE pods and services (if needed in future)
  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = var.subnet_cidr_pods
  }

  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = var.subnet_cidr_services
  }

  # Enable private Google access for resources without external IPs
  private_ip_google_access = true

  # Enable VPC Flow Logs for network monitoring and troubleshooting
  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = local.is_production ? 0.5 : 0.1
    metadata             = "INCLUDE_ALL_METADATA"
    metadata_fields      = []
  }

  purpose = "PRIVATE"

  description = "Primary subnet for PULL compute resources"
}

# Subnet for database and data services
resource "google_compute_subnetwork" "data" {
  name          = "${local.name_prefix}-subnet-data"
  project       = var.project_id
  region        = var.region
  network       = google_compute_network.main.id
  ip_cidr_range = var.subnet_cidr_data

  private_ip_google_access = true

  log_config {
    aggregation_interval = "INTERVAL_10_MIN"
    flow_sampling        = 0.1
    metadata             = "INCLUDE_ALL_METADATA"
  }

  purpose = "PRIVATE"

  description = "Subnet for Cloud SQL, Redis, and data services"
}

# Proxy-only subnet for internal load balancers
resource "google_compute_subnetwork" "proxy_only" {
  name          = "${local.name_prefix}-subnet-proxy"
  project       = var.project_id
  region        = var.region
  network       = google_compute_network.main.id
  ip_cidr_range = var.subnet_cidr_proxy

  purpose = "REGIONAL_MANAGED_PROXY"
  role    = "ACTIVE"

  description = "Proxy-only subnet for regional internal load balancers"
}

# ==============================================================================
# Private Service Connect
# ==============================================================================
# Enable private connectivity to Google APIs without traversing the internet

resource "google_compute_global_address" "private_service_connect" {
  name          = "${local.name_prefix}-psc-address"
  project       = var.project_id
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id

  description = "Private Service Connect address range for Google APIs"
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_service_connect.name]
}

# ==============================================================================
# Cloud Router
# ==============================================================================
# Required for Cloud NAT to provide outbound internet access

resource "google_compute_router" "main" {
  name    = "${local.name_prefix}-router"
  project = var.project_id
  region  = var.region
  network = google_compute_network.main.id

  bgp {
    asn               = 64514
    advertise_mode    = "CUSTOM"
    advertised_groups = ["ALL_SUBNETS"]
  }

  description = "Cloud Router for PULL VPC NAT gateway"
}

# ==============================================================================
# Cloud NAT
# ==============================================================================
# Provides outbound internet connectivity for resources without external IPs.
# Critical for Cloud Run VPC connector egress.

resource "google_compute_router_nat" "main" {
  name                               = "${local.name_prefix}-nat"
  project                            = var.project_id
  region                             = var.region
  router                             = google_compute_router.main.name
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  # Logging configuration for troubleshooting
  log_config {
    enable = true
    filter = local.is_production ? "ERRORS_ONLY" : "ALL"
  }

  # Timeout configurations
  min_ports_per_vm                    = 64
  max_ports_per_vm                    = local.is_production ? 4096 : 1024
  enable_endpoint_independent_mapping = false
  icmp_idle_timeout_sec               = 30
  tcp_established_idle_timeout_sec    = 1200
  tcp_transitory_idle_timeout_sec     = 30
  udp_idle_timeout_sec                = 30

  # Enable dynamic port allocation for high-traffic scenarios
  enable_dynamic_port_allocation = true
}

# ==============================================================================
# Firewall Rules
# ==============================================================================
# Defense-in-depth firewall rules following principle of least privilege

# Allow internal communication within VPC
resource "google_compute_firewall" "allow_internal" {
  name        = "${local.name_prefix}-allow-internal"
  project     = var.project_id
  network     = google_compute_network.main.name
  description = "Allow internal communication within VPC"
  priority    = 1000
  direction   = "INGRESS"

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "icmp"
  }

  source_ranges = [
    var.subnet_cidr_main,
    var.subnet_cidr_data,
    var.vpc_connector_cidr,
  ]

  log_config {
    metadata = "INCLUDE_ALL_METADATA"
  }
}

# Allow health checks from Google's health check ranges
resource "google_compute_firewall" "allow_health_checks" {
  name        = "${local.name_prefix}-allow-health-checks"
  project     = var.project_id
  network     = google_compute_network.main.name
  description = "Allow health check traffic from Google load balancers"
  priority    = 1000
  direction   = "INGRESS"

  allow {
    protocol = "tcp"
    ports    = ["80", "443", "3001", "3002", "8080"]
  }

  # Google's health check IP ranges
  source_ranges = [
    "35.191.0.0/16",
    "130.211.0.0/22",
    "209.85.152.0/22",
    "209.85.204.0/22",
  ]

  target_tags = ["allow-health-check"]

  log_config {
    metadata = "INCLUDE_ALL_METADATA"
  }
}

# Allow IAP for secure SSH access (bastion-less access)
resource "google_compute_firewall" "allow_iap_ssh" {
  name        = "${local.name_prefix}-allow-iap-ssh"
  project     = var.project_id
  network     = google_compute_network.main.name
  description = "Allow SSH via Identity-Aware Proxy for secure access"
  priority    = 1000
  direction   = "INGRESS"

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  # IAP's IP range
  source_ranges = ["35.235.240.0/20"]

  target_tags = ["allow-iap-ssh"]

  log_config {
    metadata = "INCLUDE_ALL_METADATA"
  }
}

# Allow VPC connector to access internal resources
resource "google_compute_firewall" "allow_vpc_connector" {
  name        = "${local.name_prefix}-allow-vpc-connector"
  project     = var.project_id
  network     = google_compute_network.main.name
  description = "Allow Serverless VPC Access connector traffic"
  priority    = 1000
  direction   = "INGRESS"

  allow {
    protocol = "tcp"
  }

  allow {
    protocol = "udp"
  }

  allow {
    protocol = "icmp"
  }

  source_ranges = [var.vpc_connector_cidr]

  log_config {
    metadata = "INCLUDE_ALL_METADATA"
  }
}

# Deny all other ingress traffic (explicit deny for visibility)
resource "google_compute_firewall" "deny_all_ingress" {
  name        = "${local.name_prefix}-deny-all-ingress"
  project     = var.project_id
  network     = google_compute_network.main.name
  description = "Explicit deny all ingress traffic not matching other rules"
  priority    = 65534
  direction   = "INGRESS"

  deny {
    protocol = "all"
  }

  source_ranges = ["0.0.0.0/0"]

  log_config {
    metadata = "INCLUDE_ALL_METADATA"
  }
}

# Allow egress to Google APIs via Private Google Access
resource "google_compute_firewall" "allow_google_apis" {
  name        = "${local.name_prefix}-allow-google-apis"
  project     = var.project_id
  network     = google_compute_network.main.name
  description = "Allow egress to Google APIs"
  priority    = 1000
  direction   = "EGRESS"

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  destination_ranges = [
    "199.36.153.8/30",   # private.googleapis.com
    "199.36.153.4/30",   # restricted.googleapis.com
  ]

  log_config {
    metadata = "INCLUDE_ALL_METADATA"
  }
}

# Allow egress to external APIs (Kalshi, Plaid, etc.)
resource "google_compute_firewall" "allow_external_apis" {
  name        = "${local.name_prefix}-allow-external-apis"
  project     = var.project_id
  network     = google_compute_network.main.name
  description = "Allow egress to external third-party APIs"
  priority    = 1000
  direction   = "EGRESS"

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  # Allow all egress for HTTPS (NAT will handle outbound)
  destination_ranges = ["0.0.0.0/0"]

  target_tags = ["allow-external-apis"]

  log_config {
    metadata = "INCLUDE_ALL_METADATA"
  }
}

# ==============================================================================
# Cloud Armor Security Policy
# ==============================================================================
# Web Application Firewall for protecting the API from common attacks

resource "google_compute_security_policy" "api" {
  name        = "${local.name_prefix}-api-waf"
  project     = var.project_id
  description = "Cloud Armor WAF policy for PULL API"

  # Adaptive protection for DDoS mitigation (production only)
  dynamic "adaptive_protection_config" {
    for_each = local.is_production ? [1] : []
    content {
      layer_7_ddos_defense_config {
        enable          = true
        rule_visibility = "STANDARD"
      }
    }
  }

  # Default rule - allow all traffic
  rule {
    action   = "allow"
    priority = "2147483647"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    description = "Default rule - allow all traffic"
  }

  # Block traffic from known bad IP ranges
  dynamic "rule" {
    for_each = length(var.blocked_ip_ranges) > 0 ? [1] : []
    content {
      action   = "deny(403)"
      priority = "100"
      match {
        versioned_expr = "SRC_IPS_V1"
        config {
          src_ip_ranges = var.blocked_ip_ranges
        }
      }
      description = "Block known malicious IP ranges"
    }
  }

  # OWASP ModSecurity Core Rule Set - SQL Injection
  rule {
    action   = "deny(403)"
    priority = "1000"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('sqli-v33-stable')"
      }
    }
    description = "Block SQL injection attacks (OWASP CRS)"
  }

  # OWASP ModSecurity Core Rule Set - XSS
  rule {
    action   = "deny(403)"
    priority = "1001"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('xss-v33-stable')"
      }
    }
    description = "Block cross-site scripting attacks (OWASP CRS)"
  }

  # OWASP ModSecurity Core Rule Set - Local File Inclusion
  rule {
    action   = "deny(403)"
    priority = "1002"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('lfi-v33-stable')"
      }
    }
    description = "Block local file inclusion attacks (OWASP CRS)"
  }

  # OWASP ModSecurity Core Rule Set - Remote File Inclusion
  rule {
    action   = "deny(403)"
    priority = "1003"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('rfi-v33-stable')"
      }
    }
    description = "Block remote file inclusion attacks (OWASP CRS)"
  }

  # OWASP ModSecurity Core Rule Set - Remote Code Execution
  rule {
    action   = "deny(403)"
    priority = "1004"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('rce-v33-stable')"
      }
    }
    description = "Block remote code execution attacks (OWASP CRS)"
  }

  # OWASP ModSecurity Core Rule Set - Method Enforcement
  rule {
    action   = "deny(403)"
    priority = "1005"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('methodenforcement-v33-stable')"
      }
    }
    description = "Enforce allowed HTTP methods (OWASP CRS)"
  }

  # OWASP ModSecurity Core Rule Set - Scanner Detection
  rule {
    action   = "deny(403)"
    priority = "1006"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('scannerdetection-v33-stable')"
      }
    }
    description = "Block known vulnerability scanners (OWASP CRS)"
  }

  # OWASP ModSecurity Core Rule Set - Protocol Attack
  rule {
    action   = "deny(403)"
    priority = "1007"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('protocolattack-v33-stable')"
      }
    }
    description = "Block HTTP protocol attacks (OWASP CRS)"
  }

  # OWASP ModSecurity Core Rule Set - Session Fixation
  rule {
    action   = "deny(403)"
    priority = "1008"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('sessionfixation-v33-stable')"
      }
    }
    description = "Block session fixation attacks (OWASP CRS)"
  }

  # Rate limiting - per IP address
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
        count        = var.rate_limit_requests_per_minute
        interval_sec = 60
      }
      enforce_on_key = "IP"
    }
    description = "Rate limit requests per IP address"
  }

  # Stricter rate limit for authentication endpoints
  rule {
    action   = "throttle"
    priority = "2001"
    match {
      expr {
        expression = "request.path.matches('/api/auth/.*')"
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      rate_limit_threshold {
        count        = var.auth_rate_limit_requests_per_minute
        interval_sec = 60
      }
      enforce_on_key = "IP"
    }
    description = "Stricter rate limit for authentication endpoints"
  }

  # Block requests with suspicious user agents
  rule {
    action   = "deny(403)"
    priority = "3000"
    match {
      expr {
        expression = "has(request.headers['user-agent']) && request.headers['user-agent'].matches('(?i)(nikto|sqlmap|nmap|masscan|zgrab|curl|wget|python-requests)')"
      }
    }
    description = "Block requests from suspicious tools/scanners"
  }

  # Geo-blocking (if enabled)
  dynamic "rule" {
    for_each = length(var.blocked_countries) > 0 ? [1] : []
    content {
      action   = "deny(403)"
      priority = "500"
      match {
        expr {
          expression = "origin.region_code in [${join(",", formatlist("'%s'", var.blocked_countries))}]"
        }
      }
      description = "Block traffic from restricted countries"
    }
  }
}

# ==============================================================================
# Cloud DNS - Private Zone
# ==============================================================================
# Internal DNS for service discovery within the VPC

resource "google_dns_managed_zone" "private" {
  name        = "${local.name_prefix}-private-zone"
  project     = var.project_id
  dns_name    = "${var.environment}.pull.internal."
  description = "Private DNS zone for PULL ${var.environment} services"
  visibility  = "private"

  private_visibility_config {
    networks {
      network_url = google_compute_network.main.id
    }
  }

  labels = local.common_labels
}

# DNS record for database
resource "google_dns_record_set" "database" {
  name         = "db.${google_dns_managed_zone.private.dns_name}"
  project      = var.project_id
  managed_zone = google_dns_managed_zone.private.name
  type         = "A"
  ttl          = 300
  rrdatas      = [google_sql_database_instance.main.private_ip_address]
}

# DNS record for Redis
resource "google_dns_record_set" "redis" {
  name         = "redis.${google_dns_managed_zone.private.dns_name}"
  project      = var.project_id
  managed_zone = google_dns_managed_zone.private.name
  type         = "A"
  ttl          = 300
  rrdatas      = [google_redis_instance.main.host]
}

# ==============================================================================
# SSL/TLS Certificate (for custom domain if configured)
# ==============================================================================

resource "google_compute_managed_ssl_certificate" "api" {
  count   = var.custom_domain != "" ? 1 : 0
  name    = "${local.name_prefix}-api-cert"
  project = var.project_id

  managed {
    domains = [var.custom_domain]
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ==============================================================================
# Global Load Balancer (for custom domain)
# ==============================================================================
# External HTTPS load balancer with Cloud Armor integration

# Reserve static IP for load balancer
resource "google_compute_global_address" "api_lb" {
  count       = var.custom_domain != "" ? 1 : 0
  name        = "${local.name_prefix}-api-lb-ip"
  project     = var.project_id
  description = "Static IP for PULL API load balancer"
}

# Serverless NEG for Cloud Run
resource "google_compute_region_network_endpoint_group" "api" {
  count                 = var.custom_domain != "" ? 1 : 0
  name                  = "${local.name_prefix}-api-neg"
  project               = var.project_id
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = google_cloud_run_v2_service.api.name
  }
}

# Backend service with Cloud Armor
resource "google_compute_backend_service" "api" {
  count                 = var.custom_domain != "" ? 1 : 0
  name                  = "${local.name_prefix}-api-backend"
  project               = var.project_id
  protocol              = "HTTP"
  port_name             = "http"
  timeout_sec           = 30
  enable_cdn            = var.enable_cdn
  security_policy       = google_compute_security_policy.api.id
  load_balancing_scheme = "EXTERNAL_MANAGED"

  backend {
    group = google_compute_region_network_endpoint_group.api[0].id
  }

  log_config {
    enable      = true
    sample_rate = local.is_production ? 0.5 : 1.0
  }

  # Connection draining for graceful shutdown
  connection_draining_timeout_sec = 300

  dynamic "cdn_policy" {
    for_each = var.enable_cdn ? [1] : []
    content {
      cache_mode                   = "CACHE_ALL_STATIC"
      default_ttl                  = 3600
      max_ttl                      = 86400
      client_ttl                   = 3600
      negative_caching             = true
      signed_url_cache_max_age_sec = 0

      cache_key_policy {
        include_host         = true
        include_protocol     = true
        include_query_string = false
      }
    }
  }
}

# URL map
resource "google_compute_url_map" "api" {
  count           = var.custom_domain != "" ? 1 : 0
  name            = "${local.name_prefix}-api-urlmap"
  project         = var.project_id
  default_service = google_compute_backend_service.api[0].id

  # Health check path
  host_rule {
    hosts        = [var.custom_domain]
    path_matcher = "api-paths"
  }

  path_matcher {
    name            = "api-paths"
    default_service = google_compute_backend_service.api[0].id
  }
}

# HTTPS proxy
resource "google_compute_target_https_proxy" "api" {
  count            = var.custom_domain != "" ? 1 : 0
  name             = "${local.name_prefix}-api-https-proxy"
  project          = var.project_id
  url_map          = google_compute_url_map.api[0].id
  ssl_certificates = [google_compute_managed_ssl_certificate.api[0].id]
}

# Global forwarding rule
resource "google_compute_global_forwarding_rule" "api_https" {
  count                 = var.custom_domain != "" ? 1 : 0
  name                  = "${local.name_prefix}-api-https-rule"
  project               = var.project_id
  ip_address            = google_compute_global_address.api_lb[0].address
  port_range            = "443"
  target                = google_compute_target_https_proxy.api[0].id
  load_balancing_scheme = "EXTERNAL_MANAGED"

  labels = local.common_labels
}

# HTTP to HTTPS redirect
resource "google_compute_url_map" "api_redirect" {
  count   = var.custom_domain != "" ? 1 : 0
  name    = "${local.name_prefix}-api-redirect"
  project = var.project_id

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "api_redirect" {
  count   = var.custom_domain != "" ? 1 : 0
  name    = "${local.name_prefix}-api-http-proxy"
  project = var.project_id
  url_map = google_compute_url_map.api_redirect[0].id
}

resource "google_compute_global_forwarding_rule" "api_http" {
  count                 = var.custom_domain != "" ? 1 : 0
  name                  = "${local.name_prefix}-api-http-rule"
  project               = var.project_id
  ip_address            = google_compute_global_address.api_lb[0].address
  port_range            = "80"
  target                = google_compute_target_http_proxy.api_redirect[0].id
  load_balancing_scheme = "EXTERNAL_MANAGED"

  labels = local.common_labels
}
