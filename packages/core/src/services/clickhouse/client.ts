/**
 * ClickHouse Analytics Client
 * Client for fast analytics and aggregations using ClickHouse
 */

import type {
  ClickHouseClientConfig,
  Logger,
  QueryParams,
  QueryResult,
  QueryFormat,
  InsertParams,
  InsertResult,
  AnalyticsEvent,
  TradeAnalytics,
  VolumeMetrics,
  UserTradingMetrics,
  TimeSeriesQuery,
  TimeSeriesDataPoint,
  AggregationResult,
  FunnelAnalysis,
  FunnelResult,
  CohortDefinition,
  CohortResult,
  TimeGranularity,
} from "./types";
import { ClickHouseError } from "./types";

// ============================================================================
// ClickHouse Client
// ============================================================================

export class ClickHouseClient {
  private readonly host: string;
  private readonly port: number;
  private readonly database: string;
  private readonly username: string;
  private readonly password: string;
  private readonly protocol: "http" | "https";
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly compression: boolean;
  private readonly logger: Logger;

  constructor(config: ClickHouseClientConfig) {
    this.host = config.host;
    this.port = config.port ?? (config.protocol === "https" ? 8443 : 8123);
    this.database = config.database;
    this.username = config.username;
    this.password = config.password;
    this.protocol = config.protocol ?? "https";
    this.timeout = config.timeout ?? 30000;
    this.maxRetries = config.maxRetries ?? 3;
    this.compression = config.compression ?? true;
    this.logger = config.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[ClickHouse] ${msg}`, meta),
      info: (msg, meta) => console.info(`[ClickHouse] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[ClickHouse] ${msg}`, meta),
      error: (msg, meta) => console.error(`[ClickHouse] ${msg}`, meta),
    };
  }

  private get baseUrl(): string {
    return `${this.protocol}://${this.host}:${this.port}`;
  }

  // ==========================================================================
  // Core Query Methods
  // ==========================================================================

