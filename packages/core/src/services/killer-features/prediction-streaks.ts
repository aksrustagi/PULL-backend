/**
 * KILLER FEATURE #7: Prediction Streaks & Challenges
 *
 * Gamified prediction challenges with streaks, leaderboards,
 * and escalating rewards. Free-to-play entry point.
 *
 * WHY IT KILLS:
 * - Free entry point (no money needed to start)
 * - Daily habit formation
 * - Escalating rewards create anticipation
 * - Skill verification for social proof
 *
 * K-FACTOR BOOST:
 * - Share perfect picks on social
 * - Challenge friends to beat your streak
 * - Daily/weekly leaderboards with prizes
 * - Referral bonus for streak achievements
 */

import { z } from "zod";

// ============================================================================
// TYPES
// ============================================================================

export const ChallengeTypeSchema = z.enum([
  "daily_picks",       // Pick X winners today
  "streak_builder",    // Win X in a row
  "sport_specialist",  // Prove expertise in one sport
  "underdog_hunter",   // Pick X underdogs correctly
  "perfect_day",       // Go perfect on a day
  "marathon",          // Maintain streak for X days
  "prop_master",       // Nail player props
  "spread_expert",     // Win against the spread
  "total_guru",        // Over/under specialist
  "parlay_legend",     // Hit multi-leg parlays
]);

export type ChallengeType = z.infer<typeof ChallengeTypeSchema>;

export interface PredictionChallenge {
  id: string;
  type: ChallengeType;
  name: string;
  description: string;
  sport?: string;

  // Requirements
  requirements: {
    minPicks: number;
    maxPicks?: number;
    minOdds?: number;
    maxOdds?: number;
    streakRequired?: number;
    daysRequired?: number;
    sports?: string[];
    betTypes?: string[];
  };

  // Rewards
  rewards: ChallengeReward[];

  // Timing
  startsAt: number;
  endsAt: number;
  isRecurring: boolean;
  recurrence?: "daily" | "weekly" | "monthly";

  // Status
  status: "upcoming" | "active" | "complete";
  totalParticipants: number;
}

export interface ChallengeReward {
  tier: "participation" | "bronze" | "silver" | "gold" | "champion";
  requirement: number; // Wins needed or streak length
  rewards: {
    xp: number;
    tokens?: number;
    badge?: string;
    freeEntry?: string; // Free entry to paid contest
    cashPrize?: number;
    streakInsurance?: boolean;
    customReward?: string;
  };
}

export interface UserChallenge {
  id: string;
  challengeId: string;
  userId: string;

  // Progress
  picks: ChallengePick[];
  currentStreak: number;
  bestStreak: number;
  totalWins: number;
  totalLosses: number;

  // Status
  status: "active" | "completed" | "failed" | "abandoned";
  tierAchieved?: string;

  // Timing
  startedAt: number;
  lastPickAt?: number;
  completedAt?: number;
}

export interface ChallengePick {
  id: string;
  eventId: string;
  eventName: string;
  pick: string;
  odds: number;
  result: "pending" | "win" | "loss" | "push";
  pickedAt: number;
  settledAt?: number;
}

export interface PredictionStreak {
  userId: string;

  // Current streaks
  currentWinStreak: number;
  currentLossStreak: number;

  // Best streaks
  bestWinStreak: number;
  bestLossStreak: number;

  // Streak history
  streakHistory: StreakRecord[];

  // Milestones
  milestones: StreakMilestone[];

  // Stats
  totalPicks: number;
  lifetimeWins: number;
  lifetimeLosses: number;

  lastUpdatedAt: number;
}

export interface StreakRecord {
  type: "win" | "loss";
  length: number;
  startedAt: number;
  endedAt: number;
  picks: string[]; // Pick IDs
}

export interface StreakMilestone {
  streakLength: number;
  achievedAt: number;
  reward: {
    xp: number;
    tokens?: number;
    badge?: string;
  };
  claimed: boolean;
}

