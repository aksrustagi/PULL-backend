#!/usr/bin/env bash
# =============================================================================
# Backup Verification Script for PULL Backend
# =============================================================================
#
# Features:
#   - Checksum verification (SHA-256)
#   - Archive integrity testing
#   - Encryption verification
#   - Content validation (manifest checks)
#   - Test restore to temporary database
#   - Report generation
#   - Alert on failures
#
# Usage:
#   ./verify-backup.sh [options] <backup-file>
#
# Options:
#   --type, -t        Backup type: postgres, redis, convex, auto (default: auto)
#   --deep            Perform deep verification (test restore)
#   --checksum-file   Path to checksum file (default: <backup-file>.sha256)
#   --decrypt-key     Decryption key for encrypted backups
#   --output-report   Generate JSON report file
#   --help, -h        Show this help message
#
# Environment Variables:
#   BACKUP_ENCRYPTION_KEY    Decryption key for encrypted backups
#   POSTGRES_HOST            PostgreSQL host for test restore
#   POSTGRES_PORT            PostgreSQL port (default: 5432)
#   POSTGRES_USER            PostgreSQL user
#   POSTGRES_PASSWORD        PostgreSQL password
#   REDIS_HOST               Redis host for test restore
#   REDIS_PORT               Redis port (default: 6379)
#   SLACK_WEBHOOK_URL        Slack webhook for notifications
#   PAGERDUTY_KEY            PagerDuty integration key
#
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_NAME="$(basename "$0")"

# Default values
BACKUP_FILE=""
BACKUP_TYPE="auto"
CHECKSUM_FILE=""
DECRYPT_KEY="${BACKUP_ENCRYPTION_KEY:-}"
DEEP_VERIFY=false
OUTPUT_REPORT=""
TEMP_DIR="/tmp/backup-verify-$$"

# Timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Verification results
declare -A VERIFY_RESULTS

# =============================================================================
# Logging Functions
# =============================================================================

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] ${message}" >&2
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

