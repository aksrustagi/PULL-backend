/**
 * Market Data Inngest Functions
 *
 * Event-driven functions for syncing market data from various sources.
 */

import { NonRetryableError } from "inngest";
import {
  inngest,
  RETRY_CONFIGS,
  CONCURRENCY_CONFIGS,
  logToDeadLetter,
} from "../client";
import { EVENT_NAMES } from "../events";

// =============================================================================
// Types
// =============================================================================

interface KalshiMarket {
  id: string;
  ticker: string;
  title: string;
  subtitle?: string;
  category: string;
  status: "open" | "closed" | "settled";
  yesPrice: number;
  noPrice: number;
  volume: number;
  volume24h: number;
  openInterest: number;
  expirationDate?: string;
  result?: "yes" | "no";
  createdAt: Date;
  updatedAt: Date;
}

interface PokemonAsset {
  id: string;
  cardId: string;
  name: string;
  setName: string;
  rarity: string;
  imageUrl: string;
  currentPrice: number;
  previousPrice: number;
  priceChange24h: number;
  priceChangePercent: number;
  lastSoldPrice?: number;
  marketCap?: number;
  totalSupply?: number;
  ownedShares: Array<{ userId: string; shares: number }>;
  updatedAt: Date;
}

interface UserSubscription {
  userId: string;
  type: "market" | "rwa";
  targetId: string;
  priceThresholdPercent?: number;
  categories?: string[];
}

// =============================================================================
// Service Interfaces
// =============================================================================

