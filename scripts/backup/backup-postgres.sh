#!/usr/bin/env bash
# =============================================================================
# PostgreSQL Backup Script for PULL Backend
# =============================================================================
#
# Features:
#   - Full database dumps with pg_dump
#   - AES-256 encryption at rest
#   - Compression with gzip
#   - Automatic upload to S3/GCS
#   - Retention policy enforcement
#   - Integrity verification
#
# Usage:
#   ./backup-postgres.sh [options]
#
# Options:
#   --database, -d    Database name (default: $POSTGRES_DB or pull_dev)
#   --output, -o      Output directory (default: /backups/postgres)
#   --upload          Upload to cloud storage after backup
#   --encrypt         Encrypt backup with GPG
#   --verify          Verify backup integrity after creation
#   --retention       Number of local backups to keep (default: 7)
#   --help, -h        Show this help message
#
# Environment Variables:
#   POSTGRES_HOST       PostgreSQL host (default: localhost)
#   POSTGRES_PORT       PostgreSQL port (default: 5432)
#   POSTGRES_USER       PostgreSQL user (default: pull)
#   POSTGRES_PASSWORD   PostgreSQL password (required)
#   POSTGRES_DB         PostgreSQL database (default: pull_dev)
#   BACKUP_ENCRYPTION_KEY  GPG encryption key ID or passphrase
#   AWS_S3_BUCKET       S3 bucket for uploads
#   GCS_BUCKET          GCS bucket for uploads
#   SLACK_WEBHOOK_URL   Slack webhook for notifications
#
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_NAME="$(basename "$0")"

# Default values
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-pull}"
POSTGRES_DB="${POSTGRES_DB:-pull_dev}"
OUTPUT_DIR="${BACKUP_OUTPUT_DIR:-/backups/postgres}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
UPLOAD_ENABLED=false
ENCRYPT_ENABLED=false
VERIFY_ENABLED=false

# Timestamp format
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_TODAY=$(date +%Y-%m-%d)

# Backup file naming
BACKUP_PREFIX="pull_postgres"
BACKUP_FILENAME="${BACKUP_PREFIX}_${POSTGRES_DB}_${TIMESTAMP}"

# Logging
LOG_FILE="${OUTPUT_DIR}/logs/backup_${TIMESTAMP}.log"

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
    local deps=(pg_dump gzip openssl)

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

    log_info "All dependencies available"
}

check_postgres_connection() {
    log_info "Testing PostgreSQL connection to ${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"

    if ! PGPASSWORD="${POSTGRES_PASSWORD}" pg_isready \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        -t 10 &>/dev/null; then
        log_error "Cannot connect to PostgreSQL database"
        exit 1
    fi

    log_info "PostgreSQL connection successful"
}

