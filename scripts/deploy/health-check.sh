#!/usr/bin/env bash
# ==============================================================================
# PULL Backend - Health Check Script
# ==============================================================================
# Verifies all services are healthy post-deployment
#
# Usage:
#   ./scripts/deploy/health-check.sh [options]
#
# Options:
#   --env ENV       Environment to check (staging|production) [default: staging]
#   --service SVC   Check specific service only (api|web|workers|redis|temporal)
#   --verbose       Show detailed health information
#   --json          Output results in JSON format
#   --watch         Continuously monitor health (every 30s)
#   --timeout N     Timeout in seconds for each check [default: 10]
#   --quiet         Only output on failure
#   -h, --help      Show this help message
#
# Exit Codes:
#   0 - All services healthy
#   1 - One or more services unhealthy
#   2 - Invalid arguments or configuration error
# ==============================================================================

set -euo pipefail

# ------------------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Default values
ENVIRONMENT="staging"
CHECK_SERVICE=""
VERBOSE=false
JSON_OUTPUT=false
WATCH_MODE=false
TIMEOUT=10
QUIET=false

# Service endpoints by environment
declare -A STAGING_URLS=(
    ["api"]="https://api-staging.pull.com"
    ["web"]="https://staging.pull.com"
    ["temporal"]="http://localhost:7233"
)

declare -A PRODUCTION_URLS=(
    ["api"]="https://api.pull.com"
    ["web"]="https://app.pull.com"
    ["temporal"]="https://temporal.pull.com"
)

# Health status tracking
declare -A HEALTH_STATUS
declare -A HEALTH_DETAILS
OVERALL_HEALTHY=true

# ------------------------------------------------------------------------------
# Colors and Formatting
# ------------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Status indicators
ICON_OK="${GREEN}[OK]${NC}"
ICON_WARN="${YELLOW}[WARN]${NC}"
ICON_FAIL="${RED}[FAIL]${NC}"
ICON_SKIP="${BLUE}[SKIP]${NC}"

# ------------------------------------------------------------------------------
# Logging Functions
# ------------------------------------------------------------------------------
log() {
    if ! $QUIET; then
        echo -e "$1"
    fi
}

info() {
    log "${BLUE}[INFO]${NC} $1"
}

success() {
    log "${GREEN}[OK]${NC} $1"
}

warn() {
    log "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[FAIL]${NC} $1" >&2
}

verbose() {
    if $VERBOSE && ! $QUIET; then
        echo -e "  ${CYAN}$1${NC}"
    fi
}

# ------------------------------------------------------------------------------
# Helper Functions
# ------------------------------------------------------------------------------
show_help() {
    sed -n '2,21p' "$0" | sed 's/^# //' | sed 's/^#//'
    exit 0
}

get_urls() {
    if [ "$ENVIRONMENT" = "production" ]; then
        echo "${!PRODUCTION_URLS[@]}"
    else
        echo "${!STAGING_URLS[@]}"
    fi
}

get_url() {
    local service=$1
    if [ "$ENVIRONMENT" = "production" ]; then
        echo "${PRODUCTION_URLS[$service]:-}"
    else
        echo "${STAGING_URLS[$service]:-}"
    fi
}

# Check if a URL is reachable with timeout
check_url() {
    local url=$1
    local expected_status=${2:-200}

    local response
    response=$(curl -s -o /dev/null -w "%{http_code}|%{time_total}" \
        --connect-timeout "$TIMEOUT" \
        --max-time "$TIMEOUT" \
        "$url" 2>/dev/null || echo "000|0")

    local status_code
    local response_time
    status_code=$(echo "$response" | cut -d'|' -f1)
    response_time=$(echo "$response" | cut -d'|' -f2)

    if [ "$status_code" = "$expected_status" ]; then
        echo "ok|$status_code|$response_time"
    else
        echo "fail|$status_code|$response_time"
    fi
}

