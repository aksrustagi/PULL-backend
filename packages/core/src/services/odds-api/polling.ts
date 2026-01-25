/**
 * Odds API Polling Service
 * Polls for odds updates and publishes to Redis Pub/Sub
 */

import { EventEmitter } from "events";
import type {
  SportKey,
  MarketKey,
  OddsUpdate,
  PollingConfig,
  PollingState,
  Logger,
  CachedOdds,
  OddsChange,
} from "./types";
import { OddsApiClient } from "./client";
import type { RedisPubSub, PriceUpdate } from "../redis/pubsub";

// ============================================================================
// Types
// ============================================================================

export interface OddsPollerConfig {
  client: OddsApiClient;
  pubsub?: RedisPubSub;
  sports: SportKey[];
  markets?: MarketKey[];
  regions?: string[];
  pollIntervalMs?: number;
  cacheExpiryMs?: number;
  logger?: Logger;
}

export interface PollResult {
  sport: SportKey;
  eventsPolled: number;
  updatesPublished: number;
  changesDetected: number;
  duration: number;
}

// ============================================================================
// Odds Poller Service
// ============================================================================

export class OddsPoller extends EventEmitter {
  private readonly client: OddsApiClient;
  private readonly pubsub?: RedisPubSub;
  private readonly sports: SportKey[];
  private readonly markets: MarketKey[];
  private readonly regions: string[];
  private readonly pollIntervalMs: number;
  private readonly cacheExpiryMs: number;
  private readonly logger: Logger;

  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private cache: Map<string, CachedOdds> = new Map();
  private state: PollingState = {
    isRunning: false,
    lastPollTime: 0,
    pollCount: 0,
    errorCount: 0,
  };

