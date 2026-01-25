#!/usr/bin/env bash
# =============================================================================
# Convex Backup Script for PULL Backend
# =============================================================================
#
# Features:
#   - Full data export using Convex CLI
#   - Table-level exports for selective restore
#   - Schema export for disaster recovery
#   - AES-256 encryption at rest
#   - Automatic upload to S3/GCS/R2
#   - Retention policy enforcement
#   - Integrity verification
#
# Usage:
#   ./backup-convex.sh [options]
#
# Options:
#   --tables, -t      Comma-separated list of tables (default: all)
#   --output, -o      Output directory (default: /backups/convex)
#   --upload          Upload to cloud storage after backup
#   --encrypt         Encrypt backup with GPG
#   --verify          Verify backup integrity after creation
#   --retention       Number of local backups to keep (default: 7)
#   --include-schema  Include schema export (default: true)
#   --help, -h        Show this help message
#
# Environment Variables:
#   CONVEX_URL           Convex deployment URL (required)
#   CONVEX_DEPLOY_KEY    Convex deploy key (required)
#   BACKUP_ENCRYPTION_KEY  GPG encryption key ID or passphrase
#   AWS_S3_BUCKET        S3 bucket for uploads
#   GCS_BUCKET           GCS bucket for uploads
#   R2_BUCKET            Cloudflare R2 bucket for uploads
#   SLACK_WEBHOOK_URL    Slack webhook for notifications
#   PAGERDUTY_KEY        PagerDuty integration key for critical alerts
#
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_NAME="$(basename "$0")"

# Default values
CONVEX_URL="${CONVEX_URL:-}"
CONVEX_DEPLOY_KEY="${CONVEX_DEPLOY_KEY:-}"
OUTPUT_DIR="${BACKUP_OUTPUT_DIR:-/backups/convex}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
BACKUP_TABLES=""
UPLOAD_ENABLED=false
ENCRYPT_ENABLED=false
VERIFY_ENABLED=false
INCLUDE_SCHEMA=true

# Timestamp format
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_TODAY=$(date +%Y-%m-%d)

# Backup file naming
BACKUP_PREFIX="pull_convex"
BACKUP_FILENAME="${BACKUP_PREFIX}_${TIMESTAMP}"

# Logging
LOG_FILE="${OUTPUT_DIR}/logs/backup_${TIMESTAMP}.log"

# Critical tables for PULL application
CRITICAL_TABLES=(
    "users"
    "accounts"
    "balances"
    "orders"
    "positions"
    "kycRecords"
    "audit"
)

# All tables in the Convex schema
ALL_TABLES=(
    "users"
    "accounts"
    "kycRecords"
    "balances"
    "orders"
    "positions"
    "transactions"
    "predictions"
    "predictionBets"
    "rwaAssets"
    "rwaPositions"
    "signals"
    "socialTrading"
    "rewards"
    "points"
    "gamification"
    "messaging"
    "experiments"
    "experimentAssignments"
    "experimentEvents"
    "analyticsEvents"
    "dailyMetrics"
    "emails"
    "audit"
    "agents"
    "agentMemory"
)

# =============================================================================
# Logging Functions
# =============================================================================

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] ${message}" | tee -a "${LOG_FILE}" 2>/dev/null || echo "[${timestamp}] [${level}] ${message}"
}

log_info() { log "INFO" "$@"; }
log_warn() { log "WARN" "$@"; }
log_error() { log "ERROR" "$@"; }
log_success() { log "SUCCESS" "$@"; }

# =============================================================================
# Helper Functions
# =============================================================================

show_help() {
    grep '^#' "$0" | grep -v '#!/' | sed 's/^# //' | sed 's/^#//'
    exit 0
}

check_dependencies() {
    local deps=(npx node jq gzip)

    if [[ "${UPLOAD_ENABLED}" == true ]]; then
        deps+=(aws)
    fi

    if [[ "${ENCRYPT_ENABLED}" == true ]]; then
        deps+=(gpg)
    fi

    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &>/dev/null; then
            log_error "Required dependency not found: $dep"
            exit 1
        fi
    done

    # Check if convex CLI is available
    if ! npx convex --version &>/dev/null; then
        log_warn "Convex CLI not found, attempting to install..."
        npm install -g convex || {
            log_error "Failed to install Convex CLI"
            exit 1
        }
    fi

    log_info "All dependencies available"
}

