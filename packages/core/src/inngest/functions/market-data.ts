/**
 * Market Data Inngest Functions
 * Sync Kalshi markets and Pokemon prices
 */

import { inngest, CRON_SCHEDULES, DEFAULT_RETRY_CONFIG, CRITICAL_RETRY_CONFIG } from "../client";

// ============================================================================
// Kalshi Market Sync Function
// ============================================================================

/**
 * Sync all Kalshi markets
 * Triggered every 5 minutes
 */
export const syncKalshiMarkets = inngest.createFunction(
  {
    id: "pull/market-data/sync-kalshi-markets",
    name: "Sync Kalshi Markets",
    retries: CRITICAL_RETRY_CONFIG.attempts,
    concurrency: {
      limit: 1, // Only one instance at a time
    },
  },
  { cron: CRON_SCHEDULES.EVERY_5_MINUTES },
  async ({ step, logger }) => {
    logger.info("Starting Kalshi market sync");

    // Step 1: Check exchange status
    const exchangeStatus = await step.run("check-exchange-status", async () => {
      // In production: use KalshiClient
      // const kalshi = new KalshiClient({
      //   apiKeyId: process.env.KALSHI_API_KEY_ID,
      //   privateKey: process.env.KALSHI_PRIVATE_KEY,
      // });
      // return await kalshi.getExchangeStatus();
      return { exchange_active: true, trading_active: true };
    });

    if (!exchangeStatus.exchange_active) {
      logger.warn("Exchange is not active, skipping sync");
      return { skipped: true, reason: "exchange_inactive" };
    }

    // Step 2: Get current cached markets for comparison
    const cachedMarkets = await step.run("get-cached-markets", async () => {
      // In production: fetch from Convex
      // return await convex.query(api.markets.getAllMarketTickers);
      return new Set<string>();
    });

    // Step 3: Fetch all open markets from Kalshi
    const markets = await step.run("fetch-kalshi-markets", async () => {
      // In production: use KalshiClient
      // const kalshi = new KalshiClient({ ... });
      // const allMarkets = [];
      // for await (const market of kalshi.paginateMarkets({ status: "open" })) {
      //   allMarkets.push(market);
      // }
      // return allMarkets;
      return [] as Array<{
        ticker: string;
        event_ticker: string;
        title: string;
        subtitle: string;
        status: string;
        yes_bid: number;
        yes_ask: number;
        last_price: number;
        volume: number;
        volume_24h: number;
        open_interest: number;
        close_time: string;
        category: string;
      }>;
    });

    logger.info("Fetched markets from Kalshi", { count: markets.length });

    // Step 4: Identify new markets
    const newMarkets = markets.filter((m) => !cachedMarkets.has(m.ticker));

    // Step 5: Update Convex cache
    const updateResults = await step.run("update-market-cache", async () => {
      const updated = [];
      const created = [];

      for (const market of markets) {
        // In production: upsert to Convex
        // await convex.mutation(api.markets.upsertMarket, {
        //   ticker: market.ticker,
        //   eventTicker: market.event_ticker,
        //   title: market.title,
        //   subtitle: market.subtitle,
        //   status: market.status,
        //   yesBid: market.yes_bid,
        //   yesAsk: market.yes_ask,
        //   lastPrice: market.last_price,
        //   volume: market.volume,
        //   volume24h: market.volume_24h,
        //   openInterest: market.open_interest,
        //   closeTime: market.close_time,
        //   category: market.category,
        //   updatedAt: Date.now(),
        // });

        if (cachedMarkets.has(market.ticker)) {
          updated.push(market.ticker);
        } else {
          created.push(market.ticker);
        }
      }

      return { updated: updated.length, created: created.length };
    });

    // Step 6: Notify users about new relevant markets
    if (newMarkets.length > 0) {
      await step.run("notify-new-markets", async () => {
        for (const market of newMarkets.slice(0, 10)) {
          // Only notify for first 10 new markets
          // In production: find users interested in this category
          // const interestedUsers = await convex.query(api.users.getUsersByMarketInterest, {
          //   category: market.category,
          // });
          //
          // for (const user of interestedUsers) {
          //   await sendEvent({
          //     name: "notification/send",
          //     data: {
          //       userId: user.id,
          //       type: "new_market",
          //       title: "New Market Available",
          //       body: market.title,
          //       data: { ticker: market.ticker },
          //       channels: ["in_app"],
          //     },
          //   });
          // }
        }
      });
    }

    // Step 7: Detect significant price movements
    await step.run("detect-price-movements", async () => {
      // In production: compare with cached prices
      // for (const market of markets) {
      //   const cached = await convex.query(api.markets.getMarket, { ticker: market.ticker });
      //   if (cached) {
      //     const priceChange = Math.abs(market.last_price - cached.lastPrice);
      //     if (priceChange >= 10) { // 10% or more
      //       // Trigger price alerts for users watching this market
      //     }
      //   }
      // }
    });

    return {
      totalMarkets: markets.length,
      newMarkets: newMarkets.length,
      ...updateResults,
      syncedAt: Date.now(),
    };
  }
);

