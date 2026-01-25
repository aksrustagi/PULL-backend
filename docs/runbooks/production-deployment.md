# PULL Backend - Production Deployment Runbook

This runbook provides step-by-step instructions for deploying the PULL Super App backend to production. It covers all services, infrastructure, databases, and third-party integrations.

**Last Updated:** 2025-01-25
**Version:** 2.0

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Secrets and Configuration](#secrets-and-configuration)
4. [Database Setup](#database-setup)
5. [Infrastructure Deployment (Terraform)](#infrastructure-deployment-terraform)
6. [Service Deployments](#service-deployments)
   - [API Service (Cloudflare Workers)](#api-service-cloudflare-workers)
   - [Web Application (Vercel)](#web-application-vercel)
   - [Temporal Workers (Google Cloud Run)](#temporal-workers-google-cloud-run)
   - [Kubernetes Deployment (Alternative)](#kubernetes-deployment-alternative)
7. [Post-Deployment Verification](#post-deployment-verification)
8. [Rollback Procedures](#rollback-procedures)
9. [Troubleshooting Guide](#troubleshooting-guide)
10. [Monitoring and Alerts](#monitoring-and-alerts)
11. [Emergency Contacts](#emergency-contacts)

---

## Architecture Overview

```
                              PULL Backend Architecture
+-----------------------------------------------------------------------------------+
|                                   CLIENTS                                          |
|   [Web App - Next.js]    [iOS - React Native]    [Android - React Native]         |
+-------------------------------------|---------------------------------------------+
                                      |
+-------------------------------------|---------------------------------------------+
|                         API GATEWAY (Hono + tRPC)                                  |
|   Deployed to: Cloudflare Workers                                                  |
|   URL: https://api.pull.com (prod) | https://api-staging.pull.com (staging)       |
|   [Auth] [Trading] [Predictions] [RWA] [Email] [Rewards] [Webhooks]               |
+-------------------------------------|---------------------------------------------+
                                      |
+-------------------------------------|---------------------------------------------+
|                       ORCHESTRATION LAYER                                          |
|   Deployed to: Google Cloud Run (us-central1)                                      |
|   +---------------------------------------------------------------------------+   |
|   |                      Temporal.io Workers                                   |   |
|   |  [KYC] [Trading] [Settlement] [Rewards] [Email] [Messaging] [Portfolio]   |   |
|   +---------------------------------------------------------------------------+   |
+-------------------------------------|---------------------------------------------+
                                      |
+-------------------------------------|---------------------------------------------+
|                           DATA LAYER                                               |
|   [Convex - Primary DB]  [Upstash Redis - Cache]  [ClickHouse - Analytics]        |
|   [Pinecone - Vectors]   [PostgreSQL - Auth]      [GCP Memorystore - Redis]       |
+-----------------------------------------------------------------------------------+
```

### Services Summary

| Service | Technology | Deployment Target | URL Pattern | Port |
|---------|------------|-------------------|-------------|------|
| API | Hono + Bun | Cloudflare Workers | `api.pull.com` | 3001 |
| Web | Next.js 14 | Vercel | `app.pull.com` | 3000 |
| Workers | Temporal.io | Google Cloud Run | Internal | 3002 |
| Metrics | Prometheus | Internal | - | 9090 |

### Deployment Order

**Critical:** Services must be deployed in this order to prevent dependency failures:

1. Infrastructure (Terraform) - if changes needed
2. Secrets and ConfigMaps (Kubernetes)
3. API Service
4. Web Application
5. Temporal Workers

---

## Pre-Deployment Checklist

### 1. Code Quality Gates

```bash
# Run all checks locally before deployment
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
```

**Automated CI checks (must all pass):**
- [ ] Lint check passing
- [ ] TypeScript typecheck passing
- [ ] Unit tests passing with coverage
- [ ] Build successful for all packages
- [ ] Convex typecheck passing (`pnpm --filter @pull/db typecheck`)
- [ ] No security vulnerabilities (`pnpm audit`)

### 2. Review CI Pipeline Status

```bash
# Check recent CI runs
gh run list --limit 5

# Check specific workflow status
gh run view <run-id>

# Watch current run
gh run watch
```

### 3. Environment Verification

- [ ] All production secrets configured in GCP Secret Manager
- [ ] External Secrets Operator syncing correctly
- [ ] API keys verified for production (not sandbox/test)
- [ ] Database connection strings point to production instances
- [ ] Secrets rotated if older than 90 days

### 4. Database Readiness

- [ ] Convex schema changes are backward compatible
- [ ] Database backups verified within last 24 hours
- [ ] PostgreSQL automated backups enabled (daily at 03:00 UTC)
- [ ] Redis persistence configured (RDB snapshots every 12 hours)
- [ ] Migration scripts tested in staging

### 5. Third-Party Service Status

Check all external service status pages:

| Service | Status Page | Critical For |
|---------|-------------|--------------|
| Convex | [status.convex.dev](https://status.convex.dev) | Primary database |
| Cloudflare | [cloudflarestatus.com](https://www.cloudflarestatus.com) | API hosting |
| Vercel | [vercel-status.com](https://www.vercel-status.com) | Web hosting |
| Google Cloud | [status.cloud.google.com](https://status.cloud.google.com) | Workers, infrastructure |
| Temporal | [status.temporal.io](https://status.temporal.io) | Workflow orchestration |
| Kalshi | N/A | Trading API |
| Plaid | [status.plaid.com](https://status.plaid.com) | Bank connections |

### 6. Communication

```bash
# Notify team before deployment
# Post to #deployments Slack channel
```

- [ ] Notify team in `#deployments` Slack channel
- [ ] Ensure on-call engineer is available
- [ ] Schedule deployment during low-traffic window (recommended: 2-4 AM UTC)
- [ ] Have rollback plan ready

---

## Secrets and Configuration

### GitHub Secrets Required

The following secrets must be configured in GitHub repository settings:

**Cloudflare (API Deployment):**
```
CLOUDFLARE_API_TOKEN    # Cloudflare API token with Workers access
CLOUDFLARE_ACCOUNT_ID   # Cloudflare account ID
```

**Vercel (Web Deployment):**
```
VERCEL_TOKEN            # Vercel API token
VERCEL_ORG_ID           # Vercel organization ID
VERCEL_PROJECT_ID       # Vercel project ID
```

**Google Cloud (Workers Deployment):**
```
GCP_PROJECT_ID          # GCP project ID
GCP_SA_KEY              # Service account key JSON (base64)
```

**Temporal:**
```
TEMPORAL_ADDRESS_STAGING     # Temporal Cloud address for staging
TEMPORAL_ADDRESS_PRODUCTION  # Temporal Cloud address for production
```

**Application Secrets (stored in GCP Secret Manager):**
```
CONVEX_URL_STAGING / CONVEX_URL_PRODUCTION
KALSHI_API_KEY_ID_STAGING / KALSHI_API_KEY_ID_PRODUCTION
KALSHI_PRIVATE_KEY_STAGING / KALSHI_PRIVATE_KEY_PRODUCTION
PLAID_CLIENT_ID_STAGING / PLAID_CLIENT_ID_PRODUCTION
PLAID_SECRET_STAGING / PLAID_SECRET_PRODUCTION
```

**Build and Caching:**
```
TURBO_TOKEN             # Turborepo remote cache token
TURBO_TEAM              # Turborepo team name
```

**Notifications:**
```
SLACK_WEBHOOK_URL       # Slack webhook for deployment notifications
```

### GCP Secret Manager Secrets

These secrets are synced to Kubernetes via External Secrets Operator:

```bash
# List all secrets in GCP Secret Manager
gcloud secrets list --project=$GCP_PROJECT_ID

# View secret value (careful!)
gcloud secrets versions access latest --secret="pull-production-convex-url"

# Create a new secret
gcloud secrets create pull-production-<secret-name> \
  --replication-policy="automatic" \
  --project=$GCP_PROJECT_ID

# Add a secret version
echo -n "secret-value" | gcloud secrets versions add pull-production-<secret-name> --data-file=-
```

### ConfigMap Values

Non-sensitive configuration in Kubernetes ConfigMaps:

| ConfigMap | Purpose | Key Variables |
|-----------|---------|---------------|
| `pull-shared-config` | Shared across services | `NODE_ENV`, `LOG_LEVEL`, `TEMPORAL_NAMESPACE` |
| `pull-api-config` | API-specific | `PORT=3001`, `CORS_ORIGINS`, `BODY_LIMIT` |
| `pull-worker-config` | Worker-specific | `PORT=3002`, `WORKER_CONCURRENCY`, `PLAID_ENV` |
| `pull-redis-config` | Redis connection pool | `REDIS_POOL_MIN`, `REDIS_POOL_MAX` |
| `pull-observability-config` | Monitoring | `OTEL_SERVICE_NAME`, `METRICS_PORT` |

---

## Database Setup

### 1. Convex (Primary Database)

#### Initial Deployment

```bash
# Install Convex CLI
npm install -g convex

# Login to Convex
npx convex login

# Create production deployment
npx convex deploy --prod

# Note: Save the deployment URL as CONVEX_URL
```

#### Schema Deployment

```bash
# Deploy schema changes to production
pnpm --filter @pull/db db:push

# Generate TypeScript types after deployment
pnpm --filter @pull/db codegen

# Verify deployment
npx convex dashboard
```

#### Monitoring Convex

1. Go to [dashboard.convex.dev](https://dashboard.convex.dev)
2. Select production deployment
3. Monitor:
   - Function call rates
   - Database size
   - Error rates
   - Slow queries

### 2. PostgreSQL (GCP Cloud SQL)

Managed via Terraform. Key configuration:

```hcl
# Production settings from infrastructure/terraform/main.tf
database_version = "POSTGRES_16"
availability_type = "REGIONAL"  # High availability
disk_type = "PD_SSD"
disk_autoresize = true

# Backups
backup_enabled = true
point_in_time_recovery = true
backup_start_time = "03:00"  # UTC
transaction_log_retention_days = 7
```

#### Manual Connection

```bash
# Connect via Cloud SQL Proxy
cloud_sql_proxy -instances=$PROJECT_ID:$REGION:pull-production-postgres=tcp:5432

# Then connect
psql "host=127.0.0.1 port=5432 dbname=pull user=pull sslmode=require"
```

### 3. Redis (GCP Memorystore)

```bash
# Check Redis instance status
gcloud redis instances describe pull-production-redis --region=$REGION

# Get connection info
gcloud redis instances describe pull-production-redis \
  --region=$REGION \
  --format="value(host,port,authString)"
```

### 4. ClickHouse (Analytics)

```bash
# Test connection
clickhouse-client \
  --host=$CLICKHOUSE_HOST \
  --port=8443 \
  --user=$CLICKHOUSE_USERNAME \
  --password=$CLICKHOUSE_PASSWORD \
  --database=pull_analytics \
  --secure
```

---

## Infrastructure Deployment (Terraform)

### Prerequisites

```bash
# Install Terraform
brew install terraform  # macOS
# or
sudo apt-get install terraform  # Ubuntu

# Authenticate to GCP
gcloud auth application-default login
```

### Terraform Commands

```bash
cd infrastructure/terraform

# Initialize Terraform
terraform init

# Review planned changes
terraform plan -var-file="environments/production.tfvars"

# Apply changes (with approval)
terraform apply -var-file="environments/production.tfvars"

# View current state
terraform show

# Destroy (DANGEROUS - requires confirmation)
terraform destroy -var-file="environments/production.tfvars"
```

### Key Infrastructure Resources

| Resource | Type | Purpose |
|----------|------|---------|
| `google_sql_database_instance.main` | Cloud SQL | PostgreSQL database |
| `google_redis_instance.main` | Memorystore | Redis cache |
| `google_cloud_run_v2_service.api` | Cloud Run | API service |
| `google_cloud_run_v2_service.worker` | Cloud Run | Temporal workers |
| `google_kms_key_ring.main` | KMS | Encryption keys |
| `google_storage_bucket.backups` | GCS | Backup storage |
| `google_vpc_access_connector.main` | VPC | Private networking |

### Using Makefile

```bash
# Initialize Terraform
make tf-init

# Plan changes
make tf-plan

# Apply changes
make tf-apply
```

---

## Service Deployments

### API Service (Cloudflare Workers)

#### Automated Deployment (Recommended)

Deployment triggers:
- Push to `main` with changes in `apps/api/**`, `packages/core/**`, or `packages/types/**`
- Manual workflow dispatch

```bash
# Trigger staging deployment
gh workflow run deploy-api.yml -f environment=staging

# Trigger production deployment (requires staging success)
gh workflow run deploy-api.yml -f environment=production
```

#### Manual Deployment

```bash
# Build the API
pnpm --filter @pull/api build

# Deploy to staging
cd apps/api
wrangler deploy --env staging

# Verify staging health
curl -s https://api-staging.pull.com/health | jq

# Deploy to production
wrangler deploy --env production

# Verify production health
curl -s https://api.pull.com/health | jq
```

#### Setting Secrets

```bash
# Set secrets for production
wrangler secret put JWT_SECRET --env production
wrangler secret put CONVEX_URL --env production
wrangler secret put CLERK_SECRET_KEY --env production
wrangler secret put UPSTASH_REDIS_REST_URL --env production
wrangler secret put UPSTASH_REDIS_REST_TOKEN --env production
```

#### Deployment Verification

```bash
# Health check
curl -w "\nResponse time: %{time_total}s\n" https://api.pull.com/health

# Ready check
curl https://api.pull.com/health/ready

# Detailed health (requires internal key)
curl -H "X-Internal-Key: $INTERNAL_API_KEY" https://api.pull.com/health/detailed
```

---

### Web Application (Vercel)

#### Automated Deployment (Recommended)

Deployment triggers:
- Push to `main` with changes in `apps/web/**`, `packages/ui/**`, or `packages/types/**`
- Pull requests get preview deployments
- Manual workflow dispatch

```bash
# Trigger production deployment
gh workflow run deploy-web.yml -f environment=production
```

#### Manual Deployment

```bash
# Install Vercel CLI
npm install -g vercel

# Pull production environment
vercel pull --yes --environment=production --token=$VERCEL_TOKEN

# Build for production
vercel build --prod --token=$VERCEL_TOKEN

# Deploy to production
vercel deploy --prebuilt --prod --token=$VERCEL_TOKEN
```

#### Environment Variables

```bash
# Add environment variable
vercel env add NEXT_PUBLIC_CONVEX_URL production
vercel env add NEXT_PUBLIC_API_URL production

# List environment variables
vercel env ls production
```

#### Deployment Verification

```bash
# Health check
curl -s -o /dev/null -w "%{http_code}" https://app.pull.com

# Check deployment status
vercel ls --token=$VERCEL_TOKEN
```

---

### Temporal Workers (Google Cloud Run)

#### Automated Deployment (Recommended)

Deployment triggers:
- Push to `main` with changes in `apps/workers/**`, `packages/core/**`, or `infrastructure/temporal/**`
- Manual workflow dispatch

```bash
# Trigger staging deployment
gh workflow run deploy-workers.yml -f environment=staging

# Trigger production deployment (requires staging success)
gh workflow run deploy-workers.yml -f environment=production
```

#### Manual Deployment

```bash
# Set variables
export PROJECT_ID="your-gcp-project"
export REGION="us-central1"
export IMAGE="gcr.io/$PROJECT_ID/pull-temporal-worker"
export VERSION=$(git rev-parse --short HEAD)

# Build and push Docker image
docker build -t $IMAGE:$VERSION -f infrastructure/temporal/Dockerfile .
docker push $IMAGE:$VERSION

# Deploy to staging
gcloud run deploy pull-temporal-worker-staging \
  --image $IMAGE:$VERSION \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated=false \
  --memory 2Gi \
  --cpu 2 \
  --min-instances 1 \
  --max-instances 10 \
  --timeout 3600 \
  --set-env-vars "NODE_ENV=staging,TEMPORAL_NAMESPACE=pull-staging" \
  --set-secrets "CONVEX_URL=CONVEX_URL_STAGING:latest,KALSHI_API_KEY_ID=KALSHI_API_KEY_ID_STAGING:latest"

# Deploy to production
gcloud run deploy pull-temporal-worker \
  --image $IMAGE:$VERSION \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated=false \
  --memory 4Gi \
  --cpu 4 \
  --min-instances 2 \
  --max-instances 50 \
  --timeout 3600 \
  --set-env-vars "NODE_ENV=production,TEMPORAL_NAMESPACE=pull-production" \
  --set-secrets "CONVEX_URL=CONVEX_URL_PRODUCTION:latest,KALSHI_API_KEY_ID=KALSHI_API_KEY_ID_PRODUCTION:latest,KALSHI_PRIVATE_KEY=KALSHI_PRIVATE_KEY_PRODUCTION:latest,PLAID_CLIENT_ID=PLAID_CLIENT_ID_PRODUCTION:latest,PLAID_SECRET=PLAID_SECRET_PRODUCTION:latest"
```

#### Deployment Verification

```bash
# Check service status
gcloud run services describe pull-temporal-worker --region $REGION

# Get service URL
gcloud run services describe pull-temporal-worker \
  --region $REGION \
  --format 'value(status.url)'

# View recent logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=pull-temporal-worker" \
  --limit 50 \
  --format "table(timestamp,severity,textPayload)"

# Check Temporal UI for worker registration
# https://cloud.temporal.io (or self-hosted UI at localhost:8080)
```

---

### Kubernetes Deployment (Alternative)

If using Kubernetes instead of managed services:

#### Prerequisites

```bash
# Configure kubectl
gcloud container clusters get-credentials pull-cluster --region $REGION

# Verify connection
kubectl cluster-info
```

#### Apply Configurations

```bash
# Apply all manifests
kubectl apply -f infrastructure/kubernetes/

# Or apply individually in order:
kubectl apply -f infrastructure/kubernetes/namespace.yaml
kubectl apply -f infrastructure/kubernetes/priority-classes.yaml
kubectl apply -f infrastructure/kubernetes/service-accounts.yaml
kubectl apply -f infrastructure/kubernetes/configmaps.yaml
kubectl apply -f infrastructure/kubernetes/external-secrets.yaml
kubectl apply -f infrastructure/kubernetes/network-policies.yaml
kubectl apply -f infrastructure/kubernetes/api-deployment.yaml
kubectl apply -f infrastructure/kubernetes/worker-deployment.yaml
kubectl apply -f infrastructure/kubernetes/ingress.yaml
```

#### Verify Deployment

```bash
# Check pods
kubectl get pods -n pull

# Check services
kubectl get svc -n pull

# Check deployments
kubectl get deployments -n pull

# Check HPA status
kubectl get hpa -n pull

# Describe specific deployment
kubectl describe deployment pull-api -n pull

# View pod logs
kubectl logs -f deployment/pull-api -n pull
```

#### Scaling

```bash
# Manual scale
kubectl scale deployment pull-api --replicas=5 -n pull

# Check HPA
kubectl describe hpa pull-api-hpa -n pull
```

---

## Post-Deployment Verification

### 1. Health Check Endpoints

```bash
# API Health Checks
echo "=== API Health ==="
curl -s https://api.pull.com/health | jq
echo "=== API Ready ==="
curl -s https://api.pull.com/health/ready | jq
echo "=== API Live ==="
curl -s https://api.pull.com/health/live | jq

# Web Health Check
echo "=== Web Status ==="
curl -s -o /dev/null -w "Status: %{http_code}\nTime: %{time_total}s\n" https://app.pull.com
```

### 2. Critical Endpoint Tests

```bash
# Test auth endpoint
curl -X POST https://api.pull.com/api/auth/check \
  -H "Content-Type: application/json" \
  -d '{}' | jq

# Test API docs
curl -s -o /dev/null -w "%{http_code}" https://api.pull.com/docs

# Test metrics endpoint (internal)
curl -s https://api.pull.com/metrics | head -20
```

### 3. Temporal Worker Verification

```bash
# Using Temporal CLI
tctl --namespace pull-production workflow list --limit 5

# Check worker task queue
tctl --namespace pull-production taskqueue describe --taskqueue pull-main-queue

# Verify workers are registered
tctl --namespace pull-production worker list
```

### 4. Automated Smoke Tests

```bash
# Run E2E smoke tests against production
E2E_BASE_URL=https://app.pull.com pnpm test:e2e -- --grep "smoke"

# Run API integration tests
API_BASE_URL=https://api.pull.com pnpm test:integration
```

### 5. Verification Checklist

- [ ] API `/health` returns 200 with `{"status":"healthy"}`
- [ ] API `/health/ready` returns 200
- [ ] API `/health/live` returns 200
- [ ] Web app loads at https://app.pull.com
- [ ] Login/signup flow working
- [ ] Convex queries returning data
- [ ] Temporal workers registered and processing
- [ ] Redis cache responding (check rate limiting)
- [ ] Sentry receiving events
- [ ] No errors in Cloud Run logs
- [ ] No errors in Cloudflare Workers logs
- [ ] Metrics being scraped by Prometheus

---

## Rollback Procedures

### Decision Matrix

| Severity | Symptoms | Action | Time Limit |
|----------|----------|--------|------------|
| **Critical** | API down, 5xx errors, data loss | Immediate rollback | 2 min |
| **High** | Auth broken, payments failing | Rollback within 5 min | 5 min |
| **Medium** | Feature broken, degraded perf | Evaluate, possible rollback | 15 min |
| **Low** | Minor UI issues, non-critical bugs | Fix forward | N/A |

### API Rollback (Cloudflare Workers)

```bash
# List recent deployments
wrangler deployments list --env production

# Automatic rollback to previous version
wrangler rollback --env production

# Or via Cloudflare Dashboard:
# 1. Go to Cloudflare Dashboard > Workers & Pages
# 2. Select pull-api
# 3. Deployments tab
# 4. Click "Rollback" on previous working version
```

### Web Rollback (Vercel)

```bash
# Via CLI - rollback to previous production deployment
vercel rollback --token=$VERCEL_TOKEN

# List deployments to find specific version
vercel ls --token=$VERCEL_TOKEN

# Promote specific deployment
vercel promote <deployment-url> --token=$VERCEL_TOKEN
```

Via Dashboard:
1. Go to Vercel Dashboard > Deployments
2. Find last working deployment
3. Click "..." menu > "Promote to Production"

### Workers Rollback (Cloud Run)

```bash
# List all revisions
gcloud run revisions list \
  --service pull-temporal-worker \
  --region us-central1

# Get current revision
CURRENT=$(gcloud run services describe pull-temporal-worker \
  --region us-central1 \
  --format 'value(status.latestReadyRevisionName)')
echo "Current: $CURRENT"

# Route 100% traffic to previous revision
gcloud run services update-traffic pull-temporal-worker \
  --region us-central1 \
  --to-revisions <PREVIOUS_REVISION>=100

# Or route traffic gradually (canary rollback)
gcloud run services update-traffic pull-temporal-worker \
  --region us-central1 \
  --to-revisions <PREVIOUS_REVISION>=90,<CURRENT_REVISION>=10
```

### Kubernetes Rollback

```bash
# View rollout history
kubectl rollout history deployment/pull-api -n pull

# Rollback to previous revision
kubectl rollout undo deployment/pull-api -n pull

# Rollback to specific revision
kubectl rollout undo deployment/pull-api -n pull --to-revision=2

# Check rollback status
kubectl rollout status deployment/pull-api -n pull
```

### Convex Rollback

**Warning:** Convex doesn't have built-in rollback. Plan carefully.

```bash
# Option 1: Redeploy previous code
git checkout <previous-commit>
pnpm --filter @pull/db db:push

# Option 2: For data issues, contact Convex support
# They can restore from point-in-time backups
```

### Database Rollback (PostgreSQL)

```bash
# Point-in-time recovery (requires GCP Console or API)
# Creates a new instance from backup

# Via gcloud (creates new instance)
gcloud sql instances clone pull-production-postgres \
  pull-production-postgres-recovery \
  --point-in-time '2025-01-25T10:00:00.000Z'
```

---

## Troubleshooting Guide

### API Issues

#### "Missing required environment variables" at startup

```
Error: FATAL: Missing required environment variables: JWT_SECRET, CONVEX_URL
```

**Solution:**
```bash
# Verify secrets are set
wrangler secret list --env production

# Add missing secrets
wrangler secret put JWT_SECRET --env production
wrangler secret put CONVEX_URL --env production

# Redeploy
wrangler deploy --env production
```

#### Rate limiting not working

**Symptoms:** All requests allowed, no rate limit headers

**Diagnostic:**
```bash
# Test Upstash connection
curl -X GET "https://<your-url>.upstash.io/ping" \
  -H "Authorization: Bearer <your-token>"
```

**Solution:**
1. Verify `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set
2. Check Upstash dashboard for connection issues
3. Verify rate limit middleware is enabled

#### CORS errors

**Symptoms:** Browser console shows CORS errors

**Solution:**
```bash
# Check current CORS config
kubectl get configmap pull-api-config -n pull -o yaml | grep CORS

# Update CORS origins
kubectl edit configmap pull-api-config -n pull
# Add your domain to CORS_ORIGINS

# Restart API pods
kubectl rollout restart deployment/pull-api -n pull
```

#### High latency / timeouts

**Diagnostic:**
```bash
# Check Cloudflare analytics
# Dashboard > Workers > Analytics

# Check response times
for i in {1..10}; do
  curl -s -o /dev/null -w "%{time_total}\n" https://api.pull.com/health
done

# Check database connection pool
# Convex Dashboard > Logs > Look for connection errors
```

---

### Temporal Worker Issues

#### Workers not processing tasks

**Symptoms:** Workflows stuck in "Running" state

**Diagnostic:**
```bash
# Check worker logs
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=pull-temporal-worker" \
  --limit 100 \
  --format="table(timestamp,severity,textPayload)"

# Check Temporal UI for worker status
# Look for "No workers" warning on task queue

# Verify Temporal connection
tctl --namespace pull-production taskqueue describe --taskqueue pull-main-queue
```

**Solutions:**
1. Verify `TEMPORAL_ADDRESS` is correct
2. Check TLS certificates if using Temporal Cloud
3. Verify namespace exists: `tctl namespace describe pull-production`
4. Scale up workers if overloaded

#### Worker OOM (Out of Memory)

**Symptoms:** Workers restarting, exit code 137

```bash
# Check for OOM events
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=pull-temporal-worker AND textPayload:OOM" \
  --limit 20

# Increase memory
gcloud run services update pull-temporal-worker \
  --memory 8Gi \
  --region us-central1
```

#### Activity timeouts

**Symptoms:** Activities failing with timeout errors

**Solution:**
```bash
# Update activity timeout configuration
# In ConfigMap pull-worker-config:
TEMPORAL_ACTIVITY_START_TO_CLOSE_TIMEOUT: "600000"  # 10 minutes
TEMPORAL_ACTIVITY_HEARTBEAT_TIMEOUT: "60000"  # 1 minute
```

---

### Convex Issues

#### Schema push fails

```
Error: Schema migration would delete data
```

**Solution:**
1. Make schema changes backward compatible
2. Use optional fields for new columns
3. For deletions, migrate data first, then remove schema

#### Slow queries

**Diagnostic:**
```bash
# Check Convex Dashboard > Logs
# Filter by: level:WARN OR level:ERROR
# Look for "slow query" warnings
```

**Solutions:**
1. Add indexes in `schema.ts`:
```typescript
.index("by_user", ["userId"])
.index("by_status", ["status"])
```
2. Paginate large result sets
3. Use `.filter()` in Convex instead of JavaScript filtering

---

### Kubernetes Issues

#### Pods stuck in CrashLoopBackOff

```bash
# Check pod status
kubectl describe pod <pod-name> -n pull

# Check logs
kubectl logs <pod-name> -n pull --previous

# Common causes:
# - Missing secrets/configmaps
# - Failed health checks
# - OOM killed
```

#### External Secrets not syncing

```bash
# Check ExternalSecret status
kubectl describe externalsecret pull-secrets -n pull

# Check SecretStore connection
kubectl describe secretstore pull-gcp-secret-store -n pull

# Verify GCP Workload Identity
kubectl get serviceaccount pull-secrets-sa -n pull -o yaml
```

---

### Log Locations

| Service | Log Location | Command |
|---------|--------------|---------|
| API (Cloudflare) | Cloudflare Dashboard | Workers > Logs |
| API (K8s) | Cloud Logging | `kubectl logs deployment/pull-api -n pull` |
| Web (Vercel) | Vercel Dashboard | Project > Logs |
| Workers | Cloud Logging | `gcloud logging read "resource.labels.service_name=pull-temporal-worker"` |
| Temporal | Temporal UI | Workflow execution details |
| PostgreSQL | Cloud Logging | `gcloud logging read "resource.type=cloudsql_database"` |

---

## Monitoring and Alerts

### Metrics Endpoints

| Service | Metrics URL | Port |
|---------|-------------|------|
| API | `/metrics` | 9090 |
| Workers | `/metrics` | 9090 |

### Key Dashboards

1. **Datadog Dashboards** (`infra/monitoring/datadog/dashboards/`)
   - `api-performance.json` - API latency, error rates, throughput
   - `database-metrics.json` - Database connections, query performance
   - `worker-queue-metrics.json` - Temporal queue depth, worker utilization

2. **Grafana Dashboards** (`infra/monitoring/grafana/`)
   - API Overview
   - Worker Health
   - Database Performance

3. **Platform-Specific Dashboards**
   - Cloudflare Analytics - API traffic
   - Temporal Cloud - Workflow metrics
   - Convex Dashboard - Database metrics
   - GCP Cloud Monitoring - Infrastructure

### Alert Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| API error rate | > 1% | > 5% | Page on-call |
| API p99 latency | > 2s | > 5s | Investigate |
| Worker queue depth | > 1000 | > 5000 | Scale workers |
| Worker failures | > 10/min | > 100/min | Page on-call |
| Database connections | > 80% | > 95% | Scale DB |
| Memory usage | > 80% | > 95% | Scale instance |
| Convex function errors | > 10/min | > 100/min | Investigate |

### Alert Channels

- **Slack:** `#production-alerts` - All alerts
- **PagerDuty:** Critical issues - Pages on-call engineer
- **Email:** Daily summary reports

### Prometheus Metrics

Key metrics to monitor:

```promql
# API Error Rate
sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))

# API Latency P99
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))

# Worker Queue Depth
temporal_workflow_task_queue_backlog{task_queue="pull-main-queue"}

# Database Connection Pool
db_connection_pool_active / db_connection_pool_max
```

---

## Emergency Contacts

| Role | Contact | Responsibility | Escalation |
|------|---------|----------------|------------|
| On-call Engineer | PagerDuty rotation | First responder | 15 min |
| Platform Lead | @platform-lead | Infrastructure | 30 min |
| Backend Lead | @backend-lead | API/Workers | 30 min |
| Security Team | @security-team | Security incidents | Immediate |
| Convex Support | support@convex.dev | Database emergencies | 1 hour |
| Temporal Support | support@temporal.io | Workflow emergencies | 1 hour |

### Incident Response Process

1. **Detect** - Alert fires or user reports issue
2. **Assess** - Determine severity using decision matrix
3. **Communicate** - Post in `#incidents` channel
4. **Mitigate** - Rollback or apply immediate fix
5. **Resolve** - Verify fix and close incident
6. **Review** - Post-mortem within 48 hours

---

## Appendix

### Quick Reference Commands

```bash
# === Build & Test ===
pnpm install                    # Install dependencies
pnpm build                      # Build all packages
pnpm test                       # Run tests
pnpm lint                       # Run linter
pnpm typecheck                  # TypeScript check

# === Local Development ===
pnpm dev                        # Start all services
pnpm dev:api                    # Start API only
pnpm dev:web                    # Start web only
pnpm dev:workers                # Start workers only

# === Deployment (via GitHub Actions) ===
gh workflow run deploy-api.yml -f environment=production
gh workflow run deploy-web.yml -f environment=production
gh workflow run deploy-workers.yml -f environment=production

# === Manual Deployment ===
wrangler deploy --env production              # API
vercel deploy --prebuilt --prod               # Web
gcloud run deploy pull-temporal-worker ...    # Workers

# === Rollback ===
wrangler rollback --env production            # API
vercel rollback                               # Web
gcloud run services update-traffic ...        # Workers
kubectl rollout undo deployment/pull-api -n pull  # Kubernetes

# === Monitoring ===
kubectl logs -f deployment/pull-api -n pull   # K8s logs
gcloud logging read "..."                     # GCP logs
tctl workflow list                            # Temporal workflows

# === Database ===
pnpm --filter @pull/db db:push               # Deploy Convex schema
pnpm --filter @pull/db codegen               # Generate types

# === Infrastructure ===
make tf-plan                                  # Plan Terraform changes
make tf-apply                                 # Apply Terraform changes
make k8s-apply                               # Apply Kubernetes manifests
```

### Related Documentation

- [API Documentation](/docs/api/)
- [Security Runbook](/docs/runbooks/security-incident.md)
- [Database Schema](/packages/db/convex/schema.ts)
- [Architecture Decision Records](/docs/adr/)
- [Environment Variables Reference](/.env.example)

---

**Document Maintainer:** Platform Team
**Review Schedule:** Monthly or after major changes