# Get JSON response from health endpoint
get_health_json() {
    local url=$1
    curl -s --connect-timeout "$TIMEOUT" --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "{}"
}

# ------------------------------------------------------------------------------
# Health Check Functions
# ------------------------------------------------------------------------------
check_api_health() {
    local base_url
    base_url=$(get_url "api")

    if [ -z "$base_url" ]; then
        HEALTH_STATUS["api"]="skip"
        HEALTH_DETAILS["api"]="No URL configured"
        return
    fi

    log ""
    log "${BOLD}API Service${NC}"
    log "  URL: $base_url"

    # Check main health endpoint
    local health_url="${base_url}/health"
    local result
    result=$(check_url "$health_url")

    local status response_code response_time
    status=$(echo "$result" | cut -d'|' -f1)
    response_code=$(echo "$result" | cut -d'|' -f2)
    response_time=$(echo "$result" | cut -d'|' -f3)

    if [ "$status" = "ok" ]; then
        log "  ${ICON_OK} Health endpoint: HTTP $response_code (${response_time}s)"
        HEALTH_STATUS["api"]="healthy"

        # Get detailed health info if verbose
        if $VERBOSE; then
            local health_data
            health_data=$(get_health_json "$health_url")
            verbose "Response: $health_data"
        fi
    else
        log "  ${ICON_FAIL} Health endpoint: HTTP $response_code"
        HEALTH_STATUS["api"]="unhealthy"
        HEALTH_DETAILS["api"]="HTTP $response_code"
        OVERALL_HEALTHY=false
    fi

    # Additional endpoint checks
    if $VERBOSE; then
        # Check docs endpoint
        local docs_result
        docs_result=$(check_url "${base_url}/docs")
        local docs_status
        docs_status=$(echo "$docs_result" | cut -d'|' -f1)
        if [ "$docs_status" = "ok" ]; then
            verbose "Docs endpoint: OK"
        else
            verbose "Docs endpoint: Not available"
        fi
    fi
}

check_web_health() {
    local base_url
    base_url=$(get_url "web")

    if [ -z "$base_url" ]; then
        HEALTH_STATUS["web"]="skip"
        HEALTH_DETAILS["web"]="No URL configured"
        return
    fi

    log ""
    log "${BOLD}Web Application${NC}"
    log "  URL: $base_url"

    local result
    result=$(check_url "$base_url")

    local status response_code response_time
    status=$(echo "$result" | cut -d'|' -f1)
    response_code=$(echo "$result" | cut -d'|' -f2)
    response_time=$(echo "$result" | cut -d'|' -f3)

    if [ "$status" = "ok" ]; then
        log "  ${ICON_OK} Main page: HTTP $response_code (${response_time}s)"
        HEALTH_STATUS["web"]="healthy"

        # Check for key assets if verbose
        if $VERBOSE; then
            # Check if the response contains expected content
            local content
            content=$(curl -s --connect-timeout "$TIMEOUT" "$base_url" 2>/dev/null | head -c 1000)
            if echo "$content" | grep -qi "pull\|app"; then
                verbose "Content verification: OK"
            else
                verbose "Content verification: Warning - unexpected content"
            fi
        fi
    else
        log "  ${ICON_FAIL} Main page: HTTP $response_code"
        HEALTH_STATUS["web"]="unhealthy"
        HEALTH_DETAILS["web"]="HTTP $response_code"
        OVERALL_HEALTHY=false
    fi
}

