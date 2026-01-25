#!/usr/bin/env bash
# =============================================================================
# Redis Restore Script for PULL Backend
# =============================================================================
#
# Features:
#   - Restore from RDB snapshots
#   - Restore from AOF files
#   - Support for encrypted backups
#   - Pre-restore backup creation
#   - Dry-run mode for validation
#
# Usage:
#   ./restore-redis.sh [options] <backup_file>
#
# Options:
#   --mode, -m        Restore mode: rdb, aof (default: auto-detect)
#   --dry-run         Validate backup without restoring
#   --no-backup       Skip creating backup before restore
#   --decrypt         Decrypt backup before restoring
#   --force           Skip confirmation prompts
#   --restart         Restart Redis after restore (required for RDB)
#   --help, -h        Show this help message
#
# Environment Variables:
#   REDIS_HOST           Redis host (default: localhost)
#   REDIS_PORT           Redis port (default: 6379)
#   REDIS_PASSWORD       Redis password (optional)
#   REDIS_DATA_DIR       Redis data directory (default: /data)
#   BACKUP_ENCRYPTION_KEY  GPG decryption key/passphrase
#
# Examples:
#   ./restore-redis.sh /backups/redis/daily/pull_redis_rdb_20240101.rdb.gz
#   ./restore-redis.sh --decrypt /backups/redis/daily/backup.rdb.gz.enc
#   ./restore-redis.sh --mode rdb --restart /backups/redis/daily/backup.rdb.gz
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
RESTORE_DIR="${RESTORE_DIR:-/tmp/restore}"

# Options
RESTORE_MODE=""
DRY_RUN=false
CREATE_BACKUP=true
DECRYPT_BACKUP=false
FORCE_RESTORE=false
RESTART_REDIS=false
BACKUP_FILE=""

# Timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# =============================================================================
# Logging Functions
# =============================================================================

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local color=""
    local reset="\033[0m"

    case "${level}" in
        INFO)    color="\033[0;34m" ;;
        WARN)    color="\033[0;33m" ;;
        ERROR)   color="\033[0;31m" ;;
        SUCCESS) color="\033[0;32m" ;;
    esac

    echo -e "${color}[${timestamp}] [${level}] ${message}${reset}"
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
    local deps=(redis-cli gunzip)

    if [[ "${DECRYPT_BACKUP}" == true ]]; then
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

    ${cmd} "$@" 2>/dev/null
}

check_redis_connection() {
    log_info "Testing Redis connection..."

    local pong=$(redis_cli PING)

    if [[ "${pong}" != "PONG" ]]; then
        log_error "Cannot connect to Redis server"
        exit 1
    fi

    log_success "Redis connection verified"
}

ensure_directories() {
    mkdir -p "${RESTORE_DIR}"
}

validate_backup_file() {
    if [[ -z "${BACKUP_FILE}" ]]; then
        log_error "No backup file specified"
        show_help
    fi

    if [[ ! -f "${BACKUP_FILE}" ]]; then
        log_error "Backup file not found: ${BACKUP_FILE}"
        exit 1
    fi

    log_info "Backup file found: ${BACKUP_FILE}"
    log_info "File size: $(du -h "${BACKUP_FILE}" | cut -f1)"

    # Auto-detect mode if not specified
    if [[ -z "${RESTORE_MODE}" ]]; then
        if [[ "${BACKUP_FILE}" == *"rdb"* ]]; then
            RESTORE_MODE="rdb"
        elif [[ "${BACKUP_FILE}" == *"aof"* ]]; then
            RESTORE_MODE="aof"
        else
            log_error "Cannot auto-detect backup type. Please specify --mode rdb or --mode aof"
            exit 1
        fi
        log_info "Auto-detected restore mode: ${RESTORE_MODE}"
    fi
}

