/**
 * Fantasy Football Draft Workflow
 *
 * Orchestrates the entire draft process for a fantasy league.
 * Supports snake, auction, and linear draft types.
 */

import {
  proxyActivities,
  sleep,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
} from "@temporalio/workflow";
import type * as activities from "./activities";

const {
  initializeDraft,
  startDraft,
  getCurrentPick,
  executeDraftPick,
  advanceToNextPick,
  autoPickForTeam,
  completeDraft,
  notifyDraftEvent,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    maximumAttempts: 3,
    initialInterval: "1 second",
    backoffCoefficient: 2,
  },
});

// =============================================================================
// SIGNALS & QUERIES
// =============================================================================

export const makePick = defineSignal<[string, string]>("makePick"); // [teamId, playerId]
export const pauseDraft = defineSignal("pauseDraft");
export const resumeDraft = defineSignal("resumeDraft");
export const skipPick = defineSignal<[string]>("skipPick"); // [teamId] - commissioner action

export const getDraftState = defineQuery<DraftState>("getDraftState");

// =============================================================================
// TYPES
// =============================================================================

export interface DraftInput {
  draftId: string;
  leagueId: string;
  draftType: "snake" | "auction" | "linear";
  secondsPerPick: number;
  draftOrder: string[]; // Team IDs in order
  totalRounds: number;
  auctionBudget?: number;
}

export interface DraftState {
  draftId: string;
  leagueId: string;
  status: "pending" | "in_progress" | "paused" | "completed";
  currentRound: number;
  currentPick: number;
  currentTeamId: string | null;
  pickDeadline: number | null;
  completedPicks: number;
  totalPicks: number;
  picks: DraftPick[];
  errors: string[];
}

interface DraftPick {
  round: number;
  pick: number;
  overallPick: number;
  teamId: string;
  playerId: string;
  isAutoPick: boolean;
  timestamp: number;
}

// =============================================================================
// WORKFLOW
// =============================================================================

export async function draftWorkflow(input: DraftInput): Promise<DraftState> {
  // Initialize state
  const state: DraftState = {
    draftId: input.draftId,
    leagueId: input.leagueId,
    status: "pending",
    currentRound: 1,
    currentPick: 1,
    currentTeamId: input.draftOrder[0],
    pickDeadline: null,
    completedPicks: 0,
    totalPicks: input.draftOrder.length * input.totalRounds,
    picks: [],
    errors: [],
  };

  let isPaused = false;
  let pendingPick: { teamId: string; playerId: string } | null = null;
  let shouldSkip = false;

  // Set up signal handlers
  setHandler(makePick, (teamId: string, playerId: string) => {
    if (teamId === state.currentTeamId && state.status === "in_progress") {
      pendingPick = { teamId, playerId };
    }
  });

  setHandler(pauseDraft, () => {
    if (state.status === "in_progress") {
      isPaused = true;
      state.status = "paused";
    }
  });

  setHandler(resumeDraft, () => {
    if (state.status === "paused") {
      isPaused = false;
      state.status = "in_progress";
    }
  });

  setHandler(skipPick, (teamId: string) => {
    if (teamId === state.currentTeamId) {
      shouldSkip = true;
    }
  });

  setHandler(getDraftState, () => state);

  // Initialize draft
  await initializeDraft({
    draftId: input.draftId,
    leagueId: input.leagueId,
    draftType: input.draftType,
    secondsPerPick: input.secondsPerPick,
    draftOrder: input.draftOrder,
    totalRounds: input.totalRounds,
  });

  // Start draft
  await startDraft(input.draftId);
  state.status = "in_progress";

  await notifyDraftEvent(input.leagueId, "start", {
    draftId: input.draftId,
    totalPicks: state.totalPicks,
    secondsPerPick: input.secondsPerPick,
  });

  // Main draft loop
  while (state.completedPicks < state.totalPicks) {
    // Wait if paused
    await condition(() => !isPaused, "30 minutes");

    // Calculate current team based on draft type
    const currentTeamIndex = calculateCurrentTeamIndex(
      state.completedPicks,
      input.draftOrder.length,
      input.draftType
    );
    state.currentTeamId = input.draftOrder[currentTeamIndex];
    state.currentRound = Math.floor(state.completedPicks / input.draftOrder.length) + 1;
    state.currentPick = (state.completedPicks % input.draftOrder.length) + 1;
    state.pickDeadline = Date.now() + input.secondsPerPick * 1000;

    // Reset pick state
    pendingPick = null;
    shouldSkip = false;

    // Wait for pick or timeout
    const pickMade = await condition(
      () => pendingPick !== null || shouldSkip || isPaused,
      input.secondsPerPick * 1000
    );

    if (isPaused) {
      continue; // Go back to pause check
    }

    let playerId: string;
    let isAutoPick = false;

    if (pendingPick) {
      // Valid pick made
      playerId = pendingPick.playerId;
    } else {
      // Auto-pick (timeout or skip)
      playerId = await autoPickForTeam(input.draftId, state.currentTeamId);
      isAutoPick = true;
    }

    // Execute the pick
    try {
      await executeDraftPick(input.draftId, state.currentTeamId, playerId, isAutoPick);

      const pick: DraftPick = {
        round: state.currentRound,
        pick: state.currentPick,
        overallPick: state.completedPicks + 1,
        teamId: state.currentTeamId,
        playerId,
        isAutoPick,
        timestamp: Date.now(),
      };
      state.picks.push(pick);
      state.completedPicks++;

      await notifyDraftEvent(input.leagueId, "pick", {
        ...pick,
        remainingPicks: state.totalPicks - state.completedPicks,
      });
    } catch (error) {
      state.errors.push(`Pick failed: ${error}`);
    }

    // Small delay between picks
    await sleep("1 second");
  }

  // Complete draft
  await completeDraft(input.draftId);
  state.status = "completed";
  state.currentTeamId = null;
  state.pickDeadline = null;

  await notifyDraftEvent(input.leagueId, "complete", {
    draftId: input.draftId,
    totalPicks: state.completedPicks,
    duration: Date.now(),
  });

  return state;
}

// =============================================================================
// HELPERS
// =============================================================================

function calculateCurrentTeamIndex(
  completedPicks: number,
  teamCount: number,
  draftType: "snake" | "auction" | "linear"
): number {
  if (draftType === "linear") {
    return completedPicks % teamCount;
  }

  // Snake draft: reverse direction each round
  const round = Math.floor(completedPicks / teamCount);
  const pickInRound = completedPicks % teamCount;

  if (round % 2 === 0) {
    // Even round: forward
    return pickInRound;
  } else {
    // Odd round: reverse
    return teamCount - 1 - pickInRound;
  }
}