check_workers_health() {
    log ""
    log "${BOLD}Temporal Workers${NC}"

    # Check if we can access Cloud Run service info
    if ! command -v gcloud &> /dev/null; then
        log "  ${ICON_SKIP} gcloud CLI not available"
        HEALTH_STATUS["workers"]="skip"
        HEALTH_DETAILS["workers"]="gcloud not available"
        return
    fi

    local service_name
    if [ "$ENVIRONMENT" = "production" ]; then
        service_name="pull-temporal-worker"
    else
        service_name="pull-temporal-worker-staging"
    fi

    local region="${GCP_REGION:-us-central1}"

    # Get service status
    local service_info
    service_info=$(gcloud run services describe "$service_name" \
        --region "$region" \
        --format "json" 2>/dev/null || echo "{}")

    if [ "$service_info" = "{}" ]; then
        log "  ${ICON_FAIL} Service not found or not accessible"
        HEALTH_STATUS["workers"]="unhealthy"
        HEALTH_DETAILS["workers"]="Service not found"
        OVERALL_HEALTHY=false
        return
    fi

    # Parse service info
    local ready_condition
    ready_condition=$(echo "$service_info" | jq -r '.status.conditions[] | select(.type=="Ready") | .status' 2>/dev/null || echo "Unknown")

    local latest_revision
    latest_revision=$(echo "$service_info" | jq -r '.status.latestReadyRevisionName // "unknown"' 2>/dev/null)

    local url
    url=$(echo "$service_info" | jq -r '.status.url // "unknown"' 2>/dev/null)

    log "  Service: $service_name"
    log "  Region: $region"
    log "  Latest Revision: $latest_revision"

    if [ "$ready_condition" = "True" ]; then
        log "  ${ICON_OK} Status: Ready"
        HEALTH_STATUS["workers"]="healthy"

        if $VERBOSE; then
            local instance_count
            instance_count=$(echo "$service_info" | jq -r '.spec.template.spec.containerConcurrency // "default"' 2>/dev/null)
            verbose "Concurrency: $instance_count"
            verbose "URL: $url"
        fi
    else
        log "  ${ICON_FAIL} Status: Not Ready"
        HEALTH_STATUS["workers"]="unhealthy"
        HEALTH_DETAILS["workers"]="Service not ready"
        OVERALL_HEALTHY=false
    fi
}

check_redis_health() {
    log ""
    log "${BOLD}Redis Cache${NC}"

    # For production, check Upstash Redis via HTTP API
    local redis_url="${UPSTASH_REDIS_REST_URL:-}"

    if [ -n "$redis_url" ]; then
        local token="${UPSTASH_REDIS_REST_TOKEN:-}"

        if [ -z "$token" ]; then
            log "  ${ICON_SKIP} UPSTASH_REDIS_REST_TOKEN not set"
            HEALTH_STATUS["redis"]="skip"
            return
        fi

        local result
        result=$(curl -s -o /dev/null -w "%{http_code}" \
            --connect-timeout "$TIMEOUT" \
            -H "Authorization: Bearer $token" \
            "$redis_url/ping" 2>/dev/null || echo "000")

        if [ "$result" = "200" ]; then
            log "  ${ICON_OK} Upstash Redis: Connected"
            HEALTH_STATUS["redis"]="healthy"

            if $VERBOSE; then
                local info
                info=$(curl -s -H "Authorization: Bearer $token" "$redis_url/info" 2>/dev/null | jq -r '.result // "N/A"')
                verbose "Info: $info"
            fi
        else
            log "  ${ICON_FAIL} Upstash Redis: Connection failed (HTTP $result)"
            HEALTH_STATUS["redis"]="unhealthy"
            HEALTH_DETAILS["redis"]="HTTP $result"
            OVERALL_HEALTHY=false
        fi
    else
        # Check local Redis
        if command -v redis-cli &> /dev/null; then
            local redis_host="${REDIS_HOST:-localhost}"
            local redis_port="${REDIS_PORT:-6379}"

            if redis-cli -h "$redis_host" -p "$redis_port" ping &> /dev/null; then
                log "  ${ICON_OK} Local Redis: Connected ($redis_host:$redis_port)"
                HEALTH_STATUS["redis"]="healthy"
            else
                log "  ${ICON_FAIL} Local Redis: Connection failed"
                HEALTH_STATUS["redis"]="unhealthy"
                OVERALL_HEALTHY=false
            fi
        else
            log "  ${ICON_SKIP} Redis check skipped (no connection info)"
            HEALTH_STATUS["redis"]="skip"
        fi
    fi
}

