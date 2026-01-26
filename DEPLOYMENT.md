# PULL Backend - Deployment Guide

## Quick Start (5 Minutes to Deploy)

### 1. Set Environment Variables

```bash
# Copy example and fill in your values
cp .env.example .env

# Required for deployment:
# - CONVEX_DEPLOY_KEY (from dashboard.convex.dev)
# - STRIPE_SECRET_KEY (from dashboard.stripe.com)
# - STRIPE_WEBHOOK_SECRET
# - JWT_SECRET (generate with: openssl rand -hex 32)
# - RESEND_API_KEY (from resend.com)
```

### 2. Run Pre-Launch Check

```bash
./scripts/pre-launch-check.sh
```

This validates:
- Environment variables
- TypeScript compilation
- Build success
- Security checks
- Database schema
- API routes

### 3. Deploy

```bash
# Deploy to staging first
./scripts/deploy.sh staging

# After testing, deploy to production
./scripts/deploy.sh production
```

---

## Platform-Specific Deployment

### Option A: Railway (Recommended - Fastest)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and initialize
railway login
railway init

# Deploy
railway up
```

**Railway Dashboard Setup:**
1. Create project at railway.app
2. Add environment variables from `.env`
3. Set start command: `pnpm start`
4. Enable auto-deploy from GitHub

### Option B: Fly.io

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Initialize (creates fly.toml)
cd apps/api && fly launch

# Deploy
fly deploy
```

### Option C: Vercel (Web App Only)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy web app
cd apps/web && vercel --prod
```

### Option D: Docker

```bash
# Build and run locally
docker compose up -d

# Or build for production
docker build -t pull-api -f apps/api/Dockerfile .
docker run -p 3000:3000 --env-file .env pull-api
```

---

## Post-Deployment Checklist

### Configure Webhooks

| Service | Webhook URL | Dashboard |
|---------|-------------|-----------|
| Stripe | `https://api.yourapp.com/webhooks/stripe` | dashboard.stripe.com/webhooks |
| Persona | `https://api.yourapp.com/webhooks/persona` | dashboard.withpersona.com |
| Plaid | `https://api.yourapp.com/webhooks/plaid` | dashboard.plaid.com |

### Verify Health

```bash
# Check API health
curl https://api.yourapp.com/health

# Check metrics endpoint
curl https://api.yourapp.com/metrics
```

### Test Critical Flows

1. **User Registration**
   - Sign up with email
   - Verify email arrives

2. **Deposit Flow**
   - Add payment method
   - Make test deposit ($1)
   - Verify balance updates

3. **Trading**
   - Place a prediction
   - Verify order executes

4. **Withdrawal**
   - Request withdrawal
   - Verify payout initiated

---

## Monitoring

### Error Tracking (Sentry)

```env
SENTRY_DSN=https://xxx@sentry.io/xxx
```

Sentry dashboard: sentry.io

### Metrics (Prometheus)

Metrics available at `/metrics`:
- `http_requests_total`
- `http_request_duration_seconds`
- `active_connections`

### Logs

```bash
# Railway
railway logs

# Fly.io
fly logs

# Docker
docker logs pull-api -f
```

---

## Scaling

### Horizontal Scaling

```bash
# Railway - automatic based on traffic

# Fly.io
fly scale count 3  # Run 3 instances

# Docker Swarm
docker service scale pull-api=3
```

### Database Scaling

Convex handles scaling automatically. For high traffic:
1. Enable Convex Pro plan
2. Add read replicas if needed

### Redis Scaling

For Upstash:
1. Upgrade plan at console.upstash.com
2. Enable clustering for >100k requests/day

---

## Rollback

### Quick Rollback

```bash
# Via GitHub Actions
# Go to Actions → Deploy → Run workflow
# Enter commit SHA in "rollback_to" field

# Via Railway
railway rollback

# Via Fly.io
fly releases list
fly releases rollback <version>
```

### Database Rollback

Convex maintains automatic backups. Contact support for point-in-time recovery.

---

## Troubleshooting

### Build Fails

```bash
# Clear caches
pnpm store prune
rm -rf node_modules
pnpm install
```

### Convex Deployment Fails

```bash
# Check schema for errors
cd packages/db && npx convex dev

# Reset if needed (WARNING: deletes data)
npx convex dev --reset
```

### Stripe Webhooks Not Working

1. Verify webhook secret matches
2. Check webhook URL is accessible
3. Test with Stripe CLI:
   ```bash
   stripe listen --forward-to localhost:3000/webhooks/stripe
   ```

### Health Check Fails

```bash
# Check if port is exposed
curl -v http://localhost:3000/health

# Check environment variables loaded
railway variables
```

---

## Security Checklist

- [ ] All secrets in environment variables (not in code)
- [ ] HTTPS enabled on all endpoints
- [ ] Rate limiting configured
- [ ] CORS configured for your domains only
- [ ] JWT secret is 32+ characters
- [ ] Stripe webhook signatures verified
- [ ] KYC enforced for withdrawals
- [ ] Fraud detection enabled

---

## Support

- GitHub Issues: github.com/your-org/pull-backend/issues
- Discord: discord.gg/pull
- Email: support@pull.app