// ============================================================================
// Pokemon Price Sync Function
// ============================================================================

/**
 * Sync Pokemon card prices for RWA assets
 * Triggered every 6 hours
 */
export const syncPokemonPrices = inngest.createFunction(
  {
    id: "pull/market-data/sync-pokemon-prices",
    name: "Sync Pokemon Prices",
    retries: DEFAULT_RETRY_CONFIG.attempts,
    concurrency: {
      limit: 2,
    },
  },
  { cron: CRON_SCHEDULES.EVERY_6_HOURS },
  async ({ step, logger }) => {
    logger.info("Starting Pokemon price sync");

    // Step 1: Get all RWA assets that are Pokemon cards
    const rwaAssets = await step.run("get-rwa-assets", async () => {
      // In production: fetch from Convex
      // return await convex.query(api.rwa.getPokemonAssets);
      return [] as Array<{
        id: string;
        cardId: string;
        cardName: string;
        setName: string;
        currentPrice: number;
        gradingCompany: string;
        grade: number;
      }>;
    });

    if (rwaAssets.length === 0) {
      logger.info("No Pokemon assets to sync");
      return { processed: 0 };
    }

    logger.info("Syncing prices for Pokemon assets", { count: rwaAssets.length });

    // Step 2: Fetch prices for each asset (with rate limiting)
    const priceUpdates = await step.run("fetch-pokemon-prices", async () => {
      const updates = [];

      for (const asset of rwaAssets) {
        try {
          // In production: use PokemonPriceClient
          // const pokemon = new PokemonPriceClient({ apiKey: process.env.POKEMON_API_KEY });
          // const pricing = await pokemon.getPricing(asset.cardId, true);

          // Simulated pricing data
          const pricing = {
            tcgplayerMarket: asset.currentPrice * (1 + (Math.random() - 0.5) * 0.1),
            gradedPrices: {
              psa10: { average: asset.currentPrice * 1.5 },
              psa9: { average: asset.currentPrice * 1.2 },
              psa8: { average: asset.currentPrice * 1.0 },
            },
          };

          // Determine which graded price to use
          const gradeKey = `${asset.gradingCompany.toLowerCase()}${asset.grade}` as keyof typeof pricing.gradedPrices;
          const relevantPrice = pricing.gradedPrices[gradeKey]?.average || pricing.tcgplayerMarket;

          updates.push({
            assetId: asset.id,
            cardId: asset.cardId,
            oldPrice: asset.currentPrice,
            newPrice: relevantPrice,
            changePercent: ((relevantPrice - asset.currentPrice) / asset.currentPrice) * 100,
            tcgplayerMarket: pricing.tcgplayerMarket,
          });

          // Rate limiting between requests
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          logger.error("Failed to fetch price for card", {
            cardId: asset.cardId,
            error: (error as Error).message,
          });
        }
      }

      return updates;
    });

    // Step 3: Update asset prices in Convex
    const updateResults = await step.run("update-asset-prices", async () => {
      let updated = 0;
      let significant = 0;

      for (const update of priceUpdates) {
        // In production: update in Convex
        // await convex.mutation(api.rwa.updateAssetPrice, {
        //   assetId: update.assetId,
        //   price: update.newPrice,
        //   previousPrice: update.oldPrice,
        //   priceSource: "pokemon_tcg",
        //   updatedAt: Date.now(),
        // });

        updated++;

        // Track significant movements (>5%)
        if (Math.abs(update.changePercent) >= 5) {
          significant++;
        }
      }

      return { updated, significant };
    });

    // Step 4: Send events for significant price changes
    const significantChanges = priceUpdates.filter(
      (u) => Math.abs(u.changePercent) >= 5
    );

    for (const change of significantChanges) {
      await step.sendEvent(`price-change-${change.assetId}`, {
        name: "rwa/price.updated",
        data: {
          assetId: change.assetId,
          oldPrice: change.oldPrice,
          newPrice: change.newPrice,
          changePercent: change.changePercent,
        },
      });
    }

    // Step 5: Alert users about big changes (>10%)
    const bigChanges = priceUpdates.filter((u) => Math.abs(u.changePercent) >= 10);

    if (bigChanges.length > 0) {
      await step.run("alert-users-big-changes", async () => {
        for (const change of bigChanges) {
          // In production: find users who own this asset
          // const owners = await convex.query(api.rwa.getAssetOwners, {
          //   assetId: change.assetId,
          // });
          //
          // for (const owner of owners) {
          //   await sendEvent({
          //     name: "notification/send",
          //     data: {
          //       userId: owner.userId,
          //       type: "rwa_price_change",
          //       title: "Significant Price Change",
          //       body: `Your Pokemon card moved ${change.changePercent.toFixed(1)}%`,
          //       data: { assetId: change.assetId, changePercent: change.changePercent },
          //       channels: ["push", "in_app"],
          //     },
          //   });
          // }
        }
      });
    }

    // Step 6: Store price history
    await step.run("store-price-history", async () => {
      // In production: batch insert price history
      // await convex.mutation(api.rwa.batchInsertPriceHistory, {
      //   entries: priceUpdates.map((u) => ({
      //     assetId: u.assetId,
      //     price: u.newPrice,
      //     tcgplayerMarket: u.tcgplayerMarket,
      //     timestamp: Date.now(),
      //   })),
      // });
    });

    return {
      totalAssets: rwaAssets.length,
      pricesUpdated: updateResults.updated,
      significantChanges: updateResults.significant,
      bigChanges: bigChanges.length,
      syncedAt: Date.now(),
    };
  }
);

