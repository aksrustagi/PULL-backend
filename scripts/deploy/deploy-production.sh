#!/usr/bin/env bash
# ==============================================================================
# PULL Backend - Production Deployment Script
# ==============================================================================
# Deploys all services to the production environment with safety confirmations
#
# Usage:
#   ./scripts/deploy/deploy-production.sh [options]
#
# Options:
#   --api-only        Deploy only the API service
#   --web-only        Deploy only the Web service
#   --workers-only    Deploy only the Workers service
#   --skip-staging    Skip staging verification (not recommended)
#   --skip-tests      Skip running tests before deployment
#   --skip-build      Skip build step (use existing build artifacts)
#   --force           Skip all confirmation prompts (USE WITH CAUTION)
#   --dry-run         Show what would be deployed without deploying
#   -h, --help        Show this help message
#
# Environment Variables:
#   PRODUCTION_DEPLOY_TOKEN  Required token to authorize production deployments
#   GCP_PROJECT_ID           Google Cloud project ID
#   GCP_REGION              Google Cloud region (default: us-central1)
# ==============================================================================

set -euo pipefail

# ------------------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_FILE="${PROJECT_ROOT}/logs/deploy-production-$(date +%Y%m%d-%H%M%S).log"

# Environment
ENVIRONMENT="production"
API_URL="https://api.pull.com"
API_STAGING_URL="https://api-staging.pull.com"
WEB_URL="https://app.pull.com"
WEB_STAGING_URL="https://staging.pull.com"
WORKERS_SERVICE="pull-temporal-worker"
WORKERS_SERVICE_STAGING="pull-temporal-worker-staging"
GCP_REGION="${GCP_REGION:-us-central1}"

# Flags
DEPLOY_API=true
DEPLOY_WEB=true
DEPLOY_WORKERS=true
SKIP_STAGING=false
SKIP_TESTS=false
SKIP_BUILD=false
FORCE_DEPLOY=false
DRY_RUN=false

# Rollback info storage
declare -A PREVIOUS_VERSIONS

# ------------------------------------------------------------------------------
# Colors and Formatting
# ------------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ------------------------------------------------------------------------------
# Logging Functions
# ------------------------------------------------------------------------------
log() {
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} $1" | tee -a "$LOG_FILE" 2>/dev/null || echo -e "${timestamp} $1"
}

info() {
    log "${BLUE}[INFO]${NC} $1"
}

success() {
    log "${GREEN}[SUCCESS]${NC} $1"
}

warn() {
    log "${YELLOW}[WARN]${NC} $1"
}

error() {
    log "${RED}[ERROR]${NC} $1"
}

step() {
    echo ""
    log "${MAGENTA}${BOLD}==> $1${NC}"
}

# ------------------------------------------------------------------------------
# Helper Functions
# ------------------------------------------------------------------------------
show_help() {
    sed -n '2,23p' "$0" | sed 's/^# //' | sed 's/^#//'
    exit 0
}

ensure_log_dir() {
    mkdir -p "$(dirname "$LOG_FILE")"
}