  constructor(config: OddsPollerConfig) {
    super();
    this.client = config.client;
    this.pubsub = config.pubsub;
    this.sports = config.sports;
    this.markets = config.markets ?? ["h2h", "spreads", "totals"];
    this.regions = config.regions ?? ["us"];
    this.pollIntervalMs = config.pollIntervalMs ?? 30000; // 30 seconds default
    this.cacheExpiryMs = config.cacheExpiryMs ?? 60000; // 1 minute cache
    this.logger = config.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[OddsPoller] ${msg}`, meta),
      info: (msg, meta) => console.info(`[OddsPoller] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[OddsPoller] ${msg}`, meta),
      error: (msg, meta) => console.error(`[OddsPoller] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // Lifecycle Management
  // ==========================================================================

  /**
   * Start polling for odds updates
   */
  start(): void {
    if (this.state.isRunning) {
      this.logger.warn("Poller already running");
      return;
    }

    this.state.isRunning = true;
    this.logger.info("Starting odds poller", {
      sports: this.sports,
      intervalMs: this.pollIntervalMs,
    });

    // Initial poll
    this.poll();

    // Set up interval
    this.pollingTimer = setInterval(() => {
      this.poll();
    }, this.pollIntervalMs);

    this.emit("started");
  }

  /**
   * Stop polling
   */
  stop(): void {
    if (!this.state.isRunning) {
      return;
    }

    this.state.isRunning = false;

    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    this.logger.info("Stopped odds poller");
    this.emit("stopped");
  }

  /**
   * Restart polling
   */
  restart(): void {
    this.stop();
    this.start();
  }

  // ==========================================================================
  // Polling Logic
  // ==========================================================================

  /**
   * Execute a poll cycle
   */
  private async poll(): Promise<void> {
    const startTime = Date.now();
    const results: PollResult[] = [];

    try {
      this.logger.debug("Starting poll cycle", { pollCount: this.state.pollCount });

      // Poll each sport
      for (const sport of this.sports) {
        try {
          const result = await this.pollSport(sport);
          results.push(result);
        } catch (error) {
          this.logger.error("Failed to poll sport", { sport, error });
          this.state.errorCount++;
        }
      }

      this.state.lastPollTime = Date.now();
      this.state.pollCount++;

      const totalDuration = Date.now() - startTime;
      const totalUpdates = results.reduce((sum, r) => sum + r.updatesPublished, 0);
      const totalChanges = results.reduce((sum, r) => sum + r.changesDetected, 0);

      this.logger.info("Poll cycle complete", {
        duration: totalDuration,
        sports: results.length,
        updates: totalUpdates,
        changes: totalChanges,
      });

      this.emit("pollComplete", { results, duration: totalDuration });
    } catch (error) {
      this.state.errorCount++;
      this.state.lastError = error as Error;
      this.logger.error("Poll cycle failed", { error });
      this.emit("pollError", error);
    }
  }

  /**
   * Poll a single sport for updates
   */
  private async pollSport(sport: SportKey): Promise<PollResult> {
    const startTime = Date.now();
    let updatesPublished = 0;
    let changesDetected = 0;

    try {
      const updates = await this.client.getNormalizedOdds({
        sport,
        markets: this.markets,
        regions: this.regions,
      });

      for (const update of updates) {
        const changes = this.detectChanges(update);
        changesDetected += changes.length;

        // Update cache
        this.cache.set(update.eventId, {
          eventId: update.eventId,
          data: update,
          cachedAt: Date.now(),
          expiresAt: Date.now() + this.cacheExpiryMs,
        });

        // Publish if there are changes or if this is a new event
        if (changes.length > 0 || !this.cache.has(update.eventId)) {
          await this.publishUpdate(update, changes);
          updatesPublished++;
        }
      }

      return {
        sport,
        eventsPolled: updates.length,
        updatesPublished,
        changesDetected,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      this.logger.error("Failed to poll sport", { sport, error });
      throw error;
    }
  }

  /**
   * Detect changes from previous cached data
   */
  private detectChanges(update: OddsUpdate): OddsChange[] {
    const changes: OddsChange[] = [];
    const cached = this.cache.get(update.eventId);

    if (!cached) {
      return changes; // No previous data to compare
    }

    const previousData = cached.data;

    // Compare markets
    for (const market of update.markets) {
      const previousMarket = previousData.markets.find(
        (m) => m.type === market.type && m.bookmaker === market.bookmaker
      );

      if (!previousMarket) continue;

      for (const outcome of market.outcomes) {
        const previousOutcome = previousMarket.outcomes.find(
          (o) => o.name === outcome.name && o.point === outcome.point
        );

        if (!previousOutcome) continue;

        const changePercent =
          ((outcome.odds - previousOutcome.odds) / previousOutcome.odds) * 100;

        // Only report significant changes (> 1%)
        if (Math.abs(changePercent) > 1) {
          changes.push({
            eventId: update.eventId,
            market: market.type,
            bookmaker: market.bookmaker,
            outcome: outcome.name,
            previousOdds: previousOutcome.odds,
            currentOdds: outcome.odds,
            changePercent: Math.round(changePercent * 100) / 100,
            timestamp: Date.now(),
          });
        }
      }
    }

    return changes;
  }

  /**
   * Publish update to Redis Pub/Sub
   */
  private async publishUpdate(
    update: OddsUpdate,
    changes: OddsChange[]
  ): Promise<void> {
    if (!this.pubsub) {
      this.emit("update", update);
      if (changes.length > 0) {
        this.emit("changes", changes);
      }
      return;
    }

    try {
      // Publish full update
      const channel = `odds:${update.sportKey}:${update.eventId}`;
      await this.pubsub.publish(channel, update);

      // Publish as price update for integration with other systems
      for (const market of update.markets) {
        if (market.type === "h2h") {
          // Find home and away team outcomes
          const homeOutcome = market.outcomes.find(
            (o) => o.name === update.homeTeam
          );
          const awayOutcome = market.outcomes.find(
            (o) => o.name === update.awayTeam
          );

          if (homeOutcome) {
            const priceUpdate: PriceUpdate = {
              marketId: `${update.eventId}:${update.homeTeam}`,
              source: "odds-api",
              yesPrice: homeOutcome.impliedProbability,
              noPrice: 100 - homeOutcome.impliedProbability,
              timestamp: update.timestamp,
            };
            await this.pubsub.publishPrice(priceUpdate);
          }

          if (awayOutcome) {
            const priceUpdate: PriceUpdate = {
              marketId: `${update.eventId}:${update.awayTeam}`,
              source: "odds-api",
              yesPrice: awayOutcome.impliedProbability,
              noPrice: 100 - awayOutcome.impliedProbability,
              timestamp: update.timestamp,
            };
            await this.pubsub.publishPrice(priceUpdate);
          }
        }
      }

      // Publish individual changes
      if (changes.length > 0) {
        await this.pubsub.publish(`odds-changes:${update.sportKey}`, changes);
      }

      this.emit("published", { update, changes });
    } catch (error) {
      this.logger.error("Failed to publish update", { eventId: update.eventId, error });
    }
  }

  // ==========================================================================
  // Cache Management
  // ==========================================================================

  /**
   * Get cached odds for an event
   */
  getCachedOdds(eventId: string): OddsUpdate | null {
    const cached = this.cache.get(eventId);
    if (!cached) return null;

    if (Date.now() > cached.expiresAt) {
      this.cache.delete(eventId);
      return null;
    }

    return cached.data;
  }

  /**
   * Get all cached events for a sport
   */
  getCachedOddsForSport(sport: SportKey): OddsUpdate[] {
    const now = Date.now();
    const results: OddsUpdate[] = [];

    for (const [eventId, cached] of this.cache) {
      if (cached.data.sportKey === sport && now < cached.expiresAt) {
        results.push(cached.data);
      }
    }

    return results;
  }

  /**
   * Clear expired cache entries
   */
  cleanupCache(): number {
    const now = Date.now();
    let removed = 0;

    for (const [eventId, cached] of this.cache) {
      if (now > cached.expiresAt) {
        this.cache.delete(eventId);
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.debug("Cleaned up cache", { removed });
    }

    return removed;
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.info("Cache cleared");
  }

  // ==========================================================================
  // State & Metrics
  // ==========================================================================

  /**
   * Get current polling state
   */
  getState(): PollingState {
    return { ...this.state };
  }

  /**
   * Get cache stats
   */
  getCacheStats(): {
    size: number;
    bySport: Record<string, number>;
    oldestEntry: number | null;
    newestEntry: number | null;
  } {
    const bySport: Record<string, number> = {};
    let oldestEntry: number | null = null;
    let newestEntry: number | null = null;

    for (const cached of this.cache.values()) {
      const sport = cached.data.sportKey;
      bySport[sport] = (bySport[sport] ?? 0) + 1;

      if (oldestEntry === null || cached.cachedAt < oldestEntry) {
        oldestEntry = cached.cachedAt;
      }
      if (newestEntry === null || cached.cachedAt > newestEntry) {
        newestEntry = cached.cachedAt;
      }
    }

    return {
      size: this.cache.size,
      bySport,
      oldestEntry,
      newestEntry,
    };
  }

  /**
   * Check if polling is active
   */
  isRunning(): boolean {
    return this.state.isRunning;
  }

  /**
   * Force an immediate poll
   */
  async forcePoll(): Promise<void> {
    if (!this.state.isRunning) {
      this.logger.warn("Poller not running, starting single poll");
    }
    await this.poll();
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  /**
   * Register update handler
   */
  onUpdate(handler: (update: OddsUpdate) => void): () => void {
    this.on("update", handler);
    return () => this.off("update", handler);
  }

  /**
   * Register changes handler
   */
  onChanges(handler: (changes: OddsChange[]) => void): () => void {
    this.on("changes", handler);
    return () => this.off("changes", handler);
  }

  /**
   * Register error handler
   */
  onError(handler: (error: Error) => void): () => void {
    this.on("pollError", handler);
    return () => this.off("pollError", handler);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let pollerInstance: OddsPoller | null = null;

export function getOddsPoller(config?: OddsPollerConfig): OddsPoller {
  if (!pollerInstance && config) {
    pollerInstance = new OddsPoller(config);
  }

  if (!pollerInstance) {
    throw new Error("OddsPoller not initialized. Call with config first.");
  }

  return pollerInstance;
}

export function initOddsPoller(config: OddsPollerConfig): OddsPoller {
  if (pollerInstance) {
    pollerInstance.stop();
  }
  pollerInstance = new OddsPoller(config);
  return pollerInstance;
}

export default OddsPoller;