check_temporal_health() {
    log ""
    log "${BOLD}Temporal Server${NC}"

    local temporal_url
    temporal_url=$(get_url "temporal")

    # Try using temporal CLI if available
    if command -v temporal &> /dev/null; then
        local namespace="${TEMPORAL_NAMESPACE:-default}"
        local address="${TEMPORAL_ADDRESS:-localhost:7233}"

        log "  Address: $address"
        log "  Namespace: $namespace"

        # Try to list namespaces as a health check
        if temporal operator namespace list --address "$address" &> /dev/null; then
            log "  ${ICON_OK} Temporal Server: Connected"
            HEALTH_STATUS["temporal"]="healthy"

            if $VERBOSE; then
                local namespaces
                namespaces=$(temporal operator namespace list --address "$address" 2>/dev/null | head -5)
                verbose "Namespaces:"
                echo "$namespaces" | while read -r line; do
                    verbose "  $line"
                done
            fi
        else
            log "  ${ICON_FAIL} Temporal Server: Connection failed"
            HEALTH_STATUS["temporal"]="unhealthy"
            HEALTH_DETAILS["temporal"]="Cannot connect to server"
            OVERALL_HEALTHY=false
        fi
    elif [ -n "$temporal_url" ]; then
        # Fallback to HTTP check
        local result
        result=$(check_url "${temporal_url}/health")
        local status
        status=$(echo "$result" | cut -d'|' -f1)

        if [ "$status" = "ok" ]; then
            log "  ${ICON_OK} Temporal UI: Accessible"
            HEALTH_STATUS["temporal"]="healthy"
        else
            log "  ${ICON_WARN} Temporal UI: Not accessible (may be expected)"
            HEALTH_STATUS["temporal"]="unknown"
        fi
    else
        log "  ${ICON_SKIP} Temporal check skipped (temporal CLI not available)"
        HEALTH_STATUS["temporal"]="skip"
    fi
}

check_database_health() {
    log ""
    log "${BOLD}Database (Convex)${NC}"

    local convex_url="${CONVEX_URL:-}"

    if [ -z "$convex_url" ]; then
        log "  ${ICON_SKIP} CONVEX_URL not set"
        HEALTH_STATUS["database"]="skip"
        return
    fi

    # Convex health check - try to reach the deployment
    local health_url="${convex_url/\.cloud/.cloud}/version"

    log "  URL: $convex_url"

    local result
    result=$(check_url "$convex_url")
    local status
    status=$(echo "$result" | cut -d'|' -f1)

    if [ "$status" = "ok" ] || [ "$(echo "$result" | cut -d'|' -f2)" = "301" ]; then
        log "  ${ICON_OK} Convex: Accessible"
        HEALTH_STATUS["database"]="healthy"
    else
        log "  ${ICON_WARN} Convex: Status unknown"
        HEALTH_STATUS["database"]="unknown"
    fi
}

# ------------------------------------------------------------------------------
# Output Formatting
# ------------------------------------------------------------------------------
output_json() {
    local json="{"
    json+="\"environment\": \"$ENVIRONMENT\","
    json+="\"timestamp\": \"$(date -Iseconds)\","
    json+="\"overall_healthy\": $OVERALL_HEALTHY,"
    json+="\"services\": {"

    local first=true
    for service in "${!HEALTH_STATUS[@]}"; do
        if ! $first; then
            json+=","
        fi
        first=false

        local details="${HEALTH_DETAILS[$service]:-}"
        json+="\"$service\": {"
        json+="\"status\": \"${HEALTH_STATUS[$service]}\""
        if [ -n "$details" ]; then
            json+=",\"details\": \"$details\""
        fi
        json+="}"
    done

    json+="}}"
    echo "$json" | jq .
}