cleanup() {
    rm -rf "${TEMP_DIR}" 2>/dev/null || true
}
trap cleanup EXIT

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
        "title": "Backup Verification - ${status^^}",
        "text": "${message}",
        "fields": [
            {"title": "Backup File", "value": "$(basename ${BACKUP_FILE})", "short": true},
            {"title": "Type", "value": "${BACKUP_TYPE}", "short": true},
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
        "source": "pull-backup-verification",
        "component": "${BACKUP_TYPE}-backup",
        "custom_details": {
            "backup_file": "${BACKUP_FILE}",
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

detect_backup_type() {
    local filename=$(basename "${BACKUP_FILE}")

    if [[ "${filename}" =~ postgres ]]; then
        BACKUP_TYPE="postgres"
    elif [[ "${filename}" =~ redis_rdb ]]; then
        BACKUP_TYPE="redis_rdb"
    elif [[ "${filename}" =~ redis_aof ]]; then
        BACKUP_TYPE="redis_aof"
    elif [[ "${filename}" =~ redis ]]; then
        BACKUP_TYPE="redis"
    elif [[ "${filename}" =~ convex ]]; then
        BACKUP_TYPE="convex"
    else
        # Try to detect from file content
        if file "${BACKUP_FILE}" | grep -q "PostgreSQL"; then
            BACKUP_TYPE="postgres"
        elif file "${BACKUP_FILE}" | grep -q "Redis"; then
            BACKUP_TYPE="redis"
        else
            BACKUP_TYPE="unknown"
        fi
    fi

    log_info "Detected backup type: ${BACKUP_TYPE}"
}

is_encrypted() {
    local file="$1"
    [[ "${file}" =~ \.enc$ ]] && return 0
    # Check GPG header
    if head -c 10 "${file}" 2>/dev/null | grep -q "GPG"; then
        return 0
    fi
    return 1
}

# =============================================================================
# Verification Functions
# =============================================================================

verify_file_exists() {
    log_info "Checking file existence..."

    if [[ ! -f "${BACKUP_FILE}" ]]; then
        log_error "Backup file not found: ${BACKUP_FILE}"
        VERIFY_RESULTS["file_exists"]="FAILED"
        return 1
    fi

    local file_size=$(du -h "${BACKUP_FILE}" | cut -f1)
    log_success "File exists (size: ${file_size})"
    VERIFY_RESULTS["file_exists"]="PASSED"
    VERIFY_RESULTS["file_size"]="${file_size}"
    return 0
}

verify_checksum() {
    log_info "Verifying checksum..."

    # Find checksum file if not specified
    if [[ -z "${CHECKSUM_FILE}" ]]; then
        local base_file="${BACKUP_FILE}"
        # Remove .enc extension if present
        base_file="${base_file%.enc}"
        CHECKSUM_FILE="${base_file}.sha256"
    fi

    if [[ ! -f "${CHECKSUM_FILE}" ]]; then
        log_warn "Checksum file not found: ${CHECKSUM_FILE}"
        VERIFY_RESULTS["checksum"]="SKIPPED"
        return 0
    fi

    # For encrypted files, we need to verify against original checksum
    if is_encrypted "${BACKUP_FILE}"; then
        log_info "Encrypted file detected, decrypting for checksum verification..."

        if [[ -z "${DECRYPT_KEY}" ]]; then
            log_warn "No decryption key provided, skipping checksum verification"
            VERIFY_RESULTS["checksum"]="SKIPPED"
            return 0
        fi

        mkdir -p "${TEMP_DIR}"
        local decrypted_file="${TEMP_DIR}/decrypted_backup"

        if ! gpg --batch --yes --passphrase "${DECRYPT_KEY}" \
            --decrypt --output "${decrypted_file}" \
            "${BACKUP_FILE}" 2>/dev/null; then
            log_error "Decryption failed"
            VERIFY_RESULTS["checksum"]="FAILED"
            VERIFY_RESULTS["decryption"]="FAILED"
            return 1
        fi

        VERIFY_RESULTS["decryption"]="PASSED"

        # Verify checksum of decrypted file
        local expected_checksum=$(cat "${CHECKSUM_FILE}" | awk '{print $1}')
        local actual_checksum=$(sha256sum "${decrypted_file}" | awk '{print $1}')

        if [[ "${expected_checksum}" == "${actual_checksum}" ]]; then
            log_success "Checksum verification passed"
            VERIFY_RESULTS["checksum"]="PASSED"
            return 0
        else
            log_error "Checksum mismatch!"
            log_error "Expected: ${expected_checksum}"
            log_error "Actual:   ${actual_checksum}"
            VERIFY_RESULTS["checksum"]="FAILED"
            return 1
        fi
    else
        # Direct checksum verification
        if sha256sum -c "${CHECKSUM_FILE}" &>/dev/null; then
            log_success "Checksum verification passed"
            VERIFY_RESULTS["checksum"]="PASSED"
            return 0
        else
            log_error "Checksum verification failed"
            VERIFY_RESULTS["checksum"]="FAILED"
            return 1
        fi
    fi
}

verify_archive_integrity() {
    log_info "Verifying archive integrity..."

    local file_to_check="${BACKUP_FILE}"

    # Decrypt if needed
    if is_encrypted "${BACKUP_FILE}"; then
        if [[ -z "${DECRYPT_KEY}" ]]; then
            log_warn "No decryption key, skipping archive integrity check"
            VERIFY_RESULTS["archive_integrity"]="SKIPPED"
            return 0
        fi

        mkdir -p "${TEMP_DIR}"
        file_to_check="${TEMP_DIR}/decrypted_backup"

        if [[ ! -f "${file_to_check}" ]]; then
            if ! gpg --batch --yes --passphrase "${DECRYPT_KEY}" \
                --decrypt --output "${file_to_check}" \
                "${BACKUP_FILE}" 2>/dev/null; then
                log_error "Decryption failed"
                VERIFY_RESULTS["archive_integrity"]="FAILED"
                return 1
            fi
        fi
    fi

    # Test based on file type
    if [[ "${file_to_check}" =~ \.tar\.gz$ ]] || file "${file_to_check}" | grep -q "gzip"; then
        if tar -tzf "${file_to_check}" &>/dev/null; then
            log_success "Archive integrity verified (tar.gz)"
            VERIFY_RESULTS["archive_integrity"]="PASSED"
            return 0
        else
            log_error "Archive integrity check failed (tar.gz)"
            VERIFY_RESULTS["archive_integrity"]="FAILED"
            return 1
        fi
    elif [[ "${file_to_check}" =~ \.gz$ ]] || file "${file_to_check}" | grep -q "gzip"; then
        if gzip -t "${file_to_check}" 2>/dev/null; then
            log_success "Archive integrity verified (gzip)"
            VERIFY_RESULTS["archive_integrity"]="PASSED"
            return 0
        else
            log_error "Archive integrity check failed (gzip)"
            VERIFY_RESULTS["archive_integrity"]="FAILED"
            return 1
        fi
    elif [[ "${file_to_check}" =~ \.sql$ ]]; then
        # SQL file - check for basic structure
        if head -n 10 "${file_to_check}" | grep -qE "(PostgreSQL|CREATE|INSERT|pg_dump)"; then
            log_success "SQL file structure verified"
            VERIFY_RESULTS["archive_integrity"]="PASSED"
            return 0
        else
            log_warn "Could not verify SQL file structure"
            VERIFY_RESULTS["archive_integrity"]="WARNING"
            return 0
        fi
    else
        log_warn "Unknown archive type, skipping integrity check"
        VERIFY_RESULTS["archive_integrity"]="SKIPPED"
        return 0
    fi
}

verify_content() {
    log_info "Verifying backup content..."

    local file_to_check="${BACKUP_FILE}"

    # Decrypt if needed
    if is_encrypted "${BACKUP_FILE}"; then
        if [[ -z "${DECRYPT_KEY}" ]]; then
            log_warn "No decryption key, skipping content verification"
            VERIFY_RESULTS["content"]="SKIPPED"
            return 0
        fi

        mkdir -p "${TEMP_DIR}"
        file_to_check="${TEMP_DIR}/decrypted_backup"

        if [[ ! -f "${file_to_check}" ]]; then
            if ! gpg --batch --yes --passphrase "${DECRYPT_KEY}" \
                --decrypt --output "${file_to_check}" \
                "${BACKUP_FILE}" 2>/dev/null; then
                log_error "Decryption failed"
                VERIFY_RESULTS["content"]="FAILED"
                return 1
            fi
        fi
    fi

    case "${BACKUP_TYPE}" in
        postgres)
            verify_postgres_content "${file_to_check}"
            ;;
        redis|redis_rdb|redis_aof)
            verify_redis_content "${file_to_check}"
            ;;
        convex)
            verify_convex_content "${file_to_check}"
            ;;
        *)
            log_warn "Unknown backup type, skipping content verification"
            VERIFY_RESULTS["content"]="SKIPPED"
            ;;
    esac
}