confirm_restore() {
    if [[ "${FORCE_RESTORE}" == true ]]; then
        return 0
    fi

    log_warn "=========================================="
    log_warn "WARNING: This will restore Redis data"
    log_warn "=========================================="
    log_warn "Target: ${REDIS_HOST}:${REDIS_PORT}"
    log_warn "Mode: ${RESTORE_MODE}"
    log_warn "Backup: ${BACKUP_FILE}"

    if [[ "${RESTORE_MODE}" == "rdb" && "${RESTART_REDIS}" != true ]]; then
        log_warn "NOTE: RDB restore requires Redis restart (use --restart)"
    fi

    log_warn "=========================================="

    read -p "Are you sure you want to proceed? (yes/no): " -r
    echo

    if [[ ! "${REPLY}" =~ ^[Yy][Ee][Ss]$ ]]; then
        log_info "Restore cancelled by user"
        exit 0
    fi
}

# =============================================================================
# Backup Functions
# =============================================================================

create_pre_restore_backup() {
    if [[ "${CREATE_BACKUP}" != true ]]; then
        log_warn "Skipping pre-restore backup (--no-backup specified)"
        return 0
    fi

    log_info "Creating backup of current Redis state..."

    # Trigger BGSAVE
    redis_cli BGSAVE

    # Wait for completion
    sleep 2
    while [[ $(redis_cli INFO persistence 2>/dev/null | grep "rdb_bgsave_in_progress:" | cut -d: -f2 | tr -d '\r') == "1" ]]; do
        sleep 1
    done

    # Copy current RDB
    local pre_backup="${RESTORE_DIR}/pre_restore_redis_${TIMESTAMP}.rdb"

    if [[ -f "${REDIS_DATA_DIR}/dump.rdb" ]]; then
        cp "${REDIS_DATA_DIR}/dump.rdb" "${pre_backup}"
        gzip "${pre_backup}"
        log_success "Pre-restore backup created: ${pre_backup}.gz"
    else
        log_warn "Could not create pre-restore backup (no existing RDB file)"
    fi
}

# =============================================================================
# Restore Functions
# =============================================================================

prepare_backup_file() {
    local source_file="${BACKUP_FILE}"
    local work_file=""

    # Determine output extension based on mode
    case "${RESTORE_MODE}" in
        rdb) work_file="${RESTORE_DIR}/restore_${TIMESTAMP}.rdb" ;;
        aof) work_file="${RESTORE_DIR}/restore_${TIMESTAMP}.aof" ;;
    esac

    # Decrypt if needed
    if [[ "${DECRYPT_BACKUP}" == true ]] || [[ "${source_file}" == *.enc ]]; then
        log_info "Decrypting backup..."

        if [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
            log_error "BACKUP_ENCRYPTION_KEY not set for decryption"
            exit 1
        fi

        local decrypted_file="${RESTORE_DIR}/decrypted_${TIMESTAMP}.gz"

        gpg --batch --yes --passphrase "${BACKUP_ENCRYPTION_KEY}" \
            --decrypt \
            --output "${decrypted_file}" \
            "${source_file}"

        source_file="${decrypted_file}"
        log_success "Backup decrypted"
    fi

    # Decompress
    if [[ "${source_file}" == *.gz ]]; then
        log_info "Decompressing backup..."
        gunzip -c "${source_file}" > "${work_file}"
        log_success "Backup decompressed"
    elif [[ "${source_file}" == *.tar.gz ]]; then
        # Handle Redis 7+ AOF directory format
        log_info "Extracting AOF archive..."
        tar -xzf "${source_file}" -C "${RESTORE_DIR}"
        work_file="${RESTORE_DIR}/aof_*"
        log_success "AOF archive extracted"
    else
        cp "${source_file}" "${work_file}"
    fi

    PREPARED_BACKUP="${work_file}"
    log_info "Prepared backup file: ${PREPARED_BACKUP}"
}

validate_backup_content() {
    log_info "Validating backup content..."

    case "${RESTORE_MODE}" in
        rdb)
            # Check RDB magic bytes
            local magic=$(head -c 5 "${PREPARED_BACKUP}" 2>/dev/null || echo "")
            if [[ "${magic}" != "REDIS" ]]; then
                log_error "Invalid RDB file (missing REDIS magic bytes)"
                exit 1
            fi
            log_success "RDB file validation passed"
            ;;
        aof)
            # Check for AOF commands
            if head -20 "${PREPARED_BACKUP}" 2>/dev/null | grep -qE "^\*[0-9]+" || \
               [[ -d "${PREPARED_BACKUP}" ]]; then
                log_success "AOF file validation passed"
            else
                log_error "Invalid AOF file format"
                exit 1
            fi
            ;;
    esac
}