check_convex_connection() {
    log_info "Testing Convex connection to ${CONVEX_URL}"

    if [[ -z "${CONVEX_URL}" ]]; then
        log_error "CONVEX_URL environment variable is required"
        exit 1
    fi

    if [[ -z "${CONVEX_DEPLOY_KEY}" ]]; then
        log_error "CONVEX_DEPLOY_KEY environment variable is required"
        exit 1
    fi

    # Test connection by fetching deployment status
    local response
    response=$(curl -sf -H "Authorization: Convex ${CONVEX_DEPLOY_KEY}" \
        "${CONVEX_URL}/api/status" 2>/dev/null) || {
        log_error "Cannot connect to Convex deployment"
        exit 1
    }

    log_info "Convex connection successful"
}

ensure_directories() {
    mkdir -p "${OUTPUT_DIR}"/{daily,weekly,monthly,logs,tables,schema}
    log_info "Backup directories ensured at ${OUTPUT_DIR}"
}

notify_slack() {
    local status="$1"
    local message="$2"

    if [[ -z "${SLACK_WEBHOOK_URL:-}" ]]; then
        return 0
    fi

    local color="good"
    [[ "$status" == "error" ]] && color="danger"
    [[ "$status" == "warning" ]] && color="warning"

    local payload=$(cat <<EOF
{
    "attachments": [{
        "color": "${color}",
        "title": "Convex Backup - ${status^^}",
        "text": "${message}",
        "fields": [
            {"title": "Deployment", "value": "${CONVEX_URL}", "short": true},
            {"title": "Tables", "value": "${#TABLES_TO_BACKUP[@]}", "short": true},
            {"title": "Timestamp", "value": "${TIMESTAMP}", "short": true}
        ],
        "footer": "PULL Backup System",
        "ts": $(date +%s)
    }]
}
EOF
)

    curl -s -X POST -H 'Content-type: application/json' \
        --data "${payload}" \
        "${SLACK_WEBHOOK_URL}" &>/dev/null || true
}

notify_pagerduty() {
    local severity="$1"
    local summary="$2"

    if [[ -z "${PAGERDUTY_KEY:-}" ]]; then
        return 0
    fi

    local payload=$(cat <<EOF
{
    "routing_key": "${PAGERDUTY_KEY}",
    "event_action": "trigger",
    "payload": {
        "summary": "${summary}",
        "severity": "${severity}",
        "source": "pull-backup-system",
        "component": "convex-backup",
        "custom_details": {
            "deployment": "${CONVEX_URL}",
            "timestamp": "${TIMESTAMP}"
        }
    }
}
EOF
)

    curl -s -X POST -H 'Content-type: application/json' \
        --data "${payload}" \
        "https://events.pagerduty.com/v2/enqueue" &>/dev/null || true
}

# =============================================================================
# Backup Functions
# =============================================================================

export_schema() {
    log_info "Exporting Convex schema..."

    local schema_file="${OUTPUT_DIR}/schema/schema_${TIMESTAMP}.json"

    # Use Convex CLI to export schema
    # Note: This uses the Convex admin API to fetch schema definition
    local schema_response
    schema_response=$(curl -sf \
        -H "Authorization: Convex ${CONVEX_DEPLOY_KEY}" \
        -H "Content-Type: application/json" \
        "${CONVEX_URL}/api/schema" 2>/dev/null) || {
        log_warn "Could not fetch schema via API, using local schema file"
        # Fallback to local schema if available
        local local_schema="${SCRIPT_DIR}/../../packages/db/convex/schema.ts"
        if [[ -f "${local_schema}" ]]; then
            cp "${local_schema}" "${OUTPUT_DIR}/schema/schema_${TIMESTAMP}.ts"
            log_info "Local schema copied"
        fi
        return 0
    }

    echo "${schema_response}" | jq '.' > "${schema_file}"
    log_success "Schema exported: ${schema_file}"
}

export_table() {
    local table_name="$1"
    local output_file="${OUTPUT_DIR}/tables/${table_name}_${TIMESTAMP}.jsonl"

    log_info "Exporting table: ${table_name}..."

    local start_time=$(date +%s)
    local cursor=""
    local total_docs=0

    # Clear output file
    > "${output_file}"

    # Paginate through all documents in the table
    while true; do
        local query_payload
        if [[ -z "${cursor}" ]]; then
            query_payload='{"tableName":"'"${table_name}"'","limit":1000}'
        else
            query_payload='{"tableName":"'"${table_name}"'","limit":1000,"cursor":"'"${cursor}"'"}'
        fi

        local response
        response=$(curl -sf \
            -H "Authorization: Convex ${CONVEX_DEPLOY_KEY}" \
            -H "Content-Type: application/json" \
            -d "${query_payload}" \
            "${CONVEX_URL}/api/export/table" 2>/dev/null) || {
            log_error "Failed to export table: ${table_name}"
            return 1
        }

        # Extract documents and append to file
        local docs
        docs=$(echo "${response}" | jq -c '.documents[]' 2>/dev/null) || true

        if [[ -n "${docs}" ]]; then
            echo "${docs}" >> "${output_file}"
            local batch_count=$(echo "${response}" | jq '.documents | length')
            total_docs=$((total_docs + batch_count))
        fi

        # Check for next cursor
        cursor=$(echo "${response}" | jq -r '.cursor // empty' 2>/dev/null) || true

        if [[ -z "${cursor}" || "${cursor}" == "null" ]]; then
            break
        fi
    done

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    log_info "Exported ${total_docs} documents from ${table_name} in ${duration}s"

    echo "${total_docs}"
}