// ============================================================================
// Market Settlement Watcher
// ============================================================================

/**
 * Check for settled markets and process payouts
 * Triggered every 5 minutes
 */
export const checkMarketSettlements = inngest.createFunction(
  {
    id: "pull/market-data/check-settlements",
    name: "Check Market Settlements",
    retries: CRITICAL_RETRY_CONFIG.attempts,
    concurrency: {
      limit: 1,
    },
  },
  { cron: CRON_SCHEDULES.EVERY_5_MINUTES },
  async ({ step, logger }) => {
    logger.info("Checking for market settlements");

    // Step 1: Get markets pending settlement check
    const pendingMarkets = await step.run("get-pending-markets", async () => {
      // In production: query markets with status approaching settlement
      // return await convex.query(api.markets.getMarketsNearSettlement);
      return [] as Array<{
        ticker: string;
        title: string;
        closeTime: number;
        status: string;
      }>;
    });

    if (pendingMarkets.length === 0) {
      return { checked: 0, settled: 0 };
    }

    // Step 2: Check each market on Kalshi
    const settlements = await step.run("check-kalshi-settlements", async () => {
      const settled = [];

      for (const market of pendingMarkets) {
        // In production: check Kalshi API
        // const kalshi = new KalshiClient({ ... });
        // const currentMarket = await kalshi.getMarket(market.ticker);
        //
        // if (currentMarket.status === "settled") {
        //   settled.push({
        //     ticker: market.ticker,
        //     result: currentMarket.result,
        //     settledAt: Date.now(),
        //   });
        // }
      }

      return settled;
    });

    // Step 3: Process settlements
    for (const settlement of settlements) {
      await step.sendEvent(`settlement-${settlement.ticker}`, {
        name: "trading/market.settled",
        data: {
          ticker: settlement.ticker,
          result: settlement.result as "yes" | "no",
          settledAt: settlement.settledAt,
        },
      });
    }

    return {
      checked: pendingMarkets.length,
      settled: settlements.length,
    };
  }
);

