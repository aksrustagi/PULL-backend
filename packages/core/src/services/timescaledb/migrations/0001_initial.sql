-- ============================================================================
-- TimescaleDB Migration 0001: Initial Schema
-- PULL Time-Series Analytics & Market Data
--
-- This migration:
-- 1. Enables the TimescaleDB extension
-- 2. Creates all time-series tables
-- 3. Converts them to hypertables with appropriate chunk intervals
-- 4. Creates continuous aggregates for OHLCV candles
-- 5. Sets up compression policies (90%+ storage savings)
-- 6. Sets up retention policies (auto-drop old raw data)
-- 7. Creates refresh policies for continuous aggregates
--
-- Run against the TimescaleDB instance (NOT the NeonDB instance):
--   psql $TIMESCALEDB_URL -f 0001_initial.sql
-- ============================================================================

-- Enable TimescaleDB
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- ============================================================================
-- 1. RAW TABLES
-- ============================================================================

-- Price Ticks: Raw price data from all sources
CREATE TABLE IF NOT EXISTS price_ticks (
  time        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  symbol      VARCHAR(50) NOT NULL,
  source      VARCHAR(50) NOT NULL,
  price       NUMERIC(19,4) NOT NULL,
  volume      NUMERIC(19,8) NOT NULL DEFAULT 0,
  bid_price   NUMERIC(19,4),
  ask_price   NUMERIC(19,4),
  bid_size    NUMERIC(19,8),
  ask_size    NUMERIC(19,8),
  trade_id    VARCHAR(255),
  metadata    JSONB
);

-- Portfolio Snapshots: Periodic user portfolio valuations
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  time              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id           VARCHAR(255) NOT NULL,
  total_value_usd   NUMERIC(19,4) NOT NULL,
  cash_balance_usd  NUMERIC(19,4) NOT NULL,
  invested_value_usd NUMERIC(19,4) NOT NULL,
  unrealized_pnl_usd NUMERIC(19,4) NOT NULL DEFAULT 0,
  realized_pnl_usd   NUMERIC(19,4) NOT NULL DEFAULT 0,
  day_change_usd    NUMERIC(19,4) NOT NULL DEFAULT 0,
  day_change_pct    NUMERIC(8,4) NOT NULL DEFAULT 0,
  position_count    INTEGER NOT NULL DEFAULT 0,
  positions         JSONB
);

-- Market Events: Prediction market odds changes, resolutions, listings
CREATE TABLE IF NOT EXISTS market_events (
  time            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  market_id       VARCHAR(255) NOT NULL,
  event_type      VARCHAR(50) NOT NULL,
  symbol          VARCHAR(50) NOT NULL,
  price           NUMERIC(19,4),
  previous_price  NUMERIC(19,4),
  volume          NUMERIC(19,4),
  open_interest   NUMERIC(19,4),
  metadata        JSONB
);

-- Trading Volume: Pre-aggregated volume per symbol
CREATE TABLE IF NOT EXISTS trading_volume (
  time                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  symbol              VARCHAR(50) NOT NULL,
  market_type         VARCHAR(20) NOT NULL,
  trade_count         INTEGER NOT NULL DEFAULT 0,
  buy_volume          NUMERIC(19,8) NOT NULL DEFAULT 0,
  sell_volume         NUMERIC(19,8) NOT NULL DEFAULT 0,
  total_volume        NUMERIC(19,8) NOT NULL DEFAULT 0,
  notional_volume_usd NUMERIC(19,4) NOT NULL DEFAULT 0,
  high_price          NUMERIC(19,4),
  low_price           NUMERIC(19,4),
  vwap                NUMERIC(19,4),
  unique_buyers       INTEGER NOT NULL DEFAULT 0,
  unique_sellers      INTEGER NOT NULL DEFAULT 0
);

-- Order Book Snapshots: L2 depth at regular intervals
CREATE TABLE IF NOT EXISTS order_book_snapshots (
  time        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  symbol      VARCHAR(50) NOT NULL,
  source      VARCHAR(50) NOT NULL,
  best_bid    NUMERIC(19,4),
  best_ask    NUMERIC(19,4),
  spread      NUMERIC(19,4),
  spread_pct  NUMERIC(8,4),
  mid_price   NUMERIC(19,4),
  bid_depth_5  NUMERIC(19,8),
  ask_depth_5  NUMERIC(19,8),
  bid_depth_10 NUMERIC(19,8),
  ask_depth_10 NUMERIC(19,8),
  bids        JSONB,
  asks        JSONB
);

-- User Activity: Engagement event time-series
CREATE TABLE IF NOT EXISTS user_activity (
  time            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id         VARCHAR(255) NOT NULL,
  event_type      VARCHAR(50) NOT NULL,
  event_category  VARCHAR(50) NOT NULL,
  symbol          VARCHAR(50),
  market_type     VARCHAR(20),
  amount          NUMERIC(19,4),
  session_id      VARCHAR(255),
  platform        VARCHAR(20),
  metadata        JSONB
);

