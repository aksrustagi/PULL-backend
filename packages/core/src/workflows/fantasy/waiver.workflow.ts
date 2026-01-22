/**
 * Fantasy Football Waiver Processing Workflow
 *
 * Processes waiver claims based on league rules (FAAB, rolling, reverse standings).
 * Runs on a schedule (typically Wednesday mornings).
 */

import {
  proxyActivities,
  sleep,
  defineQuery,
  setHandler,
} from "@temporalio/workflow";
import type * as activities from "./activities";

const {
  getPendingWaiverClaims,
  sortWaiverClaims,
  isPlayerAvailable,
  hasRosterSpace,
  executeWaiverClaim,
  updateWaiverPriorities,
  notifyWaiverResults,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    maximumAttempts: 3,
    initialInterval: "1 second",
    backoffCoefficient: 2,
  },
});

// =============================================================================
// QUERIES
// =============================================================================

export const getWaiverState = defineQuery<WaiverState>("getWaiverState");

// =============================================================================
// TYPES
// =============================================================================

export interface WaiverInput {
  leagueId: string;
  waiverType: "faab" | "rolling" | "reverse_standings";
  processTime: number; // Unix timestamp when processing should start
}

export interface WaiverState {
  leagueId: string;
  status: "waiting" | "processing" | "complete" | "failed";
  totalClaims: number;
  processedClaims: number;
  successfulClaims: number;
  failedClaims: number;
  results: WaiverResult[];
  startedAt: number | null;
  completedAt: number | null;
  errors: string[];
}

export interface WaiverResult {
  claimId: string;
  teamId: string;
  userId: string;
  success: boolean;
  playerAdded?: string;
  playerDropped?: string;
  faabSpent?: number;
  error?: string;
  processedAt: number;
}

// =============================================================================
// WORKFLOW
// =============================================================================

export async function waiverWorkflow(input: WaiverInput): Promise<WaiverState> {
  const state: WaiverState = {
    leagueId: input.leagueId,
    status: "waiting",
    totalClaims: 0,
    processedClaims: 0,
    successfulClaims: 0,
    failedClaims: 0,
    results: [],
    startedAt: null,
    completedAt: null,
    errors: [],
  };

  setHandler(getWaiverState, () => state);

  // Wait until process time if in the future
  const now = Date.now();
  if (input.processTime > now) {
    const waitTime = input.processTime - now;
    await sleep(waitTime);
  }

  state.status = "processing";
  state.startedAt = Date.now();

  try {
    // Get all pending waiver claims
    const claims = await getPendingWaiverClaims(input.leagueId);
    state.totalClaims = claims.length;

    if (claims.length === 0) {
      state.status = "complete";
      state.completedAt = Date.now();
      return state;
    }

    // Sort claims by priority based on waiver type
    const sortedClaims = await sortWaiverClaims(claims, input.waiverType);

    // Track which players have been claimed this run
    const claimedPlayers = new Set<string>();
    const successfulClaims: typeof claims = [];

    // Process each claim in order
    for (const claim of sortedClaims) {
      state.processedClaims++;

      // Skip if player was already claimed in this run
      if (claimedPlayers.has(claim.addPlayerId)) {
        state.results.push({
          claimId: claim.id,
          teamId: claim.teamId,
          userId: claim.userId,
          success: false,
          error: "Player already claimed by higher priority",
          processedAt: Date.now(),
        });
        state.failedClaims++;
        continue;
      }

      // Check if player is still available
      const playerAvailable = await isPlayerAvailable(input.leagueId, claim.addPlayerId);
      if (!playerAvailable) {
        state.results.push({
          claimId: claim.id,
          teamId: claim.teamId,
          userId: claim.userId,
          success: false,
          error: "Player is no longer available",
          processedAt: Date.now(),
        });
        state.failedClaims++;
        continue;
      }

      // Check if team has roster space (or is dropping a player)
      const hasSpace = await hasRosterSpace(claim.teamId, claim.dropPlayerId);
      if (!hasSpace) {
        state.results.push({
          claimId: claim.id,
          teamId: claim.teamId,
          userId: claim.userId,
          success: false,
          error: "No roster space available",
          processedAt: Date.now(),
        });
        state.failedClaims++;
        continue;
      }

      // Execute the claim
      const result = await executeWaiverClaim(claim);

      if (result.success) {
        claimedPlayers.add(claim.addPlayerId);
        successfulClaims.push(claim);
        state.successfulClaims++;
        state.results.push({
          claimId: claim.id,
          teamId: claim.teamId,
          userId: claim.userId,
          success: true,
          playerAdded: claim.addPlayerId,
          playerDropped: claim.dropPlayerId,
          faabSpent: claim.faabBid,
          processedAt: Date.now(),
        });
      } else {
        state.failedClaims++;
        state.results.push({
          claimId: claim.id,
          teamId: claim.teamId,
          userId: claim.userId,
          success: false,
          error: result.error,
          processedAt: Date.now(),
        });
      }

      // Small delay between claims
      await sleep("100 milliseconds");
    }

    // Update waiver priorities for rolling waiver leagues
    if (input.waiverType !== "faab" && successfulClaims.length > 0) {
      await updateWaiverPriorities(input.leagueId, successfulClaims);
    }

    // Send notifications
    await notifyWaiverResults(input.leagueId, state.results);

    state.status = "complete";
  } catch (error) {
    state.status = "failed";
    state.errors.push(String(error));
  }

  state.completedAt = Date.now();
  return state;
}

// =============================================================================
// SCHEDULED WAIVER WORKFLOW
// =============================================================================

/**
 * Weekly waiver schedule workflow
 * Runs every week and triggers waiver processing for all leagues
 */
export interface WeeklyWaiverInput {
  leagueIds: string[];
  processDay: number; // 0-6 (Sunday-Saturday)
  processHour: number; // 0-23
  timezone: string;
}

export async function weeklyWaiverScheduleWorkflow(
  input: WeeklyWaiverInput
): Promise<{ processedLeagues: number; errors: string[] }> {
  const errors: string[] = [];
  let processedLeagues = 0;

  // Calculate next process time
  const processTime = calculateNextProcessTime(
    input.processDay,
    input.processHour,
    input.timezone
  );

  // Wait until process time
  const now = Date.now();
  if (processTime > now) {
    await sleep(processTime - now);
  }

  // Process each league
  for (const leagueId of input.leagueIds) {
    try {
      // In real implementation, would start child workflow
      // await executeChild(waiverWorkflow, { args: [{ leagueId, ... }] });
      processedLeagues++;
    } catch (error) {
      errors.push(`League ${leagueId}: ${error}`);
    }
  }

  return { processedLeagues, errors };
}

function calculateNextProcessTime(
  day: number,
  hour: number,
  timezone: string
): number {
  const now = new Date();
  const target = new Date(now);

  // Set to target day and hour
  const currentDay = target.getDay();
  const daysUntil = (day - currentDay + 7) % 7 || 7;
  target.setDate(target.getDate() + daysUntil);
  target.setHours(hour, 0, 0, 0);

  // If target is in the past, add a week
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 7);
  }

  return target.getTime();
}
