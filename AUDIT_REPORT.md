# PULL Super App - Code Audit Report

**Date:** 2026-01-24
**Scope:** Full codebase audit including PR #1 (claude/design-pull-super-app-DVwu5)
**Commits Reviewed:** 104b9f7 through 335db9a (6 commits)

---

## Executive Summary

The PULL monorepo is a comprehensive fintech super-app covering prediction markets, crypto trading, RWA (real-world assets), messaging, and email intelligence. The architecture is well-structured (Turborepo + pnpm workspaces) with clear separation of concerns. However, the audit identified **35 issues** across security, correctness, and code quality:

| Severity | Count |
|----------|-------|
| Critical | 10 |
| High | 6 |
| Medium | 9 |
| Low / Code Quality | 10 |

---

## Critical Issues

### 1. Hardcoded JWT Secret Fallback

**File:** `apps/api/src/middleware/auth.ts:5-7`
**Severity:** CRITICAL
**Category:** Authentication Bypass

```typescript
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "your-secret-key-min-32-chars-long"
);
```

**Problem:** If `JWT_SECRET` environment variable is not set, the server uses a well-known default value. Any attacker who discovers this (it's in the source code) can forge valid JWT tokens and impersonate any user.

**Fix:** Remove the fallback. Fail fast at startup if `JWT_SECRET` is not provided:
```typescript
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error("JWT_SECRET environment variable is required");
const JWT_SECRET = new TextEncoder().encode(secret);
```

---

### 2. Authentication Routes Accept Any Credentials

**File:** `apps/api/src/routes/auth.ts:23-73`
**Severity:** CRITICAL
**Category:** Broken Authentication

**Problems:**
- **Register** (line 29): Generates a random UUID as userId without creating a database record, checking if the email exists, or hashing the password.
- **Login** (line 59): Generates a random UUID instead of looking up the user. Any email/password combination returns a valid token.
- **Refresh** (line 93): Returns a hardcoded string `"new-access-token"` instead of validating the existing token.
- **Logout** (line 105-113): Does nothing - tokens are not invalidated.

**Impact:** Complete authentication bypass. Anyone can obtain valid tokens for arbitrary users without credentials.

**Fix:** Implement actual user lookup, password hashing (bcrypt/argon2), and session management via Convex.

---

### 3. Webhook Signature Verification Not Implemented

**File:** `apps/api/src/routes/webhooks.ts:8-84`
**Severity:** CRITICAL
**Category:** Input Validation / Forgery

**Problem:** All 6 webhook handlers (Persona, Checkr, Nylas, Massive, Stripe, Polygon) read the signature header but never verify it. They accept any payload unconditionally.

```typescript
app.post("/persona", async (c) => {
  const signature = c.req.header("Persona-Signature");
  const body = await c.req.json();
  // TODO: Verify signature and process webhook  <-- NEVER DONE
  console.log("Persona webhook:", body.data?.type);
  return c.json({ received: true });
});
```

**Impact:** Attackers can forge webhook payloads to:
- Approve KYC for any user (Persona)
- Trigger fake order fills (Massive)
- Process fake payments (Stripe)
- Inject fake blockchain events (Polygon)

**Fix:** Implement signature verification for each webhook provider using their respective libraries.

---

### 4. Massive Client - Broken HMAC Signature

**File:** `packages/core/src/services/massive.ts:50-59`
**Severity:** CRITICAL
**Category:** Broken Cryptography

```typescript
private generateSignature(timestamp, method, path, body = ""): string {
  const message = `${timestamp}${method}${path}${body}`;
  // In production, use crypto.createHmac
  return Buffer.from(message).toString("base64");
}
```

**Problem:** The signature is just base64-encoding the message without any HMAC. This provides zero authentication to the Massive API. The comment says "In production, use crypto.createHmac" but it's not implemented.

**Fix:**
```typescript
private generateSignature(timestamp, method, path, body = ""): string {
  const message = `${timestamp}${method}${path}${body}`;
  return crypto.createHmac("sha256", this.apiSecret)
    .update(message).digest("base64");
}
```

---

### 5. Rate Limiting Bypassed for Authenticated Users

**File:** `apps/api/src/index.ts:60,68`
**Severity:** CRITICAL
**Category:** Rate Limiting Bypass

```typescript
// Rate limiting for non-webhook routes
app.use("/api/*", rateLimitMiddleware);       // Line 60 - rate limit applied here
// ...
app.use("/api/v1/*", authMiddleware);          // Line 68 - auth applied AFTER
```

**Problem:** Rate limiting middleware runs BEFORE the auth middleware. At the time rate limiting executes, `userId` is never set (it's set by `authMiddleware`). This means the rate limiter in `rate-limit.ts:47` always sees `userId` as undefined, falling back to the anonymous tier (30 req/min) for ALL users, or worse, the IP-based limit can be bypassed via `X-Forwarded-For` header spoofing.

**Additional Issue (line 48-50):** The IP extraction trusts `CF-Connecting-IP` and `X-Forwarded-For` headers which can be spoofed if not behind Cloudflare.

**Fix:** Move rate limiting after auth, or restructure to check auth state within the rate limiter.

---

### 6. Temporal Workflow Non-Determinism

**Files:**
- `packages/core/src/workflows/trading/order-execution.workflow.ts:108`
- `packages/core/src/workflows/kyc/account-creation.workflow.ts:140`

**Severity:** CRITICAL
**Category:** Data Integrity / Workflow Correctness

```typescript
// order-execution.workflow.ts:108
const orderId = `ord_${crypto.randomUUID()}`;

// account-creation.workflow.ts:140
const verificationLink = `...&token=${crypto.randomUUID()}`;
```

**Problem:** Temporal workflows MUST be deterministic. Using `crypto.randomUUID()` in workflow code (not activities) will produce different values on replay, causing workflow replay failures, stuck workflows, or incorrect state recovery.

**Fix:** Use Temporal's `uuid4()` from `@temporalio/workflow` or move UUID generation to activities.

---

### 7. Database Schema - Vector Index on Non-Existent Field

**File:** `packages/db/convex/schema.ts:861-865`
**Severity:** CRITICAL
**Category:** Schema Integrity

```typescript
agentMemory: defineTable({
  // ... (no "embedding" field defined)
})
  .vectorIndex("embedding_index", {
    vectorField: "embedding",   // <-- This field doesn't exist in the schema!
    dimensions: 1536,
    filterFields: ["userId", "agentType"],
  }),
```

**Problem:** The vector index references a field `"embedding"` that is not defined in the table schema. This will either fail at deployment or create an unusable index.

**Fix:** Add `embedding: v.optional(v.array(v.float64()))` to the table schema, or use Convex's vector type.

---

### 8. Auth Token Stored in localStorage (XSS Vulnerable)

**File:** `apps/web/src/app/providers.tsx:46`
**Severity:** CRITICAL
**Category:** Token Security

```typescript
const token = localStorage.getItem("pull-auth-token");
```

**Problem:** JWT tokens stored in `localStorage` are accessible to any JavaScript running on the page, making them vulnerable to XSS attacks. For a financial application handling trading and banking, this is unacceptable.

**Fix:** Use HttpOnly cookies for token storage, or implement a token-mediation layer with CSRF protection.

---

### 9. CORS Wildcard Subdomain May Not Work

**File:** `apps/api/src/index.ts:40`
**Severity:** CRITICAL
**Category:** Security Misconfiguration

```typescript
origin: [
  "http://localhost:3000",
  "https://pull.app",
  "https://*.pull.app",    // Wildcard subdomain
],
```

**Problem:** Hono's CORS middleware uses exact string matching, not glob patterns. `"https://*.pull.app"` will not match actual subdomains like `https://app.pull.app`. This means either:
- CORS fails silently (frontend can't make requests), OR
- A custom origin function is needed to properly validate subdomains

**Fix:** Use the `origin` option as a function that validates against a regex pattern:
```typescript
origin: (origin) => {
  const allowed = ["http://localhost:3000", "https://pull.app"];
  if (allowed.includes(origin)) return origin;
  if (/^https:\/\/[\w-]+\.pull\.app$/.test(origin)) return origin;
  return null;
}
```

---

### 10. No Password Hashing Implementation

**File:** `packages/db/convex/schema.ts:71` + `apps/api/src/routes/auth.ts`
**Severity:** CRITICAL
**Category:** Credential Storage

**Problem:** The database schema defines `passwordHash: v.optional(v.string())` but:
- The registration endpoint never hashes the password
- No password hashing library (bcrypt, argon2, scrypt) is in dependencies
- No password verification happens during login

If passwords are ever stored, they would be stored in plaintext.

**Fix:** Add `bcrypt` or `argon2` dependency, hash passwords on registration, and verify during login.

---

## High Severity Issues

### 11. Missing Authorization on Order Endpoints

**File:** `apps/api/src/routes/trading.ts:80-112`
**Severity:** HIGH
**Category:** Broken Access Control (IDOR)

```typescript
app.get("/orders/:orderId", async (c) => {
  const orderId = c.req.param("orderId");
  // No check that this order belongs to the authenticated user!
  return c.json({ ... });
});

app.delete("/orders/:orderId", async (c) => {
  const orderId = c.req.param("orderId");
  // No ownership verification!
  return c.json({ ... });
});
```

**Problem:** Any authenticated user can view or cancel any other user's orders by guessing/brute-forcing order IDs (IDOR vulnerability).

**Fix:** Add ownership verification: fetch the order from the database and confirm `order.userId === c.get("userId")`.

---

### 12. tRPC Error Handling Returns 500 for Auth Failures

**File:** `apps/api/src/trpc/router.ts:11-13`
**Severity:** HIGH
**Category:** Incorrect Error Handling

```typescript
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new Error("Unauthorized");  // Wrong! Returns 500 instead of 401
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});
```

**Fix:** Use tRPC's `TRPCError`:
```typescript
import { TRPCError } from "@trpc/server";
throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
```

---

### 13. Missing `jsonwebtoken` Dependency

**Files:**
- `packages/core/src/services/fireblocks/client.ts:8`
- `packages/core/src/services/plaid/webhooks.ts:7`

**Severity:** HIGH
**Category:** Missing Dependencies

Both files import `jsonwebtoken` but it's not declared in any `package.json`. This will fail at runtime.

**Fix:** Add `jsonwebtoken` and `@types/jsonwebtoken` to `packages/core/package.json`.

---

### 14. Order Cancellation Uses Empty assetId

**File:** `packages/core/src/workflows/trading/order-execution.workflow.ts:401`
**Severity:** HIGH
**Category:** Data Integrity

```typescript
await settleOrder({
  userId,
  orderId,
  assetId: "", // Will be filled from context  <-- BUG: it won't!
  side: "buy",
  ...
});
```

**Problem:** When partially filled orders are cancelled, `settleOrder` is called with an empty `assetId`. This will either fail or create incorrect settlement records. The `side` is also hardcoded to `"buy"`.

**Fix:** Pass the actual `assetId` and `side` from the workflow input to the `handleCancellation` function.

---

### 15. Convex URL Unsafe Assertion

**File:** `apps/web/src/app/providers.tsx:14`
**Severity:** HIGH
**Category:** Runtime Crash

```typescript
const convex = new ConvexReactClient(
  process.env.NEXT_PUBLIC_CONVEX_URL as string
);
```

**Problem:** If `NEXT_PUBLIC_CONVEX_URL` is not set, this passes `undefined` to ConvexReactClient, causing a runtime crash with an unhelpful error.

**Fix:** Add a runtime check:
```typescript
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured");
const convex = new ConvexReactClient(convexUrl);
```

---

### 16. Rate Limiter Fails Open

**File:** `apps/api/src/middleware/rate-limit.ts:89-93`
**Severity:** HIGH
**Category:** Security Fail-Open

```typescript
} catch (error) {
  // If rate limiting fails, allow the request
  console.error("Rate limit error:", error);
  await next();
}
```

**Problem:** If Redis is down, ALL requests bypass rate limiting entirely. For a financial application, this enables brute-force attacks on auth endpoints.

**Fix:** Implement a fallback in-memory rate limiter, or fail-closed for sensitive endpoints (auth, trading).

---

## Medium Severity Issues

### 17. No Request Body Size Limit

**File:** `apps/api/src/index.ts`
**Severity:** MEDIUM
**Category:** Denial of Service

**Problem:** No body size limit is configured. Attackers can send multi-GB request bodies to exhaust server memory.

**Fix:** Add body size limiting middleware:
```typescript
app.use("*", bodyLimit({ maxSize: 1024 * 1024 })); // 1MB
```

---

### 18. `v.any()` Usage Bypasses Type Safety

**File:** `packages/db/convex/schema.ts` (lines 136, 216, 304, 458, 735, 768, 812, 830)
**Severity:** MEDIUM
**Category:** Type Safety

**Problem:** 8 fields use `v.any()` for metadata/data/changes/payload fields. This allows arbitrary data injection and bypasses Convex's type checking.

**Fix:** Define explicit types for each metadata field using Convex validators, or use `v.object({...})` with known keys.

---

### 19. WebSocket Client Potential Memory Leak

**File:** `packages/core/src/services/kalshi/websocket.ts:88`
**Severity:** MEDIUM
**Category:** Resource Leak

```typescript
private pendingMessages: Map<number, { resolve: Function; reject: Function }> = new Map();
```

**Problem:** If the WebSocket disconnects before a response arrives, pending messages are never cleaned up (the reconnect logic doesn't clear them). The timeouts help for subscriptions (10s), but the heartbeat ping responses have no timeout.

**Fix:** Clear `pendingMessages` on disconnect, or add a global timeout sweep.

---

### 20. Missing Error Boundaries (Frontend)

**File:** `apps/web/src/app/` (all pages)
**Severity:** MEDIUM
**Category:** User Experience / Error Handling

**Problem:** No `error.tsx` files exist in any route group. Uncaught errors will crash the entire application with Next.js's default error page.

**Fix:** Add `error.tsx` files in each route group `(auth)`, `(dashboard)`, and root.

---

### 21. IP Address Spoofing via Headers

**File:** `apps/api/src/middleware/rate-limit.ts:48-50`
**Severity:** MEDIUM
**Category:** Rate Limit Bypass

```typescript
const ip = c.req.header("CF-Connecting-IP") ??
           c.req.header("X-Forwarded-For")?.split(",")[0] ??
           "unknown";
```

**Problem:** If the server is not behind Cloudflare, `CF-Connecting-IP` can be spoofed. `X-Forwarded-For` can also be spoofed if not properly stripped by a reverse proxy. This allows rate limit bypass by rotating headers.

**Fix:** Only trust these headers when confirmed behind the respective proxy. Use the socket IP as ultimate fallback.

---

### 22. No CSRF Protection

**File:** `apps/api/src/index.ts` (global)
**Severity:** MEDIUM
**Category:** Cross-Site Request Forgery

**Problem:** The API uses Bearer tokens only. If the token is stored in a cookie (which may happen if the localStorage approach is changed), there's no CSRF token protection.

**Fix:** If migrating to cookie-based auth, implement CSRF tokens. Otherwise, document that Bearer-only auth is intentional.

---

### 23. Error Messages Expose Internal Details

**File:** `apps/api/src/index.ts:110-112`
**Severity:** MEDIUM
**Category:** Information Disclosure

```typescript
message: process.env.NODE_ENV === "production"
  ? "An unexpected error occurred"
  : err.message,
```

**Problem:** In development/staging, raw error messages (which may contain file paths, SQL queries, or stack traces) are returned to the client.

**Fix:** Ensure staging/test environments also use generic error messages, or strip sensitive details.

---

### 24. Plaid Webhook Key Cache Unbounded

**File:** `packages/core/src/services/plaid/webhooks.ts:200`
**Severity:** MEDIUM
**Category:** Memory Leak

```typescript
const keyCache: Map<string, { key: string; expiresAt: number }> = new Map();
```

**Problem:** Keys are cached for 24 hours but never evicted. Over time (with key rotation), this Map grows unbounded.

**Fix:** Implement cache eviction on access, or use a TTL-based cache library.

---

### 25. Unused `PLAID_WEBHOOK_KEY_IDS` Constant

**File:** `packages/core/src/services/plaid/webhooks.ts:193-197,279`
**Severity:** MEDIUM
**Category:** Dead Code / Bug

The `PLAID_WEBHOOK_KEY_IDS` constant is defined but the `getWebhookVerificationKey` function doesn't use it - it constructs the URL manually on line 285. The constant also has a redundant `.replace("/get", "/get")` on line 279.

---

## Low Severity / Code Quality Issues

### 26. All API Routes Return Placeholder Data

**Files:** All route files in `apps/api/src/routes/`
**Severity:** LOW
**Category:** Incomplete Implementation

Every route handler has `// TODO: Implement...` comments and returns mock data. This is expected for early development but should be tracked for completion.

---

### 27. No Test Files Exist

**Severity:** LOW
**Category:** Test Coverage

Despite test scripts in `package.json` and a CI workflow that runs tests, there are zero test files in the repository.

---

### 28. Inconsistent Error Response Formats

**Severity:** LOW
**Category:** API Consistency

- API routes use: `{ success: false, error: { code, message }, requestId, timestamp }`
- Webhook routes use: `{ received: true }`
- tRPC uses standard tRPC error format

**Fix:** Standardize webhook responses to match the API format.

---

### 29. Unused Variables in Route Handlers

**File:** `apps/api/src/routes/trading.ts`
**Severity:** LOW
**Category:** Code Quality

- Line 57: `status` is destructured from query but never used
- Line 118: `userId` is retrieved but never used in portfolio
- Line 141: `userId` is retrieved but never used in buying-power

---

### 30. Missing Runtime Environment Validation

**Severity:** LOW
**Category:** Configuration

No startup validation ensures required environment variables are set. The app will crash with cryptic errors at runtime when services are accessed.

**Fix:** Add a startup validation function that checks all required env vars.

---

### 31. CI/CD Deploy Workflow Uses Stubs

**File:** `.github/workflows/deploy.yml`
**Severity:** LOW
**Category:** Incomplete DevOps

Deployment jobs contain placeholder commands (`echo "Deploying..."`) rather than actual deployment logic.

---

### 32. Docker Compose Missing API Service

**File:** `docker-compose.yml`
**Severity:** LOW
**Category:** Development Environment

The docker-compose file defines PostgreSQL, Redis, and Temporal but not the API server itself. This means developers need to manually start the API.

---

### 33. `Database URL` in .env.example Points to docker-compose postgres but schema uses Convex

**File:** `.env.example`
**Severity:** LOW
**Category:** Configuration Confusion

The env template includes `DATABASE_URL=postgresql://...` but the application uses Convex as its database. PostgreSQL is only used by Temporal internally.

---

### 34. Frontend Uses Hardcoded Placeholder Data

**File:** `apps/web/src/app/(dashboard)/trade/[ticker]/page.tsx:23-37`
**Severity:** LOW
**Category:** Incomplete Implementation

The trading view page uses hardcoded market data objects instead of fetching from the API.

---

### 35. No Logging Infrastructure

**Severity:** LOW
**Category:** Observability

Console.log/error is used throughout. No structured logging library (pino, winston) is configured. Sentry DSN is defined in `.env.example` but no Sentry integration exists.

---

## Recommended Priority Order for Fixes

### Immediate (Before Any Deployment)
1. Remove JWT secret fallback (Issue #1)
2. Fix Temporal workflow non-determinism (Issue #6)
3. Fix database vector index schema mismatch (Issue #7)
4. Implement webhook signature verification (Issue #3)
5. Fix Massive client HMAC (Issue #4)
6. Fix rate limiting middleware order (Issue #5)

### Before Beta
7. Implement real authentication (Issue #2)
8. Add password hashing (Issue #10)
9. Fix token storage (Issue #8)
10. Fix CORS wildcard handling (Issue #9)
11. Add authorization checks to trading routes (Issue #11)
12. Fix tRPC error codes (Issue #12)
13. Add missing dependencies (Issue #13)
14. Fix order cancellation bug (Issue #14)
15. Add request body size limits (Issue #17)
16. Improve rate limiter fail-closed behavior (Issue #16)

### Before Production
17. Replace `v.any()` with typed schemas (Issue #18)
18. Fix WebSocket memory leak (Issue #19)
19. Add error boundaries (Issue #20)
20. Fix IP spoofing vulnerability (Issue #21)
21. Add CSRF protection (Issue #22)
22. Fix error message information disclosure (Issue #23)
23. Add env validation at startup (Issue #30)
24. Add structured logging (Issue #35)
25. Write tests (Issue #27)

---

## Architecture Notes

### Positive Observations
- Clean monorepo structure with proper package separation
- Good use of Temporal for workflow orchestration
- Well-defined database schema with proper indexes
- TypeScript throughout with strict mode
- Proper Zod validation on API inputs
- Good use of retry policies in Temporal activities
- WebSocket implementation with reconnection logic

### Architectural Concerns
- **Convex + PostgreSQL confusion**: Docker-compose runs PostgreSQL but the app uses Convex. Clarify which is the primary DB.
- **Missing API gateway**: No API gateway for routing, load balancing, or additional security layers.
- **No secrets management**: Relies entirely on environment variables with no vault/secrets manager integration.
- **Single-region assumption**: No multi-region or failover configuration.
- **No audit of Convex functions**: The Convex functions (`packages/db/convex/*.ts`) have direct database access without additional authorization checks.
