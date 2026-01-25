#!/usr/bin/env bash
# =============================================================================
# Redis Backup Script for PULL Backend
# =============================================================================
#
# Features:
#   - RDB snapshot backups
#   - AOF file backups
#   - AES-256 encryption at rest
#   - Automatic upload to S3/GCS
#   - Retention policy enforcement
#   - Integrity verification
#
# Usage:
#   ./backup-redis.sh [options]
#
# Options:
#   --mode, -m        Backup mode: rdb, aof, both (default: both)
#   --output, -o      Output directory (default: /backups/redis)
#   --upload          Upload to cloud storage after backup
#   --encrypt         Encrypt backup with GPG
#   --verify          Verify backup integrity after creation
#   --retention       Number of local backups to keep (default: 7)
#   --help, -h        Show this help message
#
# Environment Variables:
#   REDIS_HOST           Redis host (default: localhost)
#   REDIS_PORT           Redis port (default: 6379)
#   REDIS_PASSWORD       Redis password (optional)
#   REDIS_DATA_DIR       Redis data directory (default: /data)
#   BACKUP_ENCRYPTION_KEY  GPG encryption key ID or passphrase
#   AWS_S3_BUCKET        S3 bucket for uploads
#   GCS_BUCKET           GCS bucket for uploads
#   SLACK_WEBHOOK_URL    Slack webhook for notifications
#
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_NAME="$(basename "$0")"

# Default values
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_DATA_DIR="${REDIS_DATA_DIR:-/data}"
OUTPUT_DIR="${BACKUP_OUTPUT_DIR:-/backups/redis}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
BACKUP_MODE="both"
UPLOAD_ENABLED=false
ENCRYPT_ENABLED=false
VERIFY_ENABLED=false

# Timestamp format
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_TODAY=$(date +%Y-%m-%d)

# Backup file naming
BACKUP_PREFIX="pull_redis"

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
    local deps=(redis-cli gzip openssl)

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

redis_cli() {
    local cmd="redis-cli -h ${REDIS_HOST} -p ${REDIS_PORT}"

    if [[ -n "${REDIS_PASSWORD:-}" ]]; then
        cmd+=" -a ${REDIS_PASSWORD}"
    fi

    # Suppress password warning
    ${cmd} "$@" 2>/dev/null
}

check_redis_connection() {
    log_info "Testing Redis connection to ${REDIS_HOST}:${REDIS_PORT}"

    local pong=$(redis_cli PING)

    if [[ "${pong}" != "PONG" ]]; then
        log_error "Cannot connect to Redis server"
        exit 1
    fi

    log_info "Redis connection successful"
}

