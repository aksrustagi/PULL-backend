# PULL Backend Secret Rotation Guide

**Version:** 1.0
**Last Updated:** 2026-01-25
**Classification:** Confidential - Internal Use Only

This document defines all secrets, API keys, and credentials used by the PULL platform, along with rotation procedures and recommended schedules.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Secret Inventory](#2-secret-inventory)
3. [Rotation Procedures](#3-rotation-procedures)
4. [Automated Rotation](#4-automated-rotation)
5. [Emergency Rotation](#5-emergency-rotation)
6. [Audit and Compliance](#6-audit-and-compliance)

---

## 1. Overview

### Secret Management Architecture

```
+-------------------+     +----------------------+     +------------------+
|  Secret Manager   |     |   Kubernetes/        |     |   Application    |
|  (GCP/AWS/Vault)  | --> |   External Secrets   | --> |   Environment    |
+-------------------+     +----------------------+     +------------------+
        |
        v
+-------------------+
|  Terraform State  |
|  (Encrypted)      |
+-------------------+
```

### Key Principles

1. **No secrets in code**: All secrets stored in GCP Secret Manager
2. **Principle of least privilege**: Each service has minimal required access
3. **Regular rotation**: All secrets rotated on schedule
4. **Audit trail**: All secret access and modifications logged
5. **Zero-downtime rotation**: Rotation must not cause service interruption

### Secret Storage Locations

| Environment | Primary Store | Backup |
|-------------|---------------|--------|
| Production | GCP Secret Manager | AWS Secrets Manager |
| Staging | GCP Secret Manager | - |
| Development | Local `.env` | - |

---

## 2. Secret Inventory

### 2.1 Authentication & Security

| Secret Name | Environment Variable | Description | Rotation Period | Owner |
|-------------|---------------------|-------------|-----------------|-------|
| JWT Signing Key | `JWT_SECRET` | Signs all JWT tokens | 180 days | Security Team |
| Encryption Key | `ENCRYPTION_KEY` | Encrypts PII data at rest | 90 days | Security Team |
| API Key | `API_KEY` | Internal API authentication | 90 days | Backend Team |

**JWT_SECRET**
- **Location**: `infrastructure/terraform/main.tf:1129-1142`
- **GCP Secret ID**: `pull-production-jwt-secret`
- **Minimum Length**: 32 characters
- **Generation**: `openssl rand -base64 32`
- **Impact if Compromised**: All existing tokens become vulnerable
- **Rotation Notes**: Must deploy new secret to all API instances before invalidating old

**ENCRYPTION_KEY**
- **Location**: `.env.example:19`
- **GCP Secret ID**: `pull-production-encryption-key`
- **Length**: 32 bytes (256-bit AES)
- **Generation**: `openssl rand -base64 32`
- **Impact if Compromised**: Encrypted data at risk
- **Rotation Notes**: Re-encrypt data with new key before removing old

### 2.2 Database Credentials

| Secret Name | Environment Variable | Description | Rotation Period | Owner |
|-------------|---------------------|-------------|-----------------|-------|
| PostgreSQL Password | `DATABASE_URL` | Primary database connection | 90 days | Platform Team |
| PostgreSQL Read Replica | `DATABASE_READ_URL` | Read replica connection | 90 days | Platform Team |
| Redis Password | `REDIS_PASSWORD` | Redis AUTH password | 90 days | Platform Team |
| Upstash Redis Token | `UPSTASH_REDIS_REST_TOKEN` | Upstash API token | 90 days | Platform Team |

**DATABASE_URL**
- **Location**: `infrastructure/terraform/main.tf:1074-1097`
- **GCP Secret ID**: `pull-production-database-url`
- **Format**: `postgresql://user:password@host:5432/dbname?sslmode=require`
- **Generation**: Managed by Terraform `random_password` resource
- **Rotation Notes**:
  1. Create new user with new password
  2. Deploy to applications
  3. Remove old user after verification

**REDIS_PASSWORD**
- **Location**: `.env.example:32`
- **GCP Secret ID**: `pull-production-redis-auth`
- **Generation**: `openssl rand -base64 24`
- **Rotation Notes**: GCP Memorystore requires instance recreation for auth string rotation

### 2.3 Trading API Credentials

| Secret Name | Environment Variable | Description | Rotation Period | Owner |
|-------------|---------------------|-------------|-----------------|-------|
| Kalshi API Key | `KALSHI_API_KEY` | Kalshi trading API | On compromise | Trading Team |
| Kalshi Private Key | `KALSHI_PRIVATE_KEY` | RSA private key for Kalshi | On compromise | Trading Team |
| Massive API Key | `MASSIVE_API_KEY` | Order execution API | 90 days | Trading Team |
| Massive API Secret | `MASSIVE_API_SECRET` | Order execution secret | 90 days | Trading Team |
| Polygon API Key | `POLYGON_API_KEY` | Market data API | Annual | Data Team |

**KALSHI_API_KEY / KALSHI_PRIVATE_KEY**
- **Location**: `infrastructure/terraform/main.tf:1145-1165`
- **GCP Secret IDs**: `pull-production-kalshi-api-key`, `pull-production-kalshi-private-key`
- **Format**: RSA private key in PEM format
- **Generation**: Via Kalshi Dashboard
- **Rotation Notes**:
  1. Generate new key pair in Kalshi Dashboard
  2. Update GCP Secret Manager
  3. Deploy to workers
  4. Revoke old key in Kalshi Dashboard

### 2.4 Identity & Compliance

| Secret Name | Environment Variable | Description | Rotation Period | Owner |
|-------------|---------------------|-------------|-----------------|-------|
| Plaid Client ID | `PLAID_CLIENT_ID` | Banking integration | On compromise | Compliance Team |
| Plaid Secret | `PLAID_SECRET` | Banking integration | 90 days | Compliance Team |
| Persona API Key | `PERSONA_API_KEY` | KYC verification | Annual | Compliance Team |
| Persona Webhook Secret | `PERSONA_WEBHOOK_SECRET` | Webhook verification | On rotation | Compliance Team |
| Sumsub App Token | `SUMSUB_APP_TOKEN` | KYC verification | Annual | Compliance Team |
| Sumsub Secret Key | `SUMSUB_SECRET_KEY` | KYC API signing | Annual | Compliance Team |
| Checkr API Key | `CHECKR_API_KEY` | Background checks | Annual | Compliance Team |
| Checkr Webhook Secret | `CHECKR_WEBHOOK_SECRET` | Webhook verification | On rotation | Compliance Team |
| Chainalysis API Key | `CHAINALYSIS_API_KEY` | Crypto compliance | Annual | Compliance Team |

**PLAID_SECRET**
- **Location**: `infrastructure/terraform/main.tf:1179-1188`
- **GCP Secret ID**: `pull-production-plaid-secret`
- **Generation**: Via Plaid Dashboard
- **Rotation Notes**:
  1. Generate new secret in Plaid Dashboard
  2. Update GCP Secret Manager
  3. Deploy to API and workers
  4. Revoke old secret in Plaid Dashboard

### 2.5 Payment Credentials

| Secret Name | Environment Variable | Description | Rotation Period | Owner |
|-------------|---------------------|-------------|-----------------|-------|
| Stripe Secret Key | `STRIPE_SECRET_KEY` | Payment processing | On compromise | Payments Team |
| Stripe Webhook Secret | `STRIPE_WEBHOOK_SECRET` | Webhook verification | On endpoint rotation | Payments Team |

**STRIPE_SECRET_KEY**
- **Location**: `.env.example:153-155`
- **Format**: `sk_live_*` (production) or `sk_test_*` (testing)
- **Generation**: Via Stripe Dashboard
- **Rotation Notes**:
  1. Generate new key in Stripe Dashboard (Rolling Keys)
  2. Update GCP Secret Manager
  3. Deploy to all services
  4. Delete old key after 24 hours

### 2.6 Communication & Notifications

| Secret Name | Environment Variable | Description | Rotation Period | Owner |
|-------------|---------------------|-------------|-----------------|-------|
| Resend API Key | `RESEND_API_KEY` | Transactional email | Annual | Backend Team |
| Nylas API Key | `NYLAS_API_KEY` | Email sync | Annual | Backend Team |
| Nylas Webhook Secret | `NYLAS_WEBHOOK_SECRET` | Webhook verification | On rotation | Backend Team |
| Firebase Private Key | `FIREBASE_PRIVATE_KEY` | Push notifications | On compromise | Mobile Team |
| OneSignal API Key | `ONESIGNAL_API_KEY` | Push notifications | Annual | Mobile Team |
| Matrix Admin Token | `MATRIX_ADMIN_TOKEN` | Federated messaging | 90 days | Backend Team |

### 2.7 AI & Analytics

| Secret Name | Environment Variable | Description | Rotation Period | Owner |
|-------------|---------------------|-------------|-----------------|-------|
| Anthropic API Key | `ANTHROPIC_API_KEY` | AI agents | Annual | AI Team |
| OpenAI API Key | `OPENAI_API_KEY` | Embeddings | Annual | AI Team |
| Pinecone API Key | `PINECONE_API_KEY` | Vector search | Annual | AI Team |
| Segment Write Key | `SEGMENT_WRITE_KEY` | Analytics | Annual | Data Team |
| ClickHouse Password | `CLICKHOUSE_PASSWORD` | Analytics DB | 90 days | Data Team |

### 2.8 Cloud Infrastructure

| Secret Name | Environment Variable | Description | Rotation Period | Owner |
|-------------|---------------------|-------------|-----------------|-------|
| Convex Deploy Key | `CONVEX_DEPLOY_KEY` | Database deployment | On compromise | Platform Team |
| Sentry DSN | `SENTRY_DSN` | Error tracking | On compromise | Platform Team |
| S3 Access Key | `S3_ACCESS_KEY_ID` | Object storage | 90 days | Platform Team |
| S3 Secret Key | `S3_SECRET_ACCESS_KEY` | Object storage | 90 days | Platform Team |
| GCP Service Account | Service Account JSON | GCP access | Annual | Platform Team |

---

## 3. Rotation Procedures

### 3.1 Standard Rotation Procedure

```mermaid
graph TD
    A[Generate New Secret] --> B[Store in Secret Manager]
    B --> C[Update Application Config]
    C --> D[Deploy to Staging]
    D --> E{Staging Tests Pass?}
    E -->|Yes| F[Deploy to Production]
    E -->|No| G[Rollback]
    F --> H[Verify Production]
    H --> I{Production OK?}
    I -->|Yes| J[Revoke Old Secret]
    I -->|No| K[Rollback to Old Secret]
    J --> L[Update Documentation]
```

### 3.2 JWT_SECRET Rotation

**Pre-rotation Checklist:**
- [ ] Schedule rotation during low-traffic window
- [ ] Notify on-call team
- [ ] Verify monitoring is active

**Procedure:**

```bash
# Step 1: Generate new JWT secret
NEW_JWT_SECRET=$(openssl rand -base64 32)

# Step 2: Update GCP Secret Manager (creates new version)
gcloud secrets versions add pull-production-jwt-secret \
  --data-file=<(echo -n "$NEW_JWT_SECRET") \
  --project=pull-production

# Step 3: Deploy API with new secret
# The ExternalSecret will sync automatically within 1 hour
# For immediate update:
kubectl rollout restart deployment/pull-api -n pull

# Step 4: Verify new tokens work
curl -X POST https://api.pull.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "test"}' \
  | jq '.data.token'

# Step 5: Wait for existing tokens to expire (15 minutes for access tokens)
# Monitor for 401 errors in logs

# Step 6: Disable old secret version
gcloud secrets versions disable PREVIOUS_VERSION \
  --secret=pull-production-jwt-secret \
  --project=pull-production
```

**Post-rotation Validation:**
- [ ] New logins work correctly
- [ ] Token refresh works correctly
- [ ] No elevated 401 error rates
- [ ] Update rotation log

### 3.3 Database Password Rotation

**Procedure:**

```bash
# Step 1: Create new database user
psql -h $DB_HOST -U admin -d pull << EOF
CREATE USER pull_new WITH PASSWORD 'NEW_SECURE_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE pull TO pull_new;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO pull_new;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO pull_new;
EOF

# Step 2: Update Secret Manager with new connection string
NEW_DB_URL="postgresql://pull_new:NEW_SECURE_PASSWORD@$DB_HOST:5432/pull?sslmode=require"
gcloud secrets versions add pull-production-database-url \
  --data-file=<(echo -n "$NEW_DB_URL") \
  --project=pull-production

# Step 3: Rolling restart of all pods
kubectl rollout restart deployment/pull-api -n pull
kubectl rollout restart deployment/pull-temporal-worker -n pull

# Step 4: Monitor for connection errors
kubectl logs -l app=pull-api -n pull --tail=100 | grep -i "database\|connection"

# Step 5: After verification (24 hours), remove old user
psql -h $DB_HOST -U admin -d pull << EOF
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM pull;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM pull;
DROP USER pull;
-- Rename new user to standard name
ALTER USER pull_new RENAME TO pull;
EOF
```

### 3.4 Third-Party API Key Rotation

**General Procedure for External APIs:**

1. **Generate New Key**
   - Log into provider dashboard
   - Generate new API key (if supported, keep old active)
   - Note the new key securely

2. **Update Secret Manager**
   ```bash
   gcloud secrets versions add pull-production-[PROVIDER]-api-key \
     --data-file=<(echo -n "$NEW_API_KEY") \
     --project=pull-production
   ```

3. **Deploy and Verify**
   ```bash
   kubectl rollout restart deployment/pull-api -n pull
   kubectl rollout restart deployment/pull-temporal-worker -n pull

   # Verify API calls work
   kubectl logs -l app=pull-api -n pull | grep "[PROVIDER]"
   ```

4. **Revoke Old Key**
   - Log into provider dashboard
   - Revoke/delete old API key
   - Verify no errors in logs

### 3.5 Webhook Secret Rotation

**Special Considerations:**
- Webhook secrets must be rotated in coordination with the provider
- Some providers support multiple active secrets for zero-downtime rotation

**Procedure for Stripe:**

```bash
# Step 1: Create new webhook endpoint in Stripe Dashboard
# (or use Stripe CLI for staging)
stripe webhook_endpoints create \
  --url "https://api.pull.app/webhooks/stripe" \
  --enabled-events "*"

# Step 2: Get new webhook secret
NEW_WEBHOOK_SECRET="whsec_..." # From Stripe Dashboard

# Step 3: Update Secret Manager
gcloud secrets versions add pull-production-stripe-webhook-secret \
  --data-file=<(echo -n "$NEW_WEBHOOK_SECRET") \
  --project=pull-production

# Step 4: Deploy
kubectl rollout restart deployment/pull-api -n pull

# Step 5: Verify webhooks are received
# Check logs for successful webhook processing

# Step 6: Delete old webhook endpoint in Stripe Dashboard
```

---

## 4. Automated Rotation

### 4.1 Terraform Rotation Configuration

```hcl
# From infrastructure/terraform/main.tf
resource "google_secret_manager_secret" "database_url" {
  secret_id = "${local.name_prefix}-database-url"

  rotation {
    rotation_period = "7776000s" # 90 days
    # Note: This is a reminder, actual rotation requires manual steps
  }
}

resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "${local.name_prefix}-jwt-secret"

  rotation {
    rotation_period = "15552000s" # 180 days
  }
}
```

### 4.2 Rotation Reminder Alerts

Set up Cloud Monitoring alerts for rotation reminders:

```yaml
# Alert policy for secret rotation reminders
displayName: "Secret Rotation Reminder"
conditions:
  - displayName: "JWT Secret Rotation Due"
    conditionThreshold:
      filter: |
        resource.type="secret_manager_secret"
        AND resource.labels.secret_id="pull-production-jwt-secret"
        AND metric.type="secretmanager.googleapis.com/secret/version_age"
      comparison: COMPARISON_GT
      thresholdValue: 15552000  # 180 days in seconds
      duration: 0s
notificationChannels:
  - security-team-pagerduty
  - security-team-slack
```

### 4.3 Rotation Schedule Calendar

| Secret | Last Rotation | Next Due | Owner |
|--------|---------------|----------|-------|
| JWT_SECRET | 2026-01-01 | 2026-07-01 | Security Team |
| ENCRYPTION_KEY | 2026-01-01 | 2026-04-01 | Security Team |
| DATABASE_URL | 2026-01-01 | 2026-04-01 | Platform Team |
| REDIS_PASSWORD | 2026-01-01 | 2026-04-01 | Platform Team |
| All Webhook Secrets | 2026-01-01 | 2026-04-01 | Backend Team |

---

## 5. Emergency Rotation

### 5.1 When to Perform Emergency Rotation

Immediately rotate secrets if:
- Secret exposed in logs or error messages
- Secret committed to source control
- Secret found in public location
- Employee with access leaves unexpectedly
- Third-party breach affecting shared credentials
- Suspicious activity detected using the credential

### 5.2 Emergency Rotation Procedure

**Priority 1: Stop the Bleeding**

```bash
# 1. Disable compromised secret version immediately
gcloud secrets versions disable VERSION_NUMBER \
  --secret=COMPROMISED_SECRET_ID \
  --project=pull-production

# 2. Generate and deploy new secret (use standard procedures above)

# 3. Force logout all users (if auth secret compromised)
# Clear Redis session store
redis-cli -h $REDIS_HOST -a $REDIS_PASSWORD FLUSHDB

# 4. Notify security team
# PagerDuty incident created automatically via monitoring
```

**Priority 2: Containment**

```bash
# Review audit logs for unauthorized access
gcloud logging read "protoPayload.serviceName=secretmanager.googleapis.com \
  AND protoPayload.resourceName:COMPROMISED_SECRET_ID" \
  --project=pull-production \
  --format=json \
  --freshness=7d

# Check for unauthorized API calls
gcloud logging read "resource.type=cloud_run_revision \
  AND httpRequest.status>=400" \
  --project=pull-production \
  --freshness=24h
```

**Priority 3: Documentation**

- Document timeline of events
- Record all actions taken
- Identify root cause
- Update procedures to prevent recurrence

### 5.3 Emergency Contacts

| Role | Name | Contact | Escalation Time |
|------|------|---------|-----------------|
| Security On-Call | [Rotation] | PagerDuty | Immediate |
| Security Lead | TBD | [phone] | 15 minutes |
| CTO | TBD | [phone] | 30 minutes |
| Legal (if data breach) | TBD | [phone] | 1 hour |

---

## 6. Audit and Compliance

### 6.1 Secret Access Logging

All secret access is logged in GCP Cloud Audit Logs:

```bash
# View secret access logs
gcloud logging read "protoPayload.serviceName=secretmanager.googleapis.com" \
  --project=pull-production \
  --format="table(timestamp,protoPayload.authenticationInfo.principalEmail,protoPayload.methodName,protoPayload.resourceName)"
```

### 6.2 Compliance Requirements

| Requirement | Standard | Implementation |
|-------------|----------|----------------|
| Secret encryption at rest | SOC2, PCI-DSS | GCP Secret Manager (AES-256) |
| Access logging | SOC2 | Cloud Audit Logs |
| Regular rotation | PCI-DSS | 90-day rotation schedule |
| Least privilege | SOC2 | Per-service service accounts |
| Separation of duties | SOC2 | Different teams own different secrets |

### 6.3 Quarterly Audit Checklist

- [ ] All secrets rotated within policy
- [ ] No secrets in source control (run `git-secrets`)
- [ ] Access logs reviewed for anomalies
- [ ] Service account permissions reviewed
- [ ] Documentation up to date
- [ ] Emergency procedures tested

### 6.4 Rotation Log Template

```markdown
## Rotation Record

**Secret:** [SECRET_NAME]
**Date:** [YYYY-MM-DD HH:MM UTC]
**Performed By:** [NAME]
**Reason:** [Scheduled/Emergency/Other]

### Pre-Rotation
- [ ] Backup of current configuration taken
- [ ] Monitoring verified active
- [ ] On-call notified

### Rotation Steps
1. [Step taken]
2. [Step taken]
3. [Step taken]

### Post-Rotation
- [ ] New secret verified working
- [ ] Old secret disabled/revoked
- [ ] No errors in monitoring
- [ ] Documentation updated

### Notes
[Any issues or observations]
```

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-25 | Security Team | Initial document |