export interface DailyPredictionGame {
  id: string;
  date: string; // YYYY-MM-DD
  sport: string;

  // Games to predict
  events: DailyPredictionEvent[];

  // Status
  status: "open" | "locked" | "complete";
  locksAt: number;

  // Leaderboard
  leaderboard: DailyLeaderboardEntry[];
  prizePool?: number;
}

export interface DailyPredictionEvent {
  id: string;
  name: string;
  startTime: number;
  options: Array<{
    id: string;
    name: string;
    odds: number;
  }>;
  result?: string; // Winning option ID
}

export interface DailyLeaderboardEntry {
  userId: string;
  username: string;
  avatarUrl?: string;
  correctPicks: number;
  totalPicks: number;
  points: number;
  rank: number;
  prize?: number;
}

export interface UserPredictionStats {
  userId: string;

  // Overall
  totalPicks: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;

  // By sport
  sportStats: Record<string, {
    picks: number;
    wins: number;
    winRate: number;
    bestStreak: number;
  }>;

  // By bet type
  betTypeStats: Record<string, {
    picks: number;
    wins: number;
    winRate: number;
  }>;

  // Challenges
  challengesCompleted: number;
  challengesAttempted: number;
  totalXP: number;
  level: number;

  // Rankings
  globalRank?: number;
  weeklyRank?: number;
  monthlyRank?: number;
}

// ============================================================================
// PREDICTION STREAKS SERVICE
// ============================================================================

export class PredictionStreaksService {
  /**
   * Calculate level from XP
   */
  calculateLevel(xp: number): { level: number; progress: number; nextLevelXP: number } {
    // XP required: 100 * level^1.5
    let level = 1;
    let totalXP = 0;

    while (true) {
      const xpForLevel = Math.floor(100 * Math.pow(level, 1.5));
      if (totalXP + xpForLevel > xp) {
        return {
          level,
          progress: (xp - totalXP) / xpForLevel,
          nextLevelXP: xpForLevel - (xp - totalXP),
        };
      }
      totalXP += xpForLevel;
      level++;
    }
  }

  /**
   * Update streak on pick result
   */
  updateStreak(
    streak: PredictionStreak,
    result: "win" | "loss" | "push"
  ): {
    streak: PredictionStreak;
    newMilestone?: StreakMilestone;
    streakBroken?: { type: "win" | "loss"; length: number };
  } {
    const updated = { ...streak, lastUpdatedAt: Date.now() };
    let newMilestone: StreakMilestone | undefined;
    let streakBroken: { type: "win" | "loss"; length: number } | undefined;

    if (result === "push") {
      return { streak: updated };
    }

    if (result === "win") {
      // Break loss streak if any
      if (updated.currentLossStreak > 0) {
        streakBroken = { type: "loss", length: updated.currentLossStreak };
        updated.currentLossStreak = 0;
      }

      // Extend win streak
      updated.currentWinStreak++;
      updated.lifetimeWins++;
      updated.totalPicks++;

      // Check for new best
      if (updated.currentWinStreak > updated.bestWinStreak) {
        updated.bestWinStreak = updated.currentWinStreak;
      }

      // Check for milestone
      newMilestone = this.checkMilestone(updated.currentWinStreak, updated.milestones);
      if (newMilestone) {
        updated.milestones = [...updated.milestones, newMilestone];
      }
    } else {
      // Break win streak if any
      if (updated.currentWinStreak > 0) {
        streakBroken = { type: "win", length: updated.currentWinStreak };

        // Record streak history
        updated.streakHistory = [
          ...updated.streakHistory,
          {
            type: "win",
            length: updated.currentWinStreak,
            startedAt: Date.now() - (updated.currentWinStreak * 86400000),
            endedAt: Date.now(),
            picks: [],
          },
        ];

        updated.currentWinStreak = 0;
      }

      // Extend loss streak
      updated.currentLossStreak++;
      updated.lifetimeLosses++;
      updated.totalPicks++;

      if (updated.currentLossStreak > updated.bestLossStreak) {
        updated.bestLossStreak = updated.currentLossStreak;
      }
    }

    return { streak: updated, newMilestone, streakBroken };
  }