restore_rdb() {
    log_info "Restoring RDB snapshot..."

    if [[ "${RESTART_REDIS}" != true ]]; then
        log_warn "=========================================="
        log_warn "RDB restore requires Redis restart!"
        log_warn "The backup file has been prepared at:"
        log_warn "${PREPARED_BACKUP}"
        log_warn ""
        log_warn "To complete the restore manually:"
        log_warn "1. Stop Redis: redis-cli SHUTDOWN NOSAVE"
        log_warn "2. Copy file: cp ${PREPARED_BACKUP} ${REDIS_DATA_DIR}/dump.rdb"
        log_warn "3. Start Redis"
        log_warn ""
        log_warn "Or re-run with --restart flag"
        log_warn "=========================================="
        return 0
    fi

    # Copy RDB file to Redis data directory
    local target_rdb="${REDIS_DATA_DIR}/dump.rdb"

    log_info "Copying RDB file to ${target_rdb}..."

    # If running in container, we need special handling
    if [[ -w "${REDIS_DATA_DIR}" ]]; then
        cp "${PREPARED_BACKUP}" "${target_rdb}"
        chmod 644 "${target_rdb}"
    else
        log_error "Cannot write to Redis data directory: ${REDIS_DATA_DIR}"
        log_warn "Ensure this script runs with appropriate permissions"
        exit 1
    fi

    # Restart Redis to load new RDB
    log_info "Restarting Redis to load new data..."

    # Try graceful shutdown first
    redis_cli SHUTDOWN NOSAVE 2>/dev/null || true

    # Wait for shutdown
    sleep 2

    # Check if we need to start Redis (depends on your setup)
    log_warn "Redis has been shut down. Please start Redis manually or via your orchestrator."
    log_warn "Kubernetes/Docker will automatically restart the container."

    # Wait for Redis to come back
    local attempts=0
    local max_attempts=30

    while [[ ${attempts} -lt ${max_attempts} ]]; do
        if redis_cli PING 2>/dev/null | grep -q "PONG"; then
            log_success "Redis is back online"
            break
        fi
        ((attempts++))
        sleep 2
    done

    if [[ ${attempts} -ge ${max_attempts} ]]; then
        log_warn "Redis did not come back online within timeout"
        log_warn "Please verify Redis startup manually"
    fi

    log_success "RDB restore completed"
}

restore_aof() {
    log_info "Restoring from AOF file..."

    # For AOF restore, we can use FLUSHALL + replay approach
    # Or replace the AOF file and restart

    log_warn "=========================================="
    log_warn "AOF Restore Options:"
    log_warn ""
    log_warn "Option 1 - Replace AOF file (requires restart):"
    log_warn "1. Stop Redis: redis-cli SHUTDOWN NOSAVE"
    log_warn "2. Copy AOF: cp ${PREPARED_BACKUP} ${REDIS_DATA_DIR}/appendonly.aof"
    log_warn "3. Start Redis"
    log_warn ""
    log_warn "Option 2 - Replay via redis-cli (live restore):"
    log_warn "1. FLUSHALL (if needed)"
    log_warn "2. cat ${PREPARED_BACKUP} | redis-cli --pipe"
    log_warn ""
    log_warn "The prepared AOF file is at: ${PREPARED_BACKUP}"
    log_warn "=========================================="

    if [[ "${RESTART_REDIS}" == true ]]; then
        local target_aof="${REDIS_DATA_DIR}/appendonly.aof"

        # Handle Redis 7+ AOF directory format
        local aof_dir=$(redis_cli CONFIG GET appenddirname 2>/dev/null | tail -1)
        if [[ -n "${aof_dir}" ]]; then
            target_aof="${REDIS_DATA_DIR}/${aof_dir}"
        fi

        log_info "Stopping Redis..."
        redis_cli SHUTDOWN NOSAVE 2>/dev/null || true
        sleep 2

        if [[ -d "${PREPARED_BACKUP}" ]]; then
            # Redis 7+ format
            rm -rf "${target_aof}" 2>/dev/null || true
            cp -r "${PREPARED_BACKUP}" "${target_aof}"
        else
            cp "${PREPARED_BACKUP}" "${target_aof}"
        fi

        chmod -R 644 "${target_aof}" 2>/dev/null || true

        log_warn "Redis has been shut down. Please restart Redis to load AOF data."
        log_success "AOF restore completed"
    fi
}