create_full_backup() {
    local backup_dir="${OUTPUT_DIR}/daily/${BACKUP_FILENAME}"
    mkdir -p "${backup_dir}"

    local start_time=$(date +%s)
    local total_docs=0
    local manifest=()

    log_info "Starting full Convex backup..."
    log_info "Tables to backup: ${TABLES_TO_BACKUP[*]}"

    # Export each table
    for table in "${TABLES_TO_BACKUP[@]}"; do
        local docs
        docs=$(export_table "${table}") || {
            log_error "Failed to export table: ${table}"
            # Continue with other tables but mark backup as partial
            manifest+=("{\"table\":\"${table}\",\"status\":\"failed\",\"documents\":0}")
            continue
        }

        # Move table file to backup directory
        mv "${OUTPUT_DIR}/tables/${table}_${TIMESTAMP}.jsonl" "${backup_dir}/"
        total_docs=$((total_docs + docs))
        manifest+=("{\"table\":\"${table}\",\"status\":\"success\",\"documents\":${docs}}")
    done

    # Export schema if enabled
    if [[ "${INCLUDE_SCHEMA}" == true ]]; then
        export_schema
        cp "${OUTPUT_DIR}/schema/schema_${TIMESTAMP}"* "${backup_dir}/" 2>/dev/null || true
    fi

    # Create manifest file
    local manifest_file="${backup_dir}/manifest.json"
    cat > "${manifest_file}" <<EOF
{
    "backup_type": "convex",
    "deployment_url": "${CONVEX_URL}",
    "timestamp": "${TIMESTAMP}",
    "date": "${DATE_TODAY}",
    "total_documents": ${total_docs},
    "tables": [$(IFS=,; echo "${manifest[*]}")],
    "include_schema": ${INCLUDE_SCHEMA}
}
EOF

    # Create tarball
    local compressed_file="${OUTPUT_DIR}/daily/${BACKUP_FILENAME}.tar.gz"
    local encrypted_file="${compressed_file}.enc"
    local checksum_file="${compressed_file}.sha256"

    log_info "Compressing backup..."
    tar -czf "${compressed_file}" -C "${OUTPUT_DIR}/daily" "${BACKUP_FILENAME}"

    # Remove uncompressed directory
    rm -rf "${backup_dir}"

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    local backup_size=$(du -h "${compressed_file}" | cut -f1)

    log_info "Backup completed in ${duration}s (size: ${backup_size})"

    # Generate checksum
    log_info "Generating SHA-256 checksum..."
    sha256sum "${compressed_file}" > "${checksum_file}"

    # Encrypt if enabled
    if [[ "${ENCRYPT_ENABLED}" == true ]]; then
        log_info "Encrypting backup..."
        encrypt_backup "${compressed_file}" "${encrypted_file}"
        rm -f "${compressed_file}"
        compressed_file="${encrypted_file}"
    fi

    # Create metadata
    create_metadata "${compressed_file}" "${duration}" "${total_docs}" "${backup_size}"

    BACKUP_FILE="${compressed_file}"
    BACKUP_CHECKSUM_FILE="${checksum_file}"

    log_success "Convex backup created: ${compressed_file}"
}