verify_postgres_content() {
    local file="$1"

    log_info "Verifying PostgreSQL backup content..."

    # Extract if compressed
    local sql_file="${file}"
    if [[ "${file}" =~ \.gz$ ]]; then
        mkdir -p "${TEMP_DIR}"
        sql_file="${TEMP_DIR}/backup.sql"
        if ! gunzip -c "${file}" > "${sql_file}" 2>/dev/null; then
            log_error "Failed to decompress PostgreSQL backup"
            VERIFY_RESULTS["content"]="FAILED"
            return 1
        fi
    fi

    # Check for essential PostgreSQL backup components
    local checks_passed=0
    local checks_total=5

    # Check for pg_dump header
    if head -n 50 "${sql_file}" | grep -q "PostgreSQL database dump"; then
        log_info "  [+] PostgreSQL dump header found"
        ((checks_passed++))
    else
        log_warn "  [-] PostgreSQL dump header not found"
    fi

    # Check for CREATE TABLE statements
    if grep -q "CREATE TABLE" "${sql_file}"; then
        log_info "  [+] CREATE TABLE statements found"
        ((checks_passed++))
    else
        log_warn "  [-] No CREATE TABLE statements found"
    fi

    # Check for data (INSERT or COPY statements)
    if grep -qE "(INSERT INTO|COPY .* FROM stdin)" "${sql_file}"; then
        log_info "  [+] Data statements found"
        ((checks_passed++))
    else
        log_warn "  [-] No data statements found"
    fi

    # Check for users table (critical for PULL)
    if grep -q '"users"' "${sql_file}" || grep -q 'users' "${sql_file}"; then
        log_info "  [+] Users table references found"
        ((checks_passed++))
    else
        log_warn "  [-] Users table not found"
    fi

    # Check file is not truncated (ends properly)
    local last_lines=$(tail -n 5 "${sql_file}")
    if echo "${last_lines}" | grep -qE "(PostgreSQL database dump complete|\\\\.|;)"; then
        log_info "  [+] Backup appears complete"
        ((checks_passed++))
    else
        log_warn "  [-] Backup may be truncated"
    fi

    if [[ ${checks_passed} -ge 3 ]]; then
        log_success "PostgreSQL content verification passed (${checks_passed}/${checks_total})"
        VERIFY_RESULTS["content"]="PASSED"
        VERIFY_RESULTS["content_checks"]="${checks_passed}/${checks_total}"
        return 0
    else
        log_error "PostgreSQL content verification failed (${checks_passed}/${checks_total})"
        VERIFY_RESULTS["content"]="FAILED"
        VERIFY_RESULTS["content_checks"]="${checks_passed}/${checks_total}"
        return 1
    fi
}

