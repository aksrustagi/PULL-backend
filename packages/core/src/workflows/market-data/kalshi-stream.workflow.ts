/**
 * Kalshi Stream Workflow
 * Long-running workflow that maintains WebSocket connection to Kalshi
 * and streams real-time market data to Convex
 * 
 * Clients automatically get updates via Convex subscriptions:
 * const price = useQuery(api.marketData.getPrice, { ticker: "BTC-USD" })
 */

import { proxyActivities, sleep } from "@temporalio/workflow";
import type * as activities from "./activities";

const { updateMarketPrice, updateMarketOrderbook, insertMarketTrade, cleanupOldTrades } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "30 seconds",
    retry: {
      initialInterval: "1 second",
      maximumInterval: "10 seconds",
      backoffCoefficient: 2,
      maximumAttempts: 3,
    },
  });

// ============================================================================
// Types
// ============================================================================

export interface KalshiStreamConfig {
  markets: string[]; // List of market tickers to subscribe to
  apiKey?: string;
  apiSecret?: string;
  enableOrderbook?: boolean;
  enableTrades?: boolean;
  enablePrices?: boolean;
  reconnectDelay?: number; // seconds
  healthCheckInterval?: number; // seconds
  cleanupInterval?: number; // seconds
}

export interface StreamMetrics {
  priceUpdates: number;
  orderbookUpdates: number;
  trades: number;
  errors: number;
  reconnects: number;
  uptime: number;
}

// ============================================================================
// Workflow
// ============================================================================

/**
 * Kalshi Stream Workflow
 * 
 * This is a simplified placeholder that demonstrates the architecture.
 * In production, this would:
 * 1. Create WebSocket connection to Kalshi
 * 2. Subscribe to markets
 * 3. Forward updates to Convex via activities
 * 4. Handle reconnections and errors
 * 
 * Note: Temporal workflows must be deterministic, so the actual WebSocket
 * handling should be in an activity or use external heartbeating.
 */
export async function kalshiStreamWorkflow(config: KalshiStreamConfig): Promise<void> {
  const metrics: StreamMetrics = {
    priceUpdates: 0,
    orderbookUpdates: 0,
    trades: 0,
    errors: 0,
    reconnects: 0,
    uptime: 0,
  };

  const startTime = Date.now();
  const reconnectDelay = (config.reconnectDelay ?? 5) * 1000;
  const healthCheckInterval = (config.healthCheckInterval ?? 30) * 1000;
  const cleanupInterval = (config.cleanupInterval ?? 3600) * 1000;

  let lastCleanup = Date.now();
  let lastHealthCheck = Date.now();

  console.log(`Starting Kalshi stream for ${config.markets.length} markets`);

  // Main loop - in production this would be event-driven from WebSocket
  while (true) {
    try {
      // Simulate receiving data from Kalshi WebSocket
      // In production, this would be handled by an activity that:
      // 1. Maintains WebSocket connection
      // 2. Emits signals/heartbeats to workflow
      // 3. Pushes updates directly to Convex

      const now = Date.now();

      // Health check
      if (now - lastHealthCheck > healthCheckInterval) {
        console.log("Health check", {
          metrics,
          uptime: Math.floor((now - startTime) / 1000),
        });
        lastHealthCheck = now;
      }

      // Periodic cleanup of old trades
      if (now - lastCleanup > cleanupInterval) {
        console.log("Running cleanup for old trades");
        for (const ticker of config.markets) {
          try {
            const deleted = await cleanupOldTrades(ticker, 1000);
            console.log(`Cleaned up ${deleted} old trades for ${ticker}`);
          } catch (error) {
            console.error(`Cleanup failed for ${ticker}:`, error);
            metrics.errors++;
          }
        }
        lastCleanup = now;
      }

      // Wait before next iteration
      await sleep(1000);
      metrics.uptime = Math.floor((Date.now() - startTime) / 1000);

    } catch (error) {
      console.error("Error in Kalshi stream:", error);
      metrics.errors++;
      metrics.reconnects++;

      // Exponential backoff for reconnection
      const delay = Math.min(reconnectDelay * Math.pow(2, metrics.reconnects), 60000);
      console.log(`Reconnecting in ${delay / 1000} seconds...`);
      await sleep(delay);
    }
  }
}

/**
 * Signal handler to add new market subscription
 */
export async function addMarketSubscription(ticker: string): Promise<void> {
  console.log(`Adding market subscription: ${ticker}`);
  // In production, this would signal to the WebSocket activity
  // to subscribe to additional markets
}

/**
 * Signal handler to remove market subscription
 */
export async function removeMarketSubscription(ticker: string): Promise<void> {
  console.log(`Removing market subscription: ${ticker}`);
  // In production, this would signal to the WebSocket activity
  // to unsubscribe from markets
}