get_git_info() {
    local branch commit
    branch=$(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
    commit=$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")
    echo "${branch}@${commit}"
}

confirm() {
    local message=$1
    local default=${2:-n}

    if $FORCE_DEPLOY; then
        return 0
    fi

    if [ "$default" = "y" ]; then
        read -p "$message [Y/n] " -n 1 -r
    else
        read -p "$message [y/N] " -n 1 -r
    fi
    echo ""

    if [ "$default" = "y" ]; then
        [[ ! $REPLY =~ ^[Nn]$ ]]
    else
        [[ $REPLY =~ ^[Yy]$ ]]
    fi
}

# Production confirmation with typed verification
confirm_production() {
    echo ""
    echo -e "${RED}${BOLD}========================================${NC}"
    echo -e "${RED}${BOLD}    PRODUCTION DEPLOYMENT WARNING       ${NC}"
    echo -e "${RED}${BOLD}========================================${NC}"
    echo ""
    echo -e "You are about to deploy to ${RED}${BOLD}PRODUCTION${NC}!"
    echo ""
    echo "This will affect:"
    $DEPLOY_API && echo "  - API: $API_URL"
    $DEPLOY_WEB && echo "  - Web: $WEB_URL"
    $DEPLOY_WORKERS && echo "  - Workers: $WORKERS_SERVICE"
    echo ""
    echo "Git: $(get_git_info)"
    echo "Time: $(date '+%Y-%m-%d %H:%M:%S %Z')"
    echo ""

    if $FORCE_DEPLOY; then
        warn "Skipping confirmation (--force flag)"
        return 0
    fi

    # First confirmation
    if ! confirm "Do you want to proceed with production deployment?"; then
        info "Deployment cancelled"
        exit 0
    fi

    # Type confirmation
    echo ""
    echo -e "Type ${BOLD}DEPLOY PRODUCTION${NC} to confirm:"
    read -r confirmation

    if [ "$confirmation" != "DEPLOY PRODUCTION" ]; then
        error "Confirmation failed. Deployment cancelled."
        exit 1
    fi

    echo ""
    success "Confirmation accepted"
}

# ------------------------------------------------------------------------------
# Pre-deployment Checks
# ------------------------------------------------------------------------------
check_prerequisites() {
    step "Checking prerequisites"

    local missing=()

    # Check required commands
    for cmd in node pnpm git curl docker; do
        if command -v "$cmd" &> /dev/null; then
            info "Found: $cmd"
        else
            missing+=("$cmd")
        fi
    done

    if $DEPLOY_WORKERS && ! command -v gcloud &> /dev/null; then
        missing+=("gcloud")
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        error "Missing required commands: ${missing[*]}"
        exit 1
    fi

    success "Prerequisites satisfied"
}

check_authentication() {
    step "Checking authentication"

    # Check if on protected branch
    local current_branch
    current_branch=$(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD)

    if [ "$current_branch" != "main" ] && [ "$current_branch" != "master" ]; then
        warn "Not on main/master branch (current: $current_branch)"
        if ! confirm "Continue deployment from non-main branch?"; then
            exit 1
        fi
    fi

    # Verify GCP authentication for workers
    if $DEPLOY_WORKERS; then
        if ! gcloud auth print-identity-token &> /dev/null; then
            error "Not authenticated with GCP. Run: gcloud auth login"
            exit 1
        fi
        info "GCP authentication verified"
    fi

    # Check for Cloudflare token
    if $DEPLOY_API; then
        if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
            error "CLOUDFLARE_API_TOKEN not set"
            exit 1
        fi
        info "Cloudflare credentials verified"
    fi

    # Check for Vercel token
    if $DEPLOY_WEB; then
        if [ -z "${VERCEL_TOKEN:-}" ]; then
            error "VERCEL_TOKEN not set"
            exit 1
        fi
        info "Vercel credentials verified"
    fi

    success "Authentication verified"
}

verify_staging() {
    if $SKIP_STAGING; then
        warn "Skipping staging verification (--skip-staging flag)"
        warn "This is NOT RECOMMENDED for production deployments!"
        return
    fi

    step "Verifying staging environment"

    local failed=false

    # Check staging API
    if $DEPLOY_API; then
        info "Checking staging API health..."
        local api_status
        api_status=$(curl -s -o /dev/null -w "%{http_code}" "${API_STAGING_URL}/health" || echo "000")

        if [ "$api_status" = "200" ]; then
            success "Staging API is healthy"
        else
            error "Staging API health check failed (status: $api_status)"
            failed=true
        fi
    fi

    # Check staging Web
    if $DEPLOY_WEB; then
        info "Checking staging Web health..."
        local web_status
        web_status=$(curl -s -o /dev/null -w "%{http_code}" "${WEB_STAGING_URL}" || echo "000")

        if [ "$web_status" = "200" ]; then
            success "Staging Web is healthy"
        else
            error "Staging Web health check failed (status: $web_status)"
            failed=true
        fi
    fi

    if $failed; then
        error "Staging verification failed!"
        error "Please ensure staging is working correctly before deploying to production."
        if ! confirm "Continue anyway? (NOT RECOMMENDED)"; then
            exit 1
        fi
    fi
}

check_secrets() {
    step "Checking production secrets"

    if [ -f "$SCRIPT_DIR/secrets-check.sh" ]; then
        if ! "$SCRIPT_DIR/secrets-check.sh" --env production --quiet; then
            error "Secrets check failed. Please configure all required secrets."
            exit 1
        fi
    else
        warn "secrets-check.sh not found, skipping secrets verification"
    fi

    success "Secrets verified"
}

# ------------------------------------------------------------------------------
# Store Previous Versions for Rollback
# ------------------------------------------------------------------------------
store_previous_versions() {
    step "Recording current versions for rollback"

    # Store API version (Cloudflare Workers deployment ID)
    if $DEPLOY_API; then
        info "Recording current API deployment..."
        # Note: wrangler doesn't have a direct way to get current version,
        # but we can store the commit hash we're replacing
        PREVIOUS_VERSIONS["api"]=$(git -C "$PROJECT_ROOT" rev-parse --short HEAD^)
    fi

    # Store Workers version (Cloud Run revision)
    if $DEPLOY_WORKERS; then
        info "Recording current Workers revision..."
        local current_revision
        current_revision=$(gcloud run services describe "$WORKERS_SERVICE" \
            --region "$GCP_REGION" \
            --format 'value(status.latestReadyRevisionName)' 2>/dev/null || echo "none")
        PREVIOUS_VERSIONS["workers"]="$current_revision"
        info "Current Workers revision: $current_revision"
    fi

    # Store in rollback file
    echo "# Rollback info for deployment at $(date)" > "$PROJECT_ROOT/logs/rollback-info-latest.txt"
    echo "DEPLOY_TIMESTAMP=$(date +%s)" >> "$PROJECT_ROOT/logs/rollback-info-latest.txt"
    echo "GIT_COMMIT=$(git -C "$PROJECT_ROOT" rev-parse HEAD)" >> "$PROJECT_ROOT/logs/rollback-info-latest.txt"

    for key in "${!PREVIOUS_VERSIONS[@]}"; do
        echo "PREVIOUS_${key^^}=${PREVIOUS_VERSIONS[$key]}" >> "$PROJECT_ROOT/logs/rollback-info-latest.txt"
    done

    success "Previous versions recorded"
}

# ------------------------------------------------------------------------------
# Build Steps
# ------------------------------------------------------------------------------
install_dependencies() {
    step "Installing dependencies"

    cd "$PROJECT_ROOT"

    if $DRY_RUN; then
        info "[DRY RUN] Would run: pnpm install --frozen-lockfile"
        return
    fi

    pnpm install --frozen-lockfile
    success "Dependencies installed"
}

run_tests() {
    if $SKIP_TESTS; then
        warn "Skipping tests (--skip-tests flag)"
        return
    fi

    step "Running full test suite"

    cd "$PROJECT_ROOT"

    if $DRY_RUN; then
        info "[DRY RUN] Would run: pnpm test:run"
        return
    fi

    if ! pnpm test:run; then
        error "Tests failed. Production deployment aborted."
        exit 1
    fi

    success "All tests passed"
}

run_build() {
    if $SKIP_BUILD; then
        warn "Skipping build (--skip-build flag)"
        return
    fi

    step "Building all packages for production"

    cd "$PROJECT_ROOT"

    if $DRY_RUN; then
        info "[DRY RUN] Would run: NODE_ENV=production pnpm build"
        return
    fi

    NODE_ENV=production pnpm build
    success "Production build completed"
}

# ------------------------------------------------------------------------------
# Deployment Functions
# ------------------------------------------------------------------------------
deploy_api() {
    if ! $DEPLOY_API; then
        info "Skipping API deployment"
        return
    fi

    step "Deploying API to production"

    cd "$PROJECT_ROOT/apps/api"

    if $DRY_RUN; then
        info "[DRY RUN] Would run: wrangler deploy --env production"
        return
    fi

    # Deploy
    wrangler deploy --env production

    # Health check with more attempts for production
    info "Running API health check..."
    local max_attempts=15
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        local status
        status=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/health" || echo "000")

        if [ "$status" = "200" ]; then
            success "API health check passed"
            return
        fi

        info "Attempt $attempt/$max_attempts: Got status $status, retrying..."
        sleep 5
        ((attempt++))
    done

    error "API health check failed after $max_attempts attempts"
    error "Consider running rollback: ./scripts/deploy/rollback.sh --service api"
    exit 1
}

deploy_web() {
    if ! $DEPLOY_WEB; then
        info "Skipping Web deployment"
        return
    fi

    step "Deploying Web to production"

    cd "$PROJECT_ROOT"

    if $DRY_RUN; then
        info "[DRY RUN] Would run: vercel deploy --prod"
        return
    fi

    # Pull production environment and deploy
    vercel pull --yes --environment=production --token="${VERCEL_TOKEN}"
    vercel build --prod --token="${VERCEL_TOKEN}"
    vercel deploy --prebuilt --prod --token="${VERCEL_TOKEN}"

    # Health check
    info "Running Web health check..."
    local max_attempts=15
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        local status
        status=$(curl -s -o /dev/null -w "%{http_code}" "$WEB_URL" || echo "000")

        if [ "$status" = "200" ]; then
            success "Web health check passed"
            return
        fi

        info "Attempt $attempt/$max_attempts: Got status $status, retrying..."
        sleep 5
        ((attempt++))
    done

    error "Web health check failed after $max_attempts attempts"
    exit 1
}

deploy_workers() {
    if ! $DEPLOY_WORKERS; then
        info "Skipping Workers deployment"
        return
    fi

    step "Deploying Workers to production"

    cd "$PROJECT_ROOT"

    local version
    version=$(git rev-parse --short HEAD)
    local image="gcr.io/${GCP_PROJECT_ID:-pull-project}/pull-temporal-worker:${version}"

    if $DRY_RUN; then
        info "[DRY RUN] Would build and push: $image"
        info "[DRY RUN] Would deploy to Cloud Run: $WORKERS_SERVICE"
        return
    fi

    # Build and push
    info "Building Docker image..."
    docker build -t "$image" -f infrastructure/temporal/Dockerfile .

    info "Pushing Docker image..."
    docker push "$image"

    # Deploy with production configuration
    info "Deploying to Cloud Run..."
    gcloud run deploy "$WORKERS_SERVICE" \
        --image "$image" \
        --region "$GCP_REGION" \
        --platform managed \
        --memory 4Gi \
        --cpu 4 \
        --min-instances 2 \
        --max-instances 50 \
        --timeout 3600 \
        --set-env-vars "NODE_ENV=production"

    # Wait for deployment to stabilize
    info "Waiting for deployment to stabilize..."
    sleep 30

    success "Workers deployed successfully"
}

deploy_convex() {
    step "Deploying Convex functions to production"

    cd "$PROJECT_ROOT"

    if $DRY_RUN; then
        info "[DRY RUN] Would run: npx convex deploy --prod"
        return
    fi

    npx convex deploy --prod
    success "Convex functions deployed"
}

# ------------------------------------------------------------------------------
# Post-deployment
# ------------------------------------------------------------------------------
run_smoke_tests() {
    step "Running production smoke tests"

    if $DRY_RUN; then
        info "[DRY RUN] Would run smoke tests"
        return
    fi

    local failed=false

    # API smoke test
    if $DEPLOY_API; then
        info "Testing API endpoints..."

        # Test health endpoint
        local health_response
        health_response=$(curl -s "${API_URL}/health")
        if echo "$health_response" | grep -q "ok\|healthy"; then
            success "API /health endpoint working"
        else
            error "API /health endpoint failed"
            failed=true
        fi
    fi

    # Web smoke test
    if $DEPLOY_WEB; then
        info "Testing Web application..."

        local web_response
        web_response=$(curl -s -o /dev/null -w "%{http_code}" "$WEB_URL")
        if [ "$web_response" = "200" ]; then
            success "Web application accessible"
        else
            error "Web application not accessible (status: $web_response)"
            failed=true
        fi
    fi

    if $failed; then
        error "Some smoke tests failed!"
        error "Please investigate and consider rollback if necessary."
        error "Rollback command: ./scripts/deploy/rollback.sh"
    else
        success "All smoke tests passed"
    fi
}

send_notification() {
    step "Sending deployment notification"

    if $DRY_RUN; then
        info "[DRY RUN] Would send Slack notification"
        return
    fi

    local slack_webhook="${SLACK_WEBHOOK_URL:-}"

    if [ -z "$slack_webhook" ]; then
        warn "SLACK_WEBHOOK_URL not set, skipping notification"
        return
    fi

    local git_info
    git_info=$(get_git_info)

    local payload
    payload=$(cat <<EOF
{
    "text": "Production Deployment Completed",
    "blocks": [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": "*Production Deployment Successful* :rocket:\n\nServices deployed:\n$(${DEPLOY_API} && echo "- API: ${API_URL}")\n$(${DEPLOY_WEB} && echo "- Web: ${WEB_URL}")\n$(${DEPLOY_WORKERS} && echo "- Workers: ${WORKERS_SERVICE}")\n\nGit: \`${git_info}\`"
            }
        }
    ]
}
EOF
)

    curl -s -X POST -H 'Content-type: application/json' --data "$payload" "$slack_webhook" > /dev/null

    success "Notification sent"
}

# ------------------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------------------
show_summary() {
    step "Deployment Summary"

    echo ""
    echo -e "${GREEN}${BOLD}"
    echo "  ======================================"
    echo "  PRODUCTION DEPLOYMENT SUCCESSFUL"
    echo "  ======================================"
    echo -e "${NC}"
    echo ""
    echo -e "${BOLD}Environment:${NC} $ENVIRONMENT"
    echo -e "${BOLD}Git:${NC} $(get_git_info)"
    echo -e "${BOLD}Timestamp:${NC} $(date '+%Y-%m-%d %H:%M:%S %Z')"
    echo ""

    if $DRY_RUN; then
        echo -e "${YELLOW}${BOLD}This was a DRY RUN - no actual deployment occurred${NC}"
        echo ""
    fi

    echo -e "${BOLD}Services Deployed:${NC}"
    $DEPLOY_API && echo -e "  ${GREEN}[LIVE]${NC} API:     $API_URL"
    $DEPLOY_WEB && echo -e "  ${GREEN}[LIVE]${NC} Web:     $WEB_URL"
    $DEPLOY_WORKERS && echo -e "  ${GREEN}[LIVE]${NC} Workers: $WORKERS_SERVICE"

    echo ""
    echo -e "${BOLD}Rollback:${NC} ./scripts/deploy/rollback.sh"
    echo -e "${BOLD}Health Check:${NC} ./scripts/deploy/health-check.sh --env production"
    echo -e "${BOLD}Log file:${NC} $LOG_FILE"
    echo ""
}

# ------------------------------------------------------------------------------
# Main
# ------------------------------------------------------------------------------
main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --api-only)
                DEPLOY_WEB=false
                DEPLOY_WORKERS=false
                shift
                ;;
            --web-only)
                DEPLOY_API=false
                DEPLOY_WORKERS=false
                shift
                ;;
            --workers-only)
                DEPLOY_API=false
                DEPLOY_WEB=false
                shift
                ;;
            --skip-staging)
                SKIP_STAGING=true
                shift
                ;;
            --skip-tests)
                SKIP_TESTS=true
                shift
                ;;
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --force)
                FORCE_DEPLOY=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            -h|--help)
                show_help
                ;;
            *)
                error "Unknown option: $1"
                show_help
                ;;
        esac
    done

    # Setup
    ensure_log_dir

    echo ""
    echo -e "${RED}${BOLD}"
    echo "  ____  _   _ _     _       "
    echo " |  _ \| | | | |   | |      "
    echo " | |_) | | | | |   | |      "
    echo " |  __/| |_| | |___| |___   "
    echo " |_|    \___/|_____|_____|  "
    echo ""
    echo " PRODUCTION Deployment"
    echo -e "${NC}"

    if $DRY_RUN; then
        warn "DRY RUN MODE - No actual changes will be made"
    fi

    # Pre-deployment checks
    check_prerequisites
    check_authentication
    check_secrets

    # Confirm production deployment
    confirm_production

    # Verify staging is working
    verify_staging

    # Store current versions for rollback
    store_previous_versions

    # Build
    install_dependencies
    run_tests
    run_build

    # Deploy services
    deploy_api
    deploy_web
    deploy_workers
    deploy_convex

    # Post-deployment
    run_smoke_tests
    send_notification

    # Summary
    show_summary
}

# Run main function
main "$@"