  /**
   * Execute a raw SQL query
   */
  async query<T = Record<string, unknown>>(
    params: QueryParams
  ): Promise<QueryResult<T>> {
    const format = params.format ?? "JSON";
    const queryWithFormat = `${params.query} FORMAT ${format}`;

    const url = new URL(this.baseUrl);
    url.searchParams.set("database", this.database);

    // Add query parameters
    if (params.params) {
      for (const [key, value] of Object.entries(params.params)) {
        url.searchParams.set(`param_${key}`, String(value));
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": "text/plain",
      Authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString("base64")}`,
    };

    if (this.compression) {
      headers["Accept-Encoding"] = "gzip";
    }

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url.toString(), {
          method: "POST",
          headers,
          body: queryWithFormat,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new ClickHouseError(
            errorText,
            response.status,
            params.query
          );
        }

        const result = await response.json();

        this.logger.debug("Query executed", {
          rows: result.rows,
          elapsed: result.statistics?.elapsed,
        });

        return {
          data: result.data ?? [],
          statistics: result.statistics ?? {
            elapsed: 0,
            rows_read: 0,
            bytes_read: 0,
          },
          rows: result.rows ?? result.data?.length ?? 0,
          rows_before_limit_at_least: result.rows_before_limit_at_least,
        };
      } catch (error) {
        lastError = error as Error;

        if (error instanceof ClickHouseError) {
          // Don't retry on syntax errors or permission errors
          if (error.code >= 400 && error.code < 500) {
            throw error;
          }
        }

        if (attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt) * 100;
          this.logger.warn(`Query failed, retrying in ${delay}ms`, {
            attempt,
            error: lastError.message,
          });
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw lastError ?? new ClickHouseError("Query failed", 500, params.query);
  }

  /**
   * Execute a query and return just the data
   */
  async queryData<T = Record<string, unknown>>(
    query: string,
    params?: Record<string, unknown>
  ): Promise<T[]> {
    const result = await this.query<T>({ query, params });
    return result.data;
  }

  /**
   * Execute a query and return a single row
   */
  async queryOne<T = Record<string, unknown>>(
    query: string,
    params?: Record<string, unknown>
  ): Promise<T | null> {
    const result = await this.query<T>({ query, params });
    return result.data[0] ?? null;
  }

  // ==========================================================================
  // Insert Methods
  // ==========================================================================

  /**
   * Insert rows into a table
   */
  async insert<T extends Record<string, unknown>>(
    params: InsertParams<T>
  ): Promise<InsertResult> {
    const startTime = Date.now();

    if (params.values.length === 0) {
      return { rows_inserted: 0, execution_time_ms: 0 };
    }

    const columns = params.columns ?? Object.keys(params.values[0]);
    const values = params.values
      .map((row) =>
        columns.map((col) => this.formatValue(row[col])).join(",")
      )
      .join("),(");

    const query = `INSERT INTO ${params.table} (${columns.join(",")}) VALUES (${values})`;

    await this.execute(query);

    return {
      rows_inserted: params.values.length,
      execution_time_ms: Date.now() - startTime,
    };
  }

  /**
   * Insert rows using JSONEachRow format (more efficient for large inserts)
   */
  async insertJSON<T extends Record<string, unknown>>(
    table: string,
    values: T[]
  ): Promise<InsertResult> {
    const startTime = Date.now();

    if (values.length === 0) {
      return { rows_inserted: 0, execution_time_ms: 0 };
    }

    const url = new URL(this.baseUrl);
    url.searchParams.set("database", this.database);
    url.searchParams.set(
      "query",
      `INSERT INTO ${table} FORMAT JSONEachRow`
    );

    const body = values.map((row) => JSON.stringify(row)).join("\n");

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString("base64")}`,
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ClickHouseError(errorText, response.status);
    }

    this.logger.info("Batch insert completed", {
      table,
      rows: values.length,
    });

    return {
      rows_inserted: values.length,
      execution_time_ms: Date.now() - startTime,
    };
  }