-- System Metrics: Internal performance data
CREATE TABLE IF NOT EXISTS system_metrics (
  time        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metric_name VARCHAR(100) NOT NULL,
  value       NUMERIC(19,4) NOT NULL,
  tags        JSONB,
  unit        VARCHAR(20)
);

-- ============================================================================
-- 2. CONVERT TO HYPERTABLES
-- ============================================================================

-- price_ticks: 1-day chunks (high volume, most queries are last 24h)
SELECT create_hypertable('price_ticks', 'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- portfolio_snapshots: 7-day chunks (medium volume, queries span weeks/months)
SELECT create_hypertable('portfolio_snapshots', 'time',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE
);

-- market_events: 1-day chunks
SELECT create_hypertable('market_events', 'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- trading_volume: 1-day chunks
SELECT create_hypertable('trading_volume', 'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- order_book_snapshots: 1-hour chunks (very high volume)
SELECT create_hypertable('order_book_snapshots', 'time',
  chunk_time_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

-- user_activity: 7-day chunks
SELECT create_hypertable('user_activity', 'time',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE
);

-- system_metrics: 1-day chunks
SELECT create_hypertable('system_metrics', 'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- ============================================================================
-- 3. INDEXES (on hypertables)
-- ============================================================================

-- price_ticks
CREATE INDEX IF NOT EXISTS idx_price_ticks_symbol_time ON price_ticks (symbol, time DESC);
CREATE INDEX IF NOT EXISTS idx_price_ticks_source_time ON price_ticks (source, time DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_price_ticks_source_trade_id ON price_ticks (source, trade_id) WHERE trade_id IS NOT NULL;

-- portfolio_snapshots
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_time ON portfolio_snapshots (user_id, time DESC);

-- market_events
CREATE INDEX IF NOT EXISTS idx_market_events_market_time ON market_events (market_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_market_events_type_time ON market_events (event_type, time DESC);
CREATE INDEX IF NOT EXISTS idx_market_events_symbol_time ON market_events (symbol, time DESC);

-- trading_volume
CREATE INDEX IF NOT EXISTS idx_trading_volume_symbol_time ON trading_volume (symbol, time DESC);
CREATE INDEX IF NOT EXISTS idx_trading_volume_market_time ON trading_volume (market_type, time DESC);

-- order_book_snapshots
CREATE INDEX IF NOT EXISTS idx_order_book_symbol_time ON order_book_snapshots (symbol, time DESC);

-- user_activity
CREATE INDEX IF NOT EXISTS idx_user_activity_user_time ON user_activity (user_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_type_time ON user_activity (event_type, time DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_category_time ON user_activity (event_category, time DESC);

-- system_metrics
CREATE INDEX IF NOT EXISTS idx_system_metrics_name_time ON system_metrics (metric_name, time DESC);

-- ============================================================================
-- 4. CONTINUOUS AGGREGATES (auto-refreshing OHLCV candles)
-- ============================================================================

-- 1-minute OHLCV candles
CREATE MATERIALIZED VIEW IF NOT EXISTS ohlcv_1m
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 minute', time) AS bucket,
  symbol,
  first(price, time) AS open,
  max(price) AS high,
  min(price) AS low,
  last(price, time) AS close,
  sum(volume) AS volume,
  count(*) AS trade_count,
  CASE WHEN sum(volume) > 0
    THEN (sum(price * volume) / sum(volume))
    ELSE 0
  END AS vwap
FROM price_ticks
GROUP BY bucket, symbol
WITH NO DATA;

-- 5-minute OHLCV candles
CREATE MATERIALIZED VIEW IF NOT EXISTS ohlcv_5m
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('5 minutes', time) AS bucket,
  symbol,
  first(price, time) AS open,
  max(price) AS high,
  min(price) AS low,
  last(price, time) AS close,
  sum(volume) AS volume,
  count(*) AS trade_count,
  CASE WHEN sum(volume) > 0
    THEN (sum(price * volume) / sum(volume))
    ELSE 0
  END AS vwap
FROM price_ticks
GROUP BY bucket, symbol
WITH NO DATA;

-- 15-minute OHLCV candles
CREATE MATERIALIZED VIEW IF NOT EXISTS ohlcv_15m
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('15 minutes', time) AS bucket,
  symbol,
  first(price, time) AS open,
  max(price) AS high,
  min(price) AS low,
  last(price, time) AS close,
  sum(volume) AS volume,
  count(*) AS trade_count,
  CASE WHEN sum(volume) > 0
    THEN (sum(price * volume) / sum(volume))
    ELSE 0
  END AS vwap
FROM price_ticks
GROUP BY bucket, symbol
WITH NO DATA;

-- 1-hour OHLCV candles
CREATE MATERIALIZED VIEW IF NOT EXISTS ohlcv_1h
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  symbol,
  first(price, time) AS open,
  max(price) AS high,
  min(price) AS low,
  last(price, time) AS close,
  sum(volume) AS volume,
  count(*) AS trade_count,
  CASE WHEN sum(volume) > 0
    THEN (sum(price * volume) / sum(volume))
    ELSE 0
  END AS vwap
FROM price_ticks
GROUP BY bucket, symbol
WITH NO DATA;

-- 1-day OHLCV candles
CREATE MATERIALIZED VIEW IF NOT EXISTS ohlcv_1d
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', time) AS bucket,
  symbol,
  first(price, time) AS open,
  max(price) AS high,
  min(price) AS low,
  last(price, time) AS close,
  sum(volume) AS volume,
  count(*) AS trade_count,
  CASE WHEN sum(volume) > 0
    THEN (sum(price * volume) / sum(volume))
    ELSE 0
  END AS vwap
FROM price_ticks
GROUP BY bucket, symbol
WITH NO DATA;

-- ============================================================================
-- 5. CONTINUOUS AGGREGATE REFRESH POLICIES
-- ============================================================================

-- 1m candles: refresh every 1 minute, covering last 2 hours
SELECT add_continuous_aggregate_policy('ohlcv_1m',
  start_offset => INTERVAL '2 hours',
  end_offset   => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute',
  if_not_exists => TRUE
);

-- 5m candles: refresh every 5 minutes, covering last 6 hours
SELECT add_continuous_aggregate_policy('ohlcv_5m',
  start_offset => INTERVAL '6 hours',
  end_offset   => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '5 minutes',
  if_not_exists => TRUE
);

-- 15m candles: refresh every 15 minutes, covering last 12 hours
SELECT add_continuous_aggregate_policy('ohlcv_15m',
  start_offset => INTERVAL '12 hours',
  end_offset   => INTERVAL '15 minutes',
  schedule_interval => INTERVAL '15 minutes',
  if_not_exists => TRUE
);

-- 1h candles: refresh every hour, covering last 2 days
SELECT add_continuous_aggregate_policy('ohlcv_1h',
  start_offset => INTERVAL '2 days',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

-- 1d candles: refresh every day, covering last 7 days
SELECT add_continuous_aggregate_policy('ohlcv_1d',
  start_offset => INTERVAL '7 days',
  end_offset   => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- ============================================================================
-- 6. COMPRESSION POLICIES
-- Compress old chunks to save 90%+ storage. Compressed data is still queryable.
-- ============================================================================

-- price_ticks: compress after 7 days, order by symbol for query locality
ALTER TABLE price_ticks SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'symbol',
  timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('price_ticks', INTERVAL '7 days', if_not_exists => TRUE);

-- portfolio_snapshots: compress after 30 days
ALTER TABLE portfolio_snapshots SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'user_id',
  timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('portfolio_snapshots', INTERVAL '30 days', if_not_exists => TRUE);

-- market_events: compress after 14 days
ALTER TABLE market_events SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'market_id',
  timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('market_events', INTERVAL '14 days', if_not_exists => TRUE);

-- trading_volume: compress after 14 days
ALTER TABLE trading_volume SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'symbol',
  timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('trading_volume', INTERVAL '14 days', if_not_exists => TRUE);

-- order_book_snapshots: compress after 3 days (very high volume)
ALTER TABLE order_book_snapshots SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'symbol',
  timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('order_book_snapshots', INTERVAL '3 days', if_not_exists => TRUE);

-- user_activity: compress after 30 days
ALTER TABLE user_activity SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'user_id',
  timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('user_activity', INTERVAL '30 days', if_not_exists => TRUE);

-- system_metrics: compress after 7 days
ALTER TABLE system_metrics SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'metric_name',
  timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('system_metrics', INTERVAL '7 days', if_not_exists => TRUE);

-- ============================================================================
-- 7. RETENTION POLICIES
-- Auto-drop old raw data. Continuous aggregates survive independently.
-- ============================================================================

-- price_ticks: keep 90 days of raw ticks (candles survive via continuous aggregates)
SELECT add_retention_policy('price_ticks', INTERVAL '90 days', if_not_exists => TRUE);

-- order_book_snapshots: keep 30 days (high volume, rarely need old snapshots)
SELECT add_retention_policy('order_book_snapshots', INTERVAL '30 days', if_not_exists => TRUE);

-- system_metrics: keep 90 days
SELECT add_retention_policy('system_metrics', INTERVAL '90 days', if_not_exists => TRUE);

-- portfolio_snapshots: keep 2 years (users want long-term P&L history)
SELECT add_retention_policy('portfolio_snapshots', INTERVAL '730 days', if_not_exists => TRUE);

-- user_activity: keep 1 year
SELECT add_retention_policy('user_activity', INTERVAL '365 days', if_not_exists => TRUE);

-- market_events: keep 1 year
SELECT add_retention_policy('market_events', INTERVAL '365 days', if_not_exists => TRUE);

-- trading_volume: keep 2 years
SELECT add_retention_policy('trading_volume', INTERVAL '730 days', if_not_exists => TRUE);

-- ============================================================================
-- Done! TimescaleDB is ready for PULL time-series data.
-- ============================================================================
