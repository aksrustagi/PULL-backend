# PULL Backend Security Checklist

**Version:** 1.0
**Last Updated:** 2026-01-25
**Classification:** Internal Use Only

This checklist must be completed and signed off before any production deployment.

---

## Table of Contents

1. [Authentication & Authorization](#1-authentication--authorization)
2. [Input Validation](#2-input-validation)
3. [Rate Limiting](#3-rate-limiting)
4. [CORS & CSRF Protection](#4-cors--csrf-protection)
5. [Secret Management](#5-secret-management)
6. [Dependency Vulnerabilities](#6-dependency-vulnerabilities)
7. [Infrastructure Security](#7-infrastructure-security)
8. [Data Protection](#8-data-protection)
9. [Logging & Monitoring](#9-logging--monitoring)
10. [Compliance](#10-compliance)

---

## 1. Authentication & Authorization

### JWT Configuration

- [ ] **JWT_SECRET environment variable is set**
  - Minimum 32 characters
  - Generated with cryptographically secure randomness: `openssl rand -base64 32`
  - Never committed to source control
  - Location: `apps/api/src/middleware/auth.ts`

- [ ] **Token expiration is configured appropriately**
  - Access tokens: 15 minutes (current implementation)
  - Refresh tokens: 7 days (current implementation)
  - Verify in `apps/api/src/middleware/auth.ts:100-101,117`

- [ ] **Token contains required claims**
  - `sub` (subject/userId): Required
  - `iss` (issuer): `pull-api`
  - `aud` (audience): `pull-app`
  - `iat` (issued at): Auto-generated
  - `exp` (expiration): Set based on token type

- [ ] **JWT algorithm is secure**
  - Using HS256 with HMAC-SHA256
  - Algorithm specified in verification: `algorithms: ["HS256"]`

### Authorization Checks

- [ ] **All protected routes use `authMiddleware`**
  ```typescript
  // Correct pattern in apps/api/src/index.ts
  app.use("/api/v1/*", authMiddleware);
  app.use("/api/v1/*", rateLimitMiddleware);
  ```

- [ ] **Database functions validate user ownership (IDOR prevention)**
  - Orders: Verify `order.userId === requestingUserId`
  - Positions: Verify `position.userId === requestingUserId`
  - Balances: Verify authorized access
  - Review all routes in `apps/api/src/routes/`

- [ ] **Admin routes have role-based access control**
  - Admin middleware applied to `/admin/*` routes
  - Role verification implemented (TODO in current codebase)

- [ ] **Webhook routes use signature verification**
  - All webhook handlers in `apps/api/src/routes/webhooks.ts`
  - Persona, Checkr, Nylas, Massive, Stripe, Polygon webhooks verified

### Password Security

- [ ] **Password requirements enforced**
  - Minimum 8 characters
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number
  - Schema: `apps/api/src/routes/auth.ts:10-17`

- [ ] **Passwords are hashed with secure algorithm**
  - Use bcrypt with cost factor >= 12, or Argon2id
  - Never store plaintext passwords

- [ ] **Password reset uses secure tokens**
  - Cryptographically random tokens
  - Short expiration (15-30 minutes)
  - Single-use tokens
  - Rate limited endpoint

---

## 2. Input Validation

### API Input Validation

- [ ] **All endpoints use Zod validation**
  - `@hono/zod-validator` middleware applied
  - Schemas defined with strict types and constraints
  - Example: `apps/api/src/routes/auth.ts:8-25`

- [ ] **Validation schemas include constraints**
  ```typescript
  // Required patterns
  z.string().email().max(254)           // Emails
  z.string().max(128)                   // Passwords
  z.number().positive().int().max(1000) // Quantities
  z.number().min(1).max(99)             // Prediction prices (cents)
  ```

- [ ] **Pagination parameters are bounded**
  - `page`: Positive integer
  - `pageSize`: Minimum 1, maximum 100
  - Schema: `packages/core/src/utils/validation.ts:91-94`

- [ ] **Special characters are sanitized**
  - XSS prevention via HTML entity encoding
  - Function: `packages/core/src/utils/validation.ts:112-121`
  - Characters: `& < > " ' \``

### Database Input Validation

- [ ] **Convex schema uses typed fields (no `v.any()`)**
  - Review `packages/db/convex/schema.ts`
  - All fields should have explicit types
  - Complex objects should use `v.object()` with defined structure

- [ ] **UUID validation for IDs**
  ```typescript
  // Use isValidUUID from packages/core/src/utils/validation.ts
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  ```

### File Upload Validation

- [ ] **File type whitelist enforced**
- [ ] **File size limits enforced**
  - Current body size limit: 1MB (`apps/api/src/index.ts:95-109`)
- [ ] **File content validation (magic bytes)**

---

## 3. Rate Limiting

### Rate Limiter Configuration

- [ ] **Upstash Redis is configured for production**
  ```
  UPSTASH_REDIS_REST_URL=<your-url>
  UPSTASH_REDIS_REST_TOKEN=<your-token>
  ```

- [ ] **Rate limiting is enabled in production**
  - Development mode skips rate limiting
  - Production mode requires Redis configuration
  - Fail-closed for sensitive endpoints

### Rate Limit Tiers

| Tier | Limit | Window | Use Case |
|------|-------|--------|----------|
| Anonymous | 30 req | 1 min | Unauthenticated users |
| Authenticated | 100 req | 1 min | Logged-in users |
| Premium | 300 req | 1 min | Premium tier users |
| Betting | 30 req | 1 min | Trading operations |
| Draft | 60 req | 1 min | Draft actions |
| Trade | 10 req | 1 hour | Trade proposals |
| Payment | 5 req | 10 min | Payment operations |
| WebSocket | 5 req | 1 min | WS connections |
| Auth | 10 req | 15 min | Login attempts |

- [ ] **All tiers are configured in `apps/api/src/middleware/rate-limit.ts`**

### Rate Limit Headers

- [ ] **Rate limit headers are returned**
  - `X-RateLimit-Limit`: Maximum requests allowed
  - `X-RateLimit-Remaining`: Requests remaining
  - `X-RateLimit-Reset`: Unix timestamp when limit resets
  - `Retry-After`: Seconds until retry allowed (on 429)

### Sensitive Endpoint Protection

- [ ] **Fail-closed behavior for sensitive endpoints**
  ```typescript
  // From apps/api/src/middleware/rate-limit.ts:211-213
  const isSensitive = path.includes("/auth") ||
                      path.includes("/trading") ||
                      path.includes("/orders");
  ```

---

## 4. CORS & CSRF Protection

### CORS Configuration

- [ ] **Allowed origins are explicitly defined**
  ```typescript
  // apps/api/src/index.ts:68-77
  const allowed = [
    "http://localhost:3000",
    "https://pull.app",
  ];
  // Subdomain pattern: /^https:\/\/[\w-]+\.pull\.app$/
  ```

- [ ] **CORS settings are restrictive**
  - `credentials: true` (for cookies)
  - Explicit allowed methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
  - Explicit allowed headers: Content-Type, Authorization, X-Request-ID
  - Max age: 86400 seconds (24 hours)

### CSRF Protection

- [ ] **CSRF protection middleware is enabled**
  - Location: `apps/api/src/middleware/security.ts:47-110`
  - Safe methods (GET, HEAD, OPTIONS) are skipped
  - Webhook routes are skipped (use signature verification)

- [ ] **Origin/Referer validation**
  - Request origin must match allowed origins list
  - Production requires valid API key if no origin header

- [ ] **API Key validation uses timing-safe comparison**
  ```typescript
  // apps/api/src/middleware/security.ts:8-15
  function timingSafeCompare(a: string, b: string): boolean
  ```

### Security Headers

- [ ] **All security headers are set**
  ```
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  X-XSS-Protection: 1; mode=block
  Referrer-Policy: strict-origin-when-cross-origin
  Content-Security-Policy: default-src 'self'; ...
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  ```
  - Location: `apps/api/src/middleware/security.ts:19-45`

---

## 5. Secret Management

### Required Environment Variables

- [ ] **All required secrets are configured**

| Secret | Description | Rotation Frequency |
|--------|-------------|-------------------|
| `JWT_SECRET` | JWT signing key | 90 days |
| `ENCRYPTION_KEY` | Data encryption | 90 days |
| `DATABASE_URL` | PostgreSQL connection | On compromise |
| `REDIS_PASSWORD` | Redis authentication | 90 days |
| `CONVEX_DEPLOY_KEY` | Convex deployment | On compromise |
| `STRIPE_SECRET_KEY` | Stripe payments | On compromise |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhooks | On key rotation |
| `KALSHI_API_SECRET` | Trading API | 90 days |
| `PLAID_SECRET` | Banking integration | 90 days |
| `PERSONA_WEBHOOK_SECRET` | KYC webhooks | On key rotation |
| `CHECKR_WEBHOOK_SECRET` | Background checks | On key rotation |
| `NYLAS_WEBHOOK_SECRET` | Email webhooks | On key rotation |

### Secret Storage

- [ ] **Secrets are stored in GCP Secret Manager**
  - Terraform configuration: `infrastructure/terraform/main.tf:486-555`
  - Secrets referenced via `value_source.secret_key_ref`

- [ ] **No secrets in source control**
  - `.env` files in `.gitignore`
  - No hardcoded secrets in code
  - `.env.example` contains only placeholder values

- [ ] **Secrets are not logged**
  - Error messages sanitized
  - Request/response logging excludes sensitive fields

### Access Control

- [ ] **Service accounts have minimal permissions**
  - `roles/secretmanager.secretAccessor` for secret access
  - `roles/cloudsql.client` for database access
  - No admin permissions in production

---

## 6. Dependency Vulnerabilities

### Automated Scanning

- [ ] **Dependabot is configured**
  - File: `.github/dependabot.yml`
  - Weekly updates for npm packages
  - Grouped PRs for production and development dependencies

- [ ] **Pre-deployment vulnerability scan**
  ```bash
  # Run before deployment
  pnpm audit --audit-level=high
  ```

- [ ] **CI/CD includes security scanning**
  - Add to `.github/workflows/ci.yml`:
  ```yaml
  - name: Security audit
    run: pnpm audit --audit-level=high
  ```

### Manual Review

- [ ] **Review high-severity vulnerabilities**
  - No critical vulnerabilities allowed
  - High vulnerabilities require documented risk acceptance
  - Medium vulnerabilities tracked for remediation

- [ ] **Lock file is committed**
  - `pnpm-lock.yaml` exists and is up to date
  - `--frozen-lockfile` used in CI

### Third-Party Risk

- [ ] **Third-party actions are pinned to SHA**
  ```yaml
  # Good
  uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11
  # Bad
  uses: actions/checkout@v4
  ```

---

## 7. Infrastructure Security

### Kubernetes Security

- [ ] **Network policies are in place**
  - API ingress restricted to nginx ingress namespace
  - Egress limited to Temporal, Redis, and HTTPS
  - Location: `infrastructure/kubernetes/ingress.yaml:38-113`

- [ ] **TLS is enforced**
  - SSL redirect enabled
  - cert-manager with Let's Encrypt
  - HSTS headers enabled

- [ ] **Security headers in ingress**
  ```yaml
  nginx.ingress.kubernetes.io/configuration-snippet: |
    more_set_headers "X-Content-Type-Options: nosniff";
    more_set_headers "X-Frame-Options: DENY";
    more_set_headers "X-XSS-Protection: 1; mode=block";
  ```

### Cloud Infrastructure

- [ ] **VPC network is private**
  - `private_ip_google_access = true`
  - No public IPs on databases

- [ ] **Cloud SQL is secured**
  - Private network only
  - Point-in-time recovery enabled (production)
  - Backup retention: 30 days (production)
  - Query insights enabled

- [ ] **Redis is secured**
  - Authorized network only
  - No public access
  - Memory policy: allkeys-lru

### Docker Security

- [ ] **Containers run as non-root**
  - `USER` directive in Dockerfiles
  - Security context in Kubernetes manifests

- [ ] **Base images are pinned**
  - Use specific version tags, not `latest`
  - Scan base images for vulnerabilities

- [ ] **Services bind to localhost in development**
  - `127.0.0.1:5432:5432` for PostgreSQL
  - `127.0.0.1:6379:6379` for Redis

---

## 8. Data Protection

### Encryption

- [ ] **Data at rest is encrypted**
  - Cloud SQL: Encrypted by default
  - Redis: Encrypted by default
  - S3/R2: Server-side encryption enabled

- [ ] **Data in transit is encrypted**
  - TLS 1.2+ for all connections
  - HTTPS enforced on all endpoints
  - Database connections use SSL

### PII Protection

- [ ] **PII is identified and protected**
  - SSN: Never stored in plaintext
  - Email: Encrypted if needed
  - Phone: Encrypted if needed
  - Bank account: Via Plaid tokens, never stored

- [ ] **Data anonymization for analytics**
  - Location: `packages/core/src/services/dataFlywheel/anonymization.ts`
  - User IDs hashed before export
  - Trading patterns aggregated

### Data Retention

- [ ] **Retention policies are implemented**
  - Audit logs: 7 years (compliance)
  - Transaction logs: Per regulatory requirements
  - Session data: 30 days
  - Temporary data: 24 hours

---

## 9. Logging & Monitoring

### Security Logging

- [ ] **Authentication events are logged**
  - Successful logins
  - Failed login attempts
  - Token refresh events
  - Logout events

- [ ] **Authorization failures are logged**
  - 401 Unauthorized responses
  - 403 Forbidden responses
  - IDOR attempt detection

- [ ] **Rate limit violations are logged**
  - IP address (hashed if needed)
  - User ID (if authenticated)
  - Endpoint attempted

### Error Handling

- [ ] **Errors don't leak internal details**
  ```typescript
  // apps/api/src/index.ts:178-202
  // Production: Generic error message
  // Never expose stack traces
  ```

- [ ] **Request IDs are generated server-side**
  - Never trust client-provided IDs
  - Used for tracing and debugging

### Monitoring

- [ ] **Sentry is configured**
  - `SENTRY_DSN` environment variable set
  - Error capturing enabled
  - Location: `apps/api/src/lib/sentry.ts`

- [ ] **Fraud detection is enabled**
  - Location: `packages/core/src/services/fraud/client.ts`
  - Velocity checks
  - Volume anomaly detection
  - Self-trading detection

---

## 10. Compliance

### Financial Regulations

- [ ] **KYC verification is enforced**
  - Persona integration: `packages/core/src/services/persona/`
  - KYC tiers implemented
  - Trading limits based on verification level

- [ ] **AML/Sanctions screening**
  - Sanctions.io integration: `packages/core/src/services/sanctions/`
  - PEP screening enabled
  - Watchlist monitoring

- [ ] **Background checks for trading**
  - Checkr integration: `packages/core/src/services/checkr/`

### Audit Trail

- [ ] **Audit logging is comprehensive**
  - All financial transactions logged
  - User actions tracked
  - Admin actions tracked
  - Location: `packages/db/convex/audit.ts`

- [ ] **Audit logs are immutable**
  - Append-only design
  - No deletion capability
  - Integrity verification

### Data Privacy

- [ ] **Privacy policy is implemented**
- [ ] **Data export is available**
- [ ] **Data deletion is available**
- [ ] **Consent management is in place**

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Security Lead | | | |
| Engineering Lead | | | |
| DevOps Lead | | | |
| Compliance Officer | | | |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-25 | Security Team | Initial checklist |
