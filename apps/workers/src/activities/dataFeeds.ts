/**
 * Data Feed Activities for Temporal workflows
 * Polls external APIs and publishes to Redis for real-time distribution
 */

import { KalshiClient, KalshiWebSocket, type Market, type TickerMessage } from "@pull/core/services/kalshi";
import { OddsApiClient, type SportKey, type OddsUpdate, type MarketKey } from "@pull/core/services/odds-api";
import { RedisPubSub, type PriceUpdate, type OrderbookUpdate, type TradeUpdate } from "@pull/core/services/redis";

// ============================================================================
// Types
// ============================================================================

export interface DataFeedConfig {
  kalshiApiKeyId?: string;
  kalshiPrivateKey?: string;
  kalshiDemoMode?: boolean;
  oddsApiKey?: string;
  redisUrl: string;
  redisToken?: string;
}

export interface PollResult {
  source: string;
  marketsPolled: number;
  updatesPublished: number;
  duration: number;
  errors: string[];
}

export interface KalshiMarketUpdate {
  ticker: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  openInterest: number;
  timestamp: number;
}

export interface OddsFeedResult {
  sport: SportKey;
  eventsPolled: number;
  marketsUpdated: number;
  duration: number;
}

// ============================================================================
// Singleton Clients
// ============================================================================

let kalshiClient: KalshiClient | null = null;
let kalshiWebSocket: KalshiWebSocket | null = null;
let oddsApiClient: OddsApiClient | null = null;
let redisPubSub: RedisPubSub | null = null;

function getKalshiClient(config: DataFeedConfig): KalshiClient {
  if (!kalshiClient && config.kalshiApiKeyId && config.kalshiPrivateKey) {
    kalshiClient = new KalshiClient({
      apiKeyId: config.kalshiApiKeyId,
      privateKey: config.kalshiPrivateKey,
      demoMode: config.kalshiDemoMode ?? false,
    });
  }
  if (!kalshiClient) {
    throw new Error("Kalshi client not configured");
  }
  return kalshiClient;
}

function getKalshiWebSocket(config: DataFeedConfig): KalshiWebSocket {
  if (!kalshiWebSocket) {
    kalshiWebSocket = new KalshiWebSocket({
      apiKeyId: config.kalshiApiKeyId,
      privateKey: config.kalshiPrivateKey,
      demoMode: config.kalshiDemoMode ?? false,
    });
  }
  return kalshiWebSocket;
}

function getOddsApiClient(config: DataFeedConfig): OddsApiClient {
  if (!oddsApiClient && config.oddsApiKey) {
    oddsApiClient = new OddsApiClient({
      apiKey: config.oddsApiKey,
    });
  }
  if (!oddsApiClient) {
    throw new Error("Odds API client not configured");
  }
  return oddsApiClient;
}

function getRedisPubSub(config: DataFeedConfig): RedisPubSub {
  if (!redisPubSub) {
    redisPubSub = new RedisPubSub({
      url: config.redisUrl,
      token: config.redisToken,
      keyPrefix: "pull:realtime:",
    });
  }
  return redisPubSub;
}

// ============================================================================
// Kalshi Polling Activities
// ============================================================================

/**
 * Poll Kalshi markets for price updates
 */
export async function pollKalshiMarkets(
  config: DataFeedConfig,
  tickers?: string[]
): Promise<PollResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let marketsPolled = 0;
  let updatesPublished = 0;

  try {
    const client = getKalshiClient(config);
    const pubsub = getRedisPubSub(config);

    // Get markets (optionally filtered by tickers)
    const response = await client.getMarkets({
      status: "open",
      limit: 100,
      tickers,
    });

    const markets = response.markets;
    marketsPolled = markets.length;

    // Transform and publish each market update
    const updates: Array<{ channel: string; data: PriceUpdate }> = [];

    for (const market of markets) {
      try {
        const priceUpdate: PriceUpdate = {
          marketId: market.ticker,
          source: "kalshi",
          yesPrice: market.yes_bid > 0 ? market.yes_bid : market.last_price,
          noPrice: market.no_bid > 0 ? market.no_bid : 100 - market.last_price,
          volume: market.volume_24h,
          openInterest: market.open_interest,
          timestamp: Date.now(),
        };

        updates.push({
          channel: `price:kalshi:${market.ticker}`,
          data: priceUpdate,
        });
      } catch (error) {
        errors.push(`Failed to process market ${market.ticker}: ${error}`);
      }
    }

    // Batch publish updates
    if (updates.length > 0) {
      await pubsub.publishBatch(updates);
      updatesPublished = updates.length;
    }

    console.log(`[DataFeeds] Polled ${marketsPolled} Kalshi markets, published ${updatesPublished} updates`);
  } catch (error) {
    errors.push(`Kalshi poll failed: ${error}`);
    console.error("[DataFeeds] Kalshi poll error:", error);
  }

  return {
    source: "kalshi",
    marketsPolled,
    updatesPublished,
    duration: Date.now() - startTime,
    errors,
  };
}

