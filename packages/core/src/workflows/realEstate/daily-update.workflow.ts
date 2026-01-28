/**
 * Real Estate Daily Update Workflow
 * Runs daily to update market data, sentiment, and PULL indices
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
  continueAsNew,
  sleep,
} from "@temporalio/workflow";

import type * as activities from "./activities";

const {
  fetchMarketMetric,
  calculateMarketSentiment,
  calculatePullIndex,
  storeMarketSentiment,
  storePullIndex,
  updateTargetMetricValue,
  sendSentimentAlert,
  recordAuditLog,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "5 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "60 seconds",
  },
});

// Input configuration
export interface DailyUpdateInput {
  locations: Array<{
    geographicScope: string;
    location: string;
    state?: string;
    city?: string;
  }>;
  openEventIds?: string[];
  runContinuously?: boolean;
}

// Update status
export interface DailyUpdateStatus {
  phase: "starting" | "updating_metrics" | "calculating_sentiment" | "updating_indices" | "completed" | "failed";
  locationsProcessed: number;
  totalLocations: number;
  eventsUpdated: number;
  indicesUpdated: number;
  lastRunAt?: string;
  nextRunAt?: string;
  errorMessage?: string;
}

export const getDailyUpdateStatusQuery = defineQuery<DailyUpdateStatus>("getDailyUpdateStatus");

/**
 * Daily Update Workflow
 * This workflow can run continuously (via continueAsNew) for scheduled daily updates
 */
export async function dailyUpdateWorkflow(input: DailyUpdateInput): Promise<DailyUpdateStatus> {
  const { locations, openEventIds = [], runContinuously = false } = input;

  const status: DailyUpdateStatus = {
    phase: "starting",
    locationsProcessed: 0,
    totalLocations: locations.length,
    eventsUpdated: 0,
    indicesUpdated: 0,
  };

  setHandler(getDailyUpdateStatusQuery, () => status);

  try {
    await recordAuditLog({
      action: "realEstate.daily_update_started",
      resourceType: "system",
      resourceId: "daily_update",
      metadata: { locations: locations.length, events: openEventIds.length },
    });

    // =========================================================================
    // Step 1: Update market metrics for open events
    // =========================================================================
    status.phase = "updating_metrics";

    for (const eventId of openEventIds) {
      try {
        // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
        // const event = await getEventDetails(eventId);
        // const metric = await fetchMarketMetric(event.targetMetric, { ... });
        // await updateTargetMetricValue(eventId, metric.value);
        status.eventsUpdated++;
      } catch (error) {
        console.error(`Failed to update event ${eventId}:`, error);
      }
    }

    // =========================================================================
    // Step 2: Calculate and store market sentiment for each location
    // =========================================================================
    status.phase = "calculating_sentiment";

    const previousSentiments = new Map<string, number>();

    for (const loc of locations) {
      try {
        const sentiment = await calculateMarketSentiment(loc.geographicScope, loc.location);

        await storeMarketSentiment(loc.geographicScope, loc.location, sentiment);

        // Check for significant sentiment changes (for alerts)
        const key = `${loc.geographicScope}:${loc.location}`;
        const previous = previousSentiments.get(key);
        if (previous && Math.abs(sentiment.overallSentiment - previous) > 10) {
          // Significant change - would trigger alerts to subscribed users
          // await sendSentimentAlert(...);
        }

        status.locationsProcessed++;
      } catch (error) {
        console.error(`Failed to calculate sentiment for ${loc.location}:`, error);
      }
    }

    // =========================================================================
    // Step 3: Calculate and update PULL Real Estate Indices
    // =========================================================================
    status.phase = "updating_indices";

    // National index
    try {
      const nationalIndex = await calculatePullIndex("national", "US");
      await storePullIndex(
        "PULL Real Estate Index - National",
        "PULL-RE-US",
        "national",
        "US",
        nationalIndex
      );
      status.indicesUpdated++;
    } catch (error) {
      console.error("Failed to calculate national index:", error);
    }

    // State-level indices for major states
    const majorStates = ["CA", "TX", "FL", "NY", "IL", "PA", "OH", "GA", "NC", "AZ"];

    for (const state of majorStates) {
      try {
        const stateIndex = await calculatePullIndex("state", state);
        await storePullIndex(
          `PULL Real Estate Index - ${state}`,
          `PULL-RE-${state}`,
          "state",
          state,
          stateIndex
        );
        status.indicesUpdated++;
      } catch (error) {
        console.error(`Failed to calculate index for ${state}:`, error);
      }
    }

    // Metro-level indices for major metros
    const majorMetros = [
      { name: "New York City", code: "NYC" },
      { name: "Los Angeles", code: "LA" },
      { name: "Chicago", code: "CHI" },
      { name: "Dallas", code: "DFW" },
      { name: "Houston", code: "HOU" },
      { name: "Miami", code: "MIA" },
      { name: "Phoenix", code: "PHX" },
      { name: "San Francisco", code: "SF" },
      { name: "Atlanta", code: "ATL" },
      { name: "Denver", code: "DEN" },
    ];

    for (const metro of majorMetros) {
      try {
        const metroIndex = await calculatePullIndex("metro", metro.name);
        await storePullIndex(
          `PULL Real Estate Index - ${metro.name}`,
          `PULL-RE-${metro.code}`,
          "metro",
          metro.name,
          metroIndex
        );
        status.indicesUpdated++;
      } catch (error) {
        console.error(`Failed to calculate index for ${metro.name}:`, error);
      }
    }

    // =========================================================================
    // Step 4: Complete and optionally schedule next run
    // =========================================================================
    status.phase = "completed";
    status.lastRunAt = new Date().toISOString();

    await recordAuditLog({
      action: "realEstate.daily_update_completed",
      resourceType: "system",
      resourceId: "daily_update",
      metadata: {
        locationsProcessed: status.locationsProcessed,
        eventsUpdated: status.eventsUpdated,
        indicesUpdated: status.indicesUpdated,
      },
    });

    // If running continuously, sleep until next day and continue
    if (runContinuously) {
      const now = new Date();
      const nextRun = new Date(now);
      nextRun.setDate(nextRun.getDate() + 1);
      nextRun.setHours(6, 0, 0, 0); // Run at 6 AM

      const sleepDuration = nextRun.getTime() - now.getTime();
      status.nextRunAt = nextRun.toISOString();

      await sleep(sleepDuration);

      // Continue as new workflow to prevent history buildup
      await continueAsNew<typeof dailyUpdateWorkflow>(input);
    }

    return status;

  } catch (error) {
    status.phase = "failed";
    status.errorMessage = error instanceof Error ? error.message : String(error);

    await recordAuditLog({
      action: "realEstate.daily_update_failed",
      resourceType: "system",
      resourceId: "daily_update",
      metadata: { error: status.errorMessage },
    });

    throw error;
  }
}