encrypt_backup() {
    local input_file="$1"
    local output_file="$2"

    if [[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
        gpg --batch --yes --passphrase "${BACKUP_ENCRYPTION_KEY}" \
            --symmetric --cipher-algo AES256 \
            --output "${output_file}" \
            "${input_file}"
    else
        log_error "BACKUP_ENCRYPTION_KEY not set"
        exit 1
    fi

    log_info "Backup encrypted with AES-256"
}

create_metadata() {
    local backup_file="$1"
    local duration="$2"
    local total_docs="$3"
    local backup_size="$4"

    local metadata_file="${backup_file}.metadata.json"

    cat > "${metadata_file}" <<EOF
{
    "backup_type": "convex",
    "deployment_url": "${CONVEX_URL}",
    "timestamp": "${TIMESTAMP}",
    "date": "${DATE_TODAY}",
    "duration_seconds": ${duration},
    "total_documents": ${total_docs},
    "tables_count": ${#TABLES_TO_BACKUP[@]},
    "backup_size": "${backup_size}",
    "encrypted": ${ENCRYPT_ENABLED},
    "compression": "tar.gz",
    "checksum_algorithm": "sha256",
    "backup_file": "$(basename ${backup_file})"
}
EOF

    log_info "Metadata created: ${metadata_file}"
}

# =============================================================================
# Verification Functions
# =============================================================================

verify_backup() {
    local backup_file="${BACKUP_FILE}"
    local checksum_file="${BACKUP_CHECKSUM_FILE}"

    log_info "Verifying backup integrity..."

    # Verify checksum
    if [[ -f "${checksum_file}" && "${ENCRYPT_ENABLED}" != true ]]; then
        if sha256sum -c "${checksum_file}" &>/dev/null; then
            log_success "Checksum verification passed"
        else
            log_error "Checksum verification failed"
            notify_slack "error" "Convex backup checksum verification failed"
            notify_pagerduty "critical" "Convex backup checksum verification failed"
            exit 1
        fi
    fi

    # Test archive integrity
    if [[ "${ENCRYPT_ENABLED}" != true ]]; then
        log_info "Testing archive integrity..."
        if tar -tzf "${backup_file}" &>/dev/null; then
            log_success "Archive integrity test passed"
        else
            log_error "Archive integrity test failed"
            notify_slack "error" "Convex backup archive integrity test failed"
            exit 1
        fi

        # Verify manifest exists in archive
        if tar -tzf "${backup_file}" | grep -q "manifest.json"; then
            log_success "Manifest file present in archive"
        else
            log_warn "Manifest file not found in archive"
        fi
    fi

    log_success "Backup verification completed"
}

# =============================================================================
# Upload Functions
# =============================================================================

upload_to_cloud() {
    local backup_file="${BACKUP_FILE}"
    local metadata_file="${backup_file}.metadata.json"

    log_info "Uploading backup to cloud storage..."

    # Upload to S3
    if [[ -n "${AWS_S3_BUCKET:-}" ]]; then
        upload_to_s3 "${backup_file}" "${metadata_file}"
    fi

    # Upload to GCS
    if [[ -n "${GCS_BUCKET:-}" ]]; then
        upload_to_gcs "${backup_file}" "${metadata_file}"
    fi

    # Upload to R2
    if [[ -n "${R2_BUCKET:-}" ]]; then
        upload_to_r2 "${backup_file}" "${metadata_file}"
    fi
}

upload_to_s3() {
    local backup_file="$1"
    local metadata_file="$2"
    local s3_path="s3://${AWS_S3_BUCKET}/convex/${DATE_TODAY}/"

    log_info "Uploading to S3: ${s3_path}"

    aws s3 cp "${backup_file}" "${s3_path}" \
        --sse aws:kms \
        --storage-class STANDARD_IA \
        --metadata "backup-type=convex,timestamp=${TIMESTAMP}"

    aws s3 cp "${metadata_file}" "${s3_path}"

    if [[ -f "${BACKUP_CHECKSUM_FILE}" ]]; then
        aws s3 cp "${BACKUP_CHECKSUM_FILE}" "${s3_path}"
    fi

    log_success "Uploaded to S3: ${s3_path}"
}

upload_to_gcs() {
    local backup_file="$1"
    local metadata_file="$2"
    local gcs_path="gs://${GCS_BUCKET}/convex/${DATE_TODAY}/"

    log_info "Uploading to GCS: ${gcs_path}"

    gsutil cp "${backup_file}" "${gcs_path}"
    gsutil cp "${metadata_file}" "${gcs_path}"

    if [[ -f "${BACKUP_CHECKSUM_FILE}" ]]; then
        gsutil cp "${BACKUP_CHECKSUM_FILE}" "${gcs_path}"
    fi

    log_success "Uploaded to GCS: ${gcs_path}"
}

upload_to_r2() {
    local backup_file="$1"
    local metadata_file="$2"
    local r2_path="s3://${R2_BUCKET}/convex/${DATE_TODAY}/"

    log_info "Uploading to Cloudflare R2: ${r2_path}"

    # R2 uses S3-compatible API
    aws s3 cp "${backup_file}" "${r2_path}" \
        --endpoint-url "${R2_ENDPOINT:-https://$(echo ${R2_ACCOUNT_ID}).r2.cloudflarestorage.com}" \
        --metadata "backup-type=convex,timestamp=${TIMESTAMP}"

    aws s3 cp "${metadata_file}" "${r2_path}" \
        --endpoint-url "${R2_ENDPOINT:-https://$(echo ${R2_ACCOUNT_ID}).r2.cloudflarestorage.com}"

    log_success "Uploaded to R2: ${r2_path}"
}

# =============================================================================
# Retention Functions
# =============================================================================

enforce_retention() {
    log_info "Enforcing retention policy (${RETENTION_DAYS} days)..."

    # Remove old daily backups
    find "${OUTPUT_DIR}/daily" -name "${BACKUP_PREFIX}_*.tar.gz*" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    find "${OUTPUT_DIR}/daily" -name "${BACKUP_PREFIX}_*.sha256" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    find "${OUTPUT_DIR}/daily" -name "${BACKUP_PREFIX}_*.json" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true

    # Keep weekly backups for 4 weeks
    find "${OUTPUT_DIR}/weekly" -name "${BACKUP_PREFIX}_*.tar.gz*" -mtime +28 -delete 2>/dev/null || true

    # Keep monthly backups for 12 months
    find "${OUTPUT_DIR}/monthly" -name "${BACKUP_PREFIX}_*.tar.gz*" -mtime +365 -delete 2>/dev/null || true

    # Clean old log files
    find "${OUTPUT_DIR}/logs" -name "backup_*.log" -mtime +30 -delete 2>/dev/null || true

    # Clean old table exports
    find "${OUTPUT_DIR}/tables" -name "*.jsonl" -mtime +1 -delete 2>/dev/null || true

    # Clean old schema exports
    find "${OUTPUT_DIR}/schema" -name "schema_*" -mtime +7 -delete 2>/dev/null || true

    # Create weekly backup (on Sundays)
    if [[ $(date +%u) -eq 7 ]]; then
        log_info "Creating weekly backup copy..."
        cp "${BACKUP_FILE}" "${OUTPUT_DIR}/weekly/" 2>/dev/null || true
    fi

    # Create monthly backup (on 1st of month)
    if [[ $(date +%d) -eq 01 ]]; then
        log_info "Creating monthly backup copy..."
        cp "${BACKUP_FILE}" "${OUTPUT_DIR}/monthly/" 2>/dev/null || true
    fi

    log_success "Retention policy enforced"
}

# =============================================================================
# Argument Parsing
# =============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -t|--tables)
                BACKUP_TABLES="$2"
                shift 2
                ;;
            -o|--output)
                OUTPUT_DIR="$2"
                shift 2
                ;;
            --upload)
                UPLOAD_ENABLED=true
                shift
                ;;
            --encrypt)
                ENCRYPT_ENABLED=true
                shift
                ;;
            --verify)
                VERIFY_ENABLED=true
                shift
                ;;
            --retention)
                RETENTION_DAYS="$2"
                shift 2
                ;;
            --include-schema)
                INCLUDE_SCHEMA=true
                shift
                ;;
            --no-schema)
                INCLUDE_SCHEMA=false
                shift
                ;;
            -h|--help)
                show_help
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                ;;
        esac
    done
}

