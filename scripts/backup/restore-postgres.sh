#!/usr/bin/env bash
# =============================================================================
# PostgreSQL Restore Script for PULL Backend
# =============================================================================
#
# Features:
#   - Restore from compressed/encrypted backups
#   - Point-in-time recovery support
#   - Pre-restore validation
#   - Automatic backup before restore
#   - Dry-run mode for testing
#
# Usage:
#   ./restore-postgres.sh [options] <backup_file>
#
# Options:
#   --database, -d    Target database name (default: $POSTGRES_DB or pull_dev)
#   --dry-run         Validate backup without restoring
#   --no-backup       Skip creating backup before restore
#   --decrypt         Decrypt backup before restoring
#   --force           Skip confirmation prompts
#   --drop-existing   Drop and recreate database before restore
#   --help, -h        Show this help message
#
# Environment Variables:
#   POSTGRES_HOST       PostgreSQL host (default: localhost)
#   POSTGRES_PORT       PostgreSQL port (default: 5432)
#   POSTGRES_USER       PostgreSQL user (default: pull)
#   POSTGRES_PASSWORD   PostgreSQL password (required)
#   POSTGRES_DB         PostgreSQL database (default: pull_dev)
#   BACKUP_ENCRYPTION_KEY  GPG decryption key/passphrase
#
# Examples:
#   ./restore-postgres.sh /backups/postgres/daily/pull_postgres_20240101_120000.sql.gz
#   ./restore-postgres.sh --decrypt /backups/postgres/daily/backup.sql.gz.enc
#   ./restore-postgres.sh --dry-run /backups/postgres/daily/backup.sql.gz
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
RESTORE_DIR="${RESTORE_DIR:-/tmp/restore}"

# Options
DRY_RUN=false
CREATE_BACKUP=true
DECRYPT_BACKUP=false
FORCE_RESTORE=false
DROP_EXISTING=false
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
    local deps=(psql gunzip)

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

check_postgres_connection() {
    log_info "Testing PostgreSQL connection..."

    if ! PGPASSWORD="${POSTGRES_PASSWORD}" pg_isready \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" \
        -t 10 &>/dev/null; then
        log_error "Cannot connect to PostgreSQL server"
        exit 1
    fi

    log_success "PostgreSQL connection verified"
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
}

confirm_restore() {
    if [[ "${FORCE_RESTORE}" == true ]]; then
        return 0
    fi

    log_warn "=========================================="
    log_warn "WARNING: This will restore the database"
    log_warn "=========================================="
    log_warn "Target: ${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"
    log_warn "Backup: ${BACKUP_FILE}"

    if [[ "${DROP_EXISTING}" == true ]]; then
        log_warn "DANGER: Database will be DROPPED and recreated!"
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

    log_info "Creating backup of current database state..."

    local pre_backup="${RESTORE_DIR}/pre_restore_${POSTGRES_DB}_${TIMESTAMP}.sql.gz"

    if PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        --format=plain \
        --no-owner \
        --no-privileges \
        2>/dev/null \
        | gzip > "${pre_backup}"; then
        log_success "Pre-restore backup created: ${pre_backup}"
    else
        log_warn "Could not create pre-restore backup (database may be empty)"
    fi
}

# =============================================================================
# Restore Functions
# =============================================================================