/**
 * Poll Kalshi orderbook for a specific market
 */
export async function pollKalshiOrderbook(
  config: DataFeedConfig,
  ticker: string,
  depth: number = 10
): Promise<OrderbookUpdate | null> {
  try {
    const client = getKalshiClient(config);
    const pubsub = getRedisPubSub(config);

    const orderbook = await client.getMarketOrderbook(ticker, depth);

    const update: OrderbookUpdate = {
      marketId: ticker,
      source: "kalshi",
      bids: orderbook.yes.map((level) => ({
        price: level.price,
        quantity: level.quantity,
      })),
      asks: orderbook.no.map((level) => ({
        price: level.price,
        quantity: level.quantity,
      })),
      timestamp: Date.now(),
    };

    await pubsub.publishOrderbook(update);

    return update;
  } catch (error) {
    console.error(`[DataFeeds] Failed to poll orderbook for ${ticker}:`, error);
    return null;
  }
}

/**
 * Poll Kalshi trades for a specific market
 */
export async function pollKalshiTrades(
  config: DataFeedConfig,
  ticker: string,
  sinceTs?: number
): Promise<TradeUpdate[]> {
  try {
    const client = getKalshiClient(config);
    const pubsub = getRedisPubSub(config);

    const response = await client.getTrades(ticker, {
      limit: 50,
      min_ts: sinceTs,
    });

    const updates: TradeUpdate[] = [];

    for (const trade of response.trades) {
      const update: TradeUpdate = {
        marketId: ticker,
        source: "kalshi",
        tradeId: trade.trade_id,
        price: trade.yes_price,
        quantity: trade.count,
        side: trade.taker_side === "yes" ? "buy" : "sell",
        timestamp: new Date(trade.created_time).getTime(),
      };

      updates.push(update);
      await pubsub.publishTrade(update);
    }

    return updates;
  } catch (error) {
    console.error(`[DataFeeds] Failed to poll trades for ${ticker}:`, error);
    return [];
  }
}

// ============================================================================
// Kalshi WebSocket Activities
// ============================================================================

/**
 * Connect to Kalshi WebSocket and subscribe to market updates
 */
export async function startKalshiWebSocket(
  config: DataFeedConfig,
  marketTickers: string[]
): Promise<boolean> {
  try {
    const ws = getKalshiWebSocket(config);
    const pubsub = getRedisPubSub(config);

    // Set up event handlers
    ws.on("ticker", async (data) => {
      const priceUpdate: PriceUpdate = {
        marketId: data.market_ticker,
        source: "kalshi",
        yesPrice: data.yes_bid,
        noPrice: data.no_bid,
        volume: data.volume,
        openInterest: data.open_interest,
        timestamp: data.ts,
      };

      await pubsub.publishPrice(priceUpdate);
    });

    ws.on("orderbook_delta", async (data) => {
      // Handle orderbook delta updates
      // This would require maintaining local orderbook state
      console.log(`[DataFeeds] Orderbook delta for ${data.market_ticker}`);
    });

    ws.on("trade", async (data) => {
      const tradeUpdate: TradeUpdate = {
        marketId: data.market_ticker,
        source: "kalshi",
        tradeId: data.trade_id,
        price: data.yes_price,
        quantity: data.count,
        side: data.taker_side === "yes" ? "buy" : "sell",
        timestamp: data.ts,
      };

      await pubsub.publishTrade(tradeUpdate);
    });

    // Connect and subscribe
    await ws.connect();
    await ws.subscribe("ticker", { market_tickers: marketTickers });

    console.log(`[DataFeeds] Kalshi WebSocket connected, subscribed to ${marketTickers.length} markets`);
    return true;
  } catch (error) {
    console.error("[DataFeeds] Failed to start Kalshi WebSocket:", error);
    return false;
  }
}

