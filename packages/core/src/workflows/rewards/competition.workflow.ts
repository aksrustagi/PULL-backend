/**
 * Competition Workflows
 * Handles seasonal competitions, tournaments, and leaderboard management
 */

import {
  proxyActivities,
  defineQuery,
  defineSignal,
  setHandler,
  condition,
  continueAsNew,
  sleep,
} from "@temporalio/workflow";

import type * as activities from "./gamification-activities";

// Activity proxies
const {
  // Competition operations
  getCompetition,
  createCompetition,
  startCompetition,
  endCompetition,
  getAllActiveCompetitions,
  // Participant operations
  joinCompetition,
  leaveCompetition,
  updateParticipantScore,
  getCompetitionLeaderboard,
  updateLeaderboardRanks,
  // Prize operations
  calculatePrizeDistribution,
  awardPrizes,
  claimCompetitionPrize,
  // Points operations
  creditPoints,
  // Token operations
  creditTokens,
  // Notifications
  sendCompetitionStartNotification,
  sendCompetitionEndNotification,
  sendRankChangeNotification,
  sendPrizeWonNotification,
  sendLeaderboardUpdateNotification,
  // Audit
  recordAuditLog,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// ============================================================================
// Types
// ============================================================================

export interface Competition {
  id: string;
  competitionId: string;
  name: string;
  description: string;
  type: "seasonal" | "weekly" | "monthly" | "special_event" | "tournament";
  scoringType: "points_earned" | "trading_volume" | "pnl" | "referrals" | "streak_days" | "quests_completed";
  startTime: number;
  endTime: number;
  prizePool: number;
  prizeDistribution: PrizeDistribution[];
  minTier?: string;
  entryFee?: number;
  maxParticipants?: number;
  participantCount: number;
  status: "upcoming" | "active" | "calculating" | "completed" | "cancelled";
}

export interface PrizeDistribution {
  rankStart: number;
  rankEnd: number;
  pointsPrize: number;
  tokenPrize?: number;
  specialPrize?: string;
}

// ============================================================================
// Competition Lifecycle Workflow
// ============================================================================

export interface RunCompetitionInput {
  competitionId: string;
  /** Interval for leaderboard updates in minutes */
  leaderboardUpdateInterval?: number;
  /** Whether to auto-start at startTime */
  autoStart?: boolean;
}

export interface RunCompetitionStatus {
  workflowId: string;
  phase: "waiting" | "active" | "calculating" | "awarding" | "completed" | "failed";
  competitionId: string;
  competitionName: string;
  // Timing
  startTime: number;
  endTime: number;
  currentTime: number;
  timeRemaining: number;
  // Stats
  participantCount: number;
  totalVolume: number;
  // Leaderboard
  topParticipants: Array<{
    rank: number;
    userId: string;
    username: string;
    score: number;
  }>;
  lastLeaderboardUpdate: number;
  // Results
  winnersAwarded: number;
  totalPrizesAwarded: {
    points: number;
    tokens: number;
  };
  error?: string;
}

// Signals
export const pauseCompetitionSignal = defineSignal("pauseCompetition");
export const resumeCompetitionSignal = defineSignal("resumeCompetition");
export const cancelCompetitionSignal = defineSignal<[string]>("cancelCompetition");

// Queries
export const getRunCompetitionStatusQuery = defineQuery<RunCompetitionStatus>(
  "getRunCompetitionStatus"
);

/**
 * Main competition lifecycle workflow
 * Manages the full lifecycle from start to prize distribution
 */
export async function runCompetitionWorkflow(
  input: RunCompetitionInput
): Promise<RunCompetitionStatus> {
  const {
    competitionId,
    leaderboardUpdateInterval = 15, // 15 minutes
    autoStart = true,
  } = input;

  const workflowId = `competition_run_${competitionId}`;

  // Get competition details
  const competition = await getCompetition(competitionId);

  if (!competition) {
    throw new Error(`Competition not found: ${competitionId}`);
  }

  const status: RunCompetitionStatus = {
    workflowId,
    phase: "waiting",
    competitionId,
    competitionName: competition.name,
    startTime: competition.startTime,
    endTime: competition.endTime,
    currentTime: Date.now(),
    timeRemaining: competition.endTime - Date.now(),
    participantCount: competition.participantCount,
    totalVolume: 0,
    topParticipants: [],
    lastLeaderboardUpdate: 0,
    winnersAwarded: 0,
    totalPrizesAwarded: { points: 0, tokens: 0 },
  };

  // Track pause state
  let isPaused = false;
  let isCancelled = false;
  let cancellationReason = "";

  setHandler(getRunCompetitionStatusQuery, () => status);
  setHandler(pauseCompetitionSignal, () => {
    isPaused = true;
  });
  setHandler(resumeCompetitionSignal, () => {
    isPaused = false;
  });
  setHandler(cancelCompetitionSignal, (reason: string) => {
    isCancelled = true;
    cancellationReason = reason;
  });

  try {
    // =========================================================================
    // Phase 1: Wait for start time
    // =========================================================================
    if (autoStart && Date.now() < competition.startTime) {
      status.phase = "waiting";
      const waitTime = competition.startTime - Date.now();

      // Wait for start or cancellation
      await condition(() => isCancelled, waitTime);

      if (isCancelled) {
        await handleCancellation(competitionId, cancellationReason);
        throw new Error(`Competition cancelled: ${cancellationReason}`);
      }
    }

    // =========================================================================
    // Phase 2: Start competition
    // =========================================================================
    status.phase = "active";
    status.currentTime = Date.now();
    status.timeRemaining = competition.endTime - Date.now();

    await startCompetition(competitionId);

    // Send start notification to all participants
    await sendCompetitionStartNotification(competitionId, {
      competitionName: competition.name,
      endTime: competition.endTime,
      prizePool: competition.prizePool,
    });

    await recordAuditLog({
      userId: "system",
      action: "competition_started",
      resourceType: "competition",
      resourceId: competitionId,
      metadata: {
        competitionName: competition.name,
        participantCount: status.participantCount,
      },
    });

    // =========================================================================
    // Phase 3: Active competition - periodic leaderboard updates
    // =========================================================================
    const updateIntervalMs = leaderboardUpdateInterval * 60 * 1000;

    while (Date.now() < competition.endTime && !isCancelled) {
      // Check for pause
      if (isPaused) {
        await condition(() => !isPaused || isCancelled, 60000); // Check every minute
        continue;
      }

      // Update leaderboard
      const leaderboard = await getCompetitionLeaderboard(competitionId, 10);
      await updateLeaderboardRanks(competitionId);

      status.topParticipants = leaderboard;
      status.lastLeaderboardUpdate = Date.now();
      status.currentTime = Date.now();
      status.timeRemaining = competition.endTime - Date.now();

      // Get updated stats
      const updatedCompetition = await getCompetition(competitionId);
      if (updatedCompetition) {
        status.participantCount = updatedCompetition.participantCount;
        status.totalVolume = updatedCompetition.totalVolume;
      }

      // Send rank change notifications for significant changes
      await sendRankChangeNotifications(competitionId, leaderboard);

      // Wait for next update interval or end time
      const sleepTime = Math.min(
        updateIntervalMs,
        Math.max(0, competition.endTime - Date.now())
      );

      if (sleepTime > 0) {
        await condition(() => isCancelled, sleepTime);
      }
    }

    if (isCancelled) {
      await handleCancellation(competitionId, cancellationReason);
      throw new Error(`Competition cancelled: ${cancellationReason}`);
    }

    // =========================================================================
    // Phase 4: End competition and calculate results
    // =========================================================================
    status.phase = "calculating";

    await endCompetition(competitionId);

    // Final leaderboard calculation
    await updateLeaderboardRanks(competitionId);
    const finalLeaderboard = await getCompetitionLeaderboard(competitionId, 100);
    status.topParticipants = finalLeaderboard.slice(0, 10);

    await recordAuditLog({
      userId: "system",
      action: "competition_ended",
      resourceType: "competition",
      resourceId: competitionId,
      metadata: {
        finalParticipantCount: status.participantCount,
        totalVolume: status.totalVolume,
      },
    });

    // =========================================================================
    // Phase 5: Award prizes
    // =========================================================================
    status.phase = "awarding";

    const prizeResults = await calculatePrizeDistribution(
      competitionId,
      competition.prizeDistribution,
      finalLeaderboard
    );

    for (const prize of prizeResults) {
      try {
        // Award points
        if (prize.pointsPrize > 0) {
          await creditPoints({
            userId: prize.userId,
            amount: prize.pointsPrize,
            action: "competition_prize",
            transactionId: `${workflowId}_${prize.userId}`,
            metadata: {
              competitionId,
              competitionName: competition.name,
              rank: prize.rank,
            },
          });
          status.totalPrizesAwarded.points += prize.pointsPrize;
        }

        // Award tokens
        if (prize.tokenPrize && prize.tokenPrize > 0) {
          await creditTokens(prize.userId, prize.tokenPrize, workflowId);
          status.totalPrizesAwarded.tokens += prize.tokenPrize;
        }

        // Record prize
        await awardPrizes(competitionId, prize.userId, {
          rank: prize.rank,
          points: prize.pointsPrize,
          tokens: prize.tokenPrize,
          special: prize.specialPrize,
        });

        // Send notification
        await sendPrizeWonNotification(prize.userId, {
          competitionId,
          competitionName: competition.name,
          rank: prize.rank,
          prizes: {
            points: prize.pointsPrize,
            tokens: prize.tokenPrize,
            special: prize.specialPrize,
          },
        });

        status.winnersAwarded++;
      } catch (error) {
        console.error(`Failed to award prize to ${prize.userId}:`, error);
      }
    }

    // =========================================================================
    // Phase 6: Send completion notification
    // =========================================================================
    await sendCompetitionEndNotification(competitionId, {
      competitionName: competition.name,
      totalParticipants: status.participantCount,
      totalVolume: status.totalVolume,
      winners: finalLeaderboard.slice(0, 3),
    });

    await recordAuditLog({
      userId: "system",
      action: "competition_prizes_awarded",
      resourceType: "competition",
      resourceId: competitionId,
      metadata: {
        winnersAwarded: status.winnersAwarded,
        totalPrizesAwarded: status.totalPrizesAwarded,
      },
    });

    status.phase = "completed";
    return status;
  } catch (error) {
    status.phase = "failed";
    status.error = error instanceof Error ? error.message : String(error);

    await recordAuditLog({
      userId: "system",
      action: "competition_failed",
      resourceType: "competition",
      resourceId: competitionId,
      metadata: {
        error: status.error,
        phase: status.phase,
      },
    });

    throw error;
  }
}

// ============================================================================
// Join Competition Workflow
// ============================================================================

export interface JoinCompetitionInput {
  userId: string;
  competitionId: string;
}

export interface JoinCompetitionStatus {
  workflowId: string;
  status: "joining" | "completed" | "failed";
  userId: string;
  competitionId: string;
  competitionName: string;
  joined: boolean;
  entryFeeCharged?: number;
  currentRank?: number;
  error?: string;
}

export const getJoinCompetitionStatusQuery = defineQuery<JoinCompetitionStatus>(
  "getJoinCompetitionStatus"
);

/**
 * Handle user joining a competition
 */
export async function joinCompetitionWorkflow(
  input: JoinCompetitionInput
): Promise<JoinCompetitionStatus> {
  const { userId, competitionId } = input;

  const workflowId = `competition_join_${competitionId}_${userId}`;

  const status: JoinCompetitionStatus = {
    workflowId,
    status: "joining",
    userId,
    competitionId,
    competitionName: "",
    joined: false,
  };

  setHandler(getJoinCompetitionStatusQuery, () => status);

  try {
    const competition = await getCompetition(competitionId);

    if (!competition) {
      throw new Error("Competition not found");
    }

    status.competitionName = competition.name;

    // Check if competition accepts new participants
    if (competition.status !== "active" && competition.status !== "upcoming") {
      throw new Error("Competition is not open for registration");
    }

    if (
      competition.maxParticipants &&
      competition.participantCount >= competition.maxParticipants
    ) {
      throw new Error("Competition is full");
    }

    // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
    // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag

    // Join competition
    const result = await joinCompetition(userId, competitionId);

    status.joined = true;
    status.currentRank = result.initialRank;

    await recordAuditLog({
      userId,
      action: "competition_joined",
      resourceType: "competition",
      resourceId: competitionId,
      metadata: {
        competitionName: competition.name,
      },
    });

    status.status = "completed";
    return status;
  } catch (error) {
    status.status = "failed";
    status.error = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

// ============================================================================
// Update Score Workflow
// ============================================================================

export interface UpdateCompetitionScoreInput {
  userId: string;
  competitionId: string;
  scoreIncrement: number;
  activityType: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateCompetitionScoreStatus {
  workflowId: string;
  status: "updating" | "completed" | "failed";
  userId: string;
  competitionId: string;
  previousScore: number;
  newScore: number;
  previousRank?: number;
  newRank?: number;
  error?: string;
}

export const getUpdateCompetitionScoreStatusQuery =
  defineQuery<UpdateCompetitionScoreStatus>("getUpdateCompetitionScoreStatus");

/**
 * Update participant score in a competition
 */
export async function updateCompetitionScoreWorkflow(
  input: UpdateCompetitionScoreInput
): Promise<UpdateCompetitionScoreStatus> {
  const { userId, competitionId, scoreIncrement, activityType, metadata = {} } =
    input;

  const workflowId = `competition_score_${competitionId}_${userId}_${Date.now()}`;

  const status: UpdateCompetitionScoreStatus = {
    workflowId,
    status: "updating",
    userId,
    competitionId,
    previousScore: 0,
    newScore: 0,
  };

  setHandler(getUpdateCompetitionScoreStatusQuery, () => status);

  try {
    const result = await updateParticipantScore(
      userId,
      competitionId,
      scoreIncrement,
      activityType
    );

    status.previousScore = result.previousScore;
    status.newScore = result.newScore;
    status.previousRank = result.previousRank;
    status.newRank = result.newRank;

    // Send notification if rank improved significantly
    if (
      result.previousRank &&
      result.newRank &&
      result.previousRank - result.newRank >= 5
    ) {
      await sendRankChangeNotification(userId, {
        competitionId,
        previousRank: result.previousRank,
        newRank: result.newRank,
        score: result.newScore,
      });
    }

    status.status = "completed";
    return status;
  } catch (error) {
    status.status = "failed";
    status.error = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

// ============================================================================
// Seasonal Competition Scheduler
// ============================================================================

export interface SeasonalCompetitionConfig {
  seasonDurationDays: number;
  prizePool: number;
  scoringType: string;
}

/**
 * Long-running workflow that manages seasonal competitions
 */
export async function seasonalCompetitionSchedulerWorkflow(
  config: SeasonalCompetitionConfig
): Promise<void> {
  const { seasonDurationDays = 90, prizePool = 1000000, scoringType = "points_earned" } = config;

  // Create new seasonal competition
  const seasonId = `season_${new Date().getFullYear()}_Q${Math.ceil(
    (new Date().getMonth() + 1) / 3
  )}`;

  const competition = await createCompetition({
    competitionId: seasonId,
    name: `Season ${seasonId}`,
    description: "Quarterly points competition",
    type: "seasonal",
    scoringType: scoringType as Competition["scoringType"],
    startTime: Date.now(),
    endTime: Date.now() + seasonDurationDays * 24 * 60 * 60 * 1000,
    prizePool,
    prizeDistribution: [
      { rankStart: 1, rankEnd: 1, pointsPrize: prizePool * 0.3, tokenPrize: 1000 },
      { rankStart: 2, rankEnd: 2, pointsPrize: prizePool * 0.2, tokenPrize: 500 },
      { rankStart: 3, rankEnd: 3, pointsPrize: prizePool * 0.1, tokenPrize: 250 },
      { rankStart: 4, rankEnd: 10, pointsPrize: prizePool * 0.05 },
      { rankStart: 11, rankEnd: 50, pointsPrize: prizePool * 0.02 },
      { rankStart: 51, rankEnd: 100, pointsPrize: prizePool * 0.01 },
    ],
  });

  // Run the competition
  await runCompetitionWorkflow({
    competitionId: competition.id,
    leaderboardUpdateInterval: 60, // Hourly updates for seasonal
  });

  // Wait a day before starting next season
  await sleep(24 * 60 * 60 * 1000);

  // Continue as new for next season
  await continueAsNew<typeof seasonalCompetitionSchedulerWorkflow>(config);
}

// ============================================================================
// Helper Functions
// ============================================================================

async function handleCancellation(
  competitionId: string,
  reason: string
): Promise<void> {
  await recordAuditLog({
    userId: "system",
    action: "competition_cancelled",
    resourceType: "competition",
    resourceId: competitionId,
    metadata: { reason },
  });

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

async function sendRankChangeNotifications(
  competitionId: string,
  leaderboard: Array<{ rank: number; userId: string; score: number }>
): Promise<void> {
  // This would track previous ranks and send notifications for significant changes
  // Implementation depends on storage of previous ranks
}
