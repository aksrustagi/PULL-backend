/**
 * Cash Battles Matchmaking Service
 * Handles random and ranked opponent matching
 */

import {
  MatchmakingQueue,
  MatchmakingResult,
  MatchmakingFactors,
  BattleType,
  BattleCategory,
  BattlePlayerStats,
  BattleRank,
  RANK_THRESHOLDS,
  MATCHING_TIMEOUT_SECONDS,
} from "./types";

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface MatchmakingConfig {
  maxWaitTimeSeconds: number;
  initialSkillRange: number;
  skillRangeExpansionRate: number; // Per second
  maxSkillDifference: number;
  stakeTolerancePercent: number;
  minMatchQuality: number;
  prioritizeSpeed: boolean;
  logger?: Logger;
}

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

interface ConvexClient {
  query<T>(name: string, args: Record<string, unknown>): Promise<T>;
  mutation<T>(name: string, args: Record<string, unknown>): Promise<T>;
}

const DEFAULT_CONFIG: MatchmakingConfig = {
  maxWaitTimeSeconds: MATCHING_TIMEOUT_SECONDS,
  initialSkillRange: 100, // ELO points
  skillRangeExpansionRate: 10, // +10 ELO per second of waiting
  maxSkillDifference: 500,
  stakeTolerancePercent: 50, // Match within 50% stake difference
  minMatchQuality: 50,
  prioritizeSpeed: false,
};

// ============================================================================
// MATCHMAKING SERVICE
// ============================================================================

export class MatchmakingService {
  private readonly config: MatchmakingConfig;
  private readonly db: ConvexClient;
  private readonly logger: Logger;