verify_redis_content() {
    local file="$1"

    log_info "Verifying Redis backup content..."

    # Determine file type
    if [[ "${BACKUP_TYPE}" == "redis_rdb" ]] || [[ "${file}" =~ \.rdb ]]; then
        # RDB file verification
        local rdb_file="${file}"
        if [[ "${file}" =~ \.gz$ ]]; then
            mkdir -p "${TEMP_DIR}"
            rdb_file="${TEMP_DIR}/dump.rdb"
            if ! gunzip -c "${file}" > "${rdb_file}" 2>/dev/null; then
                log_error "Failed to decompress RDB file"
                VERIFY_RESULTS["content"]="FAILED"
                return 1
            fi
        fi

        # Check RDB magic number
        local magic=$(head -c 5 "${rdb_file}" 2>/dev/null)
        if [[ "${magic}" == "REDIS" ]]; then
            log_success "  [+] RDB magic number verified"
            VERIFY_RESULTS["content"]="PASSED"
            return 0
        else
            log_error "  [-] Invalid RDB magic number"
            VERIFY_RESULTS["content"]="FAILED"
            return 1
        fi
    else
        # AOF file verification
        local aof_file="${file}"
        if [[ "${file}" =~ \.gz$ ]]; then
            mkdir -p "${TEMP_DIR}"
            aof_file="${TEMP_DIR}/appendonly.aof"
            if ! gunzip -c "${file}" > "${aof_file}" 2>/dev/null; then
                log_error "Failed to decompress AOF file"
                VERIFY_RESULTS["content"]="FAILED"
                return 1
            fi
        fi

        # Check AOF format (RESP protocol)
        if head -n 10 "${aof_file}" | grep -qE "^\*[0-9]+"; then
            log_success "  [+] AOF RESP format verified"
            VERIFY_RESULTS["content"]="PASSED"
            return 0
        else
            log_warn "  [-] Could not verify AOF format"
            VERIFY_RESULTS["content"]="WARNING"
            return 0
        fi
    fi
}

verify_convex_content() {
    local file="$1"

    log_info "Verifying Convex backup content..."

    # Extract archive
    mkdir -p "${TEMP_DIR}/convex"
    if ! tar -xzf "${file}" -C "${TEMP_DIR}/convex" 2>/dev/null; then
        log_error "Failed to extract Convex backup"
        VERIFY_RESULTS["content"]="FAILED"
        return 1
    fi

    local backup_dir=$(find "${TEMP_DIR}/convex" -maxdepth 1 -type d -name "pull_convex_*" | head -1)

    if [[ -z "${backup_dir}" ]]; then
        backup_dir="${TEMP_DIR}/convex"
    fi

    local checks_passed=0
    local checks_total=4

    # Check for manifest
    if [[ -f "${backup_dir}/manifest.json" ]]; then
        log_info "  [+] Manifest file found"
        ((checks_passed++))

        # Verify manifest is valid JSON
        if jq '.' "${backup_dir}/manifest.json" &>/dev/null; then
            log_info "  [+] Manifest is valid JSON"
            ((checks_passed++))

            # Check for required fields
            local total_docs=$(jq '.total_documents // 0' "${backup_dir}/manifest.json")
            log_info "  [+] Total documents: ${total_docs}"
        else
            log_warn "  [-] Manifest is not valid JSON"
        fi
    else
        log_warn "  [-] Manifest file not found"
    fi

    # Check for table data files
    local table_count=$(find "${backup_dir}" -name "*.jsonl" 2>/dev/null | wc -l)
    if [[ ${table_count} -gt 0 ]]; then
        log_info "  [+] Found ${table_count} table export files"
        ((checks_passed++))
    else
        log_warn "  [-] No table export files found"
    fi

    # Check for critical tables
    local critical_tables=("users" "balances" "orders")
    local critical_found=0
    for table in "${critical_tables[@]}"; do
        if find "${backup_dir}" -name "${table}_*.jsonl" 2>/dev/null | grep -q .; then
            ((critical_found++))
        fi
    done

    if [[ ${critical_found} -ge 2 ]]; then
        log_info "  [+] Critical tables found (${critical_found}/${#critical_tables[@]})"
        ((checks_passed++))
    else
        log_warn "  [-] Missing critical tables"
    fi

    if [[ ${checks_passed} -ge 2 ]]; then
        log_success "Convex content verification passed (${checks_passed}/${checks_total})"
        VERIFY_RESULTS["content"]="PASSED"
        VERIFY_RESULTS["content_checks"]="${checks_passed}/${checks_total}"
        return 0
    else
        log_error "Convex content verification failed (${checks_passed}/${checks_total})"
        VERIFY_RESULTS["content"]="FAILED"
        VERIFY_RESULTS["content_checks"]="${checks_passed}/${checks_total}"
        return 1
    fi
}