verify_restore() {
    log_info "Verifying restore..."

    # Wait for Redis to be available
    local attempts=0
    while [[ ${attempts} -lt 10 ]]; do
        if redis_cli PING 2>/dev/null | grep -q "PONG"; then
            break
        fi
        ((attempts++))
        sleep 1
    done

    if ! redis_cli PING 2>/dev/null | grep -q "PONG"; then
        log_warn "Redis not available for verification"
        return 0
    fi

    # Get database info
    local dbsize=$(redis_cli DBSIZE 2>/dev/null | awk '{print $2}')
    local info=$(redis_cli INFO keyspace 2>/dev/null)

    log_info "Database size: ${dbsize:-unknown} keys"
    log_info "Keyspace info:"
    echo "${info}"

    # Check memory usage
    local memory=$(redis_cli INFO memory 2>/dev/null | grep "used_memory_human:" | cut -d: -f2 | tr -d '\r')
    log_info "Memory usage: ${memory:-unknown}"

    log_success "Restore verification completed"
}

cleanup() {
    log_info "Cleaning up temporary files..."
    rm -f "${RESTORE_DIR}/restore_${TIMESTAMP}"* 2>/dev/null || true
    rm -f "${RESTORE_DIR}/decrypted_${TIMESTAMP}"* 2>/dev/null || true
    rm -rf "${RESTORE_DIR}/aof_"* 2>/dev/null || true
    log_success "Cleanup completed"
}

# =============================================================================
# Dry Run
# =============================================================================

dry_run() {
    log_info "=========================================="
    log_info "DRY RUN MODE - No changes will be made"
    log_info "=========================================="

    check_dependencies
    check_redis_connection
    validate_backup_file
    prepare_backup_file
    validate_backup_content

    log_info "=========================================="
    log_success "Dry run completed - backup is valid"
    log_info "=========================================="

    cleanup
}

# =============================================================================
# Argument Parsing
# =============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -m|--mode)
                RESTORE_MODE="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --no-backup)
                CREATE_BACKUP=false
                shift
                ;;
            --decrypt)
                DECRYPT_BACKUP=true
                shift
                ;;
            --force)
                FORCE_RESTORE=true
                shift
                ;;
            --restart)
                RESTART_REDIS=true
                shift
                ;;
            -h|--help)
                show_help
                ;;
            -*)
                log_error "Unknown option: $1"
                show_help
                ;;
            *)
                BACKUP_FILE="$1"
                shift
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
    validate_backup_file

    if [[ "${DRY_RUN}" == true ]]; then
        dry_run
        exit 0
    fi

    log_info "=========================================="
    log_info "Redis Restore Started"
    log_info "=========================================="
    log_info "Target: ${REDIS_HOST}:${REDIS_PORT}"
    log_info "Mode: ${RESTORE_MODE}"
    log_info "Backup: ${BACKUP_FILE}"
    log_info "=========================================="

    check_dependencies
    check_redis_connection
    confirm_restore

    create_pre_restore_backup
    prepare_backup_file
    validate_backup_content

    case "${RESTORE_MODE}" in
        rdb) restore_rdb ;;
        aof) restore_aof ;;
        *)
            log_error "Unknown restore mode: ${RESTORE_MODE}"
            exit 1
            ;;
    esac

    verify_restore
    cleanup

    log_info "=========================================="
    log_success "Redis Restore Completed"
    log_info "=========================================="
}

# Set trap for cleanup on error
trap cleanup EXIT

main "$@"
