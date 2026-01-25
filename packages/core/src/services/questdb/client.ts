/**
 * QuestDB Client Implementation
 * Time-series data storage for market prices, player stats, and analytics
 */

// ============================================================================
// Types
// ============================================================================

export interface QuestDBConfig {
  host: string;
  httpPort: number;        // REST API port (default: 9000)
  pgPort?: number;         // PostgreSQL wire protocol port (default: 8812)
  ilpPort?: number;        // InfluxDB Line Protocol port (default: 9009)
  username?: string;
  password?: string;
  maxRetries?: number;
  retryDelayMs?: number;
  connectionTimeout?: number;
}

export interface QueryResult<T = Record<string, any>> {
  columns: Array<{ name: string; type: string }>;
  dataset: T[];
  count: number;
  timings: { compiler: number; execute: number; count: number };
}

export interface InsertResult {
  success: boolean;
  rowsInserted: number;
  error?: string;
}

export interface OHLCData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ============================================================================
// QuestDB Client
// ============================================================================

export class QuestDBClient {
  private baseUrl: string;
  private ilpSocket: any = null;
  private buffer: string[] = [];
  private flushTimer: NodeJS.Timer | null = null;

  constructor(private config: QuestDBConfig) {
    this.baseUrl = `http://${config.host}:${config.httpPort}`;
    this.config = {
      maxRetries: 3,
      retryDelayMs: 1000,
      connectionTimeout: 5000,
      ...config,
    };
  }

  // ============================================================================
  // Query API (HTTP)
  // ============================================================================

  async query<T = Record<string, any>>(sql: string): Promise<QueryResult<T>> {
    const url = `${this.baseUrl}/exec?query=${encodeURIComponent(sql)}`;

    for (let attempt = 0; attempt <= this.config.maxRetries!; attempt++) {
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: { "Accept": "application/json" },
          signal: AbortSignal.timeout(this.config.connectionTimeout!),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`QuestDB query error: ${response.status} - ${error}`);
        }