show_summary() {
    log ""
    log "${BOLD}========================================${NC}"
    log "${BOLD}Health Check Summary - ${ENVIRONMENT^^}${NC}"
    log "${BOLD}========================================${NC}"
    log ""

    local healthy_count=0
    local unhealthy_count=0
    local skip_count=0

    for service in api web workers redis temporal database; do
        local status="${HEALTH_STATUS[$service]:-skip}"
        case $status in
            healthy)
                log "  ${ICON_OK} $service"
                ((healthy_count++))
                ;;
            unhealthy)
                log "  ${ICON_FAIL} $service: ${HEALTH_DETAILS[$service]:-unknown error}"
                ((unhealthy_count++))
                ;;
            skip)
                log "  ${ICON_SKIP} $service: skipped"
                ((skip_count++))
                ;;
            *)
                log "  ${ICON_WARN} $service: $status"
                ;;
        esac
    done

    log ""
    log "Healthy: $healthy_count | Unhealthy: $unhealthy_count | Skipped: $skip_count"
    log ""

    if $OVERALL_HEALTHY; then
        log "${GREEN}${BOLD}All checked services are healthy!${NC}"
    else
        log "${RED}${BOLD}Some services are unhealthy. Please investigate.${NC}"
    fi
}

# ------------------------------------------------------------------------------
# Watch Mode
# ------------------------------------------------------------------------------
run_watch() {
    local interval=30

    while true; do
        clear
        echo -e "${CYAN}Health Check Monitor - $(date)${NC}"
        echo -e "Environment: ${BOLD}${ENVIRONMENT}${NC} | Refresh: ${interval}s | Press Ctrl+C to exit"
        echo ""

        # Reset status
        HEALTH_STATUS=()
        HEALTH_DETAILS=()
        OVERALL_HEALTHY=true

        run_health_checks
        show_summary

        sleep "$interval"
    done
}

# ------------------------------------------------------------------------------
# Main Health Check Runner
# ------------------------------------------------------------------------------
run_health_checks() {
    if [ -n "$CHECK_SERVICE" ]; then
        case $CHECK_SERVICE in
            api) check_api_health ;;
            web) check_web_health ;;
            workers) check_workers_health ;;
            redis) check_redis_health ;;
            temporal) check_temporal_health ;;
            database) check_database_health ;;
            *)
                error "Unknown service: $CHECK_SERVICE"
                exit 2
                ;;
        esac
    else
        check_api_health
        check_web_health
        check_workers_health
        check_redis_health
        check_temporal_health
        check_database_health
    fi
}

# ------------------------------------------------------------------------------
# Main
# ------------------------------------------------------------------------------
main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --env)
                ENVIRONMENT="$2"
                shift 2
                ;;
            --service)
                CHECK_SERVICE="$2"
                shift 2
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --json)
                JSON_OUTPUT=true
                QUIET=true
                shift
                ;;
            --watch)
                WATCH_MODE=true
                shift
                ;;
            --timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            --quiet)
                QUIET=true
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

    # Validate environment
    if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
        error "Invalid environment: $ENVIRONMENT. Must be 'staging' or 'production'"
        exit 2
    fi

    # Header
    if ! $QUIET && ! $WATCH_MODE; then
        echo ""
        echo -e "${CYAN}${BOLD}PULL Health Check${NC}"
        echo -e "Environment: ${BOLD}${ENVIRONMENT}${NC}"
        echo -e "Timestamp: $(date '+%Y-%m-%d %H:%M:%S %Z')"
    fi

    # Run checks
    if $WATCH_MODE; then
        run_watch
    else
        run_health_checks

        # Output results
        if $JSON_OUTPUT; then
            output_json
        else
            show_summary
        fi
    fi

    # Exit code
    if $OVERALL_HEALTHY; then
        exit 0
    else
        exit 1
    fi
}

main "$@"
