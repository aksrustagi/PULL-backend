/**
 * Analytics Pipeline Client
 * Segment → BigQuery → Metabase integration
 */

import * as crypto from "crypto";
import type {
  AnalyticsClientConfig,
  Logger,
  IdentifyPayload,
  TrackPayload,
  PagePayload,
  GroupPayload,
  AliasPayload,
  EventContext,
  UserTraits,
  EventProperties,
  BigQueryTable,
  BigQueryInsertResult,
  BigQueryQueryResult,
  BigQueryField,
  MetabaseQuestion,
  MetabaseQueryResult,
  MetabaseDashboard,
  Metric,
  MetricAggregation,
} from "./types";
import { AnalyticsError } from "./types";

// ============================================================================
// Analytics Client
// ============================================================================

export class AnalyticsClient {
  private readonly segmentWriteKey?: string;
  private readonly segmentDataPlaneUrl: string;
  private readonly bigQueryConfig?: {
    projectId: string;
    datasetId: string;
    credentials: { clientEmail: string; privateKey: string };
    location: string;
  };
  private readonly metabaseConfig?: {
    instanceUrl: string;
    apiKey: string;
  };
  private readonly batchSize: number;
  private readonly flushInterval: number;
  private readonly logger: Logger;

  // Event queue for batching
  private eventQueue: Array<{
    type: "identify" | "track" | "page" | "group" | "alias";
    payload: unknown;
  }> = [];
  private flushTimer: NodeJS.Timeout | null = null;

  // BigQuery access token cache
  private bigQueryToken: { token: string; expiresAt: Date } | null = null;