# =============================================================================
# Main
# =============================================================================

main() {
    parse_args "$@"

    # Determine tables to backup
    if [[ -n "${BACKUP_TABLES}" ]]; then
        IFS=',' read -ra TABLES_TO_BACKUP <<< "${BACKUP_TABLES}"
    else
        TABLES_TO_BACKUP=("${ALL_TABLES[@]}")
    fi

    ensure_directories

    log_info "=========================================="
    log_info "Convex Backup Started"
    log_info "=========================================="
    log_info "Deployment: ${CONVEX_URL:-not set}"
    log_info "Tables: ${#TABLES_TO_BACKUP[@]}"
    log_info "Output: ${OUTPUT_DIR}"
    log_info "Encryption: ${ENCRYPT_ENABLED}"
    log_info "Upload: ${UPLOAD_ENABLED}"
    log_info "Include Schema: ${INCLUDE_SCHEMA}"
    log_info "=========================================="

    check_dependencies
    check_convex_connection

    create_full_backup

    if [[ "${VERIFY_ENABLED}" == true ]]; then
        verify_backup
    fi

    if [[ "${UPLOAD_ENABLED}" == true ]]; then
        upload_to_cloud
    fi

    enforce_retention

    log_info "=========================================="
    log_success "Convex Backup Completed Successfully"
    log_info "Backup file: ${BACKUP_FILE}"
    log_info "=========================================="

    notify_slack "success" "Convex backup completed successfully. File: $(basename ${BACKUP_FILE})"
}

main "$@"
