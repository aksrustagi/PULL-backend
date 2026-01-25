/**
 * KILLER FEATURE #5: Bet The Moment (Live Micro-Betting)
 *
 * Ultra-fast, single-tap betting on live game moments.
 * "Will the next play be a touchdown?" - tap to bet.
 *
 * WHY IT KILLS:
 * - Instant gratification (results in seconds)
 * - Low friction = high volume
 * - Perfect for mobile/second screen
 * - Creates "can't look away" engagement
 *
 * K-FACTOR BOOST:
 * - "Bet together" multiplayer mode
 * - Live leaderboard for active games
 * - Streak bonuses for consecutive correct
 * - Share winning moments instantly
 */

import { z } from "zod";

// ============================================================================
// TYPES
// ============================================================================

export const MomentTypeSchema = z.enum([
  // NFL/NCAA Football
  "next_play_result",      // Run/Pass/Sack/Turnover
  "next_play_yards",       // Over/Under X yards
  "drive_result",          // TD/FG/Punt/Turnover
  "next_score",            // Which team scores next
  "will_convert",          // 3rd/4th down conversion

  // NBA/NCAA Basketball
  "next_basket",           // 2pt/3pt/FT/Miss
  "next_scorer",           // Player props
  "run_continues",         // Will scoring run continue
  "timeout_result",        // Score after timeout

  // MLB
  "next_pitch",            // Ball/Strike/Foul/In Play
  "at_bat_result",         // Single/Double/HR/Out/Walk
  "inning_runs",           // Over/Under runs
  "stolen_base_success",   // Safe/Out

  // Golf
  "hole_result",           // Birdie/Par/Bogey+
  "putt_makes",            // Will putt go in
  "fairway_hit",           // Yes/No
  "green_in_regulation",   // Yes/No

  // General
  "custom",                // Custom moment
]);

export type MomentType = z.infer<typeof MomentTypeSchema>;

export interface LiveMoment {
  id: string;
  eventId: string;
  sport: string;
  type: MomentType;

  // Moment details
  title: string;
  description: string;
  situation: string; // "3rd & 7 at the 35"

  // Options
  options: MomentOption[];

  // Timing
  opensAt: number;
  closesAt: number;
  settlesAt?: number;
  status: "upcoming" | "open" | "locked" | "settled";

  // Limits
  minBet: number;
  maxBet: number;

  // Stats
  totalVolume: number;
  betCount: number;

  // Result
  winningOptionId?: string;
}

export interface MomentOption {
  id: string;
  label: string;
  probability: number;
  odds: number;
  volume: number;
  betCount: number;
}

export interface MomentBet {
  id: string;
  momentId: string;
  userId: string;
  optionId: string;
  amount: number;
  odds: number;
  potentialPayout: number;
  status: "pending" | "won" | "lost" | "cancelled";
  placedAt: number;
  settledAt?: number;
  payout?: number;
}

export interface MomentStreak {
  userId: string;
  currentStreak: number;
  bestStreak: number;
  multiplier: number;
  lastMomentId?: string;
  expiresAt?: number;
}

export interface LiveLeaderboard {
  eventId: string;
  entries: LeaderboardEntry[];
  updatedAt: number;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  avatarUrl?: string;
  wins: number;
  losses: number;
  profit: number;
  streak: number;
  rank: number;
}

export interface MultiplayerSession {
  id: string;
  hostUserId: string;
  eventId: string;
  name: string;
  participants: MultiplayerParticipant[];
  inviteCode: string;
  settings: {
    matchBets: boolean; // Everyone bets same amount
    shareResults: boolean;
    allowLateJoin: boolean;
  };
  status: "waiting" | "active" | "complete";
  createdAt: number;
}

export interface MultiplayerParticipant {
  userId: string;
  username: string;
  wins: number;
  losses: number;
  profit: number;
  isReady: boolean;
  joinedAt: number;
}

// ============================================================================
// MOMENT BETTING SERVICE
// ============================================================================

export class BetTheMomentService {
  /**
   * Generate moment odds based on real-time probability
   */
  generateOdds(probability: number, margin: number = 0.05): number {
    // Add margin for house edge
    const adjustedProb = probability * (1 - margin);

    // Convert to American odds
    if (adjustedProb >= 0.5) {
      return Math.round(-100 * adjustedProb / (1 - adjustedProb));
    } else {
      return Math.round(100 * (1 - adjustedProb) / adjustedProb);
    }
  }

