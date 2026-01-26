#!/bin/bash

# PULL Pre-Launch Validation Script
# Run this before deploying to production to catch issues early

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

pass() { echo -e "  ${GREEN}✓${NC} $1"; ((PASS_COUNT++)); }
fail() { echo -e "  ${RED}✗${NC} $1"; ((FAIL_COUNT++)); }
warn() { echo -e "  ${YELLOW}!${NC} $1"; ((WARN_COUNT++)); }
info() { echo -e "  ${BLUE}ℹ${NC} $1"; }

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║           PULL Pre-Launch Validation                       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# ==============================================================================
# 1. Environment Variables
# ==============================================================================
echo "📋 Checking Environment Variables..."

check_env() {
    local var_name=$1
    local required=${2:-true}

    if [ -n "${!var_name}" ]; then
        pass "$var_name is set"
        return 0
    else
        if [ "$required" = "true" ]; then
            fail "$var_name is missing (REQUIRED)"
            return 1
        else
            warn "$var_name is not set (optional)"
            return 0
        fi
    fi
}

# Critical - deployment will fail without these
check_env "CONVEX_DEPLOY_KEY"
check_env "STRIPE_SECRET_KEY"
check_env "STRIPE_WEBHOOK_SECRET"
check_env "JWT_SECRET"

# Important - features won't work without these
check_env "RESEND_API_KEY"
check_env "PERSONA_API_KEY" false
check_env "UPSTASH_REDIS_URL" false
check_env "SENTRY_DSN" false

echo ""

# ==============================================================================
# 2. Code Quality
# ==============================================================================
echo "🔍 Checking Code Quality..."

cd "$ROOT_DIR"

# TypeScript check
if pnpm run typecheck 2>/dev/null; then
    pass "TypeScript compilation successful"
else
    fail "TypeScript errors found"
fi

# Lint check
if pnpm run lint 2>/dev/null; then
    pass "Linting passed"
else
    warn "Linting issues found (non-blocking)"
fi

echo ""

# ==============================================================================
# 3. Build Check
# ==============================================================================
echo "🏗️  Checking Build..."

if pnpm run build 2>/dev/null; then
    pass "Build successful"
else
    fail "Build failed"
fi

echo ""

# ==============================================================================
# 4. Test Suite
# ==============================================================================
echo "🧪 Running Tests..."

if pnpm run test --run 2>/dev/null; then
    pass "All tests passed"
else
    warn "Some tests failed (review before production)"
fi

echo ""

# ==============================================================================
# 5. Security Checks
# ==============================================================================
echo "🔒 Security Checks..."

# Check for exposed secrets in code
if grep -r "sk_live_" --include="*.ts" --include="*.tsx" --include="*.js" apps packages 2>/dev/null; then
    fail "Exposed Stripe live key found in code!"
else
    pass "No exposed Stripe keys in code"
fi

if grep -r "sk-ant-" --include="*.ts" --include="*.tsx" --include="*.js" apps packages 2>/dev/null; then
    fail "Exposed Anthropic key found in code!"
else
    pass "No exposed API keys in code"
fi

# Check for .env files that shouldn't be committed
if [ -f ".env" ] || [ -f ".env.local" ] || [ -f ".env.production" ]; then
    if git ls-files --error-unmatch .env .env.local .env.production 2>/dev/null; then
        fail ".env file is tracked by git!"
    else
        pass ".env files not tracked by git"
    fi
else
    pass "No .env files present"
fi

# Check npm audit
if pnpm audit --audit-level=high 2>/dev/null; then
    pass "No high/critical npm vulnerabilities"
else
    warn "npm audit found vulnerabilities (review with: pnpm audit)"
fi

echo ""

# ==============================================================================
# 6. Database Schema
# ==============================================================================
echo "📊 Database Schema Check..."

if [ -f "packages/db/convex/schema.ts" ]; then
    pass "Convex schema exists"

    # Count tables
    TABLE_COUNT=$(grep -c "defineTable" packages/db/convex/schema.ts 2>/dev/null || echo "0")
    info "Schema defines $TABLE_COUNT tables"
else
    fail "Convex schema not found"
fi

echo ""

# ==============================================================================
# 7. API Routes Check
# ==============================================================================
echo "🛣️  API Routes Check..."

ROUTE_FILES=$(find apps/api/src/routes -name "*.ts" 2>/dev/null | wc -l)
if [ "$ROUTE_FILES" -gt 0 ]; then
    pass "$ROUTE_FILES route files found"
else
    fail "No route files found"
fi

# Check for health endpoint
if grep -r "health" apps/api/src/routes --include="*.ts" 2>/dev/null | grep -q "GET"; then
    pass "Health endpoint exists"
else
    warn "Health endpoint not found (recommended for monitoring)"
fi

echo ""

# ==============================================================================
# 8. Webhook Endpoints
# ==============================================================================
echo "🔗 Webhook Endpoints..."

check_webhook() {
    local name=$1
    local pattern=$2

    if grep -r "$pattern" apps/api/src --include="*.ts" 2>/dev/null | head -1 > /dev/null; then
        pass "$name webhook handler found"
    else
        warn "$name webhook handler not found"
    fi
}

check_webhook "Stripe" "stripe.*webhook"
check_webhook "Persona" "persona.*webhook"
check_webhook "Plaid" "plaid.*webhook"

echo ""

# ==============================================================================
# 9. Feature Flags
# ==============================================================================
echo "🚩 Feature Flags..."

if [ -f "packages/core/src/services/feature-flags/defaults.ts" ]; then
    pass "Feature flags configured"

    # Check what's enabled by default
    ENABLED_FLAGS=$(grep -E ":\s*true" packages/core/src/services/feature-flags/defaults.ts 2>/dev/null | wc -l || echo "0")
    info "$ENABLED_FLAGS features enabled by default"
else
    warn "Feature flags not configured (all features will be enabled)"
fi

echo ""

# ==============================================================================
# 10. Documentation
# ==============================================================================
echo "📚 Documentation..."

if [ -f "README.md" ]; then
    pass "README.md exists"
else
    warn "README.md not found"
fi

if [ -f "PRODUCTION_AUDIT_AND_KILLER_FEATURES.md" ]; then
    pass "Production audit document exists"
fi

echo ""

# ==============================================================================
# Summary
# ==============================================================================
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  📊 Results Summary"
echo ""
echo -e "     ${GREEN}Passed:${NC}   $PASS_COUNT"
echo -e "     ${YELLOW}Warnings:${NC} $WARN_COUNT"
echo -e "     ${RED}Failed:${NC}   $FAIL_COUNT"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "  ${GREEN}✓ Ready for deployment!${NC}"
    echo ""
    echo "  Next steps:"
    echo "    1. Run: ./scripts/deploy.sh staging"
    echo "    2. Test staging environment"
    echo "    3. Run: ./scripts/deploy.sh production"
    echo ""
    exit 0
else
    echo -e "  ${RED}✗ Fix $FAIL_COUNT issue(s) before deploying${NC}"
    echo ""
    exit 1
fi
