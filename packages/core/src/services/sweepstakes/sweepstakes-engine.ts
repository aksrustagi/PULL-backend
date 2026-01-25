/**
 * Sweepstakes & Prize System
 *
 * Comprehensive sweepstakes engine supporting:
 * - Points-based sweepstakes entries
 * - Tiered prize pools
 * - Daily/weekly/monthly drawings
 * - Skill-based and luck-based contests
 * - Regulatory compliance tracking
 */

import { z } from "zod";

// ============================================================================
// TYPES
// ============================================================================

export const SweepstakesTypeSchema = z.enum([
  "instant_win",      // Scratch-off style instant prizes
  "drawing",          // Random selection from entries
  "leaderboard",      // Skill-based top finishers win
  "tournament",       // Bracket-style competition
  "milestone",        // Reach X to unlock prize
  "collect",          // Collect pieces to win
]);

export type SweepstakesType = z.infer<typeof SweepstakesTypeSchema>;

export const PrizeTypeSchema = z.enum([
  "cash",             // Real money
  "tokens",           // Platform currency
  "free_bets",        // Betting credits
  "merchandise",      // Physical items
  "experiences",      // VIP experiences, trips, etc.
  "subscriptions",    // Premium membership
  "credits",          // AI insights credits
  "nft",              // Digital collectibles
]);

export type PrizeType = z.infer<typeof PrizeTypeSchema>;

export interface Sweepstakes {
  id: string;
  name: string;
  description: string;
  type: SweepstakesType;
  status: "upcoming" | "active" | "drawing" | "complete" | "cancelled";

  // Prize pool
  prizePool: Prize[];
  totalPrizeValue: number;

  // Entry
  entryMethods: EntryMethod[];
  maxEntriesPerUser?: number;
  totalEntries: number;
  uniqueEntrants: number;

  // Eligibility
  eligibility: EligibilityRules;

  // Timing
  startsAt: number;
  endsAt: number;
  drawingAt?: number;

  // Rules
  officialRules: string;
  termsUrl: string;

  // Sponsor
  sponsor?: {
    name: string;
    logoUrl: string;
  };

  createdAt: number;
}

export interface Prize {
  id: string;
  name: string;
  description: string;
  type: PrizeType;
  value: number;
  quantity: number;
  remaining: number;
  tier: "grand" | "first" | "second" | "third" | "consolation";
  imageUrl?: string;
  odds?: number; // For instant win
  winnerId?: string;
}

export interface EntryMethod {
  id: string;
  type: "points" | "action" | "purchase" | "free" | "referral";
  description: string;

  // Points-based
  pointsCost?: number;

  // Action-based (complete X to earn entries)
  actionType?: string;
  entriesEarned?: number;

  // Limits
  maxPerUser?: number;
  maxPerDay?: number;
}

export interface EligibilityRules {
  minAge: number;
  allowedRegions: string[]; // State/country codes
  excludedRegions: string[];
  requiresKYC: boolean;
  minAccountAge?: number; // Days
  minActivityLevel?: number;
  customRules?: string[];
}

export interface SweepstakesEntry {
  id: string;
  sweepstakesId: string;
  userId: string;
  entryMethodId: string;
  entries: number;
  pointsSpent?: number;
  createdAt: number;
}

export interface DrawingResult {
  sweepstakesId: string;
  drawingId: string;
  winners: DrawingWinner[];
  totalEntries: number;
  drawnAt: number;
  verificationHash: string; // For provably fair verification
}

export interface DrawingWinner {
  userId: string;
  username: string;
  prizeId: string;
  prizeName: string;
  prizeValue: number;
  entryId: string;
  rank: number;
  notified: boolean;
  claimed: boolean;
  claimedAt?: number;
}

// ============================================================================
// POINTS SYSTEM
// ============================================================================

export interface PointsBalance {
  userId: string;
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  lastEarnedAt?: number;
  lastSpentAt?: number;
}

