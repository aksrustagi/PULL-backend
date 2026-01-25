# PULL Backend - Production Deployment Runbook

This runbook provides step-by-step instructions for deploying the PULL Super App backend to production. It covers all services, databases, and third-party integrations.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Environment Variables Reference](#environment-variables-reference)
4. [Database Setup](#database-setup)
5. [Service Deployments](#service-deployments)
   - [API Service (Cloudflare Workers)](#api-service-cloudflare-workers)
   - [Web Application (Vercel)](#web-application-vercel)
   - [Temporal Workers (Google Cloud Run)](#temporal-workers-google-cloud-run)
   - [Smart Contracts (Polygon)](#smart-contracts-polygon)
6. [Post-Deployment Verification](#post-deployment-verification)
7. [Rollback Procedures](#rollback-procedures)
8. [Common Issues and Troubleshooting](#common-issues-and-troubleshooting)
9. [Monitoring and Alerts](#monitoring-and-alerts)

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
|   [Auth] [Trading] [Predictions] [RWA] [Email] [Rewards] [Webhooks]               |
+-------------------------------------|---------------------------------------------+
                                      |
+-------------------------------------|---------------------------------------------+
|                       ORCHESTRATION LAYER                                          |
|   Deployed to: Google Cloud Run                                                    |
|   +---------------------------------------------------------------------------+   |
|   |                      Temporal.io Workers                                   |   |
|   |  [KYC] [Trading] [Settlement] [Rewards] [Email] [Messaging] [Portfolio]   |   |
|   +---------------------------------------------------------------------------+   |
+-------------------------------------|---------------------------------------------+
                                      |
+-------------------------------------|---------------------------------------------+
|                           DATA LAYER                                               |
|   [Convex - Primary DB]  [Upstash Redis - Cache]  [ClickHouse - Analytics]        |
|   [Pinecone - Vectors]   [PostgreSQL - Auth]                                       |
+-----------------------------------------------------------------------------------+
```

### Services Summary

| Service | Technology | Deployment Target | URL Pattern |
|---------|------------|-------------------|-------------|
| API | Hono + Bun | Cloudflare Workers | `api.pull.com` |
| Web | Next.js 14 | Vercel | `app.pull.com` |
| Workers | Temporal.io | Google Cloud Run | Internal |
| Contracts | Solidity | Polygon Mainnet | On-chain |

---

## Pre-Deployment Checklist

### 1. Code Quality Gates

```bash
# Run all checks locally before deployment
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

- [ ] All CI checks passing (lint, typecheck, build, test)
- [ ] Convex typecheck passing (`pnpm --filter @pull/db typecheck`)
- [ ] E2E tests passing in staging environment
- [ ] No security vulnerabilities (`pnpm audit`)
- [ ] Code reviewed and approved by at least 2 engineers

### 2. Environment Verification

- [ ] All production environment variables are set and valid
- [ ] Secrets are rotated if older than 90 days
- [ ] API keys for all third-party services are production keys (not test/sandbox)
- [ ] Database connection strings point to production instances

### 3. Database Readiness

- [ ] Convex schema changes are backward compatible
- [ ] Database backups verified within last 24 hours
- [ ] Migration scripts tested in staging

### 4. Third-Party Service Status

Check status pages before deployment:

- [ ] [Convex Status](https://status.convex.dev)
- [ ] [Cloudflare Status](https://www.cloudflarestatus.com)
- [ ] [Vercel Status](https://www.vercel-status.com)
- [ ] [Google Cloud Status](https://status.cloud.google.com)
- [ ] [Temporal Cloud Status](https://status.temporal.io)
- [ ] [Polygon Status](https://polygon.io/system-status)

### 5. Communication

- [ ] Notify team in `#deployments` Slack channel
- [ ] Ensure on-call engineer is available
- [ ] Schedule deployment during low-traffic window (if possible)

---

## Environment Variables Reference

### Critical (Required for Startup)

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Runtime environment | `production` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | `your-secure-jwt-secret-here-min-32` |
| `CONVEX_URL` | Convex deployment URL | `https://your-project.convex.cloud` |
| `CONVEX_DEPLOY_KEY` | Convex deployment key | `convex_deploy_xxx` |

### Database Connections

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL | `https://xxx.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token | `AxxxxxxxxxxxYyyy` |
| `CLICKHOUSE_HOST` | ClickHouse hostname | `xxx.clickhouse.cloud` |
| `CLICKHOUSE_PASSWORD` | ClickHouse password | `secure-password` |

### Temporal.io (Workflow Orchestration)

| Variable | Description | Example |
|----------|-------------|---------|
| `TEMPORAL_ADDRESS` | Temporal server address | `namespace.xxx.tmprl.cloud:7233` |
| `TEMPORAL_NAMESPACE` | Temporal namespace | `pull-production` |
| `TEMPORAL_TLS` | Enable TLS | `true` |
| `TEMPORAL_TLS_CERT` | TLS cert (base64) | `base64-encoded-cert` |
| `TEMPORAL_TLS_KEY` | TLS key (base64) | `base64-encoded-key` |

### Trading APIs

| Variable | Description | Example |
|----------|-------------|---------|
| `KALSHI_API_KEY` | Kalshi API key | `kalshi_xxx` |
| `KALSHI_API_SECRET` | Kalshi API secret | `kalshi_secret_xxx` |
| `MASSIVE_API_KEY` | Massive API key | `massive_xxx` |
| `MASSIVE_API_SECRET` | Massive API secret | `massive_secret_xxx` |
| `POLYGON_API_KEY` | Polygon.io API key | `xxx` |

### Identity & Compliance

| Variable | Description | Example |
|----------|-------------|---------|
| `PERSONA_API_KEY` | Persona API key | `persona_xxx` |
| `PERSONA_TEMPLATE_ID` | Persona template ID | `tmpl_xxx` |
| `CHECKR_API_KEY` | Checkr API key | `checkr_xxx` |
| `PLAID_CLIENT_ID` | Plaid client ID | `xxx` |
| `PLAID_SECRET` | Plaid secret | `xxx` |
| `PLAID_ENV` | Plaid environment | `production` |
| `CHAINALYSIS_API_KEY` | Chainalysis API key | `xxx` |

### AI Services

| Variable | Description | Example |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Claude API key | `sk-ant-xxx` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-xxx` |

### Communication

| Variable | Description | Example |
|----------|-------------|---------|
| `RESEND_API_KEY` | Resend email API key | `re_xxx` |
| `RESEND_FROM_EMAIL` | Sender email | `noreply@pull.app` |
| `NYLAS_API_KEY` | Nylas API key | `xxx` |
| `MATRIX_HOMESERVER_URL` | Matrix server URL | `https://matrix.pull.app` |

### Payments

| Variable | Description | Example |
|----------|-------------|---------|
| `STRIPE_SECRET_KEY` | Stripe secret key | `sk_live_xxx` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret | `whsec_xxx` |

### Push Notifications

| Variable | Description | Example |
|----------|-------------|---------|
| `FIREBASE_PROJECT_ID` | Firebase project ID | `pull-production` |
| `FIREBASE_PRIVATE_KEY` | Firebase private key | `-----BEGIN PRIVATE KEY-----...` |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account | `xxx@xxx.iam.gserviceaccount.com` |

### Monitoring

| Variable | Description | Example |
|----------|-------------|---------|
| `SENTRY_DSN` | Sentry DSN | `https://xxx@sentry.io/xxx` |

### Storage

| Variable | Description | Example |
|----------|-------------|---------|
| `S3_BUCKET` | S3/R2 bucket name | `pull-assets` |
| `S3_ENDPOINT` | S3/R2 endpoint | `https://xxx.r2.cloudflarestorage.com` |
| `S3_ACCESS_KEY_ID` | S3/R2 access key | `xxx` |
| `S3_SECRET_ACCESS_KEY` | S3/R2 secret key | `xxx` |

### Web Frontend (Public)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_CONVEX_URL` | Convex URL for frontend | `https://xxx.convex.cloud` |
| `NEXT_PUBLIC_API_URL` | API URL for frontend | `https://api.pull.com` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect project ID | `xxx` |

---

## Database Setup

### 1. Convex (Primary Database)

Convex is the primary real-time database with 26+ tables.

#### Initial Deployment

```bash
# Install Convex CLI
npm install -g convex

# Login to Convex
npx convex login

# Create production deployment
npx convex deploy --prod

# Note the deployment URL (save as CONVEX_URL)
```

#### Schema Deployment

```bash
# Deploy schema changes
pnpm --filter @pull/db db:push

# Generate types after deployment
pnpm --filter @pull/db codegen
```

#### Convex Dashboard

1. Go to [dashboard.convex.dev](https://dashboard.convex.dev)
2. Select your production deployment
3. Monitor function calls, database size, and errors

### 2. Upstash Redis (Rate Limiting & Caching)

#### Setup

1. Create account at [upstash.com](https://upstash.com)
2. Create a new Redis database in `us-east-1` region
3. Copy REST URL and token to environment variables

```bash
# Test connection
curl -X GET "https://<your-url>.upstash.io/get/test" \
  -H "Authorization: Bearer <your-token>"
```

### 3. ClickHouse (Analytics)

#### Setup via ClickHouse Cloud

1. Create account at [clickhouse.cloud](https://clickhouse.cloud)
2. Create a new service
3. Configure environment variables:
   - `CLICKHOUSE_HOST`
   - `CLICKHOUSE_PORT=8443`
   - `CLICKHOUSE_DATABASE=pull_analytics`
   - `CLICKHOUSE_USERNAME`
   - `CLICKHOUSE_PASSWORD`
   - `CLICKHOUSE_PROTOCOL=https`

### 4. Pinecone (Vector Search)

#### Setup

1. Create account at [pinecone.io](https://www.pinecone.io)
2. Create index named `pull-embeddings`
3. Configure:
   - Dimensions: 1536 (for OpenAI embeddings)
   - Metric: cosine
   - Pod type: p1.x1

---

## Service Deployments

### API Service (Cloudflare Workers)

The API is built with Hono framework and deployed to Cloudflare Workers.

#### Prerequisites

- Cloudflare account with Workers enabled
- Wrangler CLI installed (`pnpm add -g wrangler`)
- `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` set

#### Manual Deployment

```bash
# Build the API
pnpm --filter @pull/api build

# Deploy to staging
cd apps/api
wrangler deploy --env staging

# Verify staging
curl https://api-staging.pull.com/health

# Deploy to production
wrangler deploy --env production

# Verify production
curl https://api.pull.com/health
```

#### Automated Deployment (GitHub Actions)

Deployment is triggered automatically when:
- Changes are pushed to `main` in `apps/api/**`, `packages/core/**`, or `packages/types/**`
- Workflow is manually triggered

```bash
# Manual trigger via GitHub CLI
gh workflow run deploy-api.yml -f environment=production
```

#### Configuration (wrangler.toml)

Ensure the following are configured in your `wrangler.toml`:

```toml
[env.production]
name = "pull-api"
route = "api.pull.com/*"

[env.production.vars]
NODE_ENV = "production"

# Secrets are set via:
# wrangler secret put JWT_SECRET --env production
# wrangler secret put CONVEX_URL --env production
# ... etc
```

#### Rollback

```bash
# List recent deployments
wrangler deployments list --env production

# Rollback to previous version
wrangler rollback --env production
```

---

### Web Application (Vercel)

The web application is a Next.js 14 app deployed to Vercel.

#### Prerequisites

- Vercel account with project configured
- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` set
- Vercel CLI installed (`pnpm add -g vercel`)

#### Manual Deployment

```bash
# Pull environment from Vercel
vercel pull --yes --environment=production --token=$VERCEL_TOKEN

# Build
vercel build --prod --token=$VERCEL_TOKEN

# Deploy
vercel deploy --prebuilt --prod --token=$VERCEL_TOKEN
```

#### Automated Deployment (GitHub Actions)

- PRs get preview deployments automatically
- Merges to `main` trigger production deployment

```bash
# Manual trigger
gh workflow run deploy-web.yml -f environment=production
```

#### Environment Variables in Vercel

Set via Vercel dashboard or CLI:

```bash
vercel env add NEXT_PUBLIC_CONVEX_URL production
vercel env add NEXT_PUBLIC_API_URL production
```

#### Rollback

```bash
# Via Vercel CLI
vercel rollback

# Or via dashboard: Deployments > Select previous > Promote to Production
```

---

### Temporal Workers (Google Cloud Run)

Temporal workers handle all background workflow execution.

#### Prerequisites

- Google Cloud project with Cloud Run enabled
- Service account with Cloud Run Admin role
- `GCP_SA_KEY` secret set in GitHub

#### Docker Build

```bash
# Build worker image
docker build -t gcr.io/$PROJECT_ID/pull-temporal-worker:latest \
  -f infrastructure/temporal/Dockerfile .

# Push to GCR
docker push gcr.io/$PROJECT_ID/pull-temporal-worker:latest
```

#### Manual Deployment

```bash
# Deploy to staging
gcloud run deploy pull-temporal-worker-staging \
  --image gcr.io/$PROJECT_ID/pull-temporal-worker:latest \
  --region us-central1 \
  --platform managed \
  --memory 2Gi \
  --cpu 2 \
  --min-instances 1 \
  --max-instances 10 \
  --timeout 3600 \
  --set-env-vars "NODE_ENV=staging,TEMPORAL_NAMESPACE=pull-staging" \
  --set-secrets "CONVEX_URL=CONVEX_URL_STAGING:latest"

# Deploy to production
gcloud run deploy pull-temporal-worker \
  --image gcr.io/$PROJECT_ID/pull-temporal-worker:latest \
  --region us-central1 \
  --platform managed \
  --memory 4Gi \
  --cpu 4 \
  --min-instances 2 \
  --max-instances 50 \
  --timeout 3600 \
  --set-env-vars "NODE_ENV=production,TEMPORAL_NAMESPACE=pull-production" \
  --set-secrets "CONVEX_URL=CONVEX_URL_PRODUCTION:latest"
```

#### Automated Deployment (GitHub Actions)

```bash
gh workflow run deploy-workers.yml -f environment=production
```

#### Worker Types

Workers can be run for specific queues via the `WORKER_TYPE` env var:

| Worker Type | Task Queue | Description |
|-------------|------------|-------------|
| `all` | All queues | All workers (default) |
| `main` | `pull-main` | General workflows |
| `kyc` | `pull-kyc` | KYC verification |
| `trading` | `pull-trading` | Order execution |
| `rwa` | `pull-rwa` | Real-world assets |
| `rewards` | `pull-rewards` | Rewards processing |
| `gamification` | `pull-gamification` | Gamification |
| `email` | `pull-email` | Email workflows |
| `messaging` | `pull-messaging` | Matrix messaging |
| `signals` | `pull-signals` | Trading signals |
| `portfolio` | `pull-portfolio` | Portfolio management |

#### Rollback

```bash
# Get current revision
CURRENT=$(gcloud run services describe pull-temporal-worker \
  --region us-central1 --format 'value(status.latestReadyRevisionName)')

# After failed deployment, rollback
gcloud run services update-traffic pull-temporal-worker \
  --region us-central1 \
  --to-revisions $PREVIOUS_REVISION=100
```

---

### Smart Contracts (Polygon)

#### Prerequisites

- Deployer wallet with MATIC for gas
- `DEPLOYER_PRIVATE_KEY_MAINNET` secret set
- `POLYGONSCAN_API_KEY` for verification

#### Testnet Deployment (Polygon Amoy)

```bash
cd packages/contracts

# Compile contracts
pnpm compile

# Run tests
pnpm test

# Deploy to Amoy testnet
pnpm deploy:amoy

# Verify on Polygonscan
npx hardhat verify --network polygonAmoy <CONTRACT_ADDRESS>
```

#### Mainnet Deployment

**IMPORTANT: This deploys real contracts with real value. Double-check everything.**

```bash
# Estimate gas costs first
npx hardhat run scripts/estimate-gas.ts --network polygon

# Deploy to mainnet
pnpm deploy:polygon

# Wait for confirmations (20+ blocks)
sleep 60

# Verify on Polygonscan
npx hardhat verify --network polygon <CONTRACT_ADDRESS>
```

#### Automated Deployment (GitHub Actions)

```bash
# Testnet
gh workflow run deploy-contracts.yml \
  -f network=polygon-amoy \
  -f contract=all \
  -f verify=true

# Mainnet (requires approval in GitHub environment)
gh workflow run deploy-contracts.yml \
  -f network=polygon-mainnet \
  -f contract=PullToken \
  -f verify=true
```

#### Contract Addresses

After deployment, update contract addresses in:
- `packages/core/src/config/contracts.json`
- Convex environment variables
- Frontend environment variables

---

## Post-Deployment Verification

### 1. Health Checks

```bash
# API Health Check
curl https://api.pull.com/health
# Expected: {"status":"healthy","timestamp":"..."}

# API Readiness (Kubernetes)
curl https://api.pull.com/health/ready
# Expected: {"ready":true,"timestamp":"..."}

# API Detailed Health (internal only)
curl -H "X-Internal-Key: $INTERNAL_API_KEY" \
  https://api.pull.com/health/detailed
```

### 2. Critical Endpoints

```bash
# Auth endpoints
curl -X POST https://api.pull.com/api/auth/check

# API docs
curl https://api.pull.com/docs
```

### 3. Temporal Worker Verification

```bash
# Check worker status in Temporal UI
open https://cloud.temporal.io

# Or via tctl
tctl --namespace pull-production workflow list
```

### 4. Smoke Tests

Run automated smoke tests:

```bash
# Run E2E smoke tests against production
E2E_BASE_URL=https://app.pull.com pnpm test:e2e -- --grep "smoke"
```

### 5. Verification Checklist

- [ ] Health endpoints returning 200
- [ ] Login/signup flow working
- [ ] Convex queries returning data
- [ ] Temporal workflows executing
- [ ] Redis cache working (check rate limiting)
- [ ] Sentry receiving events
- [ ] No errors in logs

---

## Rollback Procedures

### Immediate Rollback Decision Matrix

| Severity | Symptoms | Action |
|----------|----------|--------|
| Critical | API down, 5xx errors | Immediate rollback |
| High | Auth broken, data loss | Rollback within 5 min |
| Medium | Feature broken, degraded perf | Evaluate, possible rollback |
| Low | Minor UI issues | Fix forward |

### API Rollback (Cloudflare Workers)

```bash
# Automatic rollback (built into deployment workflow)
wrangler rollback --env production

# Or manually via dashboard:
# 1. Go to Cloudflare Dashboard > Workers
# 2. Select pull-api
# 3. Deployments tab
# 4. Click "Rollback" on previous version
```

### Web Rollback (Vercel)

```bash
# Via CLI
vercel rollback

# Via Dashboard:
# 1. Go to Vercel Dashboard > Deployments
# 2. Find last working deployment
# 3. Click "..." > "Promote to Production"
```

### Workers Rollback (Cloud Run)

```bash
# List revisions
gcloud run revisions list --service pull-temporal-worker --region us-central1

# Route traffic to previous revision
gcloud run services update-traffic pull-temporal-worker \
  --region us-central1 \
  --to-revisions <PREVIOUS_REVISION>=100
```

### Convex Rollback

**Note: Convex doesn't have built-in rollback. Plan carefully.**

1. If schema change broke things: Deploy previous schema version
2. If data was corrupted: Restore from backup (contact Convex support)
3. If functions broke: Redeploy previous function code

```bash
# Checkout previous commit
git checkout <previous-commit>

# Redeploy Convex
pnpm --filter @pull/db db:push
```

### Contract Rollback

**Smart contracts cannot be rolled back once deployed.**

Options:
1. Deploy new version with fix
2. Pause contract (if pausable)
3. Migrate to new contract via upgrade proxy

---

## Common Issues and Troubleshooting

### API Issues

#### "Missing required environment variables" at startup

```
Error: FATAL: Missing required environment variables: JWT_SECRET, CONVEX_URL
```

**Solution:**
1. Verify secrets are set in Cloudflare Workers
2. Check secret names match exactly
3. Redeploy after adding secrets

```bash
wrangler secret put JWT_SECRET --env production
wrangler secret put CONVEX_URL --env production
wrangler deploy --env production
```

#### Rate limiting not working

**Symptoms:** All requests allowed, no rate limit headers

**Solution:**
1. Check Upstash Redis credentials
2. Verify `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set
3. Test Redis connection:

```bash
curl -X GET "https://<url>.upstash.io/ping" \
  -H "Authorization: Bearer <token>"
```

#### CORS errors from frontend

**Symptoms:** Browser console shows CORS errors

**Solution:**
1. Check allowed origins in `apps/api/src/index.ts`
2. Add frontend domain to CORS config
3. Verify `Access-Control-Allow-Origin` header in response

### Temporal Worker Issues

#### Workers not processing tasks

**Symptoms:** Workflows stuck in "Running" state

**Diagnostic steps:**
```bash
# Check worker logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=pull-temporal-worker" --limit 50

# Check Temporal UI for worker status
# Look for "No workers" warning on task queue
```

**Solutions:**
1. Verify `TEMPORAL_ADDRESS` is correct
2. Check TLS certificates if using Temporal Cloud
3. Verify namespace exists: `tctl namespace describe pull-production`
4. Scale up workers if overloaded

#### Worker OOM (Out of Memory)

**Symptoms:** Workers restarting, exit code 137

**Solution:**
```bash
# Increase memory allocation
gcloud run services update pull-temporal-worker \
  --memory 8Gi \
  --region us-central1
```

### Convex Issues

#### Schema push fails

```
Error: Schema migration would delete data
```

**Solution:**
1. Make schema changes backward compatible
2. If deletion intended, use migration script
3. Check Convex dashboard for schema diff

#### Slow queries

**Diagnostic:**
```bash
# Check Convex dashboard > Logs
# Look for slow query warnings
```

**Solutions:**
1. Add missing indexes in `schema.ts`
2. Paginate large result sets
3. Use `.filter()` instead of JavaScript filtering

### Vercel Issues

#### Build failures

**Common causes:**
1. Environment variables not set
2. TypeScript errors
3. Missing dependencies

```bash
# Check build logs
vercel logs <deployment-url> --output json

# Rebuild with verbose output
vercel build --debug
```

#### Edge function timeout

**Symptoms:** 504 Gateway Timeout on API routes

**Solution:**
1. Move heavy computation to API/workers
2. Increase timeout in `vercel.json`
3. Use streaming responses for large payloads

### Contract Issues

#### Deployment fails - insufficient gas

**Solution:**
```bash
# Estimate gas first
npx hardhat run scripts/estimate-gas.ts --network polygon

# Ensure deployer wallet has enough MATIC
# Add buffer for price fluctuations
```

#### Verification fails on Polygonscan

**Common causes:**
1. Wrong compiler version
2. Mismatched constructor arguments
3. Rate limiting

```bash
# Retry with explicit arguments
npx hardhat verify --network polygon <ADDRESS> "arg1" "arg2"

# Check constructor args match deployment
```

---

## Monitoring and Alerts

### Sentry (Error Tracking)

- Dashboard: [sentry.io](https://sentry.io)
- Alerts configured for:
  - Error rate > 1% of requests
  - New error types
  - Performance degradation

### Uptime Monitoring

Configure uptime checks for:

| Endpoint | Check Interval | Alert Threshold |
|----------|----------------|-----------------|
| `https://api.pull.com/health` | 1 min | 2 failures |
| `https://app.pull.com` | 1 min | 2 failures |

### Metrics Dashboards

1. **Cloudflare Analytics**
   - Request volume
   - Error rates
   - Response times
   - Geographic distribution

2. **Temporal Cloud**
   - Workflow execution rates
   - Activity latencies
   - Worker utilization
   - Failed workflow count

3. **Convex Dashboard**
   - Function call rates
   - Database size
   - Bandwidth usage
   - Error rates

4. **Google Cloud Monitoring**
   - Worker CPU/memory usage
   - Request latency
   - Error rates

### Alert Channels

Configure alerts to:
- `#production-alerts` Slack channel
- PagerDuty for critical issues
- Email for daily summaries

### Key Metrics to Watch

| Metric | Warning | Critical |
|--------|---------|----------|
| API error rate | > 1% | > 5% |
| API p99 latency | > 2s | > 5s |
| Worker queue depth | > 1000 | > 5000 |
| Convex function errors | > 10/min | > 100/min |

---

## Appendix

### Useful Commands Quick Reference

```bash
# Monorepo
pnpm install                  # Install all dependencies
pnpm build                    # Build all packages
pnpm test                     # Run all tests
pnpm lint                     # Run linter
pnpm typecheck                # TypeScript check

# API
pnpm dev:api                  # Start API locally
wrangler deploy --env prod    # Deploy to production

# Web
pnpm dev:web                  # Start web locally
vercel deploy --prod          # Deploy to production

# Workers
pnpm dev:workers              # Start workers locally
gcloud run deploy ...         # Deploy to Cloud Run

# Database
pnpm --filter @pull/db db:push    # Deploy Convex schema
pnpm --filter @pull/db codegen    # Generate types

# Contracts
pnpm --filter @pull/contracts compile   # Compile contracts
pnpm --filter @pull/contracts test      # Run contract tests
pnpm --filter @pull/contracts deploy:polygon  # Deploy to mainnet
```

### Emergency Contacts

| Role | Contact | Responsibility |
|------|---------|----------------|
| On-call Engineer | PagerDuty | First responder |
| Platform Lead | @platform-lead | Escalation |
| Infra Lead | @infra-lead | Infrastructure issues |
| Security | @security-team | Security incidents |

### Related Documentation

- [API Documentation](/docs/api/)
- [Security Runbook](/docs/runbooks/security-incident.md)
- [Database Schema](/packages/db/convex/schema.ts)
- [Architecture Decision Records](/docs/adr/)