  /**
   * Create a live moment market
   */
  createMoment(
    eventId: string,
    sport: string,
    type: MomentType,
    options: Array<{ label: string; probability: number }>,
    context: {
      title: string;
      description: string;
      situation: string;
      durationSeconds: number;
      minBet?: number;
      maxBet?: number;
    }
  ): LiveMoment {
    const now = Date.now();

    return {
      id: `moment_${now}_${Math.random().toString(36).substr(2, 9)}`,
      eventId,
      sport,
      type,
      title: context.title,
      description: context.description,
      situation: context.situation,
      options: options.map((opt, idx) => ({
        id: `opt_${idx}`,
        label: opt.label,
        probability: opt.probability,
        odds: this.generateOdds(opt.probability),
        volume: 0,
        betCount: 0,
      })),
      opensAt: now,
      closesAt: now + (context.durationSeconds * 1000),
      status: "open",
      minBet: context.minBet ?? 1,
      maxBet: context.maxBet ?? 100,
      totalVolume: 0,
      betCount: 0,
    };
  }

  /**
   * Place a moment bet
   */
  placeBet(
    moment: LiveMoment,
    userId: string,
    optionId: string,
    amount: number
  ): MomentBet | { error: string } {
    // Validate moment is open
    if (moment.status !== "open") {
      return { error: "Moment is not open for betting" };
    }

    if (Date.now() > moment.closesAt) {
      return { error: "Betting window has closed" };
    }

    // Validate amount
    if (amount < moment.minBet) {
      return { error: `Minimum bet is $${moment.minBet}` };
    }
    if (amount > moment.maxBet) {
      return { error: `Maximum bet is $${moment.maxBet}` };
    }

    // Find option
    const option = moment.options.find(o => o.id === optionId);
    if (!option) {
      return { error: "Invalid option" };
    }

    const potentialPayout = amount * this.oddsToMultiplier(option.odds);

    return {
      id: `mbet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      momentId: moment.id,
      userId,
      optionId,
      amount,
      odds: option.odds,
      potentialPayout,
      status: "pending",
      placedAt: Date.now(),
    };
  }

  /**
   * Settle a moment
   */
  settleMoment(
    moment: LiveMoment,
    winningOptionId: string,
    bets: MomentBet[]
  ): {
    moment: LiveMoment;
    settledBets: MomentBet[];
    totalPayout: number;
  } {
    const settledBets = bets.map(bet => {
      const won = bet.optionId === winningOptionId;
      return {
        ...bet,
        status: won ? "won" as const : "lost" as const,
        settledAt: Date.now(),
        payout: won ? bet.potentialPayout : 0,
      };
    });

    const totalPayout = settledBets
      .filter(b => b.status === "won")
      .reduce((sum, b) => sum + (b.payout ?? 0), 0);

    return {
      moment: {
        ...moment,
        status: "settled",
        settlesAt: Date.now(),
        winningOptionId,
      },
      settledBets,
      totalPayout,
    };
  }

  /**
   * Calculate streak bonus
   */
  calculateStreakBonus(streak: MomentStreak): {
    multiplier: number;
    bonusAmount: number;
    nextMilestone: number;
  } {
    const milestones = [
      { streak: 3, multiplier: 1.1, bonus: 5 },
      { streak: 5, multiplier: 1.25, bonus: 15 },
      { streak: 7, multiplier: 1.5, bonus: 30 },
      { streak: 10, multiplier: 2.0, bonus: 50 },
      { streak: 15, multiplier: 2.5, bonus: 100 },
      { streak: 20, multiplier: 3.0, bonus: 200 },
    ];

    let currentMultiplier = 1.0;
    let bonusAmount = 0;
    let nextMilestone = 3;

    for (const milestone of milestones) {
      if (streak.currentStreak >= milestone.streak) {
        currentMultiplier = milestone.multiplier;
        bonusAmount = milestone.bonus;
      } else {
        nextMilestone = milestone.streak;
        break;
      }
    }

    return {
      multiplier: currentMultiplier,
      bonusAmount,
      nextMilestone,
    };
  }

  /**
   * Generate leaderboard
   */
  generateLeaderboard(
    eventId: string,
    bets: MomentBet[],
    users: Map<string, { username: string; avatarUrl?: string }>
  ): LiveLeaderboard {
    const userStats = new Map<string, {
      wins: number;
      losses: number;
      profit: number;
      streak: number;
    }>();

    // Group bets by user and calculate stats
    for (const bet of bets) {
      if (!userStats.has(bet.userId)) {
        userStats.set(bet.userId, { wins: 0, losses: 0, profit: 0, streak: 0 });
      }
      const stats = userStats.get(bet.userId)!;

      if (bet.status === "won") {
        stats.wins++;
        stats.profit += (bet.payout ?? 0) - bet.amount;
        stats.streak = Math.max(0, stats.streak) + 1;
      } else if (bet.status === "lost") {
        stats.losses++;
        stats.profit -= bet.amount;
        stats.streak = Math.min(0, stats.streak) - 1;
      }
    }

    // Create sorted entries
    const entries: LeaderboardEntry[] = Array.from(userStats.entries())
      .map(([userId, stats]) => ({
        userId,
        username: users.get(userId)?.username ?? "Unknown",
        avatarUrl: users.get(userId)?.avatarUrl,
        ...stats,
        rank: 0,
      }))
      .sort((a, b) => b.profit - a.profit)
      .map((entry, idx) => ({ ...entry, rank: idx + 1 }));

    return {
      eventId,
      entries,
      updatedAt: Date.now(),
    };
  }

  /**
   * Create multiplayer session
   */
  createMultiplayerSession(
    hostUserId: string,
    hostUsername: string,
    eventId: string,
    options: {
      name?: string;
      matchBets?: boolean;
      shareResults?: boolean;
      allowLateJoin?: boolean;
    } = {}
  ): MultiplayerSession {
    return {
      id: `mp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      hostUserId,
      eventId,
      name: options.name ?? `${hostUsername}'s Bet Party`,
      participants: [{
        userId: hostUserId,
        username: hostUsername,
        wins: 0,
        losses: 0,
        profit: 0,
        isReady: true,
        joinedAt: Date.now(),
      }],
      inviteCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
      settings: {
        matchBets: options.matchBets ?? false,
        shareResults: options.shareResults ?? true,
        allowLateJoin: options.allowLateJoin ?? true,
      },
      status: "waiting",
      createdAt: Date.now(),
    };
  }

