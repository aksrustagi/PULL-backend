#!/usr/bin/env bash
# ==============================================================================
# PULL Backend - Staging Deployment Script
# ==============================================================================
# Deploys all services to the staging environment
#
# Usage:
#   ./scripts/deploy/deploy-staging.sh [options]
#
# Options:
#   --api-only      Deploy only the API service
#   --web-only      Deploy only the Web service
#   --workers-only  Deploy only the Workers service
#   --skip-tests    Skip running tests before deployment
#   --skip-build    Skip build step (use existing build artifacts)
#   --dry-run       Show what would be deployed without deploying
#   -h, --help      Show this help message
# ==============================================================================

set -euo pipefail

# ------------------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_FILE="${PROJECT_ROOT}/logs/deploy-staging-$(date +%Y%m%d-%H%M%S).log"

# Environment
ENVIRONMENT="staging"
API_URL="https://api-staging.pull.com"
WEB_URL="https://staging.pull.com"
WORKERS_SERVICE="pull-temporal-worker-staging"
GCP_REGION="${GCP_REGION:-us-central1}"

# Flags
DEPLOY_API=true
DEPLOY_WEB=true
DEPLOY_WORKERS=true
SKIP_TESTS=false
SKIP_BUILD=false
DRY_RUN=false

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
    sed -n '2,18p' "$0" | sed 's/^# //' | sed 's/^#//'
    exit 0
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        error "Required command not found: $1"
        exit 1
    fi
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

# ------------------------------------------------------------------------------
# Pre-deployment Checks
# ------------------------------------------------------------------------------
check_prerequisites() {
    step "Checking prerequisites"

    local missing=()

    # Check required commands
    for cmd in node pnpm git curl; do
        if command -v "$cmd" &> /dev/null; then
            info "Found: $cmd ($(command -v "$cmd"))"
        else
            missing+=("$cmd")
        fi
    done

    # Check optional commands based on what we're deploying
    if $DEPLOY_API && ! command -v wrangler &> /dev/null; then
        warn "wrangler not found - will attempt to install via pnpm"
    fi

    if $DEPLOY_WEB && ! command -v vercel &> /dev/null; then
        warn "vercel not found - will attempt to install via pnpm"
    fi

    if $DEPLOY_WORKERS && ! command -v gcloud &> /dev/null; then
        missing+=("gcloud")
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        error "Missing required commands: ${missing[*]}"
        error "Please install them before continuing."
        exit 1
    fi

    success "All prerequisites satisfied"
}

check_environment() {
    step "Checking environment configuration"

    # Run secrets check
    if [ -f "$SCRIPT_DIR/secrets-check.sh" ]; then
        if ! "$SCRIPT_DIR/secrets-check.sh" --env staging --quiet; then
            error "Secrets check failed. Please configure all required secrets."
            exit 1
        fi
    fi

    # Check Git status
    if [ -n "$(git -C "$PROJECT_ROOT" status --porcelain)" ]; then
        warn "Working directory has uncommitted changes"
        info "Current changes:"
        git -C "$PROJECT_ROOT" status --short
        echo ""
        read -p "Continue with deployment anyway? [y/N] " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            info "Deployment cancelled"
            exit 0
        fi
    fi

    success "Environment check passed"
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

    step "Running tests"

    cd "$PROJECT_ROOT"

    if $DRY_RUN; then
        info "[DRY RUN] Would run: pnpm test:run"
        return
    fi

    if ! pnpm test:run; then
        error "Tests failed. Aborting deployment."
        exit 1
    fi

    success "All tests passed"
}

run_build() {
    if $SKIP_BUILD; then
        warn "Skipping build (--skip-build flag)"
        return
    fi

    step "Building all packages"

    cd "$PROJECT_ROOT"

    if $DRY_RUN; then
        info "[DRY RUN] Would run: pnpm build"
        return
    fi

    pnpm build
    success "Build completed"
}