/**
 * Stop Kalshi WebSocket connection
 */
export async function stopKalshiWebSocket(): Promise<void> {
  if (kalshiWebSocket) {
    kalshiWebSocket.disconnect();
    kalshiWebSocket = null;
    console.log("[DataFeeds] Kalshi WebSocket disconnected");
  }
}

// ============================================================================
// Odds API Polling Activities
// ============================================================================

/**
 * Poll Odds API for sport odds updates
 */
export async function pollOddsApi(
  config: DataFeedConfig,
  sport: SportKey,
  markets: MarketKey[] = ["h2h", "spreads", "totals"]
): Promise<OddsFeedResult> {
  const startTime = Date.now();
  let eventsPolled = 0;
  let marketsUpdated = 0;

  try {
    const client = getOddsApiClient(config);
    const pubsub = getRedisPubSub(config);

    const updates = await client.getNormalizedOdds({
      sport,
      markets,
      regions: ["us"],
    });

    eventsPolled = updates.length;

    // Publish each event update
    for (const update of updates) {
      const channel = `odds:${sport}:${update.eventId}`;
      await pubsub.publish(channel, update);

      // Also publish as price updates for integration
      for (const market of update.markets) {
        if (market.type === "h2h") {
          for (const outcome of market.outcomes) {
            const priceUpdate: PriceUpdate = {
              marketId: `${update.eventId}:${outcome.name}`,
              source: "odds-api",
              yesPrice: outcome.impliedProbability,
              noPrice: 100 - outcome.impliedProbability,
              timestamp: update.timestamp,
            };
            await pubsub.publishPrice(priceUpdate);
            marketsUpdated++;
          }
        }
      }
    }

    console.log(`[DataFeeds] Polled ${eventsPolled} ${sport} events, updated ${marketsUpdated} markets`);
  } catch (error) {
    console.error(`[DataFeeds] Failed to poll ${sport} odds:`, error);
  }

  return {
    sport,
    eventsPolled,
    marketsUpdated,
    duration: Date.now() - startTime,
  };
}

/**
 * Poll multiple sports at once
 */
export async function pollMultipleSports(
  config: DataFeedConfig,
  sports: SportKey[]
): Promise<OddsFeedResult[]> {
  const results: OddsFeedResult[] = [];

  for (const sport of sports) {
    try {
      const result = await pollOddsApi(config, sport);
      results.push(result);
    } catch (error) {
      console.error(`[DataFeeds] Failed to poll ${sport}:`, error);
      results.push({
        sport,
        eventsPolled: 0,
        marketsUpdated: 0,
        duration: 0,
      });
    }
  }

  return results;
}

/**
 * Get scores for a sport
 */
export async function pollSportScores(
  config: DataFeedConfig,
  sport: SportKey
): Promise<number> {
  try {
    const client = getOddsApiClient(config);
    const pubsub = getRedisPubSub(config);

    const scores = await client.getScores({ sport, daysFrom: 1 });

    for (const score of scores) {
      await pubsub.publish(`scores:${sport}:${score.id}`, {
        eventId: score.id,
        homeTeam: score.home_team,
        awayTeam: score.away_team,
        scores: score.scores,
        completed: score.completed,
        timestamp: Date.now(),
      });
    }

    console.log(`[DataFeeds] Published ${scores.length} scores for ${sport}`);
    return scores.length;
  } catch (error) {
    console.error(`[DataFeeds] Failed to poll scores for ${sport}:`, error);
    return 0;
  }
}

// ============================================================================
// Data Transformation Activities
// ============================================================================

/**
 * Transform Kalshi market data to normalized format
 */
export function transformKalshiMarket(market: Market): KalshiMarketUpdate {
  return {
    ticker: market.ticker,
    yesPrice: market.yes_bid > 0 ? market.yes_bid : market.last_price,
    noPrice: market.no_bid > 0 ? market.no_bid : 100 - market.last_price,
    volume: market.volume_24h,
    openInterest: market.open_interest,
    timestamp: Date.now(),
  };
}

/**
 * Calculate price changes between updates
 */
