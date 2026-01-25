#!/bin/bash
set -e

# PULL Backend Deployment Script
# Usage: ./scripts/deploy.sh [environment]
# Environments: staging, production

ENVIRONMENT=${1:-staging}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║           PULL Backend Deployment Script                   ║"
echo "║           Environment: $ENVIRONMENT                              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check required tools
check_requirements() {
    log_info "Checking requirements..."

    local missing=()

    command -v node >/dev/null 2>&1 || missing+=("node")
    command -v pnpm >/dev/null 2>&1 || missing+=("pnpm")
    command -v git >/dev/null 2>&1 || missing+=("git")

    if [ ${#missing[@]} -ne 0 ]; then
        log_error "Missing required tools: ${missing[*]}"
        exit 1
    fi

    log_success "All required tools installed"
}

# Validate environment variables
validate_env() {
    log_info "Validating environment variables..."

    local required_vars=(
        "CONVEX_DEPLOY_KEY"
        "STRIPE_SECRET_KEY"
        "STRIPE_WEBHOOK_SECRET"
        "RESEND_API_KEY"
    )

    local missing=()

    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing+=("$var")
        fi
    done

    if [ ${#missing[@]} -ne 0 ]; then
        log_error "Missing required environment variables:"
        for var in "${missing[@]}"; do
            echo "  - $var"
        done
        echo ""
        log_info "Copy .env.example to .env and fill in the values"
        exit 1
    fi

    log_success "Environment variables validated"
}

# Install dependencies
install_deps() {
    log_info "Installing dependencies..."
    cd "$ROOT_DIR"
    pnpm install --frozen-lockfile
    log_success "Dependencies installed"
}

# Run type checking
typecheck() {
    log_info "Running type check..."
    cd "$ROOT_DIR"
    if pnpm run typecheck; then
        log_success "Type check passed"
    else
        log_error "Type check failed"
        exit 1
    fi
}

# Run tests
run_tests() {
    log_info "Running tests..."
    cd "$ROOT_DIR"
    if pnpm run test --run; then
        log_success "Tests passed"
    else
        log_warn "Some tests failed - review before deploying to production"
        if [ "$ENVIRONMENT" = "production" ]; then
            read -p "Continue anyway? (y/N) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                exit 1
            fi
        fi
    fi
}

# Build all packages
build() {
    log_info "Building all packages..."
    cd "$ROOT_DIR"
    pnpm run build
    log_success "Build completed"
}

# Deploy Convex database
deploy_convex() {
    log_info "Deploying Convex database..."
    cd "$ROOT_DIR/packages/db"

    if [ "$ENVIRONMENT" = "production" ]; then
        npx convex deploy --prod
    else
        npx convex deploy
    fi

    log_success "Convex deployed"
}

# Deploy API to Railway/Render/Fly
deploy_api() {
    log_info "Deploying API..."
    cd "$ROOT_DIR/apps/api"

    # Check which platform is configured
    if [ -f "fly.toml" ]; then
        log_info "Deploying to Fly.io..."
        fly deploy --env "$ENVIRONMENT"
    elif [ -f "railway.json" ] || command -v railway >/dev/null 2>&1; then
        log_info "Deploying to Railway..."
        railway up --environment "$ENVIRONMENT"
    else
        log_warn "No deployment platform configured for API"
        log_info "Options:"
        echo "  - Fly.io: fly launch"
        echo "  - Railway: railway init"
        echo "  - Render: Connect GitHub repo in dashboard"
    fi

    log_success "API deployment initiated"
}

# Deploy workers
deploy_workers() {
    log_info "Deploying workers..."
    cd "$ROOT_DIR/apps/workers"

    if [ -f "fly.toml" ]; then
        fly deploy --env "$ENVIRONMENT"
    elif command -v railway >/dev/null 2>&1; then
        railway up --environment "$ENVIRONMENT" --service workers
    else
        log_warn "Workers deployment skipped - no platform configured"
    fi
}

# Deploy web app to Vercel
deploy_web() {
    log_info "Deploying web app..."
    cd "$ROOT_DIR/apps/web"

    if command -v vercel >/dev/null 2>&1; then
        if [ "$ENVIRONMENT" = "production" ]; then
            vercel --prod
        else
            vercel
        fi
        log_success "Web app deployed"
    else
        log_warn "Vercel CLI not installed - skipping web deployment"
        log_info "Install with: pnpm add -g vercel"
    fi
}

# Run database migrations/seeds if needed
run_migrations() {
    log_info "Running any pending migrations..."
    cd "$ROOT_DIR"

    # Convex handles schema automatically, but run any seed scripts
    if [ -f "packages/db/scripts/seed.ts" ]; then
        log_info "Running seed script..."
        cd packages/db && npx tsx scripts/seed.ts
    fi

    log_success "Migrations complete"
}

# Health check
health_check() {
    log_info "Running health checks..."

    local api_url="${API_URL:-https://api.pullapp.com}"

    if [ "$ENVIRONMENT" = "staging" ]; then
        api_url="${STAGING_API_URL:-https://staging-api.pullapp.com}"
    fi

    # Wait for deployment to propagate
    sleep 10

    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -sf "$api_url/health" > /dev/null 2>&1; then
            log_success "Health check passed!"
            return 0
        fi
        log_info "Waiting for API to be ready... (attempt $attempt/$max_attempts)"
        sleep 5
        ((attempt++))
    done

    log_error "Health check failed after $max_attempts attempts"
    return 1
}

# Print deployment summary
print_summary() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║                 Deployment Summary                         ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Environment: $ENVIRONMENT"
    echo "Timestamp:   $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
    echo "Git Branch:  $(git branch --show-current)"
    echo "Git Commit:  $(git rev-parse --short HEAD)"
    echo ""
    echo "Next steps:"
    echo "  1. Verify webhooks are configured in Stripe/Persona dashboards"
    echo "  2. Test a deposit flow end-to-end"
    echo "  3. Monitor error rates in Sentry"
    echo "  4. Check metrics at /metrics endpoint"
    echo ""
    log_success "Deployment complete!"
}

# Main deployment flow
main() {
    check_requirements

    # Load environment file if exists
    if [ -f "$ROOT_DIR/.env.$ENVIRONMENT" ]; then
        log_info "Loading .env.$ENVIRONMENT"
        export $(grep -v '^#' "$ROOT_DIR/.env.$ENVIRONMENT" | xargs)
    elif [ -f "$ROOT_DIR/.env" ]; then
        log_info "Loading .env"
        export $(grep -v '^#' "$ROOT_DIR/.env" | xargs)
    fi

    validate_env
    install_deps
    typecheck

    if [ "$ENVIRONMENT" = "production" ]; then
        run_tests
    fi

    build
    deploy_convex
    deploy_api
    deploy_workers
    deploy_web
    run_migrations

    if [ "$ENVIRONMENT" = "production" ]; then
        health_check
    fi

    print_summary
}

# Run main function
main "$@"