export interface PointsTransaction {
  id: string;
  userId: string;
  type: "earn" | "spend" | "bonus" | "expire" | "transfer";
  amount: number;
  balance: number; // Balance after transaction
  source: PointsSource;
  description: string;
  metadata?: Record<string, any>;
  createdAt: number;
}

export interface PointsSource {
  type: "bet" | "win" | "streak" | "achievement" | "referral" | "purchase" | "sweepstakes" | "daily_bonus" | "promo";
  referenceId?: string;
}

export interface PointsConfig {
  // Earning rates
  pointsPerDollarWagered: number;
  bonusPointsForWin: number;
  streakBonus: Record<number, number>; // Streak length -> bonus points

  // Multipliers
  sportMultipliers: Record<string, number>;
  betTypeMultipliers: Record<string, number>;
  promotionalMultiplier?: number;

  // Expiration
  expirationDays?: number;
  expirationExemptBalance?: number; // Points below this don't expire
}

// ============================================================================
// SWEEPSTAKES ENGINE
// ============================================================================

export class SweepstakesEngine {
  private config: PointsConfig = {
    pointsPerDollarWagered: 1,
    bonusPointsForWin: 10,
    streakBonus: {
      3: 25,
      5: 50,
      7: 100,
      10: 200,
    },
    sportMultipliers: {
      nfl: 1.0,
      nba: 1.0,
      mlb: 1.0,
      ncaa: 1.25, // March Madness bonus
      golf: 1.5,  // Premium sport
    },
    betTypeMultipliers: {
      straight: 1.0,
      parlay: 1.5,
      prop: 1.25,
    },
  };

  /**
   * Calculate points earned from a bet
   */
  calculatePointsEarned(
    amount: number,
    sport: string,
    betType: string,
    result: "win" | "loss" | "push",
    currentStreak?: number
  ): number {
    const basePoints = amount * this.config.pointsPerDollarWagered;
    const sportMultiplier = this.config.sportMultipliers[sport] ?? 1.0;
    const betTypeMultiplier = this.config.betTypeMultipliers[betType] ?? 1.0;
    const promoMultiplier = this.config.promotionalMultiplier ?? 1.0;

    let points = basePoints * sportMultiplier * betTypeMultiplier * promoMultiplier;

    // Win bonus
    if (result === "win") {
      points += this.config.bonusPointsForWin;

      // Streak bonus
      if (currentStreak && this.config.streakBonus[currentStreak]) {
        points += this.config.streakBonus[currentStreak];
      }
    }

    return Math.floor(points);
  }