export function calculatePriceChange(
  current: PriceUpdate,
  previous: PriceUpdate | null
): {
  priceChange: number;
  priceChangePercent: number;
  direction: "up" | "down" | "unchanged";
} {
  if (!previous) {
    return { priceChange: 0, priceChangePercent: 0, direction: "unchanged" };
  }

  const priceChange = current.yesPrice - previous.yesPrice;
  const priceChangePercent = previous.yesPrice > 0
    ? (priceChange / previous.yesPrice) * 100
    : 0;

  let direction: "up" | "down" | "unchanged" = "unchanged";
  if (priceChange > 0) direction = "up";
  else if (priceChange < 0) direction = "down";

  return {
    priceChange: Math.round(priceChange * 100) / 100,
    priceChangePercent: Math.round(priceChangePercent * 100) / 100,
    direction,
  };
}

/**
 * Aggregate multiple price updates
 */
export function aggregatePriceUpdates(
  updates: PriceUpdate[]
): {
  avgYesPrice: number;
  avgNoPrice: number;
  totalVolume: number;
  updateCount: number;
} {
  if (updates.length === 0) {
    return { avgYesPrice: 0, avgNoPrice: 0, totalVolume: 0, updateCount: 0 };
  }

  const totals = updates.reduce(
    (acc, u) => ({
      yesPrice: acc.yesPrice + u.yesPrice,
      noPrice: acc.noPrice + (u.noPrice ?? 0),
      volume: acc.volume + (u.volume ?? 0),
    }),
    { yesPrice: 0, noPrice: 0, volume: 0 }
  );

  return {
    avgYesPrice: Math.round((totals.yesPrice / updates.length) * 100) / 100,
    avgNoPrice: Math.round((totals.noPrice / updates.length) * 100) / 100,
    totalVolume: totals.volume,
    updateCount: updates.length,
  };
}

// ============================================================================
// Health Check Activities
// ============================================================================

/**
 * Check health of all data feed connections
 */
export async function checkDataFeedHealth(config: DataFeedConfig): Promise<{
  kalshi: boolean;
  oddsApi: boolean;
  redis: boolean;
  overall: boolean;
}> {
  const health = {
    kalshi: false,
    oddsApi: false,
    redis: false,
    overall: false,
  };

  // Check Kalshi
  try {
    if (config.kalshiApiKeyId) {
      const client = getKalshiClient(config);
      await client.getExchangeStatus();
      health.kalshi = true;
    }
  } catch (error) {
    console.error("[DataFeeds] Kalshi health check failed:", error);
  }

  // Check Odds API
  try {
    if (config.oddsApiKey) {
      const client = getOddsApiClient(config);
      await client.getSports();
      health.oddsApi = true;
    }
  } catch (error) {
    console.error("[DataFeeds] Odds API health check failed:", error);
  }

  // Check Redis
  try {
    const pubsub = getRedisPubSub(config);
    health.redis = await pubsub.healthCheck();
  } catch (error) {
    console.error("[DataFeeds] Redis health check failed:", error);
  }

  health.overall = health.redis && (health.kalshi || health.oddsApi);

  return health;
}

/**
 * Get data feed statistics
 */
export async function getDataFeedStats(config: DataFeedConfig): Promise<{
  kalshiConnected: boolean;
  oddsApiRequestsRemaining: number | null;
  redisSubscriptions: number;
}> {
  const stats = {
    kalshiConnected: kalshiWebSocket?.isConnected() ?? false,
    oddsApiRequestsRemaining: null as number | null,
    redisSubscriptions: 0,
  };

  try {
    if (oddsApiClient) {
      const rateLimitInfo = oddsApiClient.getRateLimitInfo();
      stats.oddsApiRequestsRemaining = rateLimitInfo?.requestsRemaining ?? null;
    }
  } catch {
    // Ignore
  }

  try {
    const pubsub = getRedisPubSub(config);
    stats.redisSubscriptions = pubsub.getSubscriptionCount();
  } catch {
    // Ignore
  }

  return stats;
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Clean up all data feed connections
 */
export async function cleanupDataFeeds(): Promise<void> {
  if (kalshiWebSocket) {
    kalshiWebSocket.disconnect();
    kalshiWebSocket = null;
  }

  if (redisPubSub) {
    redisPubSub.disconnect();
    redisPubSub = null;
  }

  kalshiClient = null;
  oddsApiClient = null;

  console.log("[DataFeeds] All connections cleaned up");
}