  constructor(config: AnalyticsClientConfig) {
    this.segmentWriteKey = config.segment?.writeKey;
    this.segmentDataPlaneUrl =
      config.segment?.dataPlaneUrl ?? "https://api.segment.io/v1";
    this.bigQueryConfig = config.bigQuery
      ? {
          ...config.bigQuery,
          location: config.bigQuery.location ?? "US",
        }
      : undefined;
    this.metabaseConfig = config.metabase;
    this.batchSize = config.batchSize ?? 100;
    this.flushInterval = config.flushInterval ?? 10000;
    this.logger = config.logger ?? this.createDefaultLogger();

    // Start flush timer
    if (this.segmentWriteKey) {
      this.startFlushTimer();
    }
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[Analytics] ${msg}`, meta),
      info: (msg, meta) => console.info(`[Analytics] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[Analytics] ${msg}`, meta),
      error: (msg, meta) => console.error(`[Analytics] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // Segment Methods
  // ==========================================================================

  /**
   * Identify a user
   */
  async identify(payload: IdentifyPayload): Promise<void> {
    this.enqueueEvent("identify", {
      userId: payload.userId,
      traits: payload.traits,
      context: payload.context,
      timestamp: (payload.timestamp ?? new Date()).toISOString(),
      messageId: crypto.randomUUID(),
    });
  }

  /**
   * Track an event
   */
  async track(payload: TrackPayload): Promise<void> {
    this.enqueueEvent("track", {
      userId: payload.userId,
      event: payload.event,
      properties: payload.properties,
      context: payload.context,
      timestamp: (payload.timestamp ?? new Date()).toISOString(),
      messageId: crypto.randomUUID(),
    });
  }

  /**
   * Track a page view
   */
  async page(payload: PagePayload): Promise<void> {
    this.enqueueEvent("page", {
      userId: payload.userId,
      anonymousId: payload.anonymousId,
      name: payload.name,
      category: payload.category,
      properties: payload.properties,
      context: payload.context,
      timestamp: (payload.timestamp ?? new Date()).toISOString(),
      messageId: crypto.randomUUID(),
    });
  }

  /**
   * Associate a user with a group
   */
  async group(payload: GroupPayload): Promise<void> {
    this.enqueueEvent("group", {
      userId: payload.userId,
      groupId: payload.groupId,
      traits: payload.traits,
      context: payload.context,
      timestamp: (payload.timestamp ?? new Date()).toISOString(),
      messageId: crypto.randomUUID(),
    });
  }

  /**
   * Create an alias for a user
   */
  async alias(payload: AliasPayload): Promise<void> {
    this.enqueueEvent("alias", {
      previousId: payload.previousId,
      userId: payload.userId,
      context: payload.context,
      timestamp: (payload.timestamp ?? new Date()).toISOString(),
      messageId: crypto.randomUUID(),
    });
  }

  /**
   * Enqueue event for batching
   */
  private enqueueEvent(
    type: "identify" | "track" | "page" | "group" | "alias",
    payload: unknown
  ): void {
    this.eventQueue.push({ type, payload });

    if (this.eventQueue.length >= this.batchSize) {
      this.flush();
    }
  }

  /**
   * Flush event queue to Segment
   */
  async flush(): Promise<void> {
    if (this.eventQueue.length === 0 || !this.segmentWriteKey) {
      return;
    }

    const events = this.eventQueue.splice(0, this.batchSize);

    this.logger.debug("Flushing events to Segment", { count: events.length });

    try {
      const response = await fetch(`${this.segmentDataPlaneUrl}/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(`${this.segmentWriteKey}:`).toString("base64")}`,
        },
        body: JSON.stringify({
          batch: events.map((e) => ({ type: e.type, ...e.payload })),
        }),
      });

      if (!response.ok) {
        throw new AnalyticsError(
          `Segment API error: ${response.status}`,
          "SEGMENT_ERROR",
          "segment"
        );
      }

      this.logger.info("Events flushed to Segment", { count: events.length });
    } catch (error) {
      this.logger.error("Failed to flush events", {
        error: (error as Error).message,
      });
      // Re-queue events on failure
      this.eventQueue.unshift(...events);
    }
  }

  /**
   * Start flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  /**
   * Stop flush timer
   */
  stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  // ==========================================================================
  // Convenience Track Methods
  // ==========================================================================

  /**
   * Track user signed up
   */
  async trackSignUp(
    userId: string,
    method: "email" | "google" | "apple" | "wallet",
    properties?: EventProperties
  ): Promise<void> {
    await this.track({
      userId,
      event: "Signed Up",
      properties: {
        signup_method: method,
        ...properties,
      },
    });
  }

  /**
   * Track user signed in
   */
  async trackSignIn(
    userId: string,
    method: string,
    properties?: EventProperties
  ): Promise<void> {
    await this.track({
      userId,
      event: "Signed In",
      properties: {
        signin_method: method,
        ...properties,
      },
    });
  }

  /**
   * Track order placed
   */
  async trackOrderPlaced(
    userId: string,
    orderDetails: {
      orderId: string;
      marketId: string;
      marketTitle: string;
      side: "buy" | "sell";
      quantity: number;
      price: number;
      orderType: "market" | "limit";
      assetType: "crypto" | "prediction" | "rwa";
    }
  ): Promise<void> {
    await this.track({
      userId,
      event: "Order Placed",
      properties: {
        order_id: orderDetails.orderId,
        market_id: orderDetails.marketId,
        market_title: orderDetails.marketTitle,
        side: orderDetails.side,
        quantity: orderDetails.quantity,
        price: orderDetails.price,
        order_type: orderDetails.orderType,
        asset_type: orderDetails.assetType,
      },
    });
  }

  /**
   * Track trade executed
   */
  async trackTradeExecuted(
    userId: string,
    tradeDetails: {
      tradeId: string;
      orderId: string;
      marketId: string;
      side: "buy" | "sell";
      quantity: number;
      price: number;
      totalValue: number;
      fee: number;
      executionTimeMs: number;
    }
  ): Promise<void> {
    await this.track({
      userId,
      event: "Trade Executed",
      properties: {
        trade_id: tradeDetails.tradeId,
        order_id: tradeDetails.orderId,
        market_id: tradeDetails.marketId,
        side: tradeDetails.side,
        quantity: tradeDetails.quantity,
        price: tradeDetails.price,
        total_value: tradeDetails.totalValue,
        fee: tradeDetails.fee,
        execution_time_ms: tradeDetails.executionTimeMs,
      },
    });
  }

  /**
   * Track market viewed
   */
  async trackMarketViewed(
    userId: string,
    marketDetails: {
      marketId: string;
      marketTitle: string;
      category: string;
      source: "search" | "browse" | "recommendation" | "link" | "notification";
      position?: number;
    }
  ): Promise<void> {
    await this.track({
      userId,
      event: "Market Viewed",
      properties: {
        market_id: marketDetails.marketId,
        market_title: marketDetails.marketTitle,
        category: marketDetails.category,
        source: marketDetails.source,
        position: marketDetails.position,
      },
    });
  }

  /**
   * Track points earned
   */
  async trackPointsEarned(
    userId: string,
    details: {
      points: number;
      action: string;
      totalPoints: number;
      level: number;
    }
  ): Promise<void> {
    await this.track({
      userId,
      event: "Points Earned",
      properties: {
        points: details.points,
        action: details.action,
        total_points: details.totalPoints,
        level: details.level,
      },
    });
  }

  /**
   * Track feature used
   */
  async trackFeatureUsed(
    userId: string,
    featureName: string,
    properties?: EventProperties
  ): Promise<void> {
    await this.track({
      userId,
      event: "Feature Used",
      properties: {
        feature_name: featureName,
        ...properties,
      },
    });
  }

  // ==========================================================================
  // BigQuery Methods
  // ==========================================================================

  /**
   * Insert rows into BigQuery
   */
  async insertRows(
    tableId: string,
    rows: Record<string, unknown>[]
  ): Promise<BigQueryInsertResult> {
    if (!this.bigQueryConfig) {
      throw new AnalyticsError("BigQuery not configured", "BQ_NOT_CONFIGURED");
    }

    const accessToken = await this.getBigQueryAccessToken();
    const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${this.bigQueryConfig.projectId}/datasets/${this.bigQueryConfig.datasetId}/tables/${tableId}/insertAll`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        rows: rows.map((row) => ({
          insertId: crypto.randomUUID(),
          json: row,
        })),
      }),
    });

    const data = await response.json();

    if (data.insertErrors?.length > 0) {
      return {
        success: false,
        insertedRows: rows.length - data.insertErrors.length,
        errors: data.insertErrors.map((e: { index: number; errors: Array<{ reason: string; message: string }> }) => ({
          index: e.index,
          errors: e.errors,
        })),
      };
    }

    this.logger.info("Rows inserted to BigQuery", {
      table: tableId,
      count: rows.length,
    });

    return {
      success: true,
      insertedRows: rows.length,
    };
  }

  /**
   * Query BigQuery
   */
  async query<T = Record<string, unknown>>(
    sql: string,
    params?: Record<string, unknown>
  ): Promise<BigQueryQueryResult<T>> {
    if (!this.bigQueryConfig) {
      throw new AnalyticsError("BigQuery not configured", "BQ_NOT_CONFIGURED");
    }

    const accessToken = await this.getBigQueryAccessToken();
    const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${this.bigQueryConfig.projectId}/queries`;

    const queryParams = params
      ? Object.entries(params).map(([name, value]) => ({
          name,
          parameterType: {
            type: this.getBigQueryParamType(value),
          },
          parameterValue: { value: String(value) },
        }))
      : undefined;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: sql,
        useLegacySql: false,
        parameterMode: params ? "NAMED" : undefined,
        queryParameters: queryParams,
        location: this.bigQueryConfig.location,
      }),
    });

    const data = await response.json();

    if (data.error) {
      throw new AnalyticsError(
        data.error.message,
        "BQ_QUERY_ERROR",
        "bigquery"
      );
    }

    const schema = data.schema?.fields ?? [];
    const rows = (data.rows ?? []).map((row: { f: Array<{ v: unknown }> }) => {
      const obj: Record<string, unknown> = {};
      row.f.forEach((field, index) => {
        obj[schema[index]?.name ?? `col${index}`] = field.v;
      });
      return obj as T;
    });

    return {
      rows,
      totalRows: parseInt(data.totalRows ?? "0", 10),
      schema,
      jobId: data.jobReference?.jobId ?? "",
      cacheHit: data.cacheHit ?? false,
    };
  }

  /**
   * Create BigQuery table
   */
  async createTable(table: BigQueryTable): Promise<void> {
    if (!this.bigQueryConfig) {
      throw new AnalyticsError("BigQuery not configured", "BQ_NOT_CONFIGURED");
    }

    const accessToken = await this.getBigQueryAccessToken();
    const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${this.bigQueryConfig.projectId}/datasets/${table.datasetId}/tables`;

    const tableDefinition: Record<string, unknown> = {
      tableReference: {
        projectId: this.bigQueryConfig.projectId,
        datasetId: table.datasetId,
        tableId: table.tableId,
      },
      schema: { fields: table.schema },
    };

    if (table.partitioning) {
      tableDefinition.timePartitioning = {
        type: table.partitioning.type,
        field: table.partitioning.field,
        expirationMs: table.partitioning.expirationMs,
      };
    }

    if (table.clustering) {
      tableDefinition.clustering = { fields: table.clustering };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tableDefinition),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new AnalyticsError(
        error.error?.message ?? "Failed to create table",
        "BQ_CREATE_ERROR",
        "bigquery"
      );
    }

    this.logger.info("BigQuery table created", { tableId: table.tableId });
  }

  /**
   * Get BigQuery access token
   */
  private async getBigQueryAccessToken(): Promise<string> {
    if (this.bigQueryToken && this.bigQueryToken.expiresAt > new Date()) {
      return this.bigQueryToken.token;
    }

    if (!this.bigQueryConfig) {
      throw new AnalyticsError("BigQuery not configured", "BQ_NOT_CONFIGURED");
    }

    const now = Math.floor(Date.now() / 1000);
    const jwt = this.createBigQueryJWT(now);

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      throw new AnalyticsError(
        "Failed to get BigQuery token",
        "BQ_AUTH_ERROR",
        "bigquery"
      );
    }

    const data = await response.json();
    this.bigQueryToken = {
      token: data.access_token,
      expiresAt: new Date(Date.now() + (data.expires_in - 300) * 1000),
    };

    return this.bigQueryToken.token;
  }

  /**
   * Create BigQuery JWT
   */
  private createBigQueryJWT(now: number): string {
    if (!this.bigQueryConfig) {
      throw new AnalyticsError("BigQuery not configured", "BQ_NOT_CONFIGURED");
    }

    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
      iss: this.bigQueryConfig.credentials.clientEmail,
      scope: "https://www.googleapis.com/auth/bigquery",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    };

    const base64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signatureInput = `${base64Header}.${base64Payload}`;

    const sign = crypto.createSign("RSA-SHA256");
    sign.update(signatureInput);
    const signature = sign.sign(
      this.bigQueryConfig.credentials.privateKey,
      "base64url"
    );

    return `${signatureInput}.${signature}`;
  }

  /**
   * Get BigQuery parameter type
   */
  private getBigQueryParamType(value: unknown): string {
    if (typeof value === "number") {
      return Number.isInteger(value) ? "INT64" : "FLOAT64";
    }
    if (typeof value === "boolean") return "BOOL";
    if (value instanceof Date) return "TIMESTAMP";
    return "STRING";
  }

  // ==========================================================================
  // Metabase Methods
  // ==========================================================================

  /**
   * Execute Metabase query
   */
  async executeMetabaseQuery(
    questionId: number
  ): Promise<MetabaseQueryResult> {
    if (!this.metabaseConfig) {
      throw new AnalyticsError("Metabase not configured", "MB_NOT_CONFIGURED");
    }

    const response = await fetch(
      `${this.metabaseConfig.instanceUrl}/api/card/${questionId}/query`,
      {
        method: "POST",
        headers: {
          "X-Metabase-Session": this.metabaseConfig.apiKey,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new AnalyticsError(
        "Metabase query failed",
        "MB_QUERY_ERROR",
        "metabase"
      );
    }

    return response.json();
  }

  /**
   * Get Metabase dashboard
   */
  async getMetabaseDashboard(dashboardId: number): Promise<MetabaseDashboard> {
    if (!this.metabaseConfig) {
      throw new AnalyticsError("Metabase not configured", "MB_NOT_CONFIGURED");
    }

    const response = await fetch(
      `${this.metabaseConfig.instanceUrl}/api/dashboard/${dashboardId}`,
      {
        headers: {
          "X-Metabase-Session": this.metabaseConfig.apiKey,
        },
      }
    );

    if (!response.ok) {
      throw new AnalyticsError(
        "Failed to get dashboard",
        "MB_DASHBOARD_ERROR",
        "metabase"
      );
    }

    return response.json();
  }

  /**
   * Create Metabase question
   */
  async createMetabaseQuestion(
    question: Omit<MetabaseQuestion, "id">
  ): Promise<MetabaseQuestion> {
    if (!this.metabaseConfig) {
      throw new AnalyticsError("Metabase not configured", "MB_NOT_CONFIGURED");
    }

    const response = await fetch(
      `${this.metabaseConfig.instanceUrl}/api/card`,
      {
        method: "POST",
        headers: {
          "X-Metabase-Session": this.metabaseConfig.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(question),
      }
    );

    if (!response.ok) {
      throw new AnalyticsError(
        "Failed to create question",
        "MB_CREATE_ERROR",
        "metabase"
      );
    }

    return response.json();
  }

  // ==========================================================================
  // Metrics Methods
  // ==========================================================================

  /**
   * Record a metric
   */
  async recordMetric(metric: Metric): Promise<void> {
    // In production, send to time-series database or ClickHouse
    this.logger.debug("Metric recorded", {
      name: metric.name,
      value: metric.value,
    });

    // Also track as Segment event
    await this.track({
      userId: "system",
      event: `metric.${metric.name}`,
      properties: {
        value: metric.value,
        ...metric.dimensions,
      },
      timestamp: metric.timestamp,
    });
  }

  /**
   * Record multiple metrics
   */
  async recordMetrics(metrics: Metric[]): Promise<void> {
    for (const metric of metrics) {
      await this.recordMetric(metric);
    }
  }

  /**
   * Get metric aggregation (from BigQuery)
   */
  async getMetricAggregation(
    metricName: string,
    aggregation: "sum" | "avg" | "min" | "max" | "count",
    startDate: Date,
    endDate: Date,
    dimensions?: string[]
  ): Promise<MetricAggregation[]> {
    if (!this.bigQueryConfig) {
      return [];
    }

    const dimensionCols = dimensions?.join(", ") ?? "";
    const groupByCols = dimensions?.length ? `, ${dimensionCols}` : "";

    const sql = `
      SELECT
        '${metricName}' as metric,
        ${aggregation}(value) as value
        ${dimensionCols ? `, ${dimensionCols}` : ""}
      FROM \`${this.bigQueryConfig.datasetId}.metrics\`
      WHERE name = @metricName
        AND timestamp >= @startDate
        AND timestamp < @endDate
      GROUP BY metric ${groupByCols}
    `;

    const result = await this.query<{
      metric: string;
      value: number;
      [key: string]: unknown;
    }>(sql, {
      metricName,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });

    return result.rows.map((row) => ({
      metric: row.metric,
      aggregation,
      value: row.value,
      period: {
        start: startDate,
        end: endDate,
        granularity: "day" as const,
      },
      dimensions: dimensions?.reduce(
        (acc, dim) => ({ ...acc, [dim]: String(row[dim]) }),
        {}
      ),
    }));
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.eventQueue.length;
  }

  /**
   * Health check
   */
  async ping(): Promise<{
    segment: boolean;
    bigQuery: boolean;
    metabase: boolean;
  }> {
    const results = {
      segment: false,
      bigQuery: false,
      metabase: false,
    };

    // Check Segment
    if (this.segmentWriteKey) {
      try {
        const response = await fetch(`${this.segmentDataPlaneUrl}/v1/p`, {
          method: "HEAD",
        });
        results.segment = response.ok;
      } catch {
        results.segment = false;
      }
    }

    // Check BigQuery
    if (this.bigQueryConfig) {
      try {
        await this.getBigQueryAccessToken();
        results.bigQuery = true;
      } catch {
        results.bigQuery = false;
      }
    }

    // Check Metabase
    if (this.metabaseConfig) {
      try {
        const response = await fetch(
          `${this.metabaseConfig.instanceUrl}/api/health`,
          {
            headers: { "X-Metabase-Session": this.metabaseConfig.apiKey },
          }
        );
        results.metabase = response.ok;
      } catch {
        results.metabase = false;
      }
    }

    return results;
  }

  /**
   * Shutdown - flush remaining events
   */
  async shutdown(): Promise<void> {
    this.stopFlushTimer();
    await this.flush();
  }
}

export default AnalyticsClient;