  /**
   * Create a new sweepstakes
   */
  createSweepstakes(
    name: string,
    type: SweepstakesType,
    prizes: Array<Omit<Prize, "id" | "remaining" | "winnerId">>,
    options: {
      description?: string;
      entryMethods: Array<Omit<EntryMethod, "id">>;
      eligibility?: Partial<EligibilityRules>;
      startsAt: number;
      endsAt: number;
      drawingAt?: number;
      maxEntriesPerUser?: number;
      sponsor?: { name: string; logoUrl: string };
    }
  ): Sweepstakes {
    const prizePool = prizes.map((p, idx) => ({
      id: `prize_${idx}`,
      ...p,
      remaining: p.quantity,
    }));

    const totalPrizeValue = prizePool.reduce(
      (sum, p) => sum + (p.value * p.quantity),
      0
    );

    return {
      id: `sweep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      description: options.description ?? "",
      type,
      status: Date.now() < options.startsAt ? "upcoming" : "active",
      prizePool,
      totalPrizeValue,
      entryMethods: options.entryMethods.map((m, idx) => ({
        id: `entry_${idx}`,
        ...m,
      })),
      maxEntriesPerUser: options.maxEntriesPerUser,
      totalEntries: 0,
      uniqueEntrants: 0,
      eligibility: {
        minAge: 18,
        allowedRegions: ["US"],
        excludedRegions: [],
        requiresKYC: false,
        ...options.eligibility,
      },
      startsAt: options.startsAt,
      endsAt: options.endsAt,
      drawingAt: options.drawingAt ?? options.endsAt,
      officialRules: this.generateOfficialRules(name, type, prizePool, options),
      termsUrl: `/sweepstakes/${name.toLowerCase().replace(/\s+/g, "-")}/rules`,
      sponsor: options.sponsor,
      createdAt: Date.now(),
    };
  }

  /**
   * Enter sweepstakes
   */
  enterSweepstakes(
    sweepstakes: Sweepstakes,
    userId: string,
    entryMethodId: string,
    userEntries: SweepstakesEntry[],
    pointsBalance: number
  ): {
    success: boolean;
    entry?: SweepstakesEntry;
    pointsSpent?: number;
    instantWin?: Prize;
    error?: string;
  } {
    // Check if sweepstakes is active
    if (sweepstakes.status !== "active") {
      return { success: false, error: "Sweepstakes is not currently active" };
    }

    // Find entry method
    const method = sweepstakes.entryMethods.find(m => m.id === entryMethodId);
    if (!method) {
      return { success: false, error: "Invalid entry method" };
    }

    // Check user's existing entries
    const userTotalEntries = userEntries
      .filter(e => e.sweepstakesId === sweepstakes.id)
      .reduce((sum, e) => sum + e.entries, 0);

    if (sweepstakes.maxEntriesPerUser && userTotalEntries >= sweepstakes.maxEntriesPerUser) {
      return { success: false, error: "Maximum entries reached" };
    }

    // Check method-specific limits
    if (method.maxPerUser) {
      const methodEntries = userEntries.filter(
        e => e.sweepstakesId === sweepstakes.id && e.entryMethodId === entryMethodId
      ).length;
      if (methodEntries >= method.maxPerUser) {
        return { success: false, error: "Maximum entries for this method reached" };
      }
    }

    // Check points if needed
    let pointsSpent = 0;
    if (method.type === "points" && method.pointsCost) {
      if (pointsBalance < method.pointsCost) {
        return { success: false, error: "Insufficient points" };
      }
      pointsSpent = method.pointsCost;
    }

    // Create entry
    const entry: SweepstakesEntry = {
      id: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sweepstakesId: sweepstakes.id,
      userId,
      entryMethodId,
      entries: method.entriesEarned ?? 1,
      pointsSpent: pointsSpent > 0 ? pointsSpent : undefined,
      createdAt: Date.now(),
    };

    // Check for instant win
    let instantWin: Prize | undefined;
    if (sweepstakes.type === "instant_win") {
      instantWin = this.checkInstantWin(sweepstakes.prizePool);
    }

    return {
      success: true,
      entry,
      pointsSpent: pointsSpent > 0 ? pointsSpent : undefined,
      instantWin,
    };
  }

  /**
   * Conduct drawing for a sweepstakes
   */
  conductDrawing(
    sweepstakes: Sweepstakes,
    entries: SweepstakesEntry[],
    users: Map<string, { username: string }>
  ): DrawingResult {
    const winners: DrawingWinner[] = [];

    // Build weighted entry list
    const weightedEntries: string[] = [];
    for (const entry of entries) {
      for (let i = 0; i < entry.entries; i++) {
        weightedEntries.push(entry.userId);
      }
    }

    // Generate verification hash for provably fair
    const seed = Date.now().toString() + Math.random().toString();
    const verificationHash = this.generateHash(seed);

    // Draw winners for each prize
    const winnersSet = new Set<string>();
    let rank = 1;

    for (const prize of sweepstakes.prizePool) {
      for (let i = 0; i < prize.quantity; i++) {
        // Filter out already selected winners for unique winners
        const eligibleEntries = weightedEntries.filter(
          userId => !winnersSet.has(userId)
        );

        if (eligibleEntries.length === 0) break;

        // Random selection using seeded RNG
        const winnerIndex = Math.floor(
          this.seededRandom(seed + prize.id + i) * eligibleEntries.length
        );
        const winnerId = eligibleEntries[winnerIndex];

        winnersSet.add(winnerId);

        const userEntry = entries.find(e => e.userId === winnerId);

        winners.push({
          userId: winnerId,
          username: users.get(winnerId)?.username ?? "Unknown",
          prizeId: prize.id,
          prizeName: prize.name,
          prizeValue: prize.value,
          entryId: userEntry?.id ?? "",
          rank: rank++,
          notified: false,
          claimed: false,
        });
      }
    }

    return {
      sweepstakesId: sweepstakes.id,
      drawingId: `drawing_${Date.now()}`,
      winners,
      totalEntries: weightedEntries.length,
      drawnAt: Date.now(),
      verificationHash,
    };
  }

  /**
   * Create a points transaction
   */
  createTransaction(
    userId: string,
    type: PointsTransaction["type"],
    amount: number,
    currentBalance: number,
    source: PointsSource,
    description: string
  ): PointsTransaction {
    const newBalance = type === "earn" || type === "bonus"
      ? currentBalance + amount
      : currentBalance - amount;

    return {
      id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      type,
      amount,
      balance: newBalance,
      source,
      description,
      createdAt: Date.now(),
    };
  }

  /**
   * Get available sweepstakes templates
   */
  getSweepstakesTemplates(): Array<{
    name: string;
    type: SweepstakesType;
    description: string;
    suggestedPrizes: Array<Omit<Prize, "id" | "remaining" | "winnerId">>;
    suggestedEntryMethods: Array<Omit<EntryMethod, "id">>;
  }> {
    return [
      {
        name: "Daily Free Draw",
        type: "drawing",
        description: "Daily free entry drawing for tokens",
        suggestedPrizes: [
          { name: "1000 Tokens", type: "tokens", value: 1000, quantity: 1, tier: "grand" },
          { name: "500 Tokens", type: "tokens", value: 500, quantity: 5, tier: "first" },
          { name: "100 Tokens", type: "tokens", value: 100, quantity: 20, tier: "consolation" },
        ],
        suggestedEntryMethods: [
          { type: "free", description: "1 free entry per day", maxPerDay: 1, entriesEarned: 1 },
        ],
      },
      {
        name: "Weekly Jackpot",
        type: "drawing",
        description: "Weekly points-based sweepstakes with cash prizes",
        suggestedPrizes: [
          { name: "$500 Cash", type: "cash", value: 500, quantity: 1, tier: "grand" },
          { name: "$100 Cash", type: "cash", value: 100, quantity: 5, tier: "first" },
          { name: "$25 Free Bet", type: "free_bets", value: 25, quantity: 20, tier: "second" },
        ],
        suggestedEntryMethods: [
          { type: "points", description: "100 points = 1 entry", pointsCost: 100, entriesEarned: 1 },
          { type: "free", description: "1 free entry per week", maxPerUser: 1, entriesEarned: 1 },
        ],
      },
      {
        name: "March Madness Mania",
        type: "leaderboard",
        description: "Skill-based bracket competition",
        suggestedPrizes: [
          { name: "VIP Experience", type: "experiences", value: 5000, quantity: 1, tier: "grand" },
          { name: "$1000 Cash", type: "cash", value: 1000, quantity: 1, tier: "first" },
          { name: "$500 Cash", type: "cash", value: 500, quantity: 3, tier: "second" },
          { name: "1 Year Premium", type: "subscriptions", value: 120, quantity: 10, tier: "third" },
        ],
        suggestedEntryMethods: [
          { type: "action", actionType: "submit_bracket", description: "Submit a bracket to enter", entriesEarned: 1 },
        ],
      },
      {
        name: "Instant Win Scratch-Off",
        type: "instant_win",
        description: "Instant reveal prizes",
        suggestedPrizes: [
          { name: "$100 Cash", type: "cash", value: 100, quantity: 10, tier: "grand", odds: 0.001 },
          { name: "$10 Free Bet", type: "free_bets", value: 10, quantity: 100, tier: "first", odds: 0.01 },
          { name: "50 Tokens", type: "tokens", value: 50, quantity: 1000, tier: "consolation", odds: 0.1 },
        ],
        suggestedEntryMethods: [
          { type: "points", description: "50 points per play", pointsCost: 50, entriesEarned: 1 },
        ],
      },
      {
        name: "Referral Raffle",
        type: "drawing",
        description: "Earn entries by referring friends",
        suggestedPrizes: [
          { name: "$250 Cash", type: "cash", value: 250, quantity: 1, tier: "grand" },
          { name: "$50 Free Bet", type: "free_bets", value: 50, quantity: 5, tier: "first" },
        ],
        suggestedEntryMethods: [
          { type: "referral", description: "5 entries per successful referral", entriesEarned: 5 },
          { type: "free", description: "1 free entry for participating", maxPerUser: 1, entriesEarned: 1 },
        ],
      },
    ];
  }

  /**
   * Get points earning opportunities
   */
  getPointsEarningOpportunities(): Array<{
    action: string;
    description: string;
    pointsRange: string;
    frequency: string;
  }> {
    return [
      {
        action: "Place Bets",
        description: "Earn 1 point per dollar wagered",
        pointsRange: "1+ per bet",
        frequency: "Per bet",
      },
      {
        action: "Win Bets",
        description: "Bonus points for winning bets",
        pointsRange: "10 per win",
        frequency: "Per win",
      },
      {
        action: "Build Streaks",
        description: "Bonus points for consecutive wins",
        pointsRange: "25-200",
        frequency: "At milestones",
      },
      {
        action: "Daily Login",
        description: "Log in daily to earn bonus points",
        pointsRange: "10-50",
        frequency: "Daily",
      },
      {
        action: "Complete Challenges",
        description: "Finish prediction challenges",
        pointsRange: "50-500",
        frequency: "Per challenge",
      },
      {
        action: "Refer Friends",
        description: "Earn when friends sign up and bet",
        pointsRange: "500-1000",
        frequency: "Per referral",
      },
      {
        action: "Achievements",
        description: "Unlock achievements for points",
        pointsRange: "50-1000",
        frequency: "Per achievement",
      },
    ];
  }

  private checkInstantWin(prizePool: Prize[]): Prize | undefined {
    // Check each prize for instant win
    for (const prize of prizePool) {
      if (prize.odds && prize.remaining > 0) {
        const roll = Math.random();
        if (roll < prize.odds) {
          return prize;
        }
      }
    }
    return undefined;
  }

  private generateOfficialRules(
    name: string,
    type: SweepstakesType,
    prizes: Prize[],
    options: any
  ): string {
    const totalValue = prizes.reduce((sum, p) => sum + p.value * p.quantity, 0);

    return `
OFFICIAL RULES - ${name.toUpperCase()}

NO PURCHASE NECESSARY TO ENTER OR WIN.

1. ELIGIBILITY: Open to legal residents of the United States who are 18 years of age or older. Void where prohibited.

2. ENTRY PERIOD: Begins at ${new Date(options.startsAt).toISOString()} and ends at ${new Date(options.endsAt).toISOString()}.

3. HOW TO ENTER: ${type === "drawing" ? "Earn entries through the methods described on the sweepstakes page." : "See entry requirements on the sweepstakes page."}

4. PRIZES: Total approximate retail value of all prizes: $${totalValue}. ${prizes.map(p => `${p.name} (${p.quantity} available) - ARV: $${p.value}`).join("; ")}

5. WINNER SELECTION: ${type === "drawing" ? "Winners will be selected in a random drawing from all eligible entries." : type === "leaderboard" ? "Winners determined by final leaderboard standings." : "Prizes awarded instantly upon qualifying."}

6. ODDS: Odds of winning depend on the number of eligible entries received.

7. For complete official rules, contact support.
    `.trim();
  }

  private generateHash(input: string): string {
    // Simple hash for demo - in production use crypto
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, "0");
  }

  private seededRandom(seed: string): number {
    // Simple seeded random for demo - in production use proper RNG
    const hash = this.generateHash(seed);
    return parseInt(hash, 16) / 0xffffffff;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createSweepstakesEngine(): SweepstakesEngine {
  return new SweepstakesEngine();
}