  /**
   * Generate moment templates for a sport
   */
  getMomentTemplates(sport: string, situation: Record<string, any>): Array<{
    type: MomentType;
    title: string;
    options: Array<{ label: string; probability: number }>;
  }> {
    switch (sport) {
      case "nfl":
      case "ncaaf":
        return [
          {
            type: "next_play_result",
            title: "Next Play Result",
            options: [
              { label: "Run Play", probability: 0.45 },
              { label: "Pass Complete", probability: 0.35 },
              { label: "Incomplete/Sack", probability: 0.15 },
              { label: "Turnover", probability: 0.05 },
            ],
          },
          {
            type: "will_convert",
            title: `Will they convert ${situation.down}?`,
            options: [
              { label: "Yes", probability: situation.down === "3rd" ? 0.42 : 0.48 },
              { label: "No", probability: situation.down === "3rd" ? 0.58 : 0.52 },
            ],
          },
          {
            type: "drive_result",
            title: "How will this drive end?",
            options: [
              { label: "Touchdown", probability: 0.30 },
              { label: "Field Goal", probability: 0.25 },
              { label: "Punt", probability: 0.35 },
              { label: "Turnover", probability: 0.10 },
            ],
          },
        ];

      case "nba":
      case "ncaab":
        return [
          {
            type: "next_basket",
            title: "Next Score",
            options: [
              { label: "2-Pointer", probability: 0.45 },
              { label: "3-Pointer", probability: 0.30 },
              { label: "Free Throws", probability: 0.15 },
              { label: "No Score (Turnover)", probability: 0.10 },
            ],
          },
          {
            type: "run_continues",
            title: "Will the run continue?",
            options: [
              { label: "Run extends", probability: 0.40 },
              { label: "Stops here", probability: 0.60 },
            ],
          },
        ];

      case "mlb":
        return [
          {
            type: "next_pitch",
            title: "Next Pitch",
            options: [
              { label: "Ball", probability: 0.35 },
              { label: "Strike", probability: 0.40 },
              { label: "Foul", probability: 0.15 },
              { label: "In Play", probability: 0.10 },
            ],
          },
          {
            type: "at_bat_result",
            title: "At-Bat Result",
            options: [
              { label: "Out", probability: 0.68 },
              { label: "Single", probability: 0.18 },
              { label: "Extra Base Hit", probability: 0.08 },
              { label: "Walk/HBP", probability: 0.06 },
            ],
          },
        ];

      case "golf":
        return [
          {
            type: "hole_result",
            title: `Hole ${situation.hole} Result`,
            options: [
              { label: "Birdie or Better", probability: 0.18 },
              { label: "Par", probability: 0.55 },
              { label: "Bogey or Worse", probability: 0.27 },
            ],
          },
          {
            type: "putt_makes",
            title: "Does the putt drop?",
            options: [
              { label: "Makes It", probability: situation.distance < 10 ? 0.70 : 0.30 },
              { label: "Misses", probability: situation.distance < 10 ? 0.30 : 0.70 },
            ],
          },
        ];

      default:
        return [];
    }
  }

  private oddsToMultiplier(odds: number): number {
    if (odds > 0) {
      return 1 + odds / 100;
    } else {
      return 1 + 100 / Math.abs(odds);
    }
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createBetTheMomentService(): BetTheMomentService {
  return new BetTheMomentService();
}
