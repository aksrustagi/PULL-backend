# PULL Backend WAF Configuration Guide

**Version:** 1.0
**Last Updated:** 2026-01-25
**Classification:** Internal Use Only

This document provides WAF (Web Application Firewall) configuration guidelines for protecting the PULL backend APIs in production.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Cloudflare WAF Configuration](#2-cloudflare-waf-configuration)
3. [AWS WAF Configuration](#3-aws-waf-configuration)
4. [Google Cloud Armor Configuration](#4-google-cloud-armor-configuration)
5. [Custom Rules for Fintech/Betting](#5-custom-rules-for-fintechbetting)
6. [Testing and Validation](#6-testing-and-validation)
7. [Monitoring and Alerting](#7-monitoring-and-alerting)

---

## 1. Overview

### Architecture

```
                    +------------------+
                    |   DNS (Route53/  |
                    |   Cloudflare)    |
                    +--------+---------+
                             |
                    +--------v---------+
                    |      WAF         |
                    | (Cloudflare/AWS/ |
                    |   Cloud Armor)   |
                    +--------+---------+
                             |
                    +--------v---------+
                    |   Load Balancer  |
                    |   (nginx/ALB)    |
                    +--------+---------+
                             |
          +------------------+------------------+
          |                  |                  |
   +------v------+    +------v------+    +------v------+
   |  API Pod 1  |    |  API Pod 2  |    |  API Pod N  |
   +-------------+    +-------------+    +-------------+
```

### Protection Layers

| Layer | Protection | Provider |
|-------|------------|----------|
| Edge | DDoS, Bot | Cloudflare/AWS Shield |
| WAF | OWASP Top 10 | Cloudflare/AWS WAF/Cloud Armor |
| Application | Rate Limiting | Upstash Redis |
| API | Input Validation | Zod/Hono |

---

## 2. Cloudflare WAF Configuration

### 2.1 Managed Rulesets

Enable the following Cloudflare Managed Rulesets:

#### OWASP Core Ruleset

```hcl
# Terraform configuration for Cloudflare
resource "cloudflare_ruleset" "pull_waf" {
  zone_id     = var.cloudflare_zone_id
  name        = "PULL API WAF Rules"
  description = "WAF rules for PULL backend"
  kind        = "zone"
  phase       = "http_request_firewall_managed"

  # OWASP Core Ruleset
  rules {
    action = "execute"
    action_parameters {
      id = "efb7b8c949ac4650a09736fc376e9aee" # OWASP Core Ruleset
      overrides {
        enabled = true
        rules {
          id      = "6179ae15870a4bb7b2d480d4843b323c"
          action  = "block"
          enabled = true
        }
      }
    }
    expression  = "true"
    description = "Enable OWASP Core Ruleset"
    enabled     = true
  }
}
```

#### Cloudflare Managed Ruleset

```hcl
  # Cloudflare Managed Ruleset
  rules {
    action = "execute"
    action_parameters {
      id = "4814384a9e5d4991b9815dcfc25d2f1f" # Cloudflare Managed Ruleset
    }
    expression  = "true"
    description = "Enable Cloudflare Managed Ruleset"
    enabled     = true
  }
```

### 2.2 Custom Rules

#### Rule 1: Block SQL Injection Attempts

```
Expression: (http.request.uri.query contains "UNION" and
             http.request.uri.query contains "SELECT") or
            (http.request.body.raw contains "UNION SELECT") or
            (http.request.uri.query contains "1=1") or
            (http.request.uri.query contains "OR 1=1")

Action: Block
Priority: 1
```

#### Rule 2: Block XSS Attempts

```
Expression: (http.request.uri.query contains "<script") or
            (http.request.uri.query contains "javascript:") or
            (http.request.body.raw contains "<script") or
            (http.request.body.raw contains "onerror=") or
            (http.request.body.raw contains "onload=")

Action: Block
Priority: 2
```

#### Rule 3: API Rate Limiting by Path

```
Expression: http.request.uri.path matches "/api/v1/trading.*"
Action: Rate Limit
Threshold: 60 requests per minute
Period: 60 seconds
Priority: 10

Expression: http.request.uri.path matches "/api/auth/login"
Action: Rate Limit
Threshold: 10 requests per 15 minutes
Period: 900 seconds
Priority: 11

Expression: http.request.uri.path matches "/webhooks/.*"
Action: Rate Limit
Threshold: 100 requests per minute
Period: 60 seconds
Priority: 12
```

#### Rule 4: Geographic Restrictions (OFAC Compliance)

```
Expression: (ip.geoip.country in {"CU" "IR" "KP" "SY" "RU"})
Action: Block
Priority: 5
Note: Block traffic from OFAC-sanctioned countries
```

#### Rule 5: Bot Management

```
Expression: (cf.bot_management.score lt 30) and
            (not cf.bot_management.verified_bot) and
            (http.request.uri.path matches "/api/.*")
Action: Challenge (JS Challenge)
Priority: 20
```

### 2.3 Page Rules

```yaml
# Cache API documentation
- url: "api.pull.app/docs/*"
  settings:
    cache_level: cache_everything
    edge_cache_ttl: 7200

# Bypass cache for API endpoints
- url: "api.pull.app/api/*"
  settings:
    cache_level: bypass

# Security headers
- url: "api.pull.app/*"
  settings:
    security_headers:
      - "X-Frame-Options: DENY"
      - "X-Content-Type-Options: nosniff"
      - "X-XSS-Protection: 1; mode=block"
```

---

## 3. AWS WAF Configuration

### 3.1 Web ACL Configuration

```hcl
resource "aws_wafv2_web_acl" "pull_api" {
  name        = "pull-api-waf"
  description = "WAF for PULL API"
  scope       = "REGIONAL" # Use "CLOUDFRONT" for CloudFront

  default_action {
    allow {}
  }

  # Rule 1: AWS Managed Core Rule Set
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"

        # Exclude rules that may cause false positives
        excluded_rule {
          name = "SizeRestrictions_BODY"
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesCommonRuleSetMetric"
      sampled_requests_enabled   = true
    }
  }

  # Rule 2: SQL Injection Prevention
  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesSQLiRuleSetMetric"
      sampled_requests_enabled   = true
    }
  }

  # Rule 3: Known Bad Inputs
  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesKnownBadInputsRuleSetMetric"
      sampled_requests_enabled   = true
    }
  }

  # Rule 4: Rate Limiting
  rule {
    name     = "RateLimitRule"
    priority = 10

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 1000
        aggregate_key_type = "IP"

        scope_down_statement {
          byte_match_statement {
            search_string         = "/api/"
            positional_constraint = "STARTS_WITH"
            field_to_match {
              uri_path {}
            }
            text_transformation {
              priority = 0
              type     = "LOWERCASE"
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitRuleMetric"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "PullApiWafMetric"
    sampled_requests_enabled   = true
  }

  tags = {
    Environment = var.environment
    Service     = "pull-api"
  }
}
```

### 3.2 IP Set for Allowlisting

```hcl
resource "aws_wafv2_ip_set" "allowed_ips" {
  name               = "pull-allowed-ips"
  description        = "Allowed IP addresses"
  scope              = "REGIONAL"
  ip_address_version = "IPV4"

  addresses = [
    # Office IPs
    "203.0.113.0/24",
    # VPN IPs
    "198.51.100.0/24",
    # CI/CD IPs
    "192.0.2.0/24",
  ]

  tags = {
    Environment = var.environment
  }
}

# Rule to allow specific IPs to bypass rate limiting
rule {
  name     = "AllowListedIPs"
  priority = 0

  action {
    allow {}
  }

  statement {
    ip_set_reference_statement {
      arn = aws_wafv2_ip_set.allowed_ips.arn
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "AllowListedIPsMetric"
    sampled_requests_enabled   = true
  }
}
```

### 3.3 Geo-Blocking Rule

```hcl
resource "aws_wafv2_rule_group" "geo_block" {
  name     = "pull-geo-block"
  scope    = "REGIONAL"
  capacity = 50

  rule {
    name     = "BlockSanctionedCountries"
    priority = 1

    action {
      block {}
    }

    statement {
      geo_match_statement {
        country_codes = ["CU", "IR", "KP", "SY", "RU", "BY"]
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "GeoBlockMetric"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "GeoBlockRuleGroupMetric"
    sampled_requests_enabled   = true
  }
}
```

---

## 4. Google Cloud Armor Configuration

The PULL infrastructure uses GCP, and Cloud Armor is already configured in Terraform.

### 4.1 Current Configuration

From `infrastructure/terraform/main.tf:561-618`:

```hcl
resource "google_compute_security_policy" "api" {
  name    = "${local.name_prefix}-api-policy"
  project = var.project_id

  # Default rule - allow all
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

  # XSS protection
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

  # SQL injection protection
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

  # Rate limiting
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
```

### 4.2 Enhanced Cloud Armor Rules

Add these additional rules for comprehensive protection:

```hcl
# Command injection protection
rule {
  action   = "deny(403)"
  priority = "1002"
  match {
    expr {
      expression = "evaluatePreconfiguredExpr('rce-stable')"
    }
  }
  description = "Remote code execution protection"
}

# Protocol attack protection
rule {
  action   = "deny(403)"
  priority = "1003"
  match {
    expr {
      expression = "evaluatePreconfiguredExpr('protocolattack-stable')"
    }
  }
  description = "Protocol attack protection"
}

# Session fixation protection
rule {
  action   = "deny(403)"
  priority = "1004"
  match {
    expr {
      expression = "evaluatePreconfiguredExpr('sessionfixation-stable')"
    }
  }
  description = "Session fixation protection"
}

# PHP injection protection (if applicable)
rule {
  action   = "deny(403)"
  priority = "1005"
  match {
    expr {
      expression = "evaluatePreconfiguredExpr('php-stable')"
    }
  }
  description = "PHP injection protection"
}

# Scanner detection
rule {
  action   = "deny(403)"
  priority = "1006"
  match {
    expr {
      expression = "evaluatePreconfiguredExpr('scannerdetection-stable')"
    }
  }
  description = "Scanner detection"
}

# Geo-blocking for OFAC compliance
rule {
  action   = "deny(403)"
  priority = "500"
  match {
    expr {
      expression = "origin.region_code == 'CU' || origin.region_code == 'IR' || origin.region_code == 'KP' || origin.region_code == 'SY' || origin.region_code == 'RU'"
    }
  }
  description = "Block OFAC sanctioned countries"
}

# Stricter rate limit for auth endpoints
rule {
  action   = "throttle"
  priority = "1500"
  match {
    expr {
      expression = "request.path.matches('/api/auth/.*')"
    }
  }
  rate_limit_options {
    conform_action = "allow"
    exceed_action  = "deny(429)"
    rate_limit_threshold {
      count        = 10
      interval_sec = 900  # 15 minutes
    }
  }
  description = "Auth endpoint rate limiting"
}

# Stricter rate limit for trading endpoints
rule {
  action   = "throttle"
  priority = "1501"
  match {
    expr {
      expression = "request.path.matches('/api/v1/trading/.*')"
    }
  }
  rate_limit_options {
    conform_action = "allow"
    exceed_action  = "deny(429)"
    rate_limit_threshold {
      count        = 60
      interval_sec = 60
    }
  }
  description = "Trading endpoint rate limiting"
}
```

---

## 5. Custom Rules for Fintech/Betting

### 5.1 Trading-Specific Rules

#### Prevent Order Manipulation Patterns

```
# Cloudflare Expression
Expression: (http.request.uri.path contains "/api/v1/trading/orders") and
            (http.request.body.size gt 10000)
Action: Block
Description: Block oversized order requests (potential DoS)

Expression: (http.request.uri.path contains "/api/v1/trading/orders") and
            (http.request.method eq "POST") and
            (cf.bot_management.score lt 50)
Action: Challenge
Description: Challenge suspicious order submissions
```

#### AWS WAF Custom Rule for Trading

```hcl
# Detect rapid order submission patterns
rule {
  name     = "TradingOrderRateLimit"
  priority = 20

  action {
    block {}
  }

  statement {
    rate_based_statement {
      limit              = 30  # 30 orders per 5 minutes
      aggregate_key_type = "IP"

      scope_down_statement {
        and_statement {
          statement {
            byte_match_statement {
              search_string         = "/api/v1/trading/orders"
              positional_constraint = "STARTS_WITH"
              field_to_match {
                uri_path {}
              }
              text_transformation {
                priority = 0
                type     = "LOWERCASE"
              }
            }
          }
          statement {
            byte_match_statement {
              search_string         = "POST"
              positional_constraint = "EXACTLY"
              field_to_match {
                method {}
              }
              text_transformation {
                priority = 0
                type     = "NONE"
              }
            }
          }
        }
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "TradingOrderRateLimitMetric"
    sampled_requests_enabled   = true
  }
}
```

### 5.2 Payment-Specific Rules

#### Deposit/Withdrawal Protection

```
# Cloudflare Expression
Expression: (http.request.uri.path matches ".*/(deposit|withdraw).*") and
            (http.request.method eq "POST") and
            (not ip.geoip.country in {"US" "CA" "GB" "AU"})
Action: Block
Description: Block payment operations from non-supported regions

Expression: (http.request.uri.path matches ".*/(deposit|withdraw).*") and
            (http.request.body.raw regex "amount.*[0-9]{6,}")
Action: Challenge
Description: Challenge large transaction amounts
```

#### AWS WAF Payment Protection

```hcl
# Strict rate limit for payment endpoints
rule {
  name     = "PaymentRateLimit"
  priority = 15

  action {
    block {}
  }

  statement {
    rate_based_statement {
      limit              = 5  # 5 payment operations per 10 minutes
      aggregate_key_type = "FORWARDED_IP"

      forwarded_ip_config {
        header_name       = "X-Forwarded-For"
        fallback_behavior = "MATCH"
      }

      scope_down_statement {
        or_statement {
          statement {
            byte_match_statement {
              search_string         = "/deposit"
              positional_constraint = "CONTAINS"
              field_to_match {
                uri_path {}
              }
              text_transformation {
                priority = 0
                type     = "LOWERCASE"
              }
            }
          }
          statement {
            byte_match_statement {
              search_string         = "/withdraw"
              positional_constraint = "CONTAINS"
              field_to_match {
                uri_path {}
              }
              text_transformation {
                priority = 0
                type     = "LOWERCASE"
              }
            }
          }
        }
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "PaymentRateLimitMetric"
    sampled_requests_enabled   = true
  }
}
```

### 5.3 Fraud Prevention Rules

#### Block Known Fraud Patterns

```
# Cloudflare Expression
Expression: (http.request.uri.query contains "referralCode=") and
            (cf.threat_score gt 50)
Action: Block
Description: Block suspicious referral abuse

Expression: (http.request.headers["user-agent"] contains "curl") and
            (http.request.uri.path matches "/api/v1/rewards.*")
Action: Challenge
Description: Challenge automated reward claims
```

#### AWS WAF Fraud Prevention

```hcl
# Block requests with suspicious headers
rule {
  name     = "BlockSuspiciousHeaders"
  priority = 25

  action {
    block {}
  }

  statement {
    or_statement {
      statement {
        byte_match_statement {
          search_string         = "sqlmap"
          positional_constraint = "CONTAINS"
          field_to_match {
            single_header {
              name = "user-agent"
            }
          }
          text_transformation {
            priority = 0
            type     = "LOWERCASE"
          }
        }
      }
      statement {
        byte_match_statement {
          search_string         = "nikto"
          positional_constraint = "CONTAINS"
          field_to_match {
            single_header {
              name = "user-agent"
            }
          }
          text_transformation {
            priority = 0
            type     = "LOWERCASE"
          }
        }
      }
      statement {
        byte_match_statement {
          search_string         = "dirbuster"
          positional_constraint = "CONTAINS"
          field_to_match {
            single_header {
              name = "user-agent"
            }
          }
          text_transformation {
            priority = 0
            type     = "LOWERCASE"
          }
        }
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "BlockSuspiciousHeadersMetric"
    sampled_requests_enabled   = true
  }
}
```

### 5.4 Webhook Protection

```
# Cloud Armor rule for webhooks
rule {
  action   = "allow"
  priority = "100"
  match {
    expr {
      expression = "request.path.matches('/webhooks/.*') && (origin.ip == '54.187.174.169' || origin.ip == '54.187.205.235')"  # Stripe IPs
    }
  }
  description = "Allow Stripe webhook IPs"
}

rule {
  action   = "deny(403)"
  priority = "101"
  match {
    expr {
      expression = "request.path.matches('/webhooks/stripe') && !(origin.ip == '54.187.174.169' || origin.ip == '54.187.205.235')"
    }
  }
  description = "Block non-Stripe IPs from Stripe webhook"
}
```

---

## 6. Testing and Validation

### 6.1 WAF Rule Testing

Before deploying WAF rules to production:

```bash
# Test SQL injection blocking
curl -X POST "https://api.pull.app/api/test" \
  -H "Content-Type: application/json" \
  -d '{"input": "1 OR 1=1"}'
# Expected: 403 Forbidden

# Test XSS blocking
curl -X POST "https://api.pull.app/api/test" \
  -H "Content-Type: application/json" \
  -d '{"input": "<script>alert(1)</script>"}'
# Expected: 403 Forbidden

# Test rate limiting
for i in {1..100}; do
  curl -s -o /dev/null -w "%{http_code}\n" "https://api.pull.app/api/v1/health"
done
# Expected: 429 after threshold
```

### 6.2 Monitoring Dashboard

Set up CloudWatch/Stackdriver dashboards for:

- Total requests blocked
- Block reasons breakdown
- Top blocked IPs
- Geographic distribution of blocks
- Rate limit violations
- False positive rate

### 6.3 Log Analysis

```sql
-- CloudWatch Logs Insights query for WAF analysis
fields @timestamp, @message
| filter @message like /BLOCK/
| stats count(*) as blocked by bin(1h)
| sort @timestamp desc
| limit 100
```

---

## 7. Monitoring and Alerting

### 7.1 Alert Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Blocked Requests/min | > 100 | > 500 | Investigate |
| Rate Limit Hits/min | > 50 | > 200 | Check for attack |
| Unique IPs Blocked/hr | > 20 | > 100 | Review rules |
| 5xx Errors/min | > 10 | > 50 | Check backend |
| False Positives/day | > 5 | > 20 | Tune rules |

### 7.2 PagerDuty Integration

```yaml
# Alert routing
critical_alerts:
  - geo_block_spike       # Sudden increase in geo-blocked traffic
  - rate_limit_exhausted  # All rate limits exceeded for IP
  - sql_injection_burst   # Multiple SQLi attempts
  - ddos_detected         # DDoS traffic patterns

warning_alerts:
  - elevated_block_rate   # Above normal blocking rate
  - new_attack_signature  # Previously unseen attack pattern
  - compliance_violation  # Sanctioned country access attempt
```

### 7.3 Weekly Review Process

1. Review blocked request logs
2. Analyze false positive reports
3. Update rule thresholds based on traffic patterns
4. Review new threat intelligence
5. Update geo-blocking lists if needed
6. Document any rule changes

---

## Appendix A: OFAC Sanctioned Countries

As of 2026, the following countries require blocking:

| Country | ISO Code | Notes |
|---------|----------|-------|
| Cuba | CU | Comprehensive sanctions |
| Iran | IR | Comprehensive sanctions |
| North Korea | KP | Comprehensive sanctions |
| Syria | SY | Comprehensive sanctions |
| Russia | RU | Sectoral sanctions |
| Belarus | BY | Related to Russia sanctions |
| Crimea Region | UA | Blocked regions |

## Appendix B: Webhook IP Allowlists

| Provider | IP Ranges | Documentation |
|----------|-----------|---------------|
| Stripe | 54.187.174.0/24, 54.187.205.0/24 | https://stripe.com/docs/ips |
| Plaid | 52.21.26.0/24 | https://plaid.com/docs/ips |
| Persona | TBD | Contact support |
| Checkr | TBD | Contact support |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-25 | Security Team | Initial guide |