  /**
   * Create a daily prediction game
   */
  createDailyGame(
    date: string,
    sport: string,
    events: Array<{
      id: string;
      name: string;
      startTime: number;
      homeTeam: string;
      awayTeam: string;
      homeOdds: number;
      awayOdds: number;
    }>
  ): DailyPredictionGame {
    const earliestStart = Math.min(...events.map(e => e.startTime));

    return {
      id: `daily_${date}_${sport}`,
      date,
      sport,
      events: events.map(e => ({
        id: e.id,
        name: e.name,
        startTime: e.startTime,
        options: [
          { id: "home", name: e.homeTeam, odds: e.homeOdds },
          { id: "away", name: e.awayTeam, odds: e.awayOdds },
        ],
      })),
      status: "open",
      locksAt: earliestStart,
      leaderboard: [],
    };
  }

  /**
   * Calculate daily game score
   */
  calculateDailyScore(
    picks: Array<{ eventId: string; pickId: string }>,
    events: DailyPredictionEvent[]
  ): { correct: number; total: number; points: number } {
    let correct = 0;
    let points = 0;
    const total = picks.length;

    for (const pick of picks) {
      const event = events.find(e => e.id === pick.eventId);
      if (event?.result === pick.pickId) {
        correct++;
        // Bonus points for upsets (longer odds)
        const option = event.options.find(o => o.id === pick.pickId);
        if (option) {
          points += option.odds > 100 ? 15 : 10;
        }
      }
    }

    return { correct, total, points };
  }

  /**
   * Generate leaderboard from scores
   */
  generateDailyLeaderboard(
    scores: Array<{
      userId: string;
      username: string;
      avatarUrl?: string;
      correct: number;
      total: number;
      points: number;
    }>,
    prizePool?: number
  ): DailyLeaderboardEntry[] {
    const sorted = [...scores]
      .sort((a, b) => b.points - a.points || b.correct - a.correct)
      .map((entry, idx) => ({
        ...entry,
        correctPicks: entry.correct,
        totalPicks: entry.total,
        rank: idx + 1,
      }));

    // Distribute prizes if any
    if (prizePool && prizePool > 0) {
      const prizeDistribution = [0.5, 0.25, 0.15, 0.07, 0.03];
      for (let i = 0; i < Math.min(5, sorted.length); i++) {
        sorted[i].prize = Math.floor(prizePool * prizeDistribution[i]);
      }
    }

    return sorted;
  }

  /**
   * Get available challenges
   */
  getAvailableChallenges(): PredictionChallenge[] {
    const now = Date.now();
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    return [
      {
        id: "daily_5",
        type: "daily_picks",
        name: "Daily 5",
        description: "Pick 5 winners today",
        requirements: { minPicks: 5, maxPicks: 5 },
        rewards: [
          {
            tier: "bronze",
            requirement: 3,
            rewards: { xp: 50 },
          },
          {
            tier: "silver",
            requirement: 4,
            rewards: { xp: 100, tokens: 10 },
          },
          {
            tier: "gold",
            requirement: 5,
            rewards: { xp: 200, tokens: 25, badge: "perfect_5" },
          },
        ],
        startsAt: now,
        endsAt: endOfDay.getTime(),
        isRecurring: true,
        recurrence: "daily",
        status: "active",
        totalParticipants: 0,
      },
      {
        id: "streak_5",
        type: "streak_builder",
        name: "Hot Streak 5",
        description: "Win 5 picks in a row",
        requirements: { minPicks: 1, streakRequired: 5 },
        rewards: [
          {
            tier: "gold",
            requirement: 5,
            rewards: { xp: 150, tokens: 20, streakInsurance: true },
          },
        ],
        startsAt: now,
        endsAt: endOfDay.getTime() + (6 * 24 * 60 * 60 * 1000), // 7 days
        isRecurring: false,
        status: "active",
        totalParticipants: 0,
      },
      {
        id: "underdog_3",
        type: "underdog_hunter",
        name: "Underdog Hunter",
        description: "Hit 3 underdogs (+150 or longer)",
        requirements: { minPicks: 3, minOdds: 150 },
        rewards: [
          {
            tier: "gold",
            requirement: 3,
            rewards: { xp: 200, tokens: 50, badge: "underdog_hunter" },
          },
        ],
        startsAt: now,
        endsAt: endOfDay.getTime() + (6 * 24 * 60 * 60 * 1000),
        isRecurring: false,
        status: "active",
        totalParticipants: 0,
      },
    ];
  }

