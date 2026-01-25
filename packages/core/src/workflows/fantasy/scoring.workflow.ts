/**
 * Fantasy Football Scoring Workflow
 *
 * Handles real-time scoring updates during NFL games and
 * final score calculation when games complete.
 */

import {
  proxyActivities,
  sleep,
  defineQuery,
  setHandler,
  continueAsNew,
} from "@temporalio/workflow";
import type * as activities from "./activities";

const {
  fetchWeeklyStats,
  calculatePoints,
  updatePlayerScores,
  updateMatchupScores,
  finalizeMatchup,
  updateStandings,
  lockMarkets,
  settleMarkets,
  processMarketPayouts,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    maximumAttempts: 5,
    initialInterval: "2 seconds",
    backoffCoefficient: 2,
  },
});

// =============================================================================
// QUERIES
// =============================================================================

export const getScoringState = defineQuery<ScoringState>("getScoringState");

// =============================================================================
// TYPES
// =============================================================================

export interface ScoringInput {
  leagueId: string;
  week: number;
  season: string;
  scoringType: "ppr" | "half_ppr" | "standard";
  matchupIds: string[];
  marketIds: string[];
}

export interface ScoringState {
  leagueId: string;
  week: number;
  status: "waiting" | "live" | "processing" | "complete";
  gamesInProgress: number;
  gamesComplete: number;
  lastUpdateAt: number;
  matchupScores: Map<string, { teamA: number; teamB: number }>;
  iteration: number;
}

interface MatchupScore {
  matchupId: string;
  teamAId: string;
  teamBId: string;
  teamAScore: number;
  teamBScore: number;
}

// =============================================================================
// WORKFLOW
// =============================================================================

export async function scoringWorkflow(input: ScoringInput): Promise<ScoringState> {
  const state: ScoringState = {
    leagueId: input.leagueId,
    week: input.week,
    status: "waiting",
    gamesInProgress: 0,
    gamesComplete: 0,
    lastUpdateAt: Date.now(),
    matchupScores: new Map(),
    iteration: 0,
  };

  setHandler(getScoringState, () => state);

  // Initialize matchup scores
  for (const matchupId of input.matchupIds) {
    state.matchupScores.set(matchupId, { teamA: 0, teamB: 0 });
  }

  // Lock prediction markets at game start
  if (input.marketIds.length > 0) {
    await lockMarkets(input.marketIds);
  }

  // Main scoring loop - runs during game window
  const MAX_ITERATIONS = 500; // ~4 hours at 30-second intervals
  let allGamesComplete = false;

  while (!allGamesComplete && state.iteration < MAX_ITERATIONS) {
    state.iteration++;
    state.status = "live";

    try {
      // Fetch latest stats from ESPN
      const weeklyStats = await fetchWeeklyStats(input.week, input.season);

      if (weeklyStats.size > 0) {
        // Calculate scores for each player
        const playerScores = new Map<string, number>();
        const scoringRules = getScoringRulesForType(input.scoringType);

        for (const [playerId, stats] of weeklyStats) {
          const points = await calculatePoints(stats, scoringRules);
          playerScores.set(playerId, points);
        }

        // Update player scores in database
        await updatePlayerScores(input.leagueId, input.week, playerScores);

        // Update matchup scores
        // In real implementation, this would aggregate roster player scores
        const matchupScores = await calculateMatchupScores(
          input.matchupIds,
          playerScores
        );

        for (const score of matchupScores) {
          state.matchupScores.set(score.matchupId, {
            teamA: score.teamAScore,
            teamB: score.teamBScore,
          });

          // Update matchup in database
          await updateMatchupScores(
            score.matchupId,
            score.teamAScore,
            score.teamBScore,
            "in_progress"
          );
        }
      }

      state.lastUpdateAt = Date.now();

      // Check if all games are complete (mock - would check ESPN game status)
      const gameStatus = await checkGameStatus(input.week);
      state.gamesInProgress = gameStatus.inProgress;
      state.gamesComplete = gameStatus.complete;
      allGamesComplete = gameStatus.allComplete;

    } catch (error) {
      console.error("Scoring update error:", error);
    }

    // Wait before next update
    if (!allGamesComplete) {
      await sleep("30 seconds");
    }

    // Continue as new to avoid history growth
    if (state.iteration % 100 === 0 && !allGamesComplete) {
      await continueAsNew<typeof scoringWorkflow>({
        ...input,
        // Pass current state via input if needed
      });
    }
  }

  // Finalize scoring
  state.status = "processing";

  // Finalize all matchups
  for (const matchupId of input.matchupIds) {
    const scores = state.matchupScores.get(matchupId);
    if (scores) {
      const winnerId = scores.teamA > scores.teamB
        ? "teamA" // Would be actual team ID
        : scores.teamB > scores.teamA
          ? "teamB"
          : null;
      const isTie = scores.teamA === scores.teamB;

      await updateMatchupScores(matchupId, scores.teamA, scores.teamB, "final");
      await finalizeMatchup(matchupId, winnerId, isTie);
    }
  }

  // Update league standings
  await updateStandings(input.leagueId);

  // Settle prediction markets
  if (input.marketIds.length > 0) {
    const outcomes = new Map<string, string>();
    // Determine outcomes based on matchup results
    for (const matchupId of input.matchupIds) {
      const scores = state.matchupScores.get(matchupId);
      if (scores) {
        outcomes.set(matchupId, scores.teamA > scores.teamB ? "teamA" : "teamB");
      }
    }
    await settleMarkets(input.marketIds, outcomes);

    // Process payouts
    for (const marketId of input.marketIds) {
      await processMarketPayouts(marketId);
    }
  }

  state.status = "complete";
  return state;
}

// =============================================================================
// HELPERS
// =============================================================================

function getScoringRulesForType(type: "ppr" | "half_ppr" | "standard") {
  const baseRules = {
    passingYardsPerPoint: 0.04,
    passingTd: 4,
    interception: -2,
    rushingYardsPerPoint: 0.1,
    rushingTd: 6,
    receivingYardsPerPoint: 0.1,
    receivingTd: 6,
    fumble: -2,
    twoPointConversion: 2,
    fgMade: 3,
    fgMissed: -1,
    fg40_49: 4,
    fg50Plus: 5,
    extraPoint: 1,
    sack: 1,
    defenseInterception: 2,
    fumbleRecovery: 2,
    defenseTd: 6,
    safety: 2,
    blockedKick: 2,
    pointsAllowed0: 10,
    pointsAllowed1_6: 7,
    pointsAllowed7_13: 4,
    pointsAllowed14_20: 1,
    pointsAllowed21_27: 0,
    pointsAllowed28_34: -1,
    pointsAllowed35Plus: -4,
  };

  return {
    ...baseRules,
    reception: type === "ppr" ? 1 : type === "half_ppr" ? 0.5 : 0,
  };
}

async function calculateMatchupScores(
  matchupIds: string[],
  playerScores: Map<string, number>
): Promise<MatchupScore[]> {
  // Mock implementation - would fetch rosters and aggregate
  return matchupIds.map((matchupId) => ({
    matchupId,
    teamAId: "team-a",
    teamBId: "team-b",
    teamAScore: 0,
    teamBScore: 0,
  }));
}

async function checkGameStatus(week: number): Promise<{
  inProgress: number;
  complete: number;
  allComplete: boolean;
}> {
  // Mock implementation - would check ESPN game status
  return {
    inProgress: 0,
    complete: 16,
    allComplete: true,
  };
}