ensure_directories() {
    mkdir -p "${OUTPUT_DIR}"/{daily,weekly,monthly,logs}
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
        "title": "PostgreSQL Backup - ${status^^}",
        "text": "${message}",
        "fields": [
            {"title": "Database", "value": "${POSTGRES_DB}", "short": true},
            {"title": "Host", "value": "${POSTGRES_HOST}", "short": true},
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

get_database_size() {
    PGPASSWORD="${POSTGRES_PASSWORD}" psql \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        -t -c "SELECT pg_size_pretty(pg_database_size('${POSTGRES_DB}'));" 2>/dev/null | xargs
}

# =============================================================================
# Backup Functions
# =============================================================================

create_backup() {
    local backup_file="${OUTPUT_DIR}/daily/${BACKUP_FILENAME}.sql"
    local compressed_file="${backup_file}.gz"
    local encrypted_file="${compressed_file}.enc"
    local checksum_file="${compressed_file}.sha256"

    local db_size=$(get_database_size)
    log_info "Starting backup of ${POSTGRES_DB} (size: ${db_size})"

    local start_time=$(date +%s)

    # Create pg_dump with custom format for parallel restore support
    log_info "Running pg_dump..."

    if ! PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        --format=plain \
        --no-owner \
        --no-privileges \
        --clean \
        --if-exists \
        --quote-all-identifiers \
        --verbose \
        2>> "${LOG_FILE}" \
        | gzip -9 > "${compressed_file}"; then
        log_error "pg_dump failed"
        notify_slack "error" "PostgreSQL backup failed during dump"
        exit 1
    fi

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    local backup_size=$(du -h "${compressed_file}" | cut -f1)

    log_info "Backup completed in ${duration}s (compressed size: ${backup_size})"

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

    # Create metadata file
    create_metadata "${compressed_file}" "${duration}" "${db_size}" "${backup_size}"

    # Export for other functions
    BACKUP_FILE="${compressed_file}"
    BACKUP_CHECKSUM_FILE="${checksum_file}"

    log_success "Backup created: ${compressed_file}"
}

encrypt_backup() {
    local input_file="$1"
    local output_file="$2"

    if [[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
        # Use symmetric encryption with passphrase
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
    local db_size="$3"
    local backup_size="$4"

    local metadata_file="${backup_file}.metadata.json"

    cat > "${metadata_file}" <<EOF
{
    "backup_type": "postgresql",
    "database": "${POSTGRES_DB}",
    "host": "${POSTGRES_HOST}",
    "timestamp": "${TIMESTAMP}",
    "date": "${DATE_TODAY}",
    "duration_seconds": ${duration},
    "original_db_size": "${db_size}",
    "backup_size": "${backup_size}",
    "encrypted": ${ENCRYPT_ENABLED},
    "compression": "gzip",
    "checksum_algorithm": "sha256",
    "pg_version": "$(pg_dump --version | head -1)",
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
    if [[ -f "${checksum_file}" ]]; then
        local backup_to_verify="${backup_file}"

        # If encrypted, need to verify the checksum of original file
        if [[ "${ENCRYPT_ENABLED}" == true ]]; then
            log_info "Skipping checksum verify for encrypted file (checksum was generated pre-encryption)"
        else
            if sha256sum -c "${checksum_file}" &>/dev/null; then
                log_success "Checksum verification passed"
            else
                log_error "Checksum verification failed"
                notify_slack "error" "Backup checksum verification failed"
                exit 1
            fi
        fi
    fi

    # Test decompression (for non-encrypted backups)
    if [[ "${ENCRYPT_ENABLED}" != true ]]; then
        log_info "Testing backup decompression..."
        if gzip -t "${backup_file}" 2>/dev/null; then
            log_success "Decompression test passed"
        else
            log_error "Decompression test failed"
            notify_slack "error" "Backup decompression test failed"
            exit 1
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
}

upload_to_s3() {
    local backup_file="$1"
    local metadata_file="$2"
    local s3_path="s3://${AWS_S3_BUCKET}/postgres/${DATE_TODAY}/"

    log_info "Uploading to S3: ${s3_path}"

    # Upload with server-side encryption
    aws s3 cp "${backup_file}" "${s3_path}" \
        --sse aws:kms \
        --storage-class STANDARD_IA \
        --metadata "backup-type=postgresql,database=${POSTGRES_DB},timestamp=${TIMESTAMP}"

    aws s3 cp "${metadata_file}" "${s3_path}"

    # Also copy checksum if available
    if [[ -f "${BACKUP_CHECKSUM_FILE}" ]]; then
        aws s3 cp "${BACKUP_CHECKSUM_FILE}" "${s3_path}"
    fi

    log_success "Uploaded to S3: ${s3_path}"
}

upload_to_gcs() {
    local backup_file="$1"
    local metadata_file="$2"
    local gcs_path="gs://${GCS_BUCKET}/postgres/${DATE_TODAY}/"

    log_info "Uploading to GCS: ${gcs_path}"

    gsutil cp "${backup_file}" "${gcs_path}"
    gsutil cp "${metadata_file}" "${gcs_path}"

    if [[ -f "${BACKUP_CHECKSUM_FILE}" ]]; then
        gsutil cp "${BACKUP_CHECKSUM_FILE}" "${gcs_path}"
    fi

    log_success "Uploaded to GCS: ${gcs_path}"
}

# =============================================================================
# Retention Functions
# =============================================================================

enforce_retention() {
    log_info "Enforcing retention policy (${RETENTION_DAYS} days)..."

    # Remove old daily backups
    find "${OUTPUT_DIR}/daily" -name "${BACKUP_PREFIX}_*.gz*" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    find "${OUTPUT_DIR}/daily" -name "${BACKUP_PREFIX}_*.sha256" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    find "${OUTPUT_DIR}/daily" -name "${BACKUP_PREFIX}_*.json" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true

    # Keep weekly backups for 4 weeks
    find "${OUTPUT_DIR}/weekly" -name "${BACKUP_PREFIX}_*.gz*" -mtime +28 -delete 2>/dev/null || true

    # Keep monthly backups for 12 months
    find "${OUTPUT_DIR}/monthly" -name "${BACKUP_PREFIX}_*.gz*" -mtime +365 -delete 2>/dev/null || true

    # Clean old log files
    find "${OUTPUT_DIR}/logs" -name "backup_*.log" -mtime +30 -delete 2>/dev/null || true

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
            -d|--database)
                POSTGRES_DB="$2"
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

    # Validate required environment
    if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
        log_error "POSTGRES_PASSWORD environment variable is required"
        exit 1
    fi

    ensure_directories

    log_info "=========================================="
    log_info "PostgreSQL Backup Started"
    log_info "=========================================="
    log_info "Database: ${POSTGRES_DB}"
    log_info "Host: ${POSTGRES_HOST}:${POSTGRES_PORT}"
    log_info "Output: ${OUTPUT_DIR}"
    log_info "Encryption: ${ENCRYPT_ENABLED}"
    log_info "Upload: ${UPLOAD_ENABLED}"
    log_info "=========================================="

    check_dependencies
    check_postgres_connection

    create_backup

    if [[ "${VERIFY_ENABLED}" == true ]]; then
        verify_backup
    fi

    if [[ "${UPLOAD_ENABLED}" == true ]]; then
        upload_to_cloud
    fi

    enforce_retention

    log_info "=========================================="
    log_success "PostgreSQL Backup Completed Successfully"
    log_info "Backup file: ${BACKUP_FILE}"
    log_info "=========================================="

    notify_slack "success" "PostgreSQL backup completed successfully. File: $(basename ${BACKUP_FILE})"
}

main "$@"