  /**
   * Get milestone rewards
   */
  getMilestoneRewards(): Array<{
    streak: number;
    xp: number;
    tokens?: number;
    badge?: string;
    special?: string;
  }> {
    return [
      { streak: 3, xp: 30 },
      { streak: 5, xp: 75, tokens: 10 },
      { streak: 7, xp: 150, tokens: 25, badge: "hot_hand" },
      { streak: 10, xp: 300, tokens: 50, badge: "on_fire" },
      { streak: 15, xp: 500, tokens: 100, badge: "unstoppable" },
      { streak: 20, xp: 1000, tokens: 200, badge: "legend", special: "Verified Sharp status" },
      { streak: 25, xp: 1500, tokens: 500, badge: "goat", special: "Hall of Fame entry" },
    ];
  }

  /**
   * Calculate XP for result
   */
  calculateXP(
    result: "win" | "loss",
    odds: number,
    isChallenge: boolean = false
  ): number {
    if (result === "loss") return 5; // Small XP for participation

    let xp = 10; // Base win XP

    // Bonus for underdogs
    if (odds > 100) {
      xp += Math.min(20, Math.floor(odds / 20));
    }

    // Challenge bonus
    if (isChallenge) {
      xp = Math.floor(xp * 1.5);
    }

    return xp;
  }

  private checkMilestone(
    streak: number,
    existingMilestones: StreakMilestone[]
  ): StreakMilestone | undefined {
    const milestones = this.getMilestoneRewards();
    const milestone = milestones.find(m => m.streak === streak);

    if (!milestone) return undefined;

    // Check if already achieved
    if (existingMilestones.some(m => m.streakLength === streak)) {
      return undefined;
    }

    return {
      streakLength: streak,
      achievedAt: Date.now(),
      reward: {
        xp: milestone.xp,
        tokens: milestone.tokens,
        badge: milestone.badge,
      },
      claimed: false,
    };
  }
}

// ============================================================================
// STREAK BADGES
// ============================================================================

export const STREAK_BADGES = [
  {
    id: "hot_hand",
    name: "Hot Hand",
    description: "7 correct picks in a row",
    icon: "🔥",
    rarity: "rare" as const,
  },
  {
    id: "on_fire",
    name: "On Fire",
    description: "10 correct picks in a row",
    icon: "🌟",
    rarity: "epic" as const,
  },
  {
    id: "unstoppable",
    name: "Unstoppable",
    description: "15 correct picks in a row",
    icon: "💪",
    rarity: "epic" as const,
  },
  {
    id: "legend",
    name: "Prediction Legend",
    description: "20 correct picks in a row",
    icon: "👑",
    rarity: "legendary" as const,
  },
  {
    id: "goat",
    name: "G.O.A.T.",
    description: "25 correct picks in a row",
    icon: "🐐",
    rarity: "legendary" as const,
  },
  {
    id: "perfect_5",
    name: "Perfect 5",
    description: "Go 5/5 on Daily 5",
    icon: "✨",
    rarity: "rare" as const,
  },
  {
    id: "underdog_hunter",
    name: "Underdog Hunter",
    description: "Hit 3 underdogs in a row",
    icon: "🎯",
    rarity: "rare" as const,
  },
];

// ============================================================================
// FACTORY
// ============================================================================

export function createPredictionStreaksService(): PredictionStreaksService {
  return new PredictionStreaksService();
}