  constructor(db: ConvexClient, config?: Partial<MatchmakingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = db;
    this.logger = config?.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[Matchmaking] ${msg}`, meta),
      info: (msg, meta) => console.info(`[Matchmaking] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[Matchmaking] ${msg}`, meta),
      error: (msg, meta) => console.error(`[Matchmaking] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // QUEUE MANAGEMENT
  // ==========================================================================

  async joinQueue(
    userId: string,
    battleType: BattleType,
    category: BattleCategory,
    stakeRange: { min: number; max: number },
    preferredMarkets?: string[],
    useRankedMatching: boolean = true
  ): Promise<MatchmakingQueue> {
    // Check if user is already in queue
    const existingEntry = await this.getQueueEntry(userId);
    if (existingEntry) {
      throw new Error("Already in matchmaking queue");
    }

    // Get user's skill rating for ranked matching
    let skillRange: { min: number; max: number } | undefined;
    if (useRankedMatching) {
      const stats = await this.getPlayerStats(userId);
      const skillRating = stats?.skillRating ?? 1000;
      skillRange = {
        min: skillRating - this.config.initialSkillRange,
        max: skillRating + this.config.initialSkillRange,
      };
    }

    const now = Date.now();
    const queueEntry: MatchmakingQueue = {
      id: this.generateId(),
      userId,
      battleType,
      category,
      stakeRange,
      skillRange,
      preferredMarkets,
      queuedAt: now,
      expiresAt: now + this.config.maxWaitTimeSeconds * 1000,
      status: "queued",
    };

    await this.db.mutation("matchmakingQueue:add", { entry: queueEntry });

    this.logger.info("Player joined queue", {
      userId,
      battleType,
      category,
      stakeRange,
    });

    // Attempt immediate match
    const match = await this.findMatch(queueEntry);
    if (match) {
      return { ...queueEntry, status: "matched" };
    }

    return queueEntry;
  }

  async leaveQueue(userId: string): Promise<void> {
    const entry = await this.getQueueEntry(userId);
    if (!entry) {
      return;
    }

    await this.db.mutation("matchmakingQueue:remove", { queueId: entry.id });

    this.logger.info("Player left queue", { userId });
  }

  async getQueueEntry(userId: string): Promise<MatchmakingQueue | null> {
    return await this.db.query<MatchmakingQueue | null>("matchmakingQueue:getByUser", {
      userId,
    });
  }

  async getQueueStats(category?: BattleCategory): Promise<{
    totalPlayers: number;
    averageWaitTime: number;
    matchesPerMinute: number;
    byStakeRange: Record<string, number>;
  }> {
    return await this.db.query("matchmakingQueue:getStats", { category });
  }

  // ==========================================================================
  // MATCHING ALGORITHM
  // ==========================================================================

  async findMatch(seeker: MatchmakingQueue): Promise<MatchmakingResult | null> {
    // Get all eligible candidates
    const candidates = await this.db.query<MatchmakingQueue[]>(
      "matchmakingQueue:findCandidates",
      {
        excludeUserId: seeker.userId,
        battleType: seeker.battleType,
        category: seeker.category,
        status: "queued",
      }
    );

    if (candidates.length === 0) {
      return null;
    }

    // Score each candidate
    const scoredCandidates = await Promise.all(
      candidates.map(async (candidate) => ({
        candidate,
        score: await this.calculateMatchScore(seeker, candidate),
        factors: await this.calculateMatchFactors(seeker, candidate),
      }))
    );

    // Filter by minimum quality threshold
    const viableCandidates = scoredCandidates.filter(
      (c) => c.score >= this.config.minMatchQuality
    );

    if (viableCandidates.length === 0) {
      return null;
    }

    // Sort by score (highest first)
    viableCandidates.sort((a, b) => b.score - a.score);

    // Select best match
    const bestMatch = viableCandidates[0];

    // Create the battle and update queue entries
    const battleId = await this.createMatchedBattle(seeker, bestMatch.candidate);

    // Update both queue entries
    await this.db.mutation("matchmakingQueue:markMatched", {
      queueIds: [seeker.id, bestMatch.candidate.id],
      battleId,
    });

    const result: MatchmakingResult = {
      battleId,
      player1Id: seeker.userId,
      player2Id: bestMatch.candidate.userId,
      matchedAt: Date.now(),
      matchQuality: bestMatch.score,
      factors: bestMatch.factors,
    };

    this.logger.info("Match found", {
      battleId,
      player1: seeker.userId,
      player2: bestMatch.candidate.userId,
      quality: bestMatch.score,
    });

    return result;
  }

  async runMatchmakingCycle(): Promise<MatchmakingResult[]> {
    const matches: MatchmakingResult[] = [];

    // Get all queued entries, oldest first
    const queue = await this.db.query<MatchmakingQueue[]>("matchmakingQueue:getAllQueued", {
      orderBy: "queuedAt",
      order: "asc",
    });

    const processedUsers = new Set<string>();

    for (const entry of queue) {
      // Skip if already processed in this cycle
      if (processedUsers.has(entry.userId)) {
        continue;
      }

      // Expand skill range based on wait time
      const expandedEntry = this.expandSkillRange(entry);

      const match = await this.findMatch(expandedEntry);
      if (match) {
        matches.push(match);
        processedUsers.add(match.player1Id);
        processedUsers.add(match.player2Id);
      }
    }

    // Expire old queue entries
    await this.expireOldEntries();

    return matches;
  }

  private async calculateMatchScore(
    seeker: MatchmakingQueue,
    candidate: MatchmakingQueue
  ): Promise<number> {
    const factors = await this.calculateMatchFactors(seeker, candidate);

    // Weighted scoring
    let score = 100;

    // Skill difference penalty (40% weight)
    if (factors.skillDifference > 0) {
      const skillPenalty = Math.min(40, (factors.skillDifference / this.config.maxSkillDifference) * 40);
      score -= skillPenalty;
    }

    // Stake difference penalty (30% weight)
    const stakePenalty = Math.min(30, factors.stakeDifference * 30);
    score -= stakePenalty;

    // Wait time bonus (15% weight) - longer wait = more lenient
    const waitBonus = Math.min(15, (factors.waitTime / this.config.maxWaitTimeSeconds) * 15);
    score += waitBonus;

    // Category match bonus (10% weight)
    if (factors.categoryMatch) {
      score += 10;
    }

    // Market overlap bonus (5% weight)
    score += factors.marketOverlap * 5;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private async calculateMatchFactors(
    seeker: MatchmakingQueue,
    candidate: MatchmakingQueue
  ): Promise<MatchmakingFactors> {
    // Calculate skill difference
    let skillDifference = 0;
    if (seeker.skillRange && candidate.skillRange) {
      const seekerMid = (seeker.skillRange.min + seeker.skillRange.max) / 2;
      const candidateMid = (candidate.skillRange.min + candidate.skillRange.max) / 2;
      skillDifference = Math.abs(seekerMid - candidateMid);
    }

    // Calculate stake difference as percentage
    const seekerStakeMid = (seeker.stakeRange.min + seeker.stakeRange.max) / 2;
    const candidateStakeMid = (candidate.stakeRange.min + candidate.stakeRange.max) / 2;
    const stakeDifference = Math.abs(seekerStakeMid - candidateStakeMid) / seekerStakeMid;

    // Calculate wait time (of the longer waiting player)
    const now = Date.now();
    const seekerWait = (now - seeker.queuedAt) / 1000;
    const candidateWait = (now - candidate.queuedAt) / 1000;
    const waitTime = Math.max(seekerWait, candidateWait);

    // Check category match
    const categoryMatch = seeker.category === candidate.category;

    // Calculate market overlap
    let marketOverlap = 0;
    if (seeker.preferredMarkets && candidate.preferredMarkets) {
      const overlap = seeker.preferredMarkets.filter((m) =>
        candidate.preferredMarkets!.includes(m)
      );
      marketOverlap = overlap.length / Math.max(seeker.preferredMarkets.length, 1);
    }

    return {
      skillDifference,
      stakeDifference,
      waitTime,
      categoryMatch,
      marketOverlap,
    };
  }

  private expandSkillRange(entry: MatchmakingQueue): MatchmakingQueue {
    if (!entry.skillRange) {
      return entry;
    }

    const waitTimeSeconds = (Date.now() - entry.queuedAt) / 1000;
    const expansion = waitTimeSeconds * this.config.skillRangeExpansionRate;
    const maxExpansion = this.config.maxSkillDifference - this.config.initialSkillRange;
    const actualExpansion = Math.min(expansion, maxExpansion);

    return {
      ...entry,
      skillRange: {
        min: entry.skillRange.min - actualExpansion,
        max: entry.skillRange.max + actualExpansion,
      },
    };
  }

  private async createMatchedBattle(
    player1Entry: MatchmakingQueue,
    player2Entry: MatchmakingQueue
  ): Promise<string> {
    // Determine stake (use minimum of both ranges)
    const stake = Math.min(
      player1Entry.stakeRange.max,
      player2Entry.stakeRange.max,
      Math.max(player1Entry.stakeRange.min, player2Entry.stakeRange.min)
    );

    // Select market (prefer overlap or random from category)
    let marketId: string;
    if (player1Entry.preferredMarkets && player2Entry.preferredMarkets) {
      const overlap = player1Entry.preferredMarkets.filter((m) =>
        player2Entry.preferredMarkets!.includes(m)
      );
      marketId = overlap[0] ?? player1Entry.preferredMarkets[0];
    } else {
      // Get random market from category
      const market = await this.db.query<{ id: string }>("markets:getRandomByCategory", {
        category: player1Entry.category,
      });
      marketId = market?.id ?? "default";
    }

    // Create the battle
    const battleId = await this.db.mutation<string>("cashBattles:createFromMatch", {
      player1Id: player1Entry.userId,
      player2Id: player2Entry.userId,
      battleType: player1Entry.battleType,
      category: player1Entry.category,
      stake,
      marketId,
    });

    return battleId;
  }

  private async expireOldEntries(): Promise<number> {
    const now = Date.now();
    return await this.db.mutation<number>("matchmakingQueue:expireOld", {
      currentTime: now,
    });
  }

  // ==========================================================================
  // SKILL RATING (ELO)
  // ==========================================================================

  async updateSkillRatings(
    winnerId: string,
    loserId: string,
    isTie: boolean = false
  ): Promise<{ winnerNewRating: number; loserNewRating: number }> {
    const K = 32; // K-factor for rating adjustment

    const winnerStats = await this.getPlayerStats(winnerId);
    const loserStats = await this.getPlayerStats(loserId);

    const winnerRating = winnerStats?.skillRating ?? 1000;
    const loserRating = loserStats?.skillRating ?? 1000;

    // Calculate expected scores
    const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
    const expectedLoser = 1 - expectedWinner;

    // Actual scores
    const actualWinner = isTie ? 0.5 : 1;
    const actualLoser = isTie ? 0.5 : 0;

    // Calculate new ratings
    const winnerNewRating = Math.round(winnerRating + K * (actualWinner - expectedWinner));
    const loserNewRating = Math.round(loserRating + K * (actualLoser - expectedLoser));

    // Update in database
    await Promise.all([
      this.db.mutation("battlePlayerStats:updateRating", {
        userId: winnerId,
        newRating: winnerNewRating,
        newRank: this.getRankFromRating(winnerNewRating),
      }),
      this.db.mutation("battlePlayerStats:updateRating", {
        userId: loserId,
        newRating: loserNewRating,
        newRank: this.getRankFromRating(loserNewRating),
      }),
    ]);

    this.logger.info("Skill ratings updated", {
      winner: { id: winnerId, old: winnerRating, new: winnerNewRating },
      loser: { id: loserId, old: loserRating, new: loserNewRating },
    });

    return {
      winnerNewRating,
      loserNewRating,
    };
  }

  getRankFromRating(rating: number): BattleRank {
    const ranks: BattleRank[] = [
      "legend",
      "grandmaster",
      "master",
      "diamond",
      "platinum",
      "gold",
      "silver",
      "bronze",
    ];

    for (const rank of ranks) {
      if (rating >= RANK_THRESHOLDS[rank]) {
        return rank;
      }
    }

    return "bronze";
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private async getPlayerStats(userId: string): Promise<BattlePlayerStats | null> {
    return await this.db.query<BattlePlayerStats | null>("battlePlayerStats:get", {
      userId,
    });
  }

  private generateId(): string {
    return `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let serviceInstance: MatchmakingService | null = null;

export function getMatchmakingService(db: ConvexClient): MatchmakingService {
  if (!serviceInstance) {
    serviceInstance = new MatchmakingService(db);
  }
  return serviceInstance;
}

export function createMatchmakingService(
  db: ConvexClient,
  config?: Partial<MatchmakingConfig>
): MatchmakingService {
  return new MatchmakingService(db, config);
}
