/**
 * Bracket Pool Management
 *
 * Handles pool creation, entry fees, prize distribution,
 * and pool-specific features.
 */

import {
  type BracketPool,
  type PrizeStructure,
  type PoolType,
  type Bracket,
} from "./types";

// ============================================================================
// TYPES
// ============================================================================

export interface PoolPrizeDistribution {
  poolId: string;
  totalPrizePool: number;
  distributions: PrizeDistributionEntry[];
  platformFee: number;
  netDistributed: number;
}

export interface PrizeDistributionEntry {
  place: number;
  userId: string;
  bracketId: string;
  bracketName: string;
  username: string;
  points: number;
  prizeAmount: number;
  prizePercentage: number;
}

export interface PoolAnalytics {
  poolId: string;
  totalEntries: number;
  totalPrizePool: number;
  averageScore: number;
  medianScore: number;
  highestScore: number;
  lowestScore: number;
  perfectBrackets: number;
  upsetSuccessRate: number;
  mostPopularChampion: { teamId: string; count: number; percentage: number };
  leastPopularChampion: { teamId: string; count: number; percentage: number };
  entryDistribution: { date: string; entries: number }[];
}

export interface PoolInvitation {
  id: string;
  poolId: string;
  inviterId: string;
  inviteeEmail?: string;
  inviteCode: string;
  status: "pending" | "accepted" | "declined" | "expired";
  createdAt: number;
  expiresAt: number;
  acceptedAt?: number;
}

// ============================================================================
// POOL MANAGER
// ============================================================================

export class PoolManager {
  private readonly PLATFORM_FEE_RATE = 0.05; // 5% platform fee
  private readonly MIN_POOL_SIZE = 2;
  private readonly MAX_POOL_SIZE = 100000;

  private invitations: Map<string, PoolInvitation> = new Map();

  // ============================================================================
  // PRIZE DISTRIBUTION
  // ============================================================================