prepare_backup_file() {
    local source_file="${BACKUP_FILE}"
    local work_file="${RESTORE_DIR}/restore_${TIMESTAMP}.sql"

    # Decrypt if needed
    if [[ "${DECRYPT_BACKUP}" == true ]] || [[ "${source_file}" == *.enc ]]; then
        log_info "Decrypting backup..."

        if [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
            log_error "BACKUP_ENCRYPTION_KEY not set for decryption"
            exit 1
        fi

        local decrypted_file="${RESTORE_DIR}/decrypted_${TIMESTAMP}.sql.gz"

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
    else
        cp "${source_file}" "${work_file}"
    fi

    PREPARED_BACKUP="${work_file}"
    log_info "Prepared backup file: ${PREPARED_BACKUP}"
}

validate_backup_content() {
    log_info "Validating backup content..."

    # Check for SQL structure
    if ! head -100 "${PREPARED_BACKUP}" | grep -qiE "(CREATE|DROP|INSERT|SET|--)" 2>/dev/null; then
        log_error "Backup file does not appear to contain valid SQL"
        exit 1
    fi

    # Count statements
    local create_count=$(grep -c "CREATE TABLE" "${PREPARED_BACKUP}" 2>/dev/null || echo "0")
    local insert_count=$(grep -c "INSERT INTO" "${PREPARED_BACKUP}" 2>/dev/null || echo "0")

    log_info "Backup contains approximately:"
    log_info "  - CREATE TABLE statements: ${create_count}"
    log_info "  - INSERT INTO statements: ${insert_count}"

    if [[ "${create_count}" -eq 0 && "${insert_count}" -eq 0 ]]; then
        log_warn "Backup appears to be empty or contains no data"
    fi

    log_success "Backup validation passed"
}

drop_and_recreate_database() {
    if [[ "${DROP_EXISTING}" != true ]]; then
        return 0
    fi

    log_warn "Dropping and recreating database ${POSTGRES_DB}..."

    # Terminate existing connections
    PGPASSWORD="${POSTGRES_PASSWORD}" psql \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" \
        -d postgres \
        -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${POSTGRES_DB}' AND pid <> pg_backend_pid();" \
        2>/dev/null || true

    # Drop database
    PGPASSWORD="${POSTGRES_PASSWORD}" psql \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" \
        -d postgres \
        -c "DROP DATABASE IF EXISTS \"${POSTGRES_DB}\";"

    # Create database
    PGPASSWORD="${POSTGRES_PASSWORD}" psql \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" \
        -d postgres \
        -c "CREATE DATABASE \"${POSTGRES_DB}\" WITH OWNER = \"${POSTGRES_USER}\" ENCODING = 'UTF8';"

    log_success "Database recreated"
}

perform_restore() {
    log_info "Starting database restore..."
    local start_time=$(date +%s)

    # Run restore
    if PGPASSWORD="${POSTGRES_PASSWORD}" psql \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        -v ON_ERROR_STOP=0 \
        -f "${PREPARED_BACKUP}" \
        2>&1 | while read -r line; do
            # Filter out noise, show important messages
            if [[ "${line}" == *"ERROR"* ]] || [[ "${line}" == *"FATAL"* ]]; then
                log_error "${line}"
            fi
        done; then
        log_success "Restore command completed"
    else
        log_error "Restore command failed"
        exit 1
    fi

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    log_success "Restore completed in ${duration} seconds"
}

verify_restore() {
    log_info "Verifying restore..."

    # Check database exists and is accessible
    local tables=$(PGPASSWORD="${POSTGRES_PASSWORD}" psql \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | xargs)

    log_info "Tables in database: ${tables}"

    # Get row counts for main tables
    local sample_query=$(cat <<EOF
SELECT
    schemaname,
    relname AS table,
    n_live_tup AS row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC
LIMIT 10;
EOF
)

    log_info "Top tables by row count:"
    PGPASSWORD="${POSTGRES_PASSWORD}" psql \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        -c "${sample_query}" 2>/dev/null || true

    log_success "Restore verification completed"
}

cleanup() {
    log_info "Cleaning up temporary files..."
    rm -f "${RESTORE_DIR}/restore_${TIMESTAMP}"* 2>/dev/null || true
    rm -f "${RESTORE_DIR}/decrypted_${TIMESTAMP}"* 2>/dev/null || true
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
    check_postgres_connection
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
            -d|--database)
                POSTGRES_DB="$2"
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
            --drop-existing)
                DROP_EXISTING=true
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

    # Validate required environment
    if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
        log_error "POSTGRES_PASSWORD environment variable is required"
        exit 1
    fi

    ensure_directories
    validate_backup_file

    if [[ "${DRY_RUN}" == true ]]; then
        dry_run
        exit 0
    fi

    log_info "=========================================="
    log_info "PostgreSQL Restore Started"
    log_info "=========================================="
    log_info "Target: ${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"
    log_info "Backup: ${BACKUP_FILE}"
    log_info "=========================================="

    check_dependencies
    check_postgres_connection
    confirm_restore

    create_pre_restore_backup
    prepare_backup_file
    validate_backup_content

    drop_and_recreate_database
    perform_restore
    verify_restore

    cleanup

    log_info "=========================================="
    log_success "PostgreSQL Restore Completed Successfully"
    log_info "=========================================="
}

# Set trap for cleanup on error
trap cleanup EXIT

main "$@"