  /**
   * Execute a command (INSERT, CREATE, ALTER, etc.)
   */
  async execute(query: string): Promise<void> {
    const url = new URL(this.baseUrl);
    url.searchParams.set("database", this.database);

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        Authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString("base64")}`,
      },
      body: query,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ClickHouseError(errorText, response.status, query);
    }
  }

  // ==========================================================================
  // Analytics Events
  // ==========================================================================

  /**
   * Track an analytics event
   */
  async trackEvent(event: AnalyticsEvent): Promise<void> {
    await this.insertJSON("analytics_events", [
      {
        event_id: event.event_id,
        event_name: event.event_name,
        user_id: event.user_id ?? "",
        session_id: event.session_id ?? "",
        timestamp: event.timestamp.toISOString(),
        properties: JSON.stringify(event.properties),
        ip: event.context.ip ?? "",
        user_agent: event.context.user_agent ?? "",
        page_url: event.context.page_url ?? "",
        referrer: event.context.referrer ?? "",
        device_type: event.context.device_type ?? "",
        os: event.context.os ?? "",
        browser: event.context.browser ?? "",
        app_version: event.context.app_version ?? "",
      },
    ]);
  }

  /**
   * Track multiple events in batch
   */
  async trackEvents(events: AnalyticsEvent[]): Promise<InsertResult> {
    const rows = events.map((event) => ({
      event_id: event.event_id,
      event_name: event.event_name,
      user_id: event.user_id ?? "",
      session_id: event.session_id ?? "",
      timestamp: event.timestamp.toISOString(),
      properties: JSON.stringify(event.properties),
      ip: event.context.ip ?? "",
      user_agent: event.context.user_agent ?? "",
      page_url: event.context.page_url ?? "",
      referrer: event.context.referrer ?? "",
      device_type: event.context.device_type ?? "",
      os: event.context.os ?? "",
      browser: event.context.browser ?? "",
      app_version: event.context.app_version ?? "",
    }));

    return this.insertJSON("analytics_events", rows);
  }

  // ==========================================================================
  // Trading Analytics
  // ==========================================================================

  /**
   * Record a trade for analytics
   */
  async recordTrade(trade: TradeAnalytics): Promise<void> {
    await this.insertJSON("trade_analytics", [
      {
        ...trade,
        timestamp: trade.timestamp.toISOString(),
      },
    ]);
  }

  /**
   * Get volume metrics for a time period
   */
  async getVolumeMetrics(
    startDate: Date,
    endDate: Date,
    granularity: TimeGranularity = "day"
  ): Promise<VolumeMetrics[]> {
    const interval = this.granularityToInterval(granularity);

    const result = await this.queryData<VolumeMetrics>(`
      SELECT
        toStartOf${this.capitalize(granularity)}(timestamp) as period,
        sum(total_value) as total_volume,
        count() as trade_count,
        uniq(user_id) as unique_traders,
        avg(total_value) as avg_trade_size
      FROM trade_analytics
      WHERE timestamp >= {startDate:DateTime}
        AND timestamp < {endDate:DateTime}
      GROUP BY period
      ORDER BY period
    `, {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });

    return result;
  }

  /**
   * Get trading metrics for a specific user
   */
  async getUserTradingMetrics(userId: string): Promise<UserTradingMetrics | null> {
    return this.queryOne<UserTradingMetrics>(`
      SELECT
        user_id,
        count() as total_trades,
        sum(total_value) as total_volume,
        countIf(side = 'buy') as winning_trades,
        countIf(side = 'sell') as losing_trades,
        winning_trades / total_trades as win_rate,
        avg(total_value) as avg_trade_size,
        argMax(symbol, count()) as most_traded_symbol,
        min(timestamp) as first_trade_at,
        max(timestamp) as last_trade_at
      FROM trade_analytics
      WHERE user_id = {userId:String}
      GROUP BY user_id
    `, { userId });
  }

  /**
   * Get top traders by volume
   */
  async getTopTraders(
    startDate: Date,
    endDate: Date,
    limit: number = 100
  ): Promise<Array<{ user_id: string; volume: number; trade_count: number }>> {
    return this.queryData(`
      SELECT
        user_id,
        sum(total_value) as volume,
        count() as trade_count
      FROM trade_analytics
      WHERE timestamp >= {startDate:DateTime}
        AND timestamp < {endDate:DateTime}
      GROUP BY user_id
      ORDER BY volume DESC
      LIMIT {limit:UInt32}
    `, {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      limit,
    });
  }

  // ==========================================================================
  // Time Series Analysis
  // ==========================================================================

  /**
   * Query time series data
   */
  async queryTimeSeries(params: TimeSeriesQuery): Promise<TimeSeriesDataPoint[]> {
    const interval = this.granularityToInterval(params.granularity);
    const filterClauses = this.buildFilterClauses(params.filters ?? {});
    const groupByClause = params.groupBy?.length
      ? `, ${params.groupBy.join(", ")}`
      : "";

    const query = `
      SELECT
        toStartOf${this.capitalize(params.granularity)}(timestamp) as timestamp,
        ${params.metric} as value
        ${groupByClause}
      FROM analytics_events
      WHERE timestamp >= {startTime:DateTime}
        AND timestamp < {endTime:DateTime}
        ${filterClauses}
      GROUP BY timestamp ${groupByClause}
      ORDER BY timestamp
    `;

    const result = await this.queryData<{
      timestamp: string;
      value: number;
      [key: string]: unknown;
    }>(query, {
      startTime: params.startTime.toISOString(),
      endTime: params.endTime.toISOString(),
    });

    return result.map((row) => ({
      timestamp: new Date(row.timestamp),
      value: row.value,
      dimensions: params.groupBy?.reduce(
        (acc, key) => ({ ...acc, [key]: String(row[key]) }),
        {}
      ),
    }));
  }

  // ==========================================================================
  // Funnel Analysis
  // ==========================================================================

  /**
   * Analyze conversion funnel
   */
  async analyzeFunnel(analysis: FunnelAnalysis): Promise<FunnelResult[]> {
    const results: FunnelResult[] = [];

    for (let i = 0; i < analysis.steps.length; i++) {
      const step = analysis.steps[i];
      const prevStep = i > 0 ? analysis.steps[i - 1] : null;

      // Build the query for this step
      let query = `
        SELECT
          uniq(user_id) as users_completed,
          avg(timestamp) as avg_time
        FROM analytics_events
        WHERE event_name = {eventName:String}
          AND timestamp >= {startDate:DateTime}
          AND timestamp < {endDate:DateTime}
      `;

      if (step.filters) {
        query += this.buildFilterClauses(step.filters);
      }

      // If not the first step, filter to users who completed previous steps
      if (prevStep) {
        query += `
          AND user_id IN (
            SELECT DISTINCT user_id
            FROM analytics_events
            WHERE event_name = {prevEventName:String}
              AND timestamp >= {startDate:DateTime}
              AND timestamp < {endDate:DateTime}
          )
        `;
      }

      const result = await this.queryOne<{
        users_completed: number;
        avg_time: string;
      }>(query, {
        eventName: step.event_name,
        prevEventName: prevStep?.event_name ?? "",
        startDate: analysis.startDate.toISOString(),
        endDate: analysis.endDate.toISOString(),
      });

      const usersEntered = i === 0
        ? result?.users_completed ?? 0
        : results[i - 1].users_completed;

      results.push({
        step_name: step.name,
        users_entered: usersEntered,
        users_completed: result?.users_completed ?? 0,
        conversion_rate:
          usersEntered > 0
            ? (result?.users_completed ?? 0) / usersEntered
            : 0,
        avg_time_to_convert_seconds: 0, // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
      });
    }

    return results;
  }

  // ==========================================================================
  // Cohort Analysis
  // ==========================================================================

  /**
   * Perform cohort retention analysis
   */
  async analyzeCohort(definition: CohortDefinition): Promise<CohortResult[]> {
    const query = `
      WITH cohorts AS (
        SELECT
          user_id,
          toStartOf${this.capitalize(definition.granularity)}(
            min(${definition.cohort_date_field})
          ) as cohort_date
        FROM analytics_events
        WHERE timestamp >= {startDate:DateTime}
          AND timestamp < {endDate:DateTime}
        GROUP BY user_id
      ),
      activity AS (
        SELECT
          user_id,
          toStartOf${this.capitalize(definition.granularity)}(timestamp) as activity_date
        FROM analytics_events
        WHERE event_name = {activityEvent:String}
          AND timestamp >= {startDate:DateTime}
        GROUP BY user_id, activity_date
      )
      SELECT
        c.cohort_date,
        count(DISTINCT c.user_id) as cohort_size,
        groupArray(
          countIf(a.user_id IS NOT NULL)
        ) as retention
      FROM cohorts c
      LEFT JOIN activity a ON c.user_id = a.user_id
        AND a.activity_date >= c.cohort_date
      GROUP BY c.cohort_date
      ORDER BY c.cohort_date
    `;

    const result = await this.queryData<{
      cohort_date: string;
      cohort_size: number;
      retention: number[];
    }>(query, {
      startDate: definition.startDate.toISOString(),
      endDate: definition.endDate.toISOString(),
      activityEvent: definition.activity_event,
    });

    return result.map((row) => ({
      cohort_date: new Date(row.cohort_date),
      cohort_size: row.cohort_size,
      retention: row.retention.map((count) =>
        row.cohort_size > 0 ? count / row.cohort_size : 0
      ),
    }));
  }

  // ==========================================================================
  // Aggregation Helpers
  // ==========================================================================

  /**
   * Count events with optional filters
   */
  async countEvents(
    eventName: string,
    startDate: Date,
    endDate: Date,
    filters?: Record<string, unknown>
  ): Promise<number> {
    const filterClauses = this.buildFilterClauses(filters ?? {});

    const result = await this.queryOne<{ count: number }>(`
      SELECT count() as count
      FROM analytics_events
      WHERE event_name = {eventName:String}
        AND timestamp >= {startDate:DateTime}
        AND timestamp < {endDate:DateTime}
        ${filterClauses}
    `, {
      eventName,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });

    return result?.count ?? 0;
  }

  /**
   * Get unique user count
   */
  async countUniqueUsers(
    startDate: Date,
    endDate: Date,
    eventName?: string
  ): Promise<number> {
    const eventFilter = eventName
      ? "AND event_name = {eventName:String}"
      : "";

    const result = await this.queryOne<{ count: number }>(`
      SELECT uniq(user_id) as count
      FROM analytics_events
      WHERE timestamp >= {startDate:DateTime}
        AND timestamp < {endDate:DateTime}
        ${eventFilter}
    `, {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      eventName: eventName ?? "",
    });

    return result?.count ?? 0;
  }

  // ==========================================================================
  // Schema Management
  // ==========================================================================

  /**
   * Create analytics tables
   */
  async createTables(): Promise<void> {
    // Analytics events table
    await this.execute(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        event_id String,
        event_name LowCardinality(String),
        user_id String,
        session_id String,
        timestamp DateTime64(3),
        properties String,
        ip String,
        user_agent String,
        page_url String,
        referrer String,
        device_type LowCardinality(String),
        os LowCardinality(String),
        browser LowCardinality(String),
        app_version LowCardinality(String)
      )
      ENGINE = MergeTree()
      PARTITION BY toYYYYMM(timestamp)
      ORDER BY (event_name, timestamp, user_id)
      SETTINGS index_granularity = 8192
    `);

    // Trade analytics table
    await this.execute(`
      CREATE TABLE IF NOT EXISTS trade_analytics (
        trade_id String,
        user_id String,
        symbol LowCardinality(String),
        asset_type LowCardinality(String),
        side LowCardinality(String),
        quantity Float64,
        price Float64,
        total_value Float64,
        fee Float64,
        timestamp DateTime64(3),
        execution_time_ms UInt32
      )
      ENGINE = MergeTree()
      PARTITION BY toYYYYMM(timestamp)
      ORDER BY (symbol, timestamp, user_id)
      SETTINGS index_granularity = 8192
    `);

    this.logger.info("Analytics tables created");
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  private formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return "NULL";
    }
    if (typeof value === "string") {
      return `'${value.replace(/'/g, "\\'")}'`;
    }
    if (typeof value === "boolean") {
      return value ? "1" : "0";
    }
    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }
    if (typeof value === "object") {
      return `'${JSON.stringify(value).replace(/'/g, "\\'")}'`;
    }
    return String(value);
  }

  private buildFilterClauses(filters: Record<string, unknown>): string {
    const clauses = Object.entries(filters).map(([key, value]) => {
      if (Array.isArray(value)) {
        const values = value.map((v) => this.formatValue(v)).join(",");
        return `AND ${key} IN (${values})`;
      }
      return `AND ${key} = ${this.formatValue(value)}`;
    });
    return clauses.join(" ");
  }

  private granularityToInterval(granularity: TimeGranularity): string {
    const intervals: Record<TimeGranularity, string> = {
      minute: "INTERVAL 1 MINUTE",
      hour: "INTERVAL 1 HOUR",
      day: "INTERVAL 1 DAY",
      week: "INTERVAL 1 WEEK",
      month: "INTERVAL 1 MONTH",
      year: "INTERVAL 1 YEAR",
    };
    return intervals[granularity];
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Health check
   */
  async ping(): Promise<boolean> {
    try {
      await this.queryOne("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }
}

export default ClickHouseClient;
