/**
 * Real Estate Market Resolution Workflow
 * Handles the complete lifecycle of resolving a real estate prediction market
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
  sleep,
  ApplicationFailure,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies with retry policies
const {
  getEventDetails,
  checkResolutionCondition,
  getEventPositions,
  calculateSettlements,
  processSettlementPayout,
  closePosition,
  settleEvent,
  updateEventStatus,
  sendResolutionNotification,
  recordAuditLog,
  updateAgentPredictionStats,
  awardAgentPoints,
  getAgentByUserId,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 seconds",
  retry: {
    initialInterval: "2 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 5,
    maximumInterval: "60 seconds",
  },
});

// Workflow input
export interface MarketResolutionInput {
  eventId: string;
  forceResolution?: boolean;
}

// Resolution status
export interface ResolutionStatus {
  eventId: string;
  phase:
    | "initializing"
    | "fetching_data"
    | "checking_condition"
    | "calculating_settlements"
    | "processing_payouts"
    | "updating_agents"
    | "finalizing"
    | "completed"
    | "failed";
  outcome?: "yes" | "no";
  settlementValue?: number;
  totalPositions: number;
  processedPositions: number;
  totalPayout: number;
  errorMessage?: string;
}

// Query for resolution status
export const getResolutionStatusQuery = defineQuery<ResolutionStatus>("getResolutionStatus");

/**
 * Market Resolution Workflow
 */
export async function marketResolutionWorkflow(
  input: MarketResolutionInput
): Promise<ResolutionStatus> {
  const { eventId, forceResolution } = input;

  // Initialize status
  const status: ResolutionStatus = {
    eventId,
    phase: "initializing",
    totalPositions: 0,
    processedPositions: 0,
    totalPayout: 0,
  };

  setHandler(getResolutionStatusQuery, () => status);

  try {
    // =========================================================================
    // Step 1: Get event details
    // =========================================================================
    await recordAuditLog({
      action: "realEstate.resolution_started",
      resourceType: "realEstatePredictionEvents",
      resourceId: eventId,
      metadata: { forceResolution },
    });

    const event = await getEventDetails(eventId);

    if (!event) {
      throw ApplicationFailure.nonRetryable(`Event not found: ${eventId}`);
    }

    // Check if event is in correct state for resolution
    if (!forceResolution && event.status !== "closed") {
      if (event.status === "settled") {
        throw ApplicationFailure.nonRetryable("Event already settled");
      }
      if (event.status === "open" && event.resolutionDate > Date.now()) {
        throw ApplicationFailure.nonRetryable("Event has not reached resolution date");
      }
    }

    // =========================================================================
    // Step 2: Fetch resolution data and check condition
    // =========================================================================
    status.phase = "fetching_data";

    // Parse location from event
    const location = parseLocation(event);

    status.phase = "checking_condition";

    const resolution = await checkResolutionCondition(
      eventId,
      event.targetMetric,
      event.targetValue,
      event.comparisonOperator as "gt" | "gte" | "lt" | "lte" | "eq",
      location
    );

    if (!resolution.resolved || resolution.outcome === null) {
      // Data not available - schedule retry
      if (!forceResolution) {
        await recordAuditLog({
          action: "realEstate.resolution_deferred",
          resourceType: "realEstatePredictionEvents",
          resourceId: eventId,
          metadata: { reason: "Data not available" },
        });

        // Wait and retry (workflow will be rescheduled)
        await sleep("1 hour");

        // This will fail and Temporal will retry the workflow
        throw new Error("Resolution data not available, retrying...");
      } else {
        throw ApplicationFailure.nonRetryable("Unable to resolve: data not available");
      }
    }

    status.outcome = resolution.outcome;
    status.settlementValue = resolution.currentValue ?? 0;

    // Close event for trading
    await updateEventStatus(eventId, "resolving");

    // =========================================================================
    // Step 3: Get all positions and calculate settlements
    // =========================================================================
    status.phase = "calculating_settlements";

    const positions = await getEventPositions(eventId);
    status.totalPositions = positions.length;

    const settlements = await calculateSettlements(eventId, resolution.outcome, positions);

    // =========================================================================
    // Step 4: Process payouts
    // =========================================================================
    status.phase = "processing_payouts";

    const agentPredictions = new Map<string, { correct: number; total: number }>();

    for (const settlement of settlements) {
      await processSettlementPayout(
        settlement.userId,
        settlement.positionId,
        eventId,
        settlement.payout,
        settlement.profitLoss
      );

      await closePosition(settlement.userId, settlement.positionId);

      status.processedPositions++;
      status.totalPayout += settlement.payout;

      // Send notification
      await sendResolutionNotification(
        settlement.userId,
        eventId,
        resolution.outcome,
        settlement.payout,
        settlement.profitLoss
      );

      // Track agent predictions for accuracy update
      const agent = await getAgentByUserId(settlement.userId);
      if (agent) {
        const current = agentPredictions.get(agent.agentId) ?? { correct: 0, total: 0 };
        current.total++;
        // Consider it correct if they profited
        if (settlement.profitLoss > 0) {
          current.correct++;
        }
        agentPredictions.set(agent.agentId, current);
      }
    }

    // =========================================================================
    // Step 5: Update agent prediction stats
    // =========================================================================
    status.phase = "updating_agents";

    for (const [agentId, stats] of agentPredictions) {
      await updateAgentPredictionStats(agentId, stats.total, stats.correct);

      // Award points for correct predictions
      if (stats.correct > 0) {
        await awardAgentPoints(
          agentId,
          "prediction_correct",
          stats.correct * 50,
          `Correct predictions on ${event.title}`,
          eventId
        );
      }
    }

    // =========================================================================
    // Step 6: Finalize settlement
    // =========================================================================
    status.phase = "finalizing";

    await settleEvent(
      eventId,
      resolution.outcome,
      resolution.currentValue ?? 0,
      `Resolved via ${resolution.source}. Target: ${event.targetValue}, Actual: ${resolution.currentValue}, Confidence: ${resolution.confidence}%`
    );

    await recordAuditLog({
      action: "realEstate.resolution_completed",
      resourceType: "realEstatePredictionEvents",
      resourceId: eventId,
      metadata: {
        outcome: resolution.outcome,
        settlementValue: resolution.currentValue,
        totalPositions: positions.length,
        totalPayout: status.totalPayout,
        source: resolution.source,
        confidence: resolution.confidence,
      },
    });

    status.phase = "completed";
    return status;

  } catch (error) {
    status.phase = "failed";
    status.errorMessage = error instanceof Error ? error.message : String(error);

    await recordAuditLog({
      action: "realEstate.resolution_failed",
      resourceType: "realEstatePredictionEvents",
      resourceId: eventId,
      metadata: {
        error: status.errorMessage,
        phase: status.phase,
      },
    });

    throw error;
  }
}

/**
 * Helper to parse location from event
 */
function parseLocation(event: {
  geographicScope: string;
  location?: string;
}): {
  geographicScope: string;
  state?: string;
  city?: string;
  zipCode?: string;
} {
  // Parse location string like "Miami, FL" or "33101"
  const location = event.location ?? "";

  if (event.geographicScope === "zip_code") {
    return { geographicScope: "zip_code", zipCode: location };
  }

  if (event.geographicScope === "city") {
    const parts = location.split(",").map((p) => p.trim());
    return {
      geographicScope: "city",
      city: parts[0],
      state: parts[1],
    };
  }

  if (event.geographicScope === "state") {
    return { geographicScope: "state", state: location };
  }

  return { geographicScope: event.geographicScope };
}