  /**
   * Calculate prize distribution for a completed pool
   */
  calculatePrizeDistribution(
    pool: BracketPool,
    brackets: Bracket[]
  ): PoolPrizeDistribution {
    // Sort brackets by score
    const sortedBrackets = [...brackets].sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      // Tiebreaker: more correct picks
      return b.correctPicks - a.correctPicks;
    });

    const platformFee = pool.prizePool * this.PLATFORM_FEE_RATE;
    const distributablePrize = pool.prizePool - platformFee;

    const distributions: PrizeDistributionEntry[] = [];

    for (const prizeLevel of pool.prizeStructure) {
      const places = this.parsePlaceRange(prizeLevel.place);

      for (const place of places) {
        if (place > sortedBrackets.length) continue;

        const bracket = sortedBrackets[place - 1];
        const prizeAmount = prizeLevel.fixedAmount
          ? prizeLevel.fixedAmount
          : distributablePrize * (prizeLevel.percentage! / 100) / places.length;

        distributions.push({
          place,
          userId: bracket.userId,
          bracketId: bracket.id,
          bracketName: bracket.name,
          username: bracket.username,
          points: bracket.totalPoints,
          prizeAmount: Math.floor(prizeAmount * 100) / 100,
          prizePercentage: (prizeAmount / pool.prizePool) * 100,
        });
      }
    }

    const netDistributed = distributions.reduce((sum, d) => sum + d.prizeAmount, 0);

    return {
      poolId: pool.id,
      totalPrizePool: pool.prizePool,
      distributions,
      platformFee,
      netDistributed,
    };
  }

  /**
   * Parse place range (e.g., "4-10" -> [4, 5, 6, 7, 8, 9, 10])
   */
  private parsePlaceRange(place: number | string): number[] {
    if (typeof place === "number") {
      return [place];
    }

    if (place.includes("-")) {
      const [start, end] = place.split("-").map(Number);
      const places: number[] = [];
      for (let i = start; i <= end; i++) {
        places.push(i);
      }
      return places;
    }

    return [Number(place)];
  }

  // ============================================================================
  // PRIZE STRUCTURE TEMPLATES
  // ============================================================================

  /**
   * Get prize structure based on pool type and size
   */
  getRecommendedPrizeStructure(
    poolType: PoolType,
    entryFee: number,
    estimatedEntries: number
  ): PrizeStructure[] {
    if (poolType === "free") {
      return [
        { place: 1, percentage: 100, description: "Bragging rights!" },
      ];
    }

    if (estimatedEntries <= 10) {
      return [
        { place: 1, percentage: 70, description: "1st Place" },
        { place: 2, percentage: 30, description: "2nd Place" },
      ];
    }

    if (estimatedEntries <= 50) {
      return [
        { place: 1, percentage: 50, description: "1st Place" },
        { place: 2, percentage: 25, description: "2nd Place" },
        { place: 3, percentage: 15, description: "3rd Place" },
        { place: "4-5", percentage: 10, description: "4th-5th Place" },
      ];
    }

    if (estimatedEntries <= 200) {
      return [
        { place: 1, percentage: 40, description: "1st Place" },
        { place: 2, percentage: 20, description: "2nd Place" },
        { place: 3, percentage: 12, description: "3rd Place" },
        { place: "4-5", percentage: 10, description: "4th-5th Place" },
        { place: "6-10", percentage: 10, description: "6th-10th Place" },
        { place: "11-20", percentage: 8, description: "11th-20th Place" },
      ];
    }

    // Large pools
    return [
      { place: 1, percentage: 30, description: "1st Place - Grand Prize" },
      { place: 2, percentage: 15, description: "2nd Place" },
      { place: 3, percentage: 10, description: "3rd Place" },
      { place: "4-5", percentage: 8, description: "4th-5th Place" },
      { place: "6-10", percentage: 10, description: "6th-10th Place" },
      { place: "11-25", percentage: 10, description: "11th-25th Place" },
      { place: "26-50", percentage: 8, description: "26th-50th Place" },
      { place: "51-100", percentage: 9, description: "51st-100th Place" },
    ];
  }

  // ============================================================================
  // POOL INVITATIONS
  // ============================================================================

  /**
   * Create pool invitation
   */
  createInvitation(
    poolId: string,
    inviterId: string,
    inviteeEmail?: string
  ): PoolInvitation {
    const invitation: PoolInvitation = {
      id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      poolId,
      inviterId,
      inviteeEmail,
      inviteCode: Math.random().toString(36).substr(2, 8).toUpperCase(),
      status: "pending",
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    this.invitations.set(invitation.id, invitation);
    return invitation;
  }

  /**
   * Accept invitation
   */
  acceptInvitation(inviteCode: string, userId: string): PoolInvitation | null {
    const invitation = Array.from(this.invitations.values()).find(
      (i) => i.inviteCode === inviteCode && i.status === "pending"
    );

    if (!invitation) return null;

    if (Date.now() > invitation.expiresAt) {
      invitation.status = "expired";
      this.invitations.set(invitation.id, invitation);
      return null;
    }

    invitation.status = "accepted";
    invitation.acceptedAt = Date.now();
    this.invitations.set(invitation.id, invitation);

    return invitation;
  }

  /**
   * Get pool invitations
   */
  getPoolInvitations(poolId: string): PoolInvitation[] {
    return Array.from(this.invitations.values()).filter(
      (i) => i.poolId === poolId
    );
  }

  // ============================================================================
  // POOL ANALYTICS
  // ============================================================================

  /**
   * Calculate pool analytics
   */
  calculatePoolAnalytics(
    pool: BracketPool,
    brackets: Bracket[],
    championCounts: Map<string, number>
  ): PoolAnalytics {
    const scores = brackets.map((b) => b.totalPoints).sort((a, b) => a - b);
    const totalScore = scores.reduce((a, b) => a + b, 0);

    // Calculate median
    const mid = Math.floor(scores.length / 2);
    const median = scores.length % 2 !== 0
      ? scores[mid]
      : (scores[mid - 1] + scores[mid]) / 2;

    // Perfect brackets
    const perfectBrackets = brackets.filter(
      (b) => b.incorrectPicks === 0 && b.pendingPicks === 0
    ).length;

    // Champion stats
    const sortedChampions = Array.from(championCounts.entries()).sort(
      (a, b) => b[1] - a[1]
    );
    const mostPopular = sortedChampions[0];
    const leastPopular = sortedChampions[sortedChampions.length - 1];

    return {
      poolId: pool.id,
      totalEntries: brackets.length,
      totalPrizePool: pool.prizePool,
      averageScore: scores.length > 0 ? totalScore / scores.length : 0,
      medianScore: median,
      highestScore: scores[scores.length - 1] ?? 0,
      lowestScore: scores[0] ?? 0,
      perfectBrackets,
      upsetSuccessRate: 0, // Calculate from bracket analytics
      mostPopularChampion: mostPopular
        ? {
            teamId: mostPopular[0],
            count: mostPopular[1],
            percentage: (mostPopular[1] / brackets.length) * 100,
          }
        : { teamId: "", count: 0, percentage: 0 },
      leastPopularChampion: leastPopular
        ? {
            teamId: leastPopular[0],
            count: leastPopular[1],
            percentage: (leastPopular[1] / brackets.length) * 100,
          }
        : { teamId: "", count: 0, percentage: 0 },
      entryDistribution: [], // Populate from entry timestamps
    };
  }

  // ============================================================================
  // VALIDATION
  // ============================================================================

  /**
   * Validate pool configuration
   */
  validatePoolConfig(config: {
    entryFee: number;
    maxEntries: number;
    entriesPerUser: number;
    prizeStructure: PrizeStructure[];
  }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (config.entryFee < 0) {
      errors.push("Entry fee cannot be negative");
    }

    if (config.maxEntries < this.MIN_POOL_SIZE) {
      errors.push(`Pool must allow at least ${this.MIN_POOL_SIZE} entries`);
    }

    if (config.maxEntries > this.MAX_POOL_SIZE) {
      errors.push(`Pool cannot exceed ${this.MAX_POOL_SIZE} entries`);
    }

    if (config.entriesPerUser < 1) {
      errors.push("Must allow at least 1 entry per user");
    }

    if (config.entriesPerUser > config.maxEntries) {
      errors.push("Entries per user cannot exceed max entries");
    }

    // Validate prize structure adds up to 100%
    const totalPercentage = config.prizeStructure.reduce(
      (sum, p) => sum + (p.percentage ?? 0),
      0
    );

    if (config.prizeStructure.length > 0 && Math.abs(totalPercentage - 100) > 0.01) {
      errors.push(`Prize percentages must total 100% (currently ${totalPercentage}%)`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // ============================================================================
  // POOL TEMPLATES
  // ============================================================================

  /**
   * Get pool templates
   */
  getPoolTemplates(): {
    name: string;
    description: string;
    type: PoolType;
    suggestedFee: number;
    suggestedMax: number;
  }[] {
    return [
      {
        name: "Office Pool",
        description: "Classic office bracket challenge with friends and coworkers",
        type: "paid",
        suggestedFee: 10,
        suggestedMax: 50,
      },
      {
        name: "Free For All",
        description: "Free bracket competition - just for fun!",
        type: "free",
        suggestedFee: 0,
        suggestedMax: 1000,
      },
      {
        name: "High Stakes",
        description: "Premium pool for serious bracket enthusiasts",
        type: "paid",
        suggestedFee: 100,
        suggestedMax: 100,
      },
      {
        name: "Tiered Entry",
        description: "Multiple entry levels for different budgets",
        type: "tiered",
        suggestedFee: 25,
        suggestedMax: 500,
      },
      {
        name: "VIP Private",
        description: "Invite-only private pool for select members",
        type: "private",
        suggestedFee: 50,
        suggestedMax: 20,
      },
    ];
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let poolManager: PoolManager | null = null;

export function getPoolManager(): PoolManager {
  if (!poolManager) {
    poolManager = new PoolManager();
  }
  return poolManager;
}

export function createPoolManager(): PoolManager {
  return new PoolManager();
}