ensure_directories() {
    mkdir -p "${OUTPUT_DIR}"/{daily,weekly,monthly,logs,temp}
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
        "title": "Redis Backup - ${status^^}",
        "text": "${message}",
        "fields": [
            {"title": "Host", "value": "${REDIS_HOST}:${REDIS_PORT}", "short": true},
            {"title": "Mode", "value": "${BACKUP_MODE}", "short": true},
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

get_redis_info() {
    local info=$(redis_cli INFO memory 2>/dev/null)

    REDIS_USED_MEMORY=$(echo "${info}" | grep "^used_memory_human:" | cut -d: -f2 | tr -d '\r')
    REDIS_KEYS=$(redis_cli DBSIZE 2>/dev/null | awk '{print $2}')

    log_info "Redis memory usage: ${REDIS_USED_MEMORY:-unknown}"
    log_info "Redis total keys: ${REDIS_KEYS:-unknown}"
}

# =============================================================================
# RDB Backup Functions
# =============================================================================

backup_rdb() {
    local backup_file="${OUTPUT_DIR}/daily/${BACKUP_PREFIX}_rdb_${TIMESTAMP}.rdb"
    local compressed_file="${backup_file}.gz"
    local encrypted_file="${compressed_file}.enc"
    local checksum_file="${compressed_file}.sha256"

    log_info "Starting RDB backup..."
    local start_time=$(date +%s)

    # Trigger BGSAVE on Redis
    log_info "Triggering Redis BGSAVE..."
    redis_cli BGSAVE

    # Wait for BGSAVE to complete
    log_info "Waiting for BGSAVE to complete..."
    local timeout=300
    local waited=0

    while [[ $(redis_cli LASTSAVE) == $(redis_cli LASTSAVE) ]]; do
        local bgsave_status=$(redis_cli INFO persistence 2>/dev/null | grep "rdb_bgsave_in_progress:" | cut -d: -f2 | tr -d '\r')

        if [[ "${bgsave_status}" == "0" ]]; then
            break
        fi

        sleep 1
        ((waited++))

        if [[ ${waited} -ge ${timeout} ]]; then
            log_error "BGSAVE timeout after ${timeout} seconds"
            exit 1
        fi
    done

    # Copy RDB file
    local rdb_source="${REDIS_DATA_DIR}/dump.rdb"

    if [[ ! -f "${rdb_source}" ]]; then
        log_error "RDB file not found at ${rdb_source}"
        exit 1
    fi

    log_info "Copying and compressing RDB file..."
    cp "${rdb_source}" "${backup_file}"
    gzip -9 "${backup_file}"

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    local backup_size=$(du -h "${compressed_file}" | cut -f1)

    log_info "RDB backup completed in ${duration}s (size: ${backup_size})"

    # Generate checksum
    sha256sum "${compressed_file}" > "${checksum_file}"

    # Encrypt if enabled
    if [[ "${ENCRYPT_ENABLED}" == true ]]; then
        log_info "Encrypting RDB backup..."
        encrypt_backup "${compressed_file}" "${encrypted_file}"
        rm -f "${compressed_file}"
        compressed_file="${encrypted_file}"
    fi

    # Create metadata
    create_metadata "rdb" "${compressed_file}" "${duration}" "${backup_size}"

    RDB_BACKUP_FILE="${compressed_file}"
    RDB_CHECKSUM_FILE="${checksum_file}"

    log_success "RDB backup created: ${compressed_file}"
}

# =============================================================================
# AOF Backup Functions
# =============================================================================

backup_aof() {
    local backup_file="${OUTPUT_DIR}/daily/${BACKUP_PREFIX}_aof_${TIMESTAMP}.aof"
    local compressed_file="${backup_file}.gz"
    local encrypted_file="${compressed_file}.enc"
    local checksum_file="${compressed_file}.sha256"

    log_info "Starting AOF backup..."
    local start_time=$(date +%s)

    # Check if AOF is enabled
    local aof_enabled=$(redis_cli CONFIG GET appendonly 2>/dev/null | tail -1)

    if [[ "${aof_enabled}" != "yes" ]]; then
        log_warn "AOF is not enabled on this Redis instance"
        return 0
    fi

    # Trigger AOF rewrite for clean state
    log_info "Triggering BGREWRITEAOF..."
    redis_cli BGREWRITEAOF

    # Wait for rewrite to complete
    log_info "Waiting for BGREWRITEAOF to complete..."
    local timeout=600
    local waited=0

    while true; do
        local aof_rewrite=$(redis_cli INFO persistence 2>/dev/null | grep "aof_rewrite_in_progress:" | cut -d: -f2 | tr -d '\r')

        if [[ "${aof_rewrite}" == "0" ]]; then
            break
        fi

        sleep 2
        ((waited+=2))

        if [[ ${waited} -ge ${timeout} ]]; then
            log_error "BGREWRITEAOF timeout after ${timeout} seconds"
            exit 1
        fi
    done

    # Get AOF filename from config
    local aof_filename=$(redis_cli CONFIG GET appendfilename 2>/dev/null | tail -1)
    local aof_source="${REDIS_DATA_DIR}/${aof_filename:-appendonly.aof}"

    # Handle new AOF format (Redis 7+) with appendonlydir
    local aof_dir=$(redis_cli CONFIG GET appenddirname 2>/dev/null | tail -1)
    if [[ -n "${aof_dir}" && -d "${REDIS_DATA_DIR}/${aof_dir}" ]]; then
        aof_source="${REDIS_DATA_DIR}/${aof_dir}"
    fi

    if [[ -f "${aof_source}" ]]; then
        log_info "Copying and compressing AOF file..."
        cp "${aof_source}" "${backup_file}"
        gzip -9 "${backup_file}"
    elif [[ -d "${aof_source}" ]]; then
        # Redis 7+ multi-part AOF
        log_info "Backing up AOF directory (Redis 7+ format)..."
        local temp_dir="${OUTPUT_DIR}/temp/aof_${TIMESTAMP}"
        mkdir -p "${temp_dir}"
        cp -r "${aof_source}"/* "${temp_dir}/"
        tar -czf "${compressed_file}" -C "${OUTPUT_DIR}/temp" "aof_${TIMESTAMP}"
        rm -rf "${temp_dir}"
    else
        log_warn "AOF file/directory not found at ${aof_source}"
        return 0
    fi

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    local backup_size=$(du -h "${compressed_file}" | cut -f1)

    log_info "AOF backup completed in ${duration}s (size: ${backup_size})"

    # Generate checksum
    sha256sum "${compressed_file}" > "${checksum_file}"

    # Encrypt if enabled
    if [[ "${ENCRYPT_ENABLED}" == true ]]; then
        log_info "Encrypting AOF backup..."
        encrypt_backup "${compressed_file}" "${encrypted_file}"
        rm -f "${compressed_file}"
        compressed_file="${encrypted_file}"
    fi

    # Create metadata
    create_metadata "aof" "${compressed_file}" "${duration}" "${backup_size}"

    AOF_BACKUP_FILE="${compressed_file}"
    AOF_CHECKSUM_FILE="${checksum_file}"

    log_success "AOF backup created: ${compressed_file}"
}

# =============================================================================
# Common Functions
# =============================================================================

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
    local backup_type="$1"
    local backup_file="$2"
    local duration="$3"
    local backup_size="$4"

    local metadata_file="${backup_file}.metadata.json"

    cat > "${metadata_file}" <<EOF
{
    "backup_type": "redis_${backup_type}",
    "host": "${REDIS_HOST}:${REDIS_PORT}",
    "timestamp": "${TIMESTAMP}",
    "date": "${DATE_TODAY}",
    "duration_seconds": ${duration},
    "redis_memory": "${REDIS_USED_MEMORY:-unknown}",
    "redis_keys": "${REDIS_KEYS:-unknown}",
    "backup_size": "${backup_size}",
    "encrypted": ${ENCRYPT_ENABLED},
    "compression": "gzip",
    "checksum_algorithm": "sha256",
    "redis_version": "$(redis_cli INFO server 2>/dev/null | grep redis_version | cut -d: -f2 | tr -d '\r')",
    "backup_file": "$(basename ${backup_file})"
}
EOF

    log_info "Metadata created: ${metadata_file}"
}

# =============================================================================
# Verification Functions
# =============================================================================

verify_rdb_backup() {
    if [[ -z "${RDB_BACKUP_FILE:-}" ]]; then
        return 0
    fi

    log_info "Verifying RDB backup integrity..."

    local checksum_file="${RDB_CHECKSUM_FILE}"

    if [[ -f "${checksum_file}" && "${ENCRYPT_ENABLED}" != true ]]; then
        if sha256sum -c "${checksum_file}" &>/dev/null; then
            log_success "RDB checksum verification passed"
        else
            log_error "RDB checksum verification failed"
            notify_slack "error" "RDB backup checksum verification failed"
            exit 1
        fi
    fi

    # Test decompression
    if [[ "${ENCRYPT_ENABLED}" != true ]]; then
        if gzip -t "${RDB_BACKUP_FILE}" 2>/dev/null; then
            log_success "RDB decompression test passed"
        else
            log_error "RDB decompression test failed"
            exit 1
        fi
    fi
}

verify_aof_backup() {
    if [[ -z "${AOF_BACKUP_FILE:-}" ]]; then
        return 0
    fi

    log_info "Verifying AOF backup integrity..."

    local checksum_file="${AOF_CHECKSUM_FILE}"

    if [[ -f "${checksum_file}" && "${ENCRYPT_ENABLED}" != true ]]; then
        if sha256sum -c "${checksum_file}" &>/dev/null; then
            log_success "AOF checksum verification passed"
        else
            log_error "AOF checksum verification failed"
            notify_slack "error" "AOF backup checksum verification failed"
            exit 1
        fi
    fi
}

# =============================================================================
# Upload Functions
# =============================================================================

upload_to_cloud() {
    log_info "Uploading backups to cloud storage..."

    # Upload RDB backup
    if [[ -n "${RDB_BACKUP_FILE:-}" ]]; then
        if [[ -n "${AWS_S3_BUCKET:-}" ]]; then
            upload_to_s3 "${RDB_BACKUP_FILE}"
        fi
        if [[ -n "${GCS_BUCKET:-}" ]]; then
            upload_to_gcs "${RDB_BACKUP_FILE}"
        fi
    fi

    # Upload AOF backup
    if [[ -n "${AOF_BACKUP_FILE:-}" ]]; then
        if [[ -n "${AWS_S3_BUCKET:-}" ]]; then
            upload_to_s3 "${AOF_BACKUP_FILE}"
        fi
        if [[ -n "${GCS_BUCKET:-}" ]]; then
            upload_to_gcs "${AOF_BACKUP_FILE}"
        fi
    fi
}

upload_to_s3() {
    local backup_file="$1"
    local metadata_file="${backup_file}.metadata.json"
    local s3_path="s3://${AWS_S3_BUCKET}/redis/${DATE_TODAY}/"

    log_info "Uploading to S3: ${s3_path}"

    aws s3 cp "${backup_file}" "${s3_path}" \
        --sse aws:kms \
        --storage-class STANDARD_IA \
        --metadata "backup-type=redis,timestamp=${TIMESTAMP}"

    aws s3 cp "${metadata_file}" "${s3_path}"

    log_success "Uploaded to S3: ${s3_path}$(basename ${backup_file})"
}

upload_to_gcs() {
    local backup_file="$1"
    local metadata_file="${backup_file}.metadata.json"
    local gcs_path="gs://${GCS_BUCKET}/redis/${DATE_TODAY}/"

    log_info "Uploading to GCS: ${gcs_path}"

    gsutil cp "${backup_file}" "${gcs_path}"
    gsutil cp "${metadata_file}" "${gcs_path}"

    log_success "Uploaded to GCS: ${gcs_path}$(basename ${backup_file})"
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

    # Clean temp directory
    rm -rf "${OUTPUT_DIR}/temp"/* 2>/dev/null || true

    # Create weekly backup (on Sundays)
    if [[ $(date +%u) -eq 7 ]]; then
        log_info "Creating weekly backup copies..."
        [[ -n "${RDB_BACKUP_FILE:-}" ]] && cp "${RDB_BACKUP_FILE}" "${OUTPUT_DIR}/weekly/" 2>/dev/null || true
        [[ -n "${AOF_BACKUP_FILE:-}" ]] && cp "${AOF_BACKUP_FILE}" "${OUTPUT_DIR}/weekly/" 2>/dev/null || true
    fi

    # Create monthly backup (on 1st of month)
    if [[ $(date +%d) -eq 01 ]]; then
        log_info "Creating monthly backup copies..."
        [[ -n "${RDB_BACKUP_FILE:-}" ]] && cp "${RDB_BACKUP_FILE}" "${OUTPUT_DIR}/monthly/" 2>/dev/null || true
        [[ -n "${AOF_BACKUP_FILE:-}" ]] && cp "${AOF_BACKUP_FILE}" "${OUTPUT_DIR}/monthly/" 2>/dev/null || true
    fi

    log_success "Retention policy enforced"
}

# =============================================================================
# Argument Parsing
# =============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -m|--mode)
                BACKUP_MODE="$2"
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

    ensure_directories

    log_info "=========================================="
    log_info "Redis Backup Started"
    log_info "=========================================="
    log_info "Host: ${REDIS_HOST}:${REDIS_PORT}"
    log_info "Mode: ${BACKUP_MODE}"
    log_info "Output: ${OUTPUT_DIR}"
    log_info "Encryption: ${ENCRYPT_ENABLED}"
    log_info "Upload: ${UPLOAD_ENABLED}"
    log_info "=========================================="

    check_dependencies
    check_redis_connection
    get_redis_info

    # Perform backups based on mode
    case "${BACKUP_MODE}" in
        rdb)
            backup_rdb
            ;;
        aof)
            backup_aof
            ;;
        both)
            backup_rdb
            backup_aof
            ;;
        *)
            log_error "Invalid backup mode: ${BACKUP_MODE}"
            exit 1
            ;;
    esac

    if [[ "${VERIFY_ENABLED}" == true ]]; then
        verify_rdb_backup
        verify_aof_backup
    fi

    if [[ "${UPLOAD_ENABLED}" == true ]]; then
        upload_to_cloud
    fi

    enforce_retention

    log_info "=========================================="
    log_success "Redis Backup Completed Successfully"
    [[ -n "${RDB_BACKUP_FILE:-}" ]] && log_info "RDB: ${RDB_BACKUP_FILE}"
    [[ -n "${AOF_BACKUP_FILE:-}" ]] && log_info "AOF: ${AOF_BACKUP_FILE}"
    log_info "=========================================="

    notify_slack "success" "Redis backup completed successfully (mode: ${BACKUP_MODE})"
}

main "$@"