# =============================================================================
# Deep Verification (Test Restore)
# =============================================================================

deep_verify_postgres() {
    log_info "Performing deep verification (test restore) for PostgreSQL..."

    if [[ -z "${POSTGRES_HOST:-}" ]] || [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
        log_warn "PostgreSQL credentials not provided, skipping test restore"
        VERIFY_RESULTS["deep_verify"]="SKIPPED"
        return 0
    fi

    local test_db="pull_backup_test_${TIMESTAMP}"
    local file_to_restore="${BACKUP_FILE}"

    # Decrypt and decompress if needed
    mkdir -p "${TEMP_DIR}"

    if is_encrypted "${BACKUP_FILE}"; then
        local decrypted="${TEMP_DIR}/decrypted.gz"
        gpg --batch --yes --passphrase "${DECRYPT_KEY}" \
            --decrypt --output "${decrypted}" "${BACKUP_FILE}"
        file_to_restore="${decrypted}"
    fi

    # Create test database
    log_info "Creating test database: ${test_db}"
    PGPASSWORD="${POSTGRES_PASSWORD}" psql \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT:-5432}" \
        -U "${POSTGRES_USER:-pull}" \
        -c "CREATE DATABASE ${test_db};" 2>/dev/null || {
        log_error "Failed to create test database"
        VERIFY_RESULTS["deep_verify"]="FAILED"
        return 1
    }

    # Restore backup
    log_info "Restoring backup to test database..."
    local restore_result=0

    if [[ "${file_to_restore}" =~ \.gz$ ]]; then
        gunzip -c "${file_to_restore}" | PGPASSWORD="${POSTGRES_PASSWORD}" psql \
            -h "${POSTGRES_HOST}" \
            -p "${POSTGRES_PORT:-5432}" \
            -U "${POSTGRES_USER:-pull}" \
            -d "${test_db}" &>/dev/null || restore_result=1
    else
        PGPASSWORD="${POSTGRES_PASSWORD}" psql \
            -h "${POSTGRES_HOST}" \
            -p "${POSTGRES_PORT:-5432}" \
            -U "${POSTGRES_USER:-pull}" \
            -d "${test_db}" \
            -f "${file_to_restore}" &>/dev/null || restore_result=1
    fi

    # Verify key tables exist
    if [[ ${restore_result} -eq 0 ]]; then
        local tables_exist=$(PGPASSWORD="${POSTGRES_PASSWORD}" psql \
            -h "${POSTGRES_HOST}" \
            -p "${POSTGRES_PORT:-5432}" \
            -U "${POSTGRES_USER:-pull}" \
            -d "${test_db}" \
            -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | xargs)

        if [[ ${tables_exist} -gt 0 ]]; then
            log_success "Test restore successful: ${tables_exist} tables restored"
            VERIFY_RESULTS["deep_verify"]="PASSED"
            VERIFY_RESULTS["tables_restored"]="${tables_exist}"
        else
            log_error "Test restore failed: no tables found"
            VERIFY_RESULTS["deep_verify"]="FAILED"
            restore_result=1
        fi
    else
        log_error "Test restore failed"
        VERIFY_RESULTS["deep_verify"]="FAILED"
    fi

    # Cleanup test database
    log_info "Cleaning up test database..."
    PGPASSWORD="${POSTGRES_PASSWORD}" psql \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT:-5432}" \
        -U "${POSTGRES_USER:-pull}" \
        -c "DROP DATABASE IF EXISTS ${test_db};" 2>/dev/null || true

    return ${restore_result}
}