// ============================================================================
// Price Alert Checker
// ============================================================================

/**
 * Check user price alerts against current prices
 */
export const checkPriceAlerts = inngest.createFunction(
  {
    id: "pull/market-data/check-price-alerts",
    name: "Check Price Alerts",
    retries: DEFAULT_RETRY_CONFIG.attempts,
  },
  { cron: CRON_SCHEDULES.EVERY_5_MINUTES },
  async ({ step, logger }) => {
    logger.info("Checking price alerts");

    // Step 1: Get active price alerts
    const alerts = await step.run("get-active-alerts", async () => {
      // In production: fetch from Convex
      // return await convex.query(api.alerts.getActivePriceAlerts);
      return [] as Array<{
        id: string;
        userId: string;
        ticker: string;
        targetPrice: number;
        direction: "above" | "below";
      }>;
    });

    if (alerts.length === 0) {
      return { checked: 0, triggered: 0 };
    }

    // Step 2: Get current prices for all tickers
    const tickers = [...new Set(alerts.map((a) => a.ticker))];
    const currentPrices = await step.run("get-current-prices", async () => {
      // In production: fetch from Convex cache
      // return await convex.query(api.markets.getMarketPrices, { tickers });
      return new Map<string, number>();
    });

    // Step 3: Check alerts
    const triggeredAlerts = alerts.filter((alert) => {
      const currentPrice = currentPrices.get(alert.ticker);
      if (!currentPrice) return false;

      if (alert.direction === "above" && currentPrice >= alert.targetPrice) {
        return true;
      }
      if (alert.direction === "below" && currentPrice <= alert.targetPrice) {
        return true;
      }
      return false;
    });

    // Step 4: Send notifications for triggered alerts
    for (const alert of triggeredAlerts) {
      const currentPrice = currentPrices.get(alert.ticker)!;

      await step.sendEvent(`alert-${alert.id}`, {
        name: "trading/price-alert.triggered",
        data: {
          userId: alert.userId,
          alertId: alert.id,
          ticker: alert.ticker,
          targetPrice: alert.targetPrice,
          currentPrice,
          direction: alert.direction,
        },
      });
    }

    // Step 5: Deactivate triggered alerts
    if (triggeredAlerts.length > 0) {
      await step.run("deactivate-alerts", async () => {
        // In production: update in Convex
        // await convex.mutation(api.alerts.deactivateAlerts, {
        //   alertIds: triggeredAlerts.map((a) => a.id),
        // });
      });
    }

    return {
      checked: alerts.length,
      triggered: triggeredAlerts.length,
    };
  }
);

// ============================================================================
// Export Functions
// ============================================================================

export const marketDataFunctions = [
  syncKalshiMarkets,
  syncPokemonPrices,
  checkMarketSettlements,
  checkPriceAlerts,
];
