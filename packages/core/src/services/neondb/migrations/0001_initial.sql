-- ============================================================================
-- PULL Financial System of Record - Initial Migration
-- NeonDB (Serverless PostgreSQL)
--
-- This migration creates the complete financial ledger infrastructure.
-- It is designed to be idempotent: running it multiple times is safe.
--
-- CRITICAL: This schema implements double-entry bookkeeping.
-- Every financial mutation MUST create balanced debit/credit pairs.
-- The database enforces this at the trigger level.
--
-- Money is stored as NUMERIC(19,4) - NEVER as FLOAT or DOUBLE PRECISION.
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Enable pgcrypto for gen_random_uuid() (faster than uuid-ossp)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE account_type AS ENUM (
    'user_wallet',
    'user_bonus',
    'user_escrow',
    'platform_revenue',
    'platform_reserve',
    'platform_insurance',
    'settlement_pool',
    'fee_collection',
    'external_deposit',
    'external_withdrawal'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE account_status AS ENUM (
    'active',
    'frozen',
    'suspended',
    'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE currency AS ENUM (
    'USD',
    'USDC',
    'BTC',
    'ETH',
    'SOL'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE entry_type AS ENUM (
    'debit',
    'credit'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE transaction_type AS ENUM (
    'deposit',
    'withdrawal',
    'trade_buy',
    'trade_sell',
    'trade_settlement',
    'fee_charge',
    'fee_rebate',
    'bonus_grant',
    'bonus_conversion',
    'bonus_expiry',
    'escrow_lock',
    'escrow_release',
    'escrow_forfeit',
    'pnl_realized',
    'transfer_internal',
    'adjustment',
    'reversal',
    'insurance_payout'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE transaction_status AS ENUM (
    'pending',
    'committed',
    'failed',
    'reversed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE order_side AS ENUM (
    'buy',
    'sell'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE order_type AS ENUM (
    'market',
    'limit',
    'stop',
    'stop_limit'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'pending',
    'open',
    'partial_fill',
    'filled',
    'settled',
    'cancelled',
    'rejected',
    'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE time_in_force AS ENUM (
    'gtc',
    'ioc',
    'fok',
    'day',
    'gtd'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE trade_status AS ENUM (
    'executed',
    'settling',
    'settled',
    'settlement_failed',
    'disputed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE settlement_type AS ENUM (
    'instant',
    'standard',
    'deferred'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE settlement_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed',
    'rolled_back'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE market_type AS ENUM (
    'prediction',
    'crypto',
    'rwa'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE audit_action AS ENUM (
    'account_created',
    'account_frozen',
    'account_unfrozen',
    'account_closed',
    'deposit_initiated',
    'deposit_completed',
    'withdrawal_initiated',
    'withdrawal_completed',
    'withdrawal_failed',
    'order_placed',
    'order_cancelled',
    'order_modified',
    'trade_executed',
    'trade_settled',
    'settlement_initiated',
    'settlement_completed',
    'settlement_failed',
    'balance_adjustment',
    'reconciliation_started',
    'reconciliation_completed',
    'reconciliation_mismatch',
    'admin_override',
    'compliance_hold',
    'compliance_release'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- TABLE: financial_accounts
-- Chart of accounts - every entity that can hold a balance
-- ============================================================================

CREATE TABLE IF NOT EXISTS financial_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner identification
  user_id         VARCHAR(255),             -- NULL for platform accounts
  account_type    account_type NOT NULL,
  account_status  account_status NOT NULL DEFAULT 'active',
  currency        currency NOT NULL DEFAULT 'USD',

  -- Human-readable label
  label           VARCHAR(255) NOT NULL,

  -- Account metadata (JSON)
  metadata        JSONB NOT NULL DEFAULT '{}',

  -- Optimistic locking
  version         INTEGER NOT NULL DEFAULT 1,

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_financial_accounts_user_id
  ON financial_accounts (user_id);

CREATE INDEX IF NOT EXISTS idx_financial_accounts_type
  ON financial_accounts (account_type);

CREATE INDEX IF NOT EXISTS idx_financial_accounts_status
  ON financial_accounts (account_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_accounts_user_currency_type
  ON financial_accounts (user_id, currency, account_type);

COMMENT ON TABLE financial_accounts IS
  'Chart of accounts. Every entity that can hold a financial balance. '
  'User wallets, platform reserves, fee accounts, escrow accounts, etc.';

COMMENT ON COLUMN financial_accounts.version IS
  'Optimistic locking version. Increment on every update. '
  'Reject updates where version != expected version.';


-- ============================================================================
-- TABLE: ledger_transactions
-- Groups related ledger entries into atomic double-entry transactions
-- ============================================================================

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Transaction classification
  transaction_type          transaction_type NOT NULL,
  transaction_status        transaction_status NOT NULL DEFAULT 'pending',

  -- Reference to the business operation that caused this transaction
  reference_type            VARCHAR(50),    -- 'order', 'trade', 'deposit', etc.
  reference_id              UUID,

  -- Idempotency
  idempotency_key           VARCHAR(255) UNIQUE,

  -- Description
  description               TEXT NOT NULL,

  -- Currency
  currency                  currency NOT NULL DEFAULT 'USD',

  -- Net amount (sum of all debits = sum of all credits)
  amount                    NUMERIC(19, 4) NOT NULL,

  -- Who initiated this transaction
  initiated_by              VARCHAR(255) NOT NULL,  -- userId or 'system'
  approved_by               VARCHAR(255),

  -- Reversal tracking
  reverses_transaction_id   UUID REFERENCES ledger_transactions(id),
  reversed_by_transaction_id UUID REFERENCES ledger_transactions(id),

  -- Additional context
  metadata                  JSONB NOT NULL DEFAULT '{}',

  -- Timestamps
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  committed_at              TIMESTAMPTZ,
  failed_at                 TIMESTAMPTZ,

  -- Error information
  error_code                VARCHAR(50),
  error_message             TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ledger_tx_type
  ON ledger_transactions (transaction_type);

CREATE INDEX IF NOT EXISTS idx_ledger_tx_status
  ON ledger_transactions (transaction_status);

CREATE INDEX IF NOT EXISTS idx_ledger_tx_reference
  ON ledger_transactions (reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_ledger_tx_initiated_by
  ON ledger_transactions (initiated_by);

CREATE INDEX IF NOT EXISTS idx_ledger_tx_created_at
  ON ledger_transactions (created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_tx_idempotency
  ON ledger_transactions (idempotency_key);

COMMENT ON TABLE ledger_transactions IS
  'Groups related ledger entries into atomic double-entry transactions. '
  'Every transaction MUST have balanced debits and credits. '
  'This is enforced by the trg_validate_balanced_transaction trigger.';


-- ============================================================================
-- TABLE: ledger_entries
-- Individual debit/credit entries - the atomic units of the ledger
-- ============================================================================

CREATE TABLE IF NOT EXISTS ledger_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent transaction
  transaction_id    UUID NOT NULL REFERENCES ledger_transactions(id) ON DELETE RESTRICT,

  -- Which account is affected
  account_id        UUID NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,

  -- Debit or credit
  entry_type        entry_type NOT NULL,

  -- Amount (always positive; entry_type indicates direction)
  amount            NUMERIC(19, 4) NOT NULL,

  -- Currency
  currency          currency NOT NULL DEFAULT 'USD',

  -- Running balance AFTER this entry
  balance_after     NUMERIC(19, 4) NOT NULL,

  -- Sequence number within the account (monotonically increasing)
  sequence_number   INTEGER NOT NULL,

  -- Description
  description       TEXT,

  -- Timestamp
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_ledger_entry_amount_positive CHECK (amount > 0),
  CONSTRAINT uq_ledger_entries_account_sequence UNIQUE (account_id, sequence_number)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction
  ON ledger_entries (transaction_id);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_account
  ON ledger_entries (account_id);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_seq
  ON ledger_entries (account_id, sequence_number);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_created_at
  ON ledger_entries (created_at);

COMMENT ON TABLE ledger_entries IS
  'Individual debit/credit entries. The atomic units of the financial ledger. '
  'Amount is ALWAYS positive. entry_type (debit/credit) indicates direction. '
  'balance_after holds the running balance for fast lookups. '
  'sequence_number is monotonically increasing per account.';

COMMENT ON COLUMN ledger_entries.balance_after IS
  'Running balance of the account AFTER this entry is applied. '
  'For debits: balance_after = previous_balance - amount. '
  'For credits: balance_after = previous_balance + amount. '
  'This enables O(1) balance lookups by reading the latest entry.';


-- ============================================================================
-- TABLE: orders
-- Order book with proper state machine
-- ============================================================================

CREATE TABLE IF NOT EXISTS orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Order identification
  user_id             VARCHAR(255) NOT NULL,
  client_order_id     VARCHAR(255),

  -- Market context
  market_type         market_type NOT NULL,
  market_id           VARCHAR(255) NOT NULL,
  symbol              VARCHAR(50) NOT NULL,

  -- Order specification
  side                order_side NOT NULL,
  order_type          order_type NOT NULL,
  time_in_force       time_in_force NOT NULL DEFAULT 'gtc',

  -- Pricing (NUMERIC, never float)
  price               NUMERIC(19, 4),         -- NULL for market orders
  stop_price          NUMERIC(19, 4),
  quantity            NUMERIC(19, 8) NOT NULL,
  filled_quantity     NUMERIC(19, 8) NOT NULL DEFAULT 0,
  remaining_quantity  NUMERIC(19, 8) NOT NULL,

  -- Average fill price
  avg_fill_price      NUMERIC(19, 4),

  -- Fees
  estimated_fee       NUMERIC(19, 4) NOT NULL DEFAULT 0,
  actual_fee          NUMERIC(19, 4) NOT NULL DEFAULT 0,

  -- State
  status              order_status NOT NULL DEFAULT 'pending',

  -- Escrow
  escrow_account_id   UUID REFERENCES financial_accounts(id),

  -- Expiry
  expires_at          TIMESTAMPTZ,

  -- External venue reference
  external_order_id   VARCHAR(255),
  external_venue      VARCHAR(50),

  -- Cancellation/rejection
  cancel_reason       TEXT,
  reject_reason       TEXT,

  -- Metadata
  metadata            JSONB NOT NULL DEFAULT '{}',

  -- Optimistic locking
  version             INTEGER NOT NULL DEFAULT 1,

  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at        TIMESTAMPTZ,
  filled_at           TIMESTAMPTZ,
  settled_at          TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  expires_at_actual   TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT chk_order_quantity_positive CHECK (quantity > 0),
  CONSTRAINT chk_order_filled_non_negative CHECK (filled_quantity >= 0),
  CONSTRAINT chk_order_remaining_non_negative CHECK (remaining_quantity >= 0),
  CONSTRAINT chk_order_price_positive CHECK (price IS NULL OR price > 0)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_user_id
  ON orders (user_id);

CREATE INDEX IF NOT EXISTS idx_orders_market
  ON orders (market_id);

CREATE INDEX IF NOT EXISTS idx_orders_symbol
  ON orders (symbol);

CREATE INDEX IF NOT EXISTS idx_orders_status
  ON orders (status);

CREATE INDEX IF NOT EXISTS idx_orders_user_status
  ON orders (user_id, status);

CREATE INDEX IF NOT EXISTS idx_orders_market_status
  ON orders (market_id, status);

CREATE INDEX IF NOT EXISTS idx_orders_created_at
  ON orders (created_at);

CREATE INDEX IF NOT EXISTS idx_orders_external
  ON orders (external_venue, external_order_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_client_order_id
  ON orders (user_id, client_order_id);

COMMENT ON TABLE orders IS
  'Order book. State machine: pending -> open -> partial_fill -> filled -> settled | cancelled/rejected/expired. '
  'Funds are escrowed when order moves to open. Released on cancel/settle.';


-- ============================================================================
-- TABLE: trades
-- Executed trades with settlement tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS trades (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Trade parties
  buy_order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  sell_order_id           UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  buyer_user_id           VARCHAR(255) NOT NULL,
  seller_user_id          VARCHAR(255) NOT NULL,

  -- Trade details
  market_type             market_type NOT NULL,
  market_id               VARCHAR(255) NOT NULL,
  symbol                  VARCHAR(50) NOT NULL,

  -- Execution
  price                   NUMERIC(19, 4) NOT NULL,
  quantity                NUMERIC(19, 8) NOT NULL,
  total_value             NUMERIC(19, 4) NOT NULL,
  currency                currency NOT NULL DEFAULT 'USD',

  -- Fees
  buyer_fee               NUMERIC(19, 4) NOT NULL DEFAULT 0,
  seller_fee              NUMERIC(19, 4) NOT NULL DEFAULT 0,
  platform_fee            NUMERIC(19, 4) NOT NULL DEFAULT 0,

  -- Settlement
  status                  trade_status NOT NULL DEFAULT 'executed',
  settlement_id           UUID,

  -- External reference
  external_trade_id       VARCHAR(255),
  external_venue          VARCHAR(50),

  -- Ledger transaction
  ledger_transaction_id   UUID,

  -- Metadata
  metadata                JSONB NOT NULL DEFAULT '{}',

  -- Timestamps
  executed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_trade_price_positive CHECK (price > 0),
  CONSTRAINT chk_trade_quantity_positive CHECK (quantity > 0),
  CONSTRAINT chk_trade_value_positive CHECK (total_value > 0),
  CONSTRAINT chk_trade_fees_non_negative CHECK (buyer_fee >= 0 AND seller_fee >= 0 AND platform_fee >= 0)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trades_buyer
  ON trades (buyer_user_id);

CREATE INDEX IF NOT EXISTS idx_trades_seller
  ON trades (seller_user_id);

CREATE INDEX IF NOT EXISTS idx_trades_market
  ON trades (market_id);

CREATE INDEX IF NOT EXISTS idx_trades_symbol
  ON trades (symbol);

CREATE INDEX IF NOT EXISTS idx_trades_status
  ON trades (status);

CREATE INDEX IF NOT EXISTS idx_trades_settlement
  ON trades (settlement_id);

CREATE INDEX IF NOT EXISTS idx_trades_executed_at
  ON trades (executed_at);

CREATE INDEX IF NOT EXISTS idx_trades_external
  ON trades (external_venue, external_trade_id);

COMMENT ON TABLE trades IS
  'Executed trades between two parties. Created when orders match. '
  'Tracks settlement status through executed -> settling -> settled lifecycle.';


-- ============================================================================
-- TABLE: settlements
-- Settlement records
-- ============================================================================

CREATE TABLE IF NOT EXISTS settlements (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Settlement type
  settlement_type           settlement_type NOT NULL,

  -- Trades being settled (batch settlement)
  trade_ids                 UUID[] NOT NULL,

  -- Amounts
  total_amount              NUMERIC(19, 4) NOT NULL,
  total_fees                NUMERIC(19, 4) NOT NULL DEFAULT 0,
  currency                  currency NOT NULL DEFAULT 'USD',

  -- State
  status                    settlement_status NOT NULL DEFAULT 'pending',

  -- Ledger transactions created during settlement
  ledger_transaction_ids    UUID[] DEFAULT ARRAY[]::uuid[],

  -- Settlement window
  scheduled_at              TIMESTAMPTZ NOT NULL,
  started_at                TIMESTAMPTZ,
  completed_at              TIMESTAMPTZ,
  failed_at                 TIMESTAMPTZ,

  -- Error handling
  retry_count               INTEGER NOT NULL DEFAULT 0,
  max_retries               INTEGER NOT NULL DEFAULT 3,
  error_code                VARCHAR(50),
  error_message             TEXT,

  -- Rollback
  rollback_transaction_id   UUID,
  rolled_back_at            TIMESTAMPTZ,

  -- Metadata
  metadata                  JSONB NOT NULL DEFAULT '{}',

  -- Timestamps
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_settlement_amount_positive CHECK (total_amount > 0),
  CONSTRAINT chk_settlement_fees_non_negative CHECK (total_fees >= 0),
  CONSTRAINT chk_settlement_retry_non_negative CHECK (retry_count >= 0)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_settlements_type
  ON settlements (settlement_type);

CREATE INDEX IF NOT EXISTS idx_settlements_status
  ON settlements (status);

CREATE INDEX IF NOT EXISTS idx_settlements_scheduled_at
  ON settlements (scheduled_at);

CREATE INDEX IF NOT EXISTS idx_settlements_created_at
  ON settlements (created_at);

COMMENT ON TABLE settlements IS
  'Settlement records. Groups one or more trades for atomic settlement. '
  'T+0 for crypto (instant), T+1 for prediction markets (standard).';


-- ============================================================================
-- TABLE: balances_snapshot
-- Periodic balance snapshots for reconciliation
-- ============================================================================

CREATE TABLE IF NOT EXISTS balances_snapshot (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which account
  account_id            UUID NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,

  -- Balance at snapshot time
  balance               NUMERIC(19, 4) NOT NULL,
  currency              currency NOT NULL DEFAULT 'USD',

  -- Breakdown
  available_balance     NUMERIC(19, 4) NOT NULL,
  held_balance          NUMERIC(19, 4) NOT NULL DEFAULT 0,

  -- Ledger position at snapshot time
  last_sequence_number  INTEGER NOT NULL,
  last_entry_id         UUID REFERENCES ledger_entries(id),

  -- Snapshot metadata
  snapshot_reason       VARCHAR(50) NOT NULL,  -- 'periodic', 'reconciliation', 'eod'
  is_reconciled         BOOLEAN NOT NULL DEFAULT FALSE,
  reconciled_at         TIMESTAMPTZ,
  reconciled_by         VARCHAR(255),
  discrepancy           NUMERIC(19, 4),

  -- Timestamps
  snapshot_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_balances_snapshot_account
  ON balances_snapshot (account_id);

CREATE INDEX IF NOT EXISTS idx_balances_snapshot_at
  ON balances_snapshot (snapshot_at);

CREATE INDEX IF NOT EXISTS idx_balances_snapshot_account_time
  ON balances_snapshot (account_id, snapshot_at);

CREATE INDEX IF NOT EXISTS idx_balances_snapshot_reconciled
  ON balances_snapshot (is_reconciled);

COMMENT ON TABLE balances_snapshot IS
  'Periodic balance snapshots for reconciliation and fast reads. '
  'The authoritative balance is ALWAYS the latest ledger entry balance_after. '
  'Snapshots are checkpoints for reconciliation performance.';


-- ============================================================================
-- TABLE: idempotency_keys
-- Prevent duplicate financial operations
-- ============================================================================

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The unique key
  key                     VARCHAR(255) NOT NULL UNIQUE,

  -- Operation context
  operation_type          VARCHAR(100) NOT NULL,
  request_hash            VARCHAR(64) NOT NULL,    -- SHA-256 of request body

  -- Cached response
  response_status         INTEGER,
  response_body           JSONB,

  -- Linked ledger transaction
  ledger_transaction_id   UUID,

  -- Locking (SELECT FOR UPDATE serialization)
  locked_at               TIMESTAMPTZ,
  locked_by               VARCHAR(255),

  -- Auto-expiry
  expires_at              TIMESTAMPTZ NOT NULL,

  -- Timestamps
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at            TIMESTAMPTZ
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_keys_key
  ON idempotency_keys (key);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires
  ON idempotency_keys (expires_at);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_operation
  ON idempotency_keys (operation_type);

COMMENT ON TABLE idempotency_keys IS
  'Idempotency key store. Prevents duplicate financial operations. '
  'Clients provide a unique key; if the key exists, the stored response is returned. '
  'Keys auto-expire after a configurable period (default 24h).';


-- ============================================================================
-- TABLE: audit_trail
-- Immutable audit log of all financial operations
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_trail (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What happened
  action                audit_action NOT NULL,

  -- Who did it
  actor_id              VARCHAR(255) NOT NULL,
  actor_type            VARCHAR(50) NOT NULL,    -- 'user', 'admin', 'system', 'worker'
  actor_ip              VARCHAR(45),

  -- What entity was affected
  entity_type           VARCHAR(50) NOT NULL,    -- 'account', 'order', 'trade', etc.
  entity_id             UUID NOT NULL,

  -- Change details
  previous_state        JSONB,
  new_state             JSONB,
  change_summary        TEXT NOT NULL,

  -- Related entities
  related_entity_type   VARCHAR(50),
  related_entity_id     UUID,

  -- Distributed tracing
  correlation_id        VARCHAR(255),
  trace_id              VARCHAR(64),
  span_id               VARCHAR(32),

  -- Request context
  request_method        VARCHAR(10),
  request_path          VARCHAR(500),
  user_agent            TEXT,

  -- Metadata
  metadata              JSONB NOT NULL DEFAULT '{}',

  -- Timestamps
  occurred_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audit_trail_action
  ON audit_trail (action);

CREATE INDEX IF NOT EXISTS idx_audit_trail_actor
  ON audit_trail (actor_id);

CREATE INDEX IF NOT EXISTS idx_audit_trail_entity
  ON audit_trail (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_trail_occurred_at
  ON audit_trail (occurred_at);

CREATE INDEX IF NOT EXISTS idx_audit_trail_correlation
  ON audit_trail (correlation_id);

CREATE INDEX IF NOT EXISTS idx_audit_trail_related
  ON audit_trail (related_entity_type, related_entity_id);

COMMENT ON TABLE audit_trail IS
  'Immutable audit log. APPEND ONLY - no updates or deletes allowed. '
  'Every financial operation, state change, and admin action is recorded here. '
  'Protected by the trg_audit_trail_immutable trigger.';


-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Auto-update updated_at timestamp
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
DO $$ BEGIN
  CREATE TRIGGER trg_financial_accounts_updated_at
    BEFORE UPDATE ON financial_accounts
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_settlements_updated_at
    BEFORE UPDATE ON settlements
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Optimistic locking - auto-increment version on update
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_increment_version()
RETURNS TRIGGER AS $$
BEGIN
  -- If the caller did not explicitly set a new version, auto-increment
  IF NEW.version = OLD.version THEN
    NEW.version = OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_financial_accounts_version
    BEFORE UPDATE ON financial_accounts
    FOR EACH ROW EXECUTE FUNCTION fn_increment_version();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_orders_version
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION fn_increment_version();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Validate balanced transactions (debits = credits)
--    This trigger fires when a ledger_transaction status changes to 'committed'.
--    It verifies the sum of debits equals the sum of credits.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_validate_balanced_transaction()
RETURNS TRIGGER AS $$
DECLARE
  v_total_debits  NUMERIC(19, 4);
  v_total_credits NUMERIC(19, 4);
  v_entry_count   INTEGER;
BEGIN
  -- Only validate when transitioning to 'committed'
  IF NEW.transaction_status = 'committed' AND
     (OLD.transaction_status IS NULL OR OLD.transaction_status != 'committed') THEN

    -- Calculate totals
    SELECT
      COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0),
      COUNT(*)
    INTO v_total_debits, v_total_credits, v_entry_count
    FROM ledger_entries
    WHERE transaction_id = NEW.id;

    -- Must have at least 2 entries (one debit, one credit)
    IF v_entry_count < 2 THEN
      RAISE EXCEPTION 'Transaction % must have at least 2 entries (has %)',
        NEW.id, v_entry_count;
    END IF;

    -- Debits must equal credits
    IF v_total_debits != v_total_credits THEN
      RAISE EXCEPTION 'Transaction % is unbalanced: debits=% credits=%',
        NEW.id, v_total_debits, v_total_credits;
    END IF;

    -- Set committed timestamp
    NEW.committed_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_validate_balanced_transaction
    BEFORE UPDATE ON ledger_transactions
    FOR EACH ROW EXECUTE FUNCTION fn_validate_balanced_transaction();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Prevent modifications to committed ledger entries
--    Once a ledger entry is created, it is IMMUTABLE.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_ledger_entries_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Ledger entries are immutable. Cannot % entry %',
    TG_OP, OLD.id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_ledger_entries_no_update
    BEFORE UPDATE ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION fn_ledger_entries_immutable();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_ledger_entries_no_delete
    BEFORE DELETE ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION fn_ledger_entries_immutable();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Prevent modifications to audit trail
--    Audit trail is APPEND ONLY.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_audit_trail_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit trail is append-only. Cannot % entry %',
    TG_OP, OLD.id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_audit_trail_no_update
    BEFORE UPDATE ON audit_trail
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trail_immutable();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_audit_trail_no_delete
    BEFORE DELETE ON audit_trail
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trail_immutable();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Order status transition validation
--    Enforce the order state machine to prevent invalid transitions.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_validate_order_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Define valid transitions
  IF OLD.status = 'pending' AND NEW.status NOT IN ('open', 'cancelled', 'rejected') THEN
    RAISE EXCEPTION 'Invalid order status transition: % -> %', OLD.status, NEW.status;
  ELSIF OLD.status = 'open' AND NEW.status NOT IN ('partial_fill', 'filled', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'Invalid order status transition: % -> %', OLD.status, NEW.status;
  ELSIF OLD.status = 'partial_fill' AND NEW.status NOT IN ('filled', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid order status transition: % -> %', OLD.status, NEW.status;
  ELSIF OLD.status = 'filled' AND NEW.status NOT IN ('settled') THEN
    RAISE EXCEPTION 'Invalid order status transition: % -> %', OLD.status, NEW.status;
  ELSIF OLD.status IN ('settled', 'cancelled', 'rejected', 'expired') THEN
    RAISE EXCEPTION 'Cannot transition from terminal status: %', OLD.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_validate_order_status
    BEFORE UPDATE OF status ON orders
    FOR EACH ROW EXECUTE FUNCTION fn_validate_order_status_transition();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Prevent operations on frozen/closed accounts
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_check_account_active()
RETURNS TRIGGER AS $$
DECLARE
  v_account_status account_status;
BEGIN
  SELECT account_status INTO v_account_status
  FROM financial_accounts
  WHERE id = NEW.account_id;

  IF v_account_status IS NULL THEN
    RAISE EXCEPTION 'Account % does not exist', NEW.account_id;
  END IF;

  IF v_account_status != 'active' THEN
    RAISE EXCEPTION 'Cannot create ledger entry on % account %',
      v_account_status, NEW.account_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_check_account_active_on_entry
    BEFORE INSERT ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION fn_check_account_active();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 8. Auto-cleanup expired idempotency keys
--    This is a helper function meant to be called by a cron job (pg_cron)
--    or application-level scheduler.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_cleanup_expired_idempotency_keys()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM idempotency_keys
  WHERE expires_at < NOW()
    AND completed_at IS NOT NULL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_cleanup_expired_idempotency_keys IS
  'Removes expired and completed idempotency keys. '
  'Schedule via pg_cron: SELECT fn_cleanup_expired_idempotency_keys(); '
  'Recommended: run hourly.';


-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Get the current balance of an account from the latest ledger entry
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_get_account_balance(p_account_id UUID)
RETURNS NUMERIC(19, 4) AS $$
DECLARE
  v_balance NUMERIC(19, 4);
BEGIN
  SELECT balance_after INTO v_balance
  FROM ledger_entries
  WHERE account_id = p_account_id
  ORDER BY sequence_number DESC
  LIMIT 1;

  -- If no entries exist, balance is 0
  RETURN COALESCE(v_balance, 0);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION fn_get_account_balance IS
  'Returns the current balance of a financial account by reading the latest ledger entry. '
  'Returns 0 if the account has no entries yet.';

-- ---------------------------------------------------------------------------
-- Get the next sequence number for an account
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_get_next_sequence_number(p_account_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_max_seq INTEGER;
BEGIN
  SELECT MAX(sequence_number) INTO v_max_seq
  FROM ledger_entries
  WHERE account_id = p_account_id;

  RETURN COALESCE(v_max_seq, 0) + 1;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_get_next_sequence_number IS
  'Returns the next available sequence number for ledger entries in an account. '
  'IMPORTANT: Call this within a transaction with account row locked (SELECT FOR UPDATE) '
  'to prevent race conditions.';

-- ---------------------------------------------------------------------------
-- Reconciliation: verify account balance matches sum of entries
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_reconcile_account(p_account_id UUID)
RETURNS TABLE (
  account_id UUID,
  computed_balance NUMERIC(19, 4),
  latest_entry_balance NUMERIC(19, 4),
  is_reconciled BOOLEAN,
  entry_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH entry_sum AS (
    SELECT
      COALESCE(
        SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE -amount END),
        0
      ) AS computed,
      COUNT(*) AS cnt
    FROM ledger_entries le
    WHERE le.account_id = p_account_id
  ),
  latest AS (
    SELECT balance_after
    FROM ledger_entries le
    WHERE le.account_id = p_account_id
    ORDER BY sequence_number DESC
    LIMIT 1
  )
  SELECT
    p_account_id,
    es.computed,
    COALESCE(l.balance_after, 0::NUMERIC(19,4)),
    es.computed = COALESCE(l.balance_after, 0::NUMERIC(19,4)),
    es.cnt
  FROM entry_sum es
  LEFT JOIN latest l ON TRUE;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION fn_reconcile_account IS
  'Reconciles an account by comparing the sum of all credits minus debits '
  'against the latest balance_after value. Returns TRUE if they match. '
  'Run periodically for all accounts to detect data corruption.';


-- ============================================================================
-- ROW-LEVEL SECURITY (optional - enable per environment)
-- ============================================================================

-- These policies are defined but NOT enabled by default.
-- Enable with: ALTER TABLE financial_accounts ENABLE ROW LEVEL SECURITY;
-- This is useful when using Neon's connection pooling with JWT-based auth.

-- Users can only see their own accounts
DO $$ BEGIN
  CREATE POLICY user_accounts_policy ON financial_accounts
    FOR ALL
    USING (user_id = current_setting('app.current_user_id', TRUE))
    WITH CHECK (user_id = current_setting('app.current_user_id', TRUE));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can only see their own orders
DO $$ BEGIN
  CREATE POLICY user_orders_policy ON orders
    FOR ALL
    USING (user_id = current_setting('app.current_user_id', TRUE))
    WITH CHECK (user_id = current_setting('app.current_user_id', TRUE));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- SEED: Platform accounts (run once)
-- These are the system-level accounts that must exist for the ledger to work.
-- ============================================================================

INSERT INTO financial_accounts (id, user_id, account_type, currency, label, metadata)
VALUES
  -- Platform revenue account (where fees accumulate)
  (
    '00000000-0000-0000-0000-000000000001',
    NULL,
    'platform_revenue',
    'USD',
    'Platform Revenue - USD',
    '{"description": "Accumulated trading fees and platform revenue"}'::jsonb
  ),
  -- Platform reserve (operational float)
  (
    '00000000-0000-0000-0000-000000000002',
    NULL,
    'platform_reserve',
    'USD',
    'Platform Reserve - USD',
    '{"description": "Operational reserve for liquidity and operations"}'::jsonb
  ),
  -- Insurance fund
  (
    '00000000-0000-0000-0000-000000000003',
    NULL,
    'platform_insurance',
    'USD',
    'Insurance Fund - USD',
    '{"description": "Insurance fund for socialized losses and counterparty default"}'::jsonb
  ),
  -- Settlement pool
  (
    '00000000-0000-0000-0000-000000000004',
    NULL,
    'settlement_pool',
    'USD',
    'Settlement Pool - USD',
    '{"description": "Temporary holding pool during trade settlement"}'::jsonb
  ),
  -- Fee collection
  (
    '00000000-0000-0000-0000-000000000005',
    NULL,
    'fee_collection',
    'USD',
    'Fee Collection - USD',
    '{"description": "Collected fees before distribution to revenue"}'::jsonb
  ),
  -- External deposit source
  (
    '00000000-0000-0000-0000-000000000006',
    NULL,
    'external_deposit',
    'USD',
    'External Deposits - USD',
    '{"description": "Source account representing external deposit inflows"}'::jsonb
  ),
  -- External withdrawal destination
  (
    '00000000-0000-0000-0000-000000000007',
    NULL,
    'external_withdrawal',
    'USD',
    'External Withdrawals - USD',
    '{"description": "Destination account representing external withdrawal outflows"}'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

-- USDC platform accounts
INSERT INTO financial_accounts (id, user_id, account_type, currency, label, metadata)
VALUES
  (
    '00000000-0000-0000-0000-000000000011',
    NULL,
    'platform_revenue',
    'USDC',
    'Platform Revenue - USDC',
    '{"description": "Accumulated trading fees and platform revenue in USDC"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000012',
    NULL,
    'platform_reserve',
    'USDC',
    'Platform Reserve - USDC',
    '{"description": "Operational reserve in USDC"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000013',
    NULL,
    'platform_insurance',
    'USDC',
    'Insurance Fund - USDC',
    '{"description": "Insurance fund in USDC"}'::jsonb
  )
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- DONE
-- ============================================================================

-- Verify table creation
DO $$
DECLARE
  v_table_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'financial_accounts',
      'ledger_transactions',
      'ledger_entries',
      'orders',
      'trades',
      'settlements',
      'balances_snapshot',
      'idempotency_keys',
      'audit_trail'
    );

  IF v_table_count != 9 THEN
    RAISE EXCEPTION 'Migration verification failed: expected 9 tables, found %', v_table_count;
  END IF;

  RAISE NOTICE 'Migration 0001_initial completed successfully. % tables created.', v_table_count;
END $$;