# ------------------------------------------------------------------------------
# Deployment Functions
# ------------------------------------------------------------------------------
deploy_api() {
    if ! $DEPLOY_API; then
        info "Skipping API deployment"
        return
    fi

    step "Deploying API to staging"

    cd "$PROJECT_ROOT/apps/api"

    # Ensure wrangler is available
    if ! command -v wrangler &> /dev/null; then
        info "Installing wrangler..."
        pnpm add -g wrangler
    fi

    if $DRY_RUN; then
        info "[DRY RUN] Would run: wrangler deploy --env staging"
        return
    fi

    wrangler deploy --env staging

    # Health check
    info "Running API health check..."
    local max_attempts=10
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
    exit 1
}

deploy_web() {
    if ! $DEPLOY_WEB; then
        info "Skipping Web deployment"
        return
    fi

    step "Deploying Web to staging"

    cd "$PROJECT_ROOT"

    # Ensure vercel is available
    if ! command -v vercel &> /dev/null; then
        info "Installing vercel CLI..."
        pnpm add -g vercel@latest
    fi

    if $DRY_RUN; then
        info "[DRY RUN] Would run: vercel deploy (staging)"
        return
    fi

    # Pull staging environment and deploy
    vercel pull --yes --environment=preview
    vercel build
    local url
    url=$(vercel deploy --prebuilt)

    success "Web deployed to: $url"

    # Health check
    info "Running Web health check..."
    local max_attempts=10
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        local status
        status=$(curl -s -o /dev/null -w "%{http_code}" "$url" || echo "000")

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

    step "Deploying Workers to staging"

    cd "$PROJECT_ROOT"

    # Get version tag
    local version
    version=$(git rev-parse --short HEAD)
    local image="gcr.io/${GCP_PROJECT_ID:-pull-project}/pull-temporal-worker:${version}"

    if $DRY_RUN; then
        info "[DRY RUN] Would build and push Docker image: $image"
        info "[DRY RUN] Would deploy to Cloud Run: $WORKERS_SERVICE"
        return
    fi

    # Build and push Docker image
    info "Building Docker image..."
    docker build -t "$image" -f infrastructure/temporal/Dockerfile .

    info "Pushing Docker image..."
    docker push "$image"

    # Deploy to Cloud Run
    info "Deploying to Cloud Run..."
    gcloud run deploy "$WORKERS_SERVICE" \
        --image "$image" \
        --region "$GCP_REGION" \
        --platform managed \
        --memory 2Gi \
        --cpu 2 \
        --min-instances 1 \
        --max-instances 10 \
        --set-env-vars "NODE_ENV=staging"

    success "Workers deployed successfully"
}

deploy_convex() {
    step "Deploying Convex functions"

    cd "$PROJECT_ROOT"

    if $DRY_RUN; then
        info "[DRY RUN] Would run: npx convex deploy"
        return
    fi

    npx convex deploy --preview staging
    success "Convex functions deployed"
}

# ------------------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------------------
show_summary() {
    step "Deployment Summary"

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
    $DEPLOY_API && echo -e "  ${GREEN}[OK]${NC} API:     $API_URL"
    $DEPLOY_WEB && echo -e "  ${GREEN}[OK]${NC} Web:     $WEB_URL"
    $DEPLOY_WORKERS && echo -e "  ${GREEN}[OK]${NC} Workers: $WORKERS_SERVICE"

    echo ""
    echo -e "${BOLD}Log file:${NC} $LOG_FILE"
    echo ""
    success "Staging deployment completed!"
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
            --skip-tests)
                SKIP_TESTS=true
                shift
                ;;
            --skip-build)
                SKIP_BUILD=true
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
    echo -e "${CYAN}${BOLD}"
    echo "  ____  _   _ _     _       "
    echo " |  _ \| | | | |   | |      "
    echo " | |_) | | | | |   | |      "
    echo " |  __/| |_| | |___| |___   "
    echo " |_|    \___/|_____|_____|  "
    echo ""
    echo " Staging Deployment"
    echo -e "${NC}"

    info "Starting staging deployment..."
    info "Deploying: API=$DEPLOY_API, Web=$DEPLOY_WEB, Workers=$DEPLOY_WORKERS"

    if $DRY_RUN; then
        warn "DRY RUN MODE - No actual changes will be made"
    fi

    # Execute deployment steps
    check_prerequisites
    check_environment
    install_dependencies
    run_tests
    run_build

    # Deploy services
    deploy_api
    deploy_web
    deploy_workers
    deploy_convex

    # Final summary
    show_summary
}

# Run main function
main "$@"
