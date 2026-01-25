/**
 * Settlement Workflow
 * Handles prediction market settlement when events resolve
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
  sleep,
  ApplicationFailure,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies
const {
  getEventDetails,
  getAllPositionsForEvent,
  calculateSettlementAmounts,
  creditUserBalance,
  debitUserBalance,
  closePosition,
  sendSettlementNotification,
  recordAuditLog,
  markEventSettled,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 5,
    maximumInterval: "30 seconds",
  },
});

// Workflow input type
export interface SettlementInput {
  eventId: string;
  outcome: string;
  settlementTime: string;
}

// Settlement status type
export interface SettlementStatus {
  eventId: string;
  outcome: string;
  status: "pending" | "processing" | "completed" | "completed_with_errors" | "failed";
  totalPositions: number;
  processedPositions: number;
  totalPayout: number;
  totalCollected: number;
  errors: Array<{ userId: string; error: string }>;
}

// Queries
export const getSettlementStatusQuery = defineQuery<SettlementStatus>("getSettlementStatus");

/**
 * Settlement Workflow
 */
export async function settlementWorkflow(
  input: SettlementInput
): Promise<SettlementStatus> {
  const { eventId, outcome, settlementTime } = input;

  // Initialize status
  const status: SettlementStatus = {
    eventId,
    outcome,
    status: "pending",
    totalPositions: 0,
    processedPositions: 0,
    totalPayout: 0,
    totalCollected: 0,
    errors: [],
  };

  // Set up query handler
  setHandler(getSettlementStatusQuery, () => status);

  try {
    // Log settlement start
    await recordAuditLog({
      userId: "system",
      action: "settlement_started",
      resourceType: "event",
      resourceId: eventId,
      metadata: { outcome, settlementTime },
    });

    status.status = "processing";

    // =========================================================================
    // Step 1: Get event details and validate
    // =========================================================================
    const event = await getEventDetails(eventId);

    if (event.status === "settled") {
      throw ApplicationFailure.nonRetryable("Event already settled");
    }

    if (!event.outcomes.includes(outcome)) {
      throw ApplicationFailure.nonRetryable(`Invalid outcome: ${outcome}`);
    }

    // =========================================================================
    // Step 2: Get all positions for this event
    // =========================================================================
    const positions = await getAllPositionsForEvent(eventId);
    status.totalPositions = positions.length;

    if (positions.length === 0) {
      // No positions to settle
      await markEventSettled(eventId, outcome);
      status.status = "completed";
      return status;
    }

    // =========================================================================
    // Step 3: Calculate settlement amounts for each position
    // =========================================================================
    const settlements = await calculateSettlementAmounts(eventId, outcome, positions);

    // =========================================================================
    // Step 4: Process each settlement
    // =========================================================================
    for (const settlement of settlements) {
      try {
        if (settlement.payout > 0) {
          // Winner - credit their balance
          await creditUserBalance(
            settlement.userId,
            "USD",
            settlement.payout,
            `Settlement for ${eventId} - ${outcome}`
          );
          status.totalPayout += settlement.payout;
        } else if (settlement.loss > 0) {
          // Already lost when they bought - just close position
          status.totalCollected += settlement.loss;
        }

        // Close the position
        await closePosition(settlement.userId, settlement.positionId);

        // Send notification
        await sendSettlementNotification(
          settlement.userId,
          eventId,
          outcome,
          settlement.payout > 0 ? "win" : "loss",
          settlement.payout > 0 ? settlement.payout : settlement.loss
        );

        status.processedPositions++;
      } catch (error) {
        status.errors.push({
          userId: settlement.userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // =========================================================================
    // Step 5: Mark event as settled
    // =========================================================================
    await markEventSettled(eventId, outcome);

    // =========================================================================
    // Step 6: Log completion
    // =========================================================================
    await recordAuditLog({
      userId: "system",
      action: "settlement_completed",
      resourceType: "event",
      resourceId: eventId,
      metadata: {
        outcome,
        totalPositions: status.totalPositions,
        processedPositions: status.processedPositions,
        totalPayout: status.totalPayout,
        errors: status.errors.length,
      },
    });

    status.status = status.errors.length > 0 ? "completed_with_errors" : "completed";

    return status;
  } catch (error) {
    status.status = "failed";

    await recordAuditLog({
      userId: "system",
      action: "settlement_failed",
      resourceType: "event",
      resourceId: eventId,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}