        const result = await response.json();
        return {
          columns: result.columns || [],
          dataset: result.dataset || [],
          count: result.count || 0,
          timings: result.timings || { compiler: 0, execute: 0, count: 0 },
        };
      } catch (error: any) {
        if (attempt === this.config.maxRetries!) throw error;
        await this.delay(this.config.retryDelayMs! * (attempt + 1));
      }
    }

    throw new Error("Max retries exceeded");
  }

  // ============================================================================
  // ILP (InfluxDB Line Protocol) - High-performance writes
  // ============================================================================

  /**
   * Write a single row using ILP format
   * Format: table,tag1=val1,tag2=val2 field1=val1,field2=val2 timestamp_ns
   */
  writeILP(line: string): void {
    this.buffer.push(line);

    // Auto-flush at 1000 lines
    if (this.buffer.length >= 1000) {
      this.flushILP();
    }

    // Set flush timer if not already set
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flushILP(), 100);
    }
  }

  async flushILP(): Promise<InsertResult> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.buffer.length === 0) {
      return { success: true, rowsInserted: 0 };
    }

    const lines = this.buffer.splice(0);
    const body = lines.join("\n");

    try {
      const response = await fetch(`${this.baseUrl}/write`, {
        method: "POST",
        body,
        signal: AbortSignal.timeout(this.config.connectionTimeout!),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`ILP write error: ${error}`);
      }

      return { success: true, rowsInserted: lines.length };
    } catch (error: any) {
      // Put lines back in buffer for retry
      this.buffer.unshift(...lines);
      return { success: false, rowsInserted: 0, error: error.message };
    }
  }

  // ============================================================================
  // Market Price Operations
  // ============================================================================

  async insertMarketPrice(data: {
    marketId: string;
    outcomeId: string;
    price: number;
    impliedProbability: number;
    volume: number;
    liquidity: number;
    bid?: number;
    ask?: number;
  }): Promise<void> {
    const spread = (data.ask || data.price) - (data.bid || data.price);
    const ts = Date.now() * 1000000; // nanoseconds

    this.writeILP(
      `market_prices,market_id=${data.marketId},outcome_id=${data.outcomeId} ` +
      `price=${data.price},implied_probability=${data.impliedProbability},` +
      `volume=${data.volume},liquidity=${data.liquidity},` +
      `bid=${data.bid || data.price},ask=${data.ask || data.price},spread=${spread} ${ts}`
    );
  }

  async getMarketPriceHistory(
    marketId: string,
    outcomeId: string,
    options: { from?: string; to?: string; sampleBy?: string } = {}
  ): Promise<QueryResult> {
    const { from, to, sampleBy = "1h" } = options;

    let sql = `SELECT ts, price, implied_probability, volume, liquidity
      FROM market_prices
      WHERE market_id = '${marketId}' AND outcome_id = '${outcomeId}'`;

    if (from) sql += ` AND ts >= '${from}'`;
    if (to) sql += ` AND ts <= '${to}'`;

    sql += ` ORDER BY ts`;

    return this.query(sql);
  }

  async getMarketOHLC(
    marketId: string,
    outcomeId: string,
    interval: string = "1h",
    limit: number = 168
  ): Promise<OHLCData[]> {
    const sql = `SELECT
      ts as timestamp,
      first(price) as open,
      max(price) as high,
      min(price) as low,
      last(price) as close,
      sum(volume) as volume
      FROM market_prices
      WHERE market_id = '${marketId}' AND outcome_id = '${outcomeId}'
      SAMPLE BY ${interval}
      ORDER BY ts DESC
      LIMIT ${limit}`;

    const result = await this.query<OHLCData>(sql);
    return result.dataset.reverse();
  }

  async getLatestPrices(marketId: string): Promise<QueryResult> {
    const sql = `SELECT DISTINCT ON (outcome_id) outcome_id, price, implied_probability, volume, ts
      FROM market_prices
      WHERE market_id = '${marketId}'
      ORDER BY outcome_id, ts DESC`;

    return this.query(sql);
  }

  // ============================================================================
  // Player Stats Operations
  // ============================================================================

  async insertPlayerStats(data: {
    playerId: string;
    season: number;
    week: number;
    passingYards?: number;
    passingTds?: number;
    interceptions?: number;
    rushingYards?: number;
    rushingTds?: number;
    receptions?: number;
    receivingYards?: number;
    receivingTds?: number;
    fumbles?: number;
    pprPoints?: number;
    halfPprPoints?: number;
    standardPoints?: number;
  }): Promise<void> {
    const ts = Date.now() * 1000000;
    const fields = [
      `season=${data.season}i`,
      `week=${data.week}i`,
      data.passingYards !== undefined ? `passing_yards=${data.passingYards}i` : null,
      data.passingTds !== undefined ? `passing_tds=${data.passingTds}i` : null,
      data.interceptions !== undefined ? `interceptions=${data.interceptions}i` : null,
      data.rushingYards !== undefined ? `rushing_yards=${data.rushingYards}i` : null,
      data.rushingTds !== undefined ? `rushing_tds=${data.rushingTds}i` : null,
      data.receptions !== undefined ? `receptions=${data.receptions}i` : null,
      data.receivingYards !== undefined ? `receiving_yards=${data.receivingYards}i` : null,
      data.receivingTds !== undefined ? `receiving_tds=${data.receivingTds}i` : null,
      data.fumbles !== undefined ? `fumbles=${data.fumbles}i` : null,
      data.pprPoints !== undefined ? `ppr_points=${data.pprPoints}` : null,
      data.halfPprPoints !== undefined ? `half_ppr_points=${data.halfPprPoints}` : null,
      data.standardPoints !== undefined ? `standard_points=${data.standardPoints}` : null,
    ].filter(Boolean).join(",");

    this.writeILP(`player_stats,player_id=${data.playerId} ${fields} ${ts}`);
  }

  async getPlayerSeasonStats(playerId: string, season: number): Promise<QueryResult> {
    const sql = `SELECT week, passing_yards, passing_tds, interceptions,
      rushing_yards, rushing_tds, receptions, receiving_yards, receiving_tds,
      fumbles, ppr_points, half_ppr_points, standard_points
      FROM player_stats
      WHERE player_id = '${playerId}' AND season = ${season}
      ORDER BY week`;

    return this.query(sql);
  }

  async getPlayerSeasonAverages(playerId: string, season: number): Promise<QueryResult> {
    const sql = `SELECT
      avg(ppr_points) as avg_ppr,
      avg(half_ppr_points) as avg_half_ppr,
      avg(standard_points) as avg_standard,
      max(ppr_points) as max_ppr,
      min(ppr_points) as min_ppr,
      sum(passing_yards) as total_passing_yards,
      sum(rushing_yards) as total_rushing_yards,
      sum(receiving_yards) as total_receiving_yards,
      sum(passing_tds) as total_passing_tds,
      sum(rushing_tds) as total_rushing_tds,
      sum(receiving_tds) as total_receiving_tds,
      count() as games_played
      FROM player_stats
      WHERE player_id = '${playerId}' AND season = ${season}`;

    return this.query(sql);
  }

  async getTopScorers(season: number, week: number, position?: string, limit: number = 50): Promise<QueryResult> {
    let sql = `SELECT player_id, ppr_points, half_ppr_points, standard_points
      FROM player_stats
      WHERE season = ${season} AND week = ${week}`;

    sql += ` ORDER BY ppr_points DESC LIMIT ${limit}`;

    return this.query(sql);
  }

  // ============================================================================
  // Bet Transactions
  // ============================================================================

  async insertBetTransaction(data: {
    betId: string;
    userId: string;
    marketId: string;
    outcomeId: string;
    betType: "buy" | "sell" | "settlement";
    shares: number;
    price: number;
    cost: number;
    pnl: number;
    balanceAfter: number;
  }): Promise<void> {
    const ts = Date.now() * 1000000;

    this.writeILP(
      `bet_transactions,bet_id=${data.betId},user_id=${data.userId},` +
      `market_id=${data.marketId},outcome_id=${data.outcomeId},bet_type=${data.betType} ` +
      `shares=${data.shares},price=${data.price},cost=${data.cost},` +
      `pnl=${data.pnl},balance_after=${data.balanceAfter} ${ts}`
    );
  }

  async getUserPnL(userId: string, period?: string): Promise<QueryResult> {
    let sql = `SELECT
      sum(pnl) as total_pnl,
      count() as total_bets,
      sum(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
      sum(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losses,
      sum(cost) as total_wagered,
      avg(pnl) as avg_pnl
      FROM bet_transactions
      WHERE user_id = '${userId}' AND bet_type = 'settlement'`;

    if (period) {
      sql += ` AND ts > dateadd('d', -${period === "7d" ? 7 : period === "30d" ? 30 : 365}, now())`;
    }

    return this.query(sql);
  }

  async getUserBetHistory(userId: string, limit: number = 50, offset: number = 0): Promise<QueryResult> {
    const sql = `SELECT ts, bet_id, market_id, outcome_id, bet_type, shares, price, cost, pnl
      FROM bet_transactions
      WHERE user_id = '${userId}'
      ORDER BY ts DESC
      LIMIT ${limit}
      OFFSET ${offset}`;

    return this.query(sql);
  }

  // ============================================================================
  // Analytics
  // ============================================================================

  async insertUserActivity(data: {
    userId: string;
    sessionId: string;
    eventType: string;
    eventData?: Record<string, any>;
    screen?: string;
    platform?: string;
    appVersion?: string;
  }): Promise<void> {
    const ts = Date.now() * 1000000;
    const tags = [
      `user_id=${data.userId}`,
      `event_type=${data.eventType}`,
      data.platform ? `platform=${data.platform}` : null,
    ].filter(Boolean).join(",");

    const fields = [
      `session_id="${data.sessionId}"`,
      data.screen ? `screen="${data.screen}"` : null,
      data.appVersion ? `app_version="${data.appVersion}"` : null,
      data.eventData ? `event_data="${JSON.stringify(data.eventData).replace(/"/g, '\\"')}"` : null,
    ].filter(Boolean).join(",");

    this.writeILP(`user_activity,${tags} ${fields} ${ts}`);
  }

  async getDailyActiveUsers(days: number = 30): Promise<QueryResult> {
    const sql = `SELECT ts, count_distinct(user_id) as dau
      FROM user_activity
      WHERE ts > dateadd('d', -${days}, now())
      SAMPLE BY 1d`;

    return this.query(sql);
  }

  async getEventCounts(eventType: string, days: number = 7): Promise<QueryResult> {
    const sql = `SELECT ts, count() as event_count
      FROM user_activity
      WHERE event_type = '${eventType}' AND ts > dateadd('d', -${days}, now())
      SAMPLE BY 1h`;

    return this.query(sql);
  }

  // ============================================================================
  // System Metrics
  // ============================================================================

  async insertMetric(data: {
    metricName: string;
    value: number;
    host?: string;
    service?: string;
    tags?: Record<string, string>;
  }): Promise<void> {
    const ts = Date.now() * 1000000;
    const tagStr = [
      `metric_name=${data.metricName}`,
      data.host ? `host=${data.host}` : null,
      data.service ? `service=${data.service}` : null,
    ].filter(Boolean).join(",");

    const tagsJson = data.tags ? `tags="${JSON.stringify(data.tags).replace(/"/g, '\\"')}"` : null;
    const fields = [`value=${data.value}`, tagsJson].filter(Boolean).join(",");

    this.writeILP(`system_metrics,${tagStr} ${fields} ${ts}`);
  }

  // ============================================================================
  // Schema Management
  // ============================================================================

  async createTables(): Promise<void> {
    const tables = [
      `CREATE TABLE IF NOT EXISTS market_prices (
        ts TIMESTAMP,
        market_id SYMBOL,
        outcome_id SYMBOL,
        price DOUBLE,
        implied_probability DOUBLE,
        volume DOUBLE,
        liquidity DOUBLE,
        bid DOUBLE,
        ask DOUBLE,
        spread DOUBLE
      ) TIMESTAMP(ts) PARTITION BY DAY WAL
      DEDUP UPSERT KEYS(ts, market_id, outcome_id)`,

      `CREATE TABLE IF NOT EXISTS player_stats (
        ts TIMESTAMP,
        player_id SYMBOL,
        season INT,
        week INT,
        passing_yards INT,
        passing_tds INT,
        interceptions INT,
        rushing_yards INT,
        rushing_tds INT,
        receptions INT,
        receiving_yards INT,
        receiving_tds INT,
        fumbles INT,
        ppr_points DOUBLE,
        half_ppr_points DOUBLE,
        standard_points DOUBLE
      ) TIMESTAMP(ts) PARTITION BY YEAR WAL`,

      `CREATE TABLE IF NOT EXISTS bet_transactions (
        ts TIMESTAMP,
        bet_id SYMBOL,
        user_id SYMBOL,
        market_id SYMBOL,
        outcome_id SYMBOL,
        bet_type SYMBOL,
        shares DOUBLE,
        price DOUBLE,
        cost DOUBLE,
        pnl DOUBLE,
        balance_after DOUBLE
      ) TIMESTAMP(ts) PARTITION BY MONTH WAL`,

      `CREATE TABLE IF NOT EXISTS user_activity (
        ts TIMESTAMP,
        user_id SYMBOL,
        session_id SYMBOL,
        event_type SYMBOL,
        event_data STRING,
        screen STRING,
        platform SYMBOL,
        app_version STRING
      ) TIMESTAMP(ts) PARTITION BY DAY WAL`,

      `CREATE TABLE IF NOT EXISTS system_metrics (
        ts TIMESTAMP,
        metric_name SYMBOL,
        value DOUBLE,
        host SYMBOL,
        service SYMBOL,
        tags STRING
      ) TIMESTAMP(ts) PARTITION BY HOUR WAL`,
    ];

    for (const sql of tables) {
      await this.query(sql);
    }
  }

  // ============================================================================
  // Health Check
  // ============================================================================

  async healthCheck(): Promise<{ healthy: boolean; version?: string; error?: string }> {
    try {
      const result = await this.query("SELECT version()");
      return { healthy: true, version: result.dataset[0]?.version };
    } catch (error: any) {
      return { healthy: false, error: error.message };
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async close(): Promise<void> {
    await this.flushILP();
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
  }
}

// ============================================================================
// Export Factory
// ============================================================================

let instance: QuestDBClient | null = null;

export function getQuestDBClient(config?: QuestDBConfig): QuestDBClient {
  if (!instance && config) {
    instance = new QuestDBClient(config);
  }
  if (!instance) {
    throw new Error("QuestDB client not initialized");
  }
  return instance;
}