deep_verify() {
    case "${BACKUP_TYPE}" in
        postgres)
            deep_verify_postgres
            ;;
        redis|redis_rdb|redis_aof)
            log_warn "Deep verification for Redis not implemented (would require separate Redis instance)"
            VERIFY_RESULTS["deep_verify"]="SKIPPED"
            ;;
        convex)
            log_warn "Deep verification for Convex not implemented (requires Convex deployment)"
            VERIFY_RESULTS["deep_verify"]="SKIPPED"
            ;;
        *)
            log_warn "Deep verification not available for type: ${BACKUP_TYPE}"
            VERIFY_RESULTS["deep_verify"]="SKIPPED"
            ;;
    esac
}

# =============================================================================
# Report Generation
# =============================================================================

generate_report() {
    local overall_status="PASSED"

    # Determine overall status
    for key in "${!VERIFY_RESULTS[@]}"; do
        if [[ "${VERIFY_RESULTS[$key]}" == "FAILED" ]]; then
            overall_status="FAILED"
            break
        fi
    done

    local report=$(cat <<EOF
{
    "verification_timestamp": "${TIMESTAMP}",
    "backup_file": "${BACKUP_FILE}",
    "backup_type": "${BACKUP_TYPE}",
    "overall_status": "${overall_status}",
    "deep_verification": ${DEEP_VERIFY},
    "checks": {
        "file_exists": "${VERIFY_RESULTS["file_exists"]:-NOT_RUN}",
        "file_size": "${VERIFY_RESULTS["file_size"]:-unknown}",
        "checksum": "${VERIFY_RESULTS["checksum"]:-NOT_RUN}",
        "decryption": "${VERIFY_RESULTS["decryption"]:-NOT_APPLICABLE}",
        "archive_integrity": "${VERIFY_RESULTS["archive_integrity"]:-NOT_RUN}",
        "content": "${VERIFY_RESULTS["content"]:-NOT_RUN}",
        "content_checks": "${VERIFY_RESULTS["content_checks"]:-N/A}",
        "deep_verify": "${VERIFY_RESULTS["deep_verify"]:-NOT_RUN}",
        "tables_restored": "${VERIFY_RESULTS["tables_restored"]:-N/A}"
    }
}
EOF
)

    if [[ -n "${OUTPUT_REPORT}" ]]; then
        echo "${report}" | jq '.' > "${OUTPUT_REPORT}"
        log_info "Report saved to: ${OUTPUT_REPORT}"
    fi

    echo "${report}" | jq '.'

    return $([ "${overall_status}" == "PASSED" ] && echo 0 || echo 1)
}

# =============================================================================
# Argument Parsing
# =============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -t|--type)
                BACKUP_TYPE="$2"
                shift 2
                ;;
            --deep)
                DEEP_VERIFY=true
                shift
                ;;
            --checksum-file)
                CHECKSUM_FILE="$2"
                shift 2
                ;;
            --decrypt-key)
                DECRYPT_KEY="$2"
                shift 2
                ;;
            --output-report)
                OUTPUT_REPORT="$2"
                shift 2
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

    if [[ -z "${BACKUP_FILE}" ]]; then
        log_error "Backup file is required"
        show_help
    fi

    log_info "=========================================="
    log_info "Backup Verification Started"
    log_info "=========================================="
    log_info "Backup file: ${BACKUP_FILE}"
    log_info "Deep verification: ${DEEP_VERIFY}"
    log_info "=========================================="

    # Auto-detect backup type if needed
    if [[ "${BACKUP_TYPE}" == "auto" ]]; then
        detect_backup_type
    fi

    # Run verifications
    local exit_code=0

    verify_file_exists || exit_code=1
    verify_checksum || exit_code=1
    verify_archive_integrity || exit_code=1
    verify_content || exit_code=1

    if [[ "${DEEP_VERIFY}" == true ]]; then
        deep_verify || exit_code=1
    fi

    log_info "=========================================="

    # Generate report
    generate_report

    if [[ ${exit_code} -eq 0 ]]; then
        log_success "Backup Verification Completed - ALL CHECKS PASSED"
        notify_slack "success" "Backup verification passed for $(basename ${BACKUP_FILE})"
    else
        log_error "Backup Verification Completed - SOME CHECKS FAILED"
        notify_slack "error" "Backup verification FAILED for $(basename ${BACKUP_FILE})"
        notify_pagerduty "warning" "Backup verification failed for ${BACKUP_FILE}"
    fi

    exit ${exit_code}
}

main "$@"