interface KalshiService {
  getMarkets(params?: {
    status?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{
    markets: Array<{
      ticker: string;
      event_ticker: string;
      title: string;
      subtitle?: string;
      category: string;
      status: string;
      yes_bid: number;
      no_bid: number;
      volume: number;
      volume_24h: number;
      open_interest: number;
      close_time?: string;
      result?: string;
    }>;
    cursor?: string;
  }>;
}

interface PokemonService {
  getCardPrices(cardIds: string[]): Promise<
    Array<{
      cardId: string;
      name: string;
      setName: string;
      rarity: string;
      imageUrl: string;
      prices: {
        market: number;
        low: number;
        mid: number;
        high: number;
      };
      lastUpdated: string;
    }>
  >;
  searchCards(query: string): Promise<
    Array<{
      cardId: string;
      name: string;
      setName: string;
    }>
  >;
}

interface ConvexService {
  // Market operations
  getMarket(ticker: string): Promise<KalshiMarket | null>;
  upsertMarket(market: Omit<KalshiMarket, "id" | "createdAt" | "updatedAt">): Promise<string>;
  getNewMarketsSince(since: Date): Promise<KalshiMarket[]>;
  getAllTrackedCardIds(): Promise<string[]>;

  // RWA operations
  getRWAAsset(cardId: string): Promise<PokemonAsset | null>;
  upsertRWAAsset(asset: Partial<PokemonAsset> & { cardId: string }): Promise<string>;
  getUsersHoldingAsset(assetId: string): Promise<string[]>;

  // Subscriptions
  getMarketSubscribers(marketId: string): Promise<UserSubscription[]>;
  getCategorySubscribers(category: string): Promise<UserSubscription[]>;
  getPriceAlertSubscribers(assetId: string, changePercent: number): Promise<string[]>;
}

interface NotificationService {
  sendMarketNotification(params: {
    userIds: string[];
    type: "new_market" | "price_change" | "market_settled";
    market: { ticker: string; title: string };
    data: Record<string, unknown>;
  }): Promise<void>;

  sendPriceAlert(params: {
    userIds: string[];
    asset: { id: string; name: string };
    previousPrice: number;
    currentPrice: number;
    changePercent: number;
  }): Promise<void>;
}

// =============================================================================
// Service Factory
// =============================================================================

interface Services {
  kalshi: KalshiService;
  pokemon: PokemonService;
  convex: ConvexService;
  notifications: NotificationService;
}

function getServices(): Services {
  return {
    kalshi: {
      async getMarkets() {
        throw new Error("KalshiService not configured");
      },
    },
    pokemon: {
      async getCardPrices() {
        throw new Error("PokemonService not configured");
      },
      async searchCards() {
        throw new Error("PokemonService not configured");
      },
    },
    convex: {
      async getMarket() {
        throw new Error("ConvexService not configured");
      },
      async upsertMarket() {
        throw new Error("ConvexService not configured");
      },
      async getNewMarketsSince() {
        throw new Error("ConvexService not configured");
      },
      async getAllTrackedCardIds() {
        throw new Error("ConvexService not configured");
      },
      async getRWAAsset() {
        throw new Error("ConvexService not configured");
      },
      async upsertRWAAsset() {
        throw new Error("ConvexService not configured");
      },
      async getUsersHoldingAsset() {
        throw new Error("ConvexService not configured");
      },
      async getMarketSubscribers() {
        throw new Error("ConvexService not configured");
      },
      async getCategorySubscribers() {
        throw new Error("ConvexService not configured");
      },
      async getPriceAlertSubscribers() {
        throw new Error("ConvexService not configured");
      },
    },
    notifications: {
      async sendMarketNotification() {
        throw new Error("NotificationService not configured");
      },
      async sendPriceAlert() {
        throw new Error("NotificationService not configured");
      },
    },
  };
}

let servicesOverride: Services | null = null;

export function setServices(services: Services): void {
  servicesOverride = services;
}

export function clearServices(): void {
  servicesOverride = null;
}

function services(): Services {
  return servicesOverride ?? getServices();
}

// =============================================================================
// Configuration
// =============================================================================

const SIGNIFICANT_PRICE_CHANGE_PERCENT = 5; // 5% change triggers alerts
const NEW_MARKET_RELEVANCE_THRESHOLD = 0.7; // Relevance score threshold

// =============================================================================
// syncKalshiMarkets Function
// =============================================================================

/**
 * Synchronizes Kalshi prediction markets.
 *
 * Triggers:
 * - Cron: Every 5 minutes
 *
 * Process:
 * 1. Fetch all open markets from Kalshi
 * 2. Update Convex cache with latest prices
 * 3. Detect new markets
 * 4. Send notifications for relevant new markets
 */
export const syncKalshiMarkets = inngest.createFunction(
  {
    id: "sync-kalshi-markets",
    name: "Sync Kalshi Markets",
    retries: RETRY_CONFIGS.standard.attempts,
    concurrency: [{ limit: 1 }], // Single instance to prevent race conditions
    onFailure: async ({ error, event, runId }) => {
      await logToDeadLetter({
        originalEvent: { name: event.name, data: event.data },
        error: {
          message: error.message,
          stack: error.stack,
        },
        functionName: "sync-kalshi-markets",
        runId,
        timestamp: new Date().toISOString(),
        attemptCount: RETRY_CONFIGS.standard.attempts,
      });
    },
  },
  { cron: "*/5 * * * *" }, // Every 5 minutes
  async ({ step, logger }) => {
    const { kalshi, convex, notifications } = services();

    const syncStartTime = new Date();
    let totalMarkets = 0;
    let newMarkets = 0;
    let updatedMarkets = 0;

    // Step 1: Fetch all open markets from Kalshi
    const allMarkets = await step.run("fetch-kalshi-markets", async () => {
      const markets: Array<{
        ticker: string;
        event_ticker: string;
        title: string;
        subtitle?: string;
        category: string;
        status: string;
        yes_bid: number;
        no_bid: number;
        volume: number;
        volume_24h: number;
        open_interest: number;
        close_time?: string;
        result?: string;
      }> = [];

      let cursor: string | undefined;

      do {
        const response = await kalshi.getMarkets({
          status: "open",
          cursor,
          limit: 200,
        });

        markets.push(...response.markets);
        cursor = response.cursor;
      } while (cursor);

      return markets;
    });

    logger.info(`Fetched ${allMarkets.length} markets from Kalshi`);
    totalMarkets = allMarkets.length;

    // Step 2: Process markets in batches
    const batchSize = 50;
    const batches = [];
    for (let i = 0; i < allMarkets.length; i += batchSize) {
      batches.push(allMarkets.slice(i, i + batchSize));
    }

    const newMarketsList: KalshiMarket[] = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      const batchResults = await step.run(`process-batch-${i}`, async () => {
        const results = { new: 0, updated: 0, newMarkets: [] as KalshiMarket[] };

        for (const market of batch) {
          const existing = await convex.getMarket(market.ticker);

          const marketData = {
            ticker: market.ticker,
            title: market.title,
            subtitle: market.subtitle,
            category: market.category,
            status: market.status as KalshiMarket["status"],
            yesPrice: market.yes_bid,
            noPrice: market.no_bid,
            volume: market.volume,
            volume24h: market.volume_24h,
            openInterest: market.open_interest,
            expirationDate: market.close_time,
            result: market.result as KalshiMarket["result"],
          };

          const marketId = await convex.upsertMarket(marketData);

          if (!existing) {
            results.new++;
            results.newMarkets.push({
              id: marketId,
              ...marketData,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          } else {
            results.updated++;

            // Check for significant price changes
            const priceChange = Math.abs(
              ((market.yes_bid - existing.yesPrice) / existing.yesPrice) * 100
            );

            if (priceChange >= SIGNIFICANT_PRICE_CHANGE_PERCENT) {
              // Emit price change event
              await inngest.send({
                name: EVENT_NAMES.MARKET_DATA_UPDATED,
                data: {
                  marketId,
                  ticker: market.ticker,
                  previousPrice: existing.yesPrice,
                  currentPrice: market.yes_bid,
                  priceChangePercent: priceChange,
                  volume24h: market.volume_24h,
                  timestamp: new Date().toISOString(),
                },
              });
            }
          }
        }

        return results;
      });

      newMarkets += batchResults.new;
      updatedMarkets += batchResults.updated;
      newMarketsList.push(...batchResults.newMarkets);
    }

    // Step 3: Notify subscribers of new markets
    if (newMarketsList.length > 0) {
      await step.run("notify-new-markets", async () => {
        // Group by category
        const byCategory = new Map<string, KalshiMarket[]>();
        for (const market of newMarketsList) {
          const existing = byCategory.get(market.category) ?? [];
          existing.push(market);
          byCategory.set(market.category, existing);
        }

        // Notify category subscribers
        for (const [category, markets] of byCategory) {
          const subscribers = await convex.getCategorySubscribers(category);

          if (subscribers.length > 0) {
            const userIds = subscribers.map((s) => s.userId);

            for (const market of markets) {
              await notifications.sendMarketNotification({
                userIds,
                type: "new_market",
                market: { ticker: market.ticker, title: market.title },
                data: {
                  category,
                  yesPrice: market.yesPrice,
                  expirationDate: market.expirationDate,
                },
              });

              // Emit new market event
              await inngest.send({
                name: EVENT_NAMES.MARKET_DATA_NEW_MARKET,
                data: {
                  marketId: market.id,
                  ticker: market.ticker,
                  title: market.title,
                  category,
                  expirationDate: market.expirationDate,
                  initialYesPrice: market.yesPrice,
                },
              });
            }
          }
        }
      });
    }

    logger.info(
      `Kalshi sync complete: ${newMarkets} new, ${updatedMarkets} updated`
    );

    return {
      totalMarkets,
      newMarkets,
      updatedMarkets,
      syncDuration: Date.now() - syncStartTime.getTime(),
    };
  }
);

// =============================================================================
// syncPokemonPrices Function
// =============================================================================

/**
 * Synchronizes Pokemon card prices for RWA assets.
 *
 * Triggers:
 * - Cron: Every 6 hours
 *
 * Process:
 * 1. Update all RWA asset prices
 * 2. Detect significant price movements
 * 3. Alert users of big changes
 */
export const syncPokemonPrices = inngest.createFunction(
  {
    id: "sync-pokemon-prices",
    name: "Sync Pokemon Prices",
    retries: RETRY_CONFIGS.standard.attempts,
    concurrency: [{ limit: 1 }],
    onFailure: async ({ error, event, runId }) => {
      await logToDeadLetter({
        originalEvent: { name: event.name, data: event.data },
        error: {
          message: error.message,
          stack: error.stack,
        },
        functionName: "sync-pokemon-prices",
        runId,
        timestamp: new Date().toISOString(),
        attemptCount: RETRY_CONFIGS.standard.attempts,
      });
    },
  },
  { cron: "0 */6 * * *" }, // Every 6 hours
  async ({ step, logger }) => {
    const { pokemon, convex, notifications } = services();

    const syncStartTime = new Date();
    let totalAssets = 0;
    let priceChanges = 0;
    let alertsSent = 0;

    // Step 1: Get all tracked card IDs
    const cardIds = await step.run("get-tracked-cards", async () => {
      return convex.getAllTrackedCardIds();
    });

    if (cardIds.length === 0) {
      logger.info("No Pokemon cards to sync");
      return { totalAssets: 0, priceChanges: 0, alertsSent: 0 };
    }

    logger.info(`Syncing prices for ${cardIds.length} Pokemon cards`);
    totalAssets = cardIds.length;

    // Step 2: Fetch prices in batches
    const batchSize = 100;
    const batches = [];
    for (let i = 0; i < cardIds.length; i += batchSize) {
      batches.push(cardIds.slice(i, i + batchSize));
    }

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      const batchResults = await step.run(`fetch-prices-batch-${i}`, async () => {
        const prices = await pokemon.getCardPrices(batch);
        const results = { changes: 0, alerts: 0 };

        for (const priceData of prices) {
          // Get existing asset data
          const existing = await convex.getRWAAsset(priceData.cardId);

          const previousPrice = existing?.currentPrice ?? priceData.prices.market;
          const currentPrice = priceData.prices.market;
          const priceChange = currentPrice - previousPrice;
          const priceChangePercent =
            previousPrice > 0 ? (priceChange / previousPrice) * 100 : 0;

          // Update asset in database
          await convex.upsertRWAAsset({
            cardId: priceData.cardId,
            name: priceData.name,
            setName: priceData.setName,
            rarity: priceData.rarity,
            imageUrl: priceData.imageUrl,
            currentPrice,
            previousPrice,
            priceChange24h: priceChange,
            priceChangePercent,
          });

          // Check for significant price movements
          if (Math.abs(priceChangePercent) >= SIGNIFICANT_PRICE_CHANGE_PERCENT) {
            results.changes++;

            // Get users holding this asset
            const assetId = existing?.id ?? priceData.cardId;
            const holdingUsers = await convex.getUsersHoldingAsset(assetId);

            // Get users with price alerts set
            const alertUsers = await convex.getPriceAlertSubscribers(
              assetId,
              Math.abs(priceChangePercent)
            );

            const affectedUserIds = [...new Set([...holdingUsers, ...alertUsers])];

            if (affectedUserIds.length > 0) {
              // Send price alert notification
              await notifications.sendPriceAlert({
                userIds: affectedUserIds,
                asset: { id: assetId, name: priceData.name },
                previousPrice,
                currentPrice,
                changePercent: priceChangePercent,
              });

              results.alerts++;

              // Emit price alert event
              await inngest.send({
                name: EVENT_NAMES.RWA_PRICE_ALERT,
                data: {
                  assetId,
                  assetType: "pokemon_card",
                  assetName: priceData.name,
                  previousPrice,
                  currentPrice,
                  priceChangePercent,
                  affectedUserIds,
                },
              });
            }
          }
        }

        return results;
      });

      priceChanges += batchResults.changes;
      alertsSent += batchResults.alerts;
    }

    logger.info(
      `Pokemon price sync complete: ${priceChanges} significant changes, ${alertsSent} alerts sent`
    );

    return {
      totalAssets,
      priceChanges,
      alertsSent,
      syncDuration: Date.now() - syncStartTime.getTime(),
    };
  }
);

// =============================================================================
// Exports
// =============================================================================

export const marketDataFunctions = [syncKalshiMarkets, syncPokemonPrices];
