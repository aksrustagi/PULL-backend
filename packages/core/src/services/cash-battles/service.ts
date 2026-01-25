/**
 * Cash Battles Service
 * Main service for 1v1 head-to-head prediction duels
 */

import {
  CashBattle,
  BattleStatus,
  BattleType,
  BattleMatchType,
  BattleCategory,
  BattlePrediction,
  BattleRound,
  BattleChatMessage,
  BattlePlayerStats,
  BattleDispute,
  BattleLeaderboard,
  CreateBattleRequest,
  CreateBattleResponse,
  AcceptBattleRequest,
  SubmitPredictionRequest,
  GetBattlesRequest,
  GetBattlesResponse,
  SendChatMessageRequest,
  BattleEvent,
  DisputeReason,
  PLATFORM_FEE_PERCENT,
  BATTLE_EXPIRY_HOURS,
  MIN_BATTLE_STAKE,
  MAX_BATTLE_STAKE,
} from "./types";
import { MatchmakingService, getMatchmakingService } from "./matching";

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface CashBattlesConfig {
  platformFeePercent: number;
  minStake: number;
  maxStake: number;
  expiryHours: number;
  maxRoundsPerBattle: number;
  chatRateLimit: number; // Messages per minute
  enableSpectators: boolean;
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

interface EventEmitter {
  emit(event: string, data: BattleEvent): void;
}

const DEFAULT_CONFIG: CashBattlesConfig = {
  platformFeePercent: PLATFORM_FEE_PERCENT,
  minStake: MIN_BATTLE_STAKE,
  maxStake: MAX_BATTLE_STAKE,
  expiryHours: BATTLE_EXPIRY_HOURS,
  maxRoundsPerBattle: 5,
  chatRateLimit: 10,
  enableSpectators: true,
};

// ============================================================================
// CASH BATTLES SERVICE
// ============================================================================

export class CashBattlesService {
  private readonly config: CashBattlesConfig;
  private readonly db: ConvexClient;
  private readonly matchmaking: MatchmakingService;
  private readonly events: EventEmitter;
  private readonly logger: Logger;

  constructor(
    db: ConvexClient,
    events: EventEmitter,
    config?: Partial<CashBattlesConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = db;
    this.matchmaking = getMatchmakingService(db);
    this.events = events;
    this.logger = config?.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[CashBattles] ${msg}`, meta),
      info: (msg, meta) => console.info(`[CashBattles] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[CashBattles] ${msg}`, meta),
      error: (msg, meta) => console.error(`[CashBattles] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // BATTLE CREATION
  // ==========================================================================

  async createBattle(
    userId: string,
    request: CreateBattleRequest
  ): Promise<CreateBattleResponse> {
    // Validate stake
    if (request.stake < this.config.minStake || request.stake > this.config.maxStake) {
      throw new Error(`Stake must be between $${this.config.minStake} and $${this.config.maxStake}`);
    }

    // Check user balance
    const hasBalance = await this.checkUserBalance(userId, request.stake, request.currency);
    if (!hasBalance) {
      throw new Error("Insufficient balance");
    }

    // Get market details
    const market = await this.getMarket(request.marketId);
    if (!market) {
      throw new Error("Market not found");
    }

    // Calculate pot and fees
    const totalPot = request.stake * 2;
    const platformFee = totalPot * (this.config.platformFeePercent / 100);
    const winnerPayout = totalPot - platformFee;

    const now = Date.now();
    const battleId = this.generateId();

    const battle: CashBattle = {
      id: battleId,
      creatorId: userId,
      opponentId: request.opponentId,
      status: request.matchType === "random" ? "matching" : "pending",
      type: request.type,
      matchType: request.matchType,
      category: request.category,
      stake: request.stake,
      currency: request.currency,
      totalPot,
      platformFee,
      winnerPayout,
      marketId: request.marketId,
      marketTicker: market.ticker,
      marketTitle: market.title,
      marketCloseTime: market.closeTime,
      predictions: [],
      roundCount: request.roundCount ?? 1,
      currentRound: 1,
      rounds: this.initializeRounds(request.roundCount ?? 1, request.marketId, market.title),
      creatorScore: 0,
      opponentScore: 0,
      winnerId: undefined,
      isTie: false,
      chatEnabled: request.chatEnabled,
      chatMessages: [],
      createdAt: now,
      expiresAt: now + this.config.expiryHours * 60 * 60 * 1000,
      isPrivate: request.isPrivate,
      spectatorCount: 0,
      viewerIds: [],
    };

    // Hold creator's stake
    await this.holdStake(userId, request.stake, request.currency);

    // Save battle
    await this.db.mutation("cashBattles:create", { battle });

    // Handle matchmaking for random matches
    let matchmakingEntry = undefined;
    if (request.matchType === "random") {
      matchmakingEntry = await this.matchmaking.joinQueue(
        userId,
        request.type,
        request.category,
        { min: request.stake, max: request.stake },
        [request.marketId]
      );
    }

    // Send notification for friend challenge
    if (request.matchType === "friend" && request.opponentId) {
      await this.notifyChallenge(battleId, userId, request.opponentId, request.stake);
    }

    // Emit event
    this.events.emit("battle", {
      type: "battle_created",
      battle,
    });

    this.logger.info("Battle created", {
      battleId,
      creator: userId,
      stake: request.stake,
      matchType: request.matchType,
    });

    return {
      battle,
      matchmaking: matchmakingEntry,
      shareLink: `https://pull.app/battle/${battleId}`,
    };
  }

  // ==========================================================================
  // BATTLE ACCEPTANCE
  // ==========================================================================

  async acceptBattle(userId: string, request: AcceptBattleRequest): Promise<CashBattle> {
    const battle = await this.getBattle(request.battleId);
    if (!battle) {
      throw new Error("Battle not found");
    }

    if (battle.status !== "pending" && battle.status !== "matched") {
      throw new Error(`Battle cannot be accepted in ${battle.status} status`);
    }

    if (battle.creatorId === userId) {
      throw new Error("Cannot accept your own battle");
    }

    if (battle.opponentId && battle.opponentId !== userId) {
      throw new Error("This battle is for a specific opponent");
    }

    // Check user balance
    const hasBalance = await this.checkUserBalance(userId, battle.stake, battle.currency);
    if (!hasBalance) {
      throw new Error("Insufficient balance");
    }

    // Hold opponent's stake
    await this.holdStake(userId, battle.stake, battle.currency);

    const now = Date.now();

    // Update battle
    const updatedBattle = await this.db.mutation<CashBattle>("cashBattles:update", {
      battleId: request.battleId,
      updates: {
        opponentId: userId,
        status: "active",
        acceptedAt: now,
        startedAt: now,
      },
    });

    // Emit event
    this.events.emit("battle", {
      type: "battle_accepted",
      battle: updatedBattle,
    });

    // Notify creator
    await this.notifyBattleAccepted(battle.creatorId, userId, request.battleId);

    this.logger.info("Battle accepted", {
      battleId: request.battleId,
      opponent: userId,
    });

    return updatedBattle;
  }

  async declineBattle(userId: string, battleId: string): Promise<void> {
    const battle = await this.getBattle(battleId);
    if (!battle) {
      throw new Error("Battle not found");
    }

    if (battle.opponentId !== userId) {
      throw new Error("You are not the challenged opponent");
    }

    if (battle.status !== "pending" && battle.status !== "matched") {
      throw new Error("Battle cannot be declined");
    }

    // Release creator's stake
    await this.releaseStake(battle.creatorId, battle.stake, battle.currency);

    // Cancel battle
    await this.db.mutation("cashBattles:update", {
      battleId,
      updates: {
        status: "cancelled",
      },
    });

    // Notify creator
    await this.notifyBattleDeclined(battle.creatorId, userId, battleId);

    this.events.emit("battle", {
      type: "battle_cancelled",
      battleId,
      reason: "Opponent declined",
    });
  }

  // ==========================================================================
  // PREDICTIONS
  // ==========================================================================

  async submitPrediction(
    userId: string,
    request: SubmitPredictionRequest
  ): Promise<BattlePrediction> {
    const battle = await this.getBattle(request.battleId);
    if (!battle) {
      throw new Error("Battle not found");
    }

    if (battle.status !== "active") {
      throw new Error("Battle is not active");
    }

    if (battle.creatorId !== userId && battle.opponentId !== userId) {
      throw new Error("You are not a participant in this battle");
    }

    // Check if user already submitted for this round
    const existingPrediction = battle.predictions.find(
      (p) => p.userId === userId && p.roundNumber === request.roundNumber
    );
    if (existingPrediction) {
      throw new Error("Prediction already submitted for this round");
    }

    // Check if market is still open
    if (Date.now() > battle.marketCloseTime) {
      throw new Error("Market has closed");
    }

    const prediction: BattlePrediction = {
      id: this.generateId(),
      battleId: request.battleId,
      roundNumber: request.roundNumber,
      userId,
      marketId: battle.marketId,
      outcome: request.outcome,
      confidence: request.confidence,
      lockedAt: Date.now(),
    };

    await this.db.mutation("cashBattles:addPrediction", {
      battleId: request.battleId,
      prediction,
    });

    // Emit event (without revealing the prediction to opponent)
    this.events.emit("battle", {
      type: "prediction_submitted",
      battleId: request.battleId,
      userId,
      roundNumber: request.roundNumber,
    });

    // Check if both predictions are in for this round
    const bothSubmitted = await this.checkBothPredictionsSubmitted(
      request.battleId,
      request.roundNumber
    );
    if (bothSubmitted) {
      await this.lockRound(request.battleId, request.roundNumber);
    }

    this.logger.info("Prediction submitted", {
      battleId: request.battleId,
      userId,
      roundNumber: request.roundNumber,
    });

    return prediction;
  }

  // ==========================================================================
  // RESOLUTION
  // ==========================================================================

  async resolveBattle(battleId: string, marketOutcome: string): Promise<CashBattle> {
    const battle = await this.getBattle(battleId);
    if (!battle) {
      throw new Error("Battle not found");
    }

    if (battle.status !== "active" && battle.status !== "awaiting_results") {
      throw new Error(`Cannot resolve battle in ${battle.status} status`);
    }

    // Resolve each round
    let creatorScore = 0;
    let opponentScore = 0;

    for (const prediction of battle.predictions) {
      const isCorrect = prediction.outcome === marketOutcome;
      await this.db.mutation("cashBattles:updatePrediction", {
        predictionId: prediction.id,
        isCorrect,
        settledAt: Date.now(),
      });

      if (isCorrect) {
        if (prediction.userId === battle.creatorId) {
          creatorScore++;
        } else {
          opponentScore++;
        }
      }
    }

    // Determine winner
    let winnerId: string | undefined;
    let isTie = false;

    if (creatorScore > opponentScore) {
      winnerId = battle.creatorId;
    } else if (opponentScore > creatorScore) {
      winnerId = battle.opponentId;
    } else {
      isTie = true;
    }

    // Update battle
    const resolvedBattle = await this.db.mutation<CashBattle>("cashBattles:update", {
      battleId,
      updates: {
        status: "resolved",
        creatorScore,
        opponentScore,
        winnerId,
        isTie,
        resolvedAt: Date.now(),
      },
    });

    // Distribute winnings
    await this.distributeWinnings(resolvedBattle);

    // Update player stats
    await this.updatePlayerStats(resolvedBattle);

    // Emit event
    this.events.emit("battle", {
      type: "battle_resolved",
      battle: resolvedBattle,
    });

    this.logger.info("Battle resolved", {
      battleId,
      winnerId,
      isTie,
      creatorScore,
      opponentScore,
    });

    return resolvedBattle;
  }

  private async distributeWinnings(battle: CashBattle): Promise<void> {
    if (battle.isTie) {
      // Refund both players (minus small fee)
      const refundAmount = battle.stake - (battle.stake * 0.01); // 1% fee on ties
      await Promise.all([
        this.releaseStake(battle.creatorId, refundAmount, battle.currency),
        this.releaseStake(battle.opponentId!, refundAmount, battle.currency),
      ]);
    } else if (battle.winnerId) {
      // Winner gets payout
      await this.releaseStake(battle.winnerId, battle.winnerPayout, battle.currency);

      // Update stats
      await this.db.mutation("battlePlayerStats:recordWin", {
        userId: battle.winnerId,
        amount: battle.winnerPayout - battle.stake,
      });

      const loserId = battle.winnerId === battle.creatorId ? battle.opponentId : battle.creatorId;
      await this.db.mutation("battlePlayerStats:recordLoss", {
        userId: loserId,
        amount: battle.stake,
      });
    }

    // Mark battle as completed
    await this.db.mutation("cashBattles:update", {
      battleId: battle.id,
      updates: {
        status: "completed",
        completedAt: Date.now(),
      },
    });
  }

  private async updatePlayerStats(battle: CashBattle): Promise<void> {
    if (battle.isTie) {
      await Promise.all([
        this.db.mutation("battlePlayerStats:recordTie", { userId: battle.creatorId }),
        this.db.mutation("battlePlayerStats:recordTie", { userId: battle.opponentId }),
      ]);
    } else if (battle.winnerId) {
      const loserId = battle.winnerId === battle.creatorId
        ? battle.opponentId
        : battle.creatorId;

      // Update ELO ratings
      await this.matchmaking.updateSkillRatings(battle.winnerId, loserId!, false);
    }
  }

  // ==========================================================================
  // RETRIEVAL
  // ==========================================================================

  async getBattle(battleId: string): Promise<CashBattle | null> {
    return await this.db.query<CashBattle | null>("cashBattles:get", { battleId });
  }

  async getBattles(request: GetBattlesRequest): Promise<GetBattlesResponse> {
    const result = await this.db.query<{ battles: CashBattle[]; nextCursor?: string }>(
      "cashBattles:list",
      request
    );

    return {
      battles: result.battles,
      nextCursor: result.nextCursor,
      hasMore: !!result.nextCursor,
    };
  }

  async getUserBattles(
    userId: string,
    status?: BattleStatus[],
    limit: number = 20
  ): Promise<CashBattle[]> {
    return await this.db.query<CashBattle[]>("cashBattles:getByUser", {
      userId,
      status,
      limit,
    });
  }

  async getActiveBattles(limit: number = 50): Promise<CashBattle[]> {
    return await this.db.query<CashBattle[]>("cashBattles:getActive", { limit });
  }

  async getOpenBattles(
    category?: BattleCategory,
    limit: number = 20
  ): Promise<CashBattle[]> {
    return await this.db.query<CashBattle[]>("cashBattles:getOpen", {
      category,
      limit,
    });
  }

  // ==========================================================================
  // CHAT
  // ==========================================================================

  async sendChatMessage(
    userId: string,
    request: SendChatMessageRequest
  ): Promise<BattleChatMessage> {
    const battle = await this.getBattle(request.battleId);
    if (!battle) {
      throw new Error("Battle not found");
    }

    if (!battle.chatEnabled) {
      throw new Error("Chat is disabled for this battle");
    }

    if (battle.creatorId !== userId && battle.opponentId !== userId) {
      throw new Error("You are not a participant in this battle");
    }

    // Rate limit check
    const recentMessages = await this.db.query<number>("battleChat:countRecent", {
      battleId: request.battleId,
      userId,
      sinceMs: 60 * 1000, // Last minute
    });

    if (recentMessages >= this.config.chatRateLimit) {
      throw new Error("Chat rate limit exceeded");
    }

    const message: BattleChatMessage = {
      id: this.generateId(),
      battleId: request.battleId,
      userId,
      message: request.message,
      isSystem: false,
      createdAt: Date.now(),
    };

    await this.db.mutation("battleChat:send", { message });

    this.events.emit("battle", {
      type: "chat_message",
      message,
    });

    return message;
  }

  // ==========================================================================
  // SPECTATORS
  // ==========================================================================

  async joinAsSpectator(userId: string, battleId: string): Promise<void> {
    if (!this.config.enableSpectators) {
      throw new Error("Spectating is disabled");
    }

    const battle = await this.getBattle(battleId);
    if (!battle) {
      throw new Error("Battle not found");
    }

    if (battle.isPrivate) {
      throw new Error("Cannot spectate private battles");
    }

    await this.db.mutation("cashBattles:addSpectator", {
      battleId,
      userId,
    });

    this.events.emit("battle", {
      type: "spectator_joined",
      battleId,
      count: battle.spectatorCount + 1,
    });
  }

  // ==========================================================================
  // DISPUTES
  // ==========================================================================

  async fileDispute(
    userId: string,
    battleId: string,
    reason: DisputeReason,
    description: string,
    evidence?: string[]
  ): Promise<BattleDispute> {
    const battle = await this.getBattle(battleId);
    if (!battle) {
      throw new Error("Battle not found");
    }

    if (battle.creatorId !== userId && battle.opponentId !== userId) {
      throw new Error("You are not a participant in this battle");
    }

    if (battle.status !== "resolved" && battle.status !== "completed") {
      throw new Error("Can only dispute resolved battles");
    }

    const dispute: BattleDispute = {
      id: this.generateId(),
      battleId,
      disputerId: userId,
      reason,
      description,
      evidence,
      status: "pending",
      createdAt: Date.now(),
    };

    await this.db.mutation("battleDisputes:create", { dispute });

    // Mark battle as disputed
    await this.db.mutation("cashBattles:update", {
      battleId,
      updates: { status: "disputed" },
    });

    this.logger.info("Dispute filed", { battleId, userId, reason });

    return dispute;
  }

  // ==========================================================================
  // STATS & LEADERBOARDS
  // ==========================================================================

  async getPlayerStats(userId: string): Promise<BattlePlayerStats | null> {
    return await this.db.query<BattlePlayerStats | null>("battlePlayerStats:get", {
      userId,
    });
  }

  async getLeaderboard(
    period: "daily" | "weekly" | "monthly" | "all_time",
    category?: BattleCategory,
    limit: number = 100
  ): Promise<BattleLeaderboard> {
    return await this.db.query<BattleLeaderboard>("battleLeaderboards:get", {
      period,
      category,
      limit,
    });
  }

  // ==========================================================================
  // EXPIRATION
  // ==========================================================================

  async expireBattles(): Promise<number> {
    const now = Date.now();

    const expiredBattles = await this.db.query<CashBattle[]>("cashBattles:getExpired", {
      currentTime: now,
    });

    for (const battle of expiredBattles) {
      // Release creator's stake
      await this.releaseStake(battle.creatorId, battle.stake, battle.currency);

      // Update status
      await this.db.mutation("cashBattles:update", {
        battleId: battle.id,
        updates: { status: "expired" },
      });

      this.events.emit("battle", {
        type: "battle_cancelled",
        battleId: battle.id,
        reason: "Battle expired",
      });
    }

    this.logger.info("Expired battles", { count: expiredBattles.length });

    return expiredBattles.length;
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private initializeRounds(
    roundCount: number,
    marketId: string,
    marketTitle: string
  ): BattleRound[] {
    return Array.from({ length: roundCount }, (_, i) => ({
      roundNumber: i + 1,
      marketId,
      marketTitle,
      status: i === 0 ? "active" : "pending",
    }));
  }

  private async checkBothPredictionsSubmitted(
    battleId: string,
    roundNumber: number
  ): Promise<boolean> {
    const battle = await this.getBattle(battleId);
    if (!battle) return false;

    const roundPredictions = battle.predictions.filter(
      (p) => p.roundNumber === roundNumber
    );

    return roundPredictions.length === 2;
  }

  private async lockRound(battleId: string, roundNumber: number): Promise<void> {
    await this.db.mutation("cashBattles:lockRound", {
      battleId,
      roundNumber,
    });
  }

  private async checkUserBalance(
    userId: string,
    amount: number,
    currency: "USD" | "USDC"
  ): Promise<boolean> {
    const balance = await this.db.query<{ available: number }>("balances:get", {
      userId,
      assetType: currency.toLowerCase(),
    });

    return balance ? balance.available >= amount : false;
  }

  private async holdStake(
    userId: string,
    amount: number,
    currency: "USD" | "USDC"
  ): Promise<void> {
    await this.db.mutation("balances:hold", {
      userId,
      assetType: currency.toLowerCase(),
      amount,
      reason: "battle_stake",
    });
  }

  private async releaseStake(
    userId: string,
    amount: number,
    currency: "USD" | "USDC"
  ): Promise<void> {
    await this.db.mutation("balances:release", {
      userId,
      assetType: currency.toLowerCase(),
      amount,
    });
  }

  private async getMarket(marketId: string): Promise<{
    ticker: string;
    title: string;
    closeTime: number;
  } | null> {
    return await this.db.query("predictionMarkets:get", { marketId });
  }

  private async notifyChallenge(
    battleId: string,
    challengerId: string,
    challengedId: string,
    stake: number
  ): Promise<void> {
    await this.db.mutation("notifications:create", {
      userId: challengedId,
      type: "battle_challenge",
      title: "Battle Challenge!",
      body: `You've been challenged to a $${stake} prediction battle!`,
      data: { battleId, challengerId, stake },
      createdAt: Date.now(),
    });
  }

  private async notifyBattleAccepted(
    creatorId: string,
    opponentId: string,
    battleId: string
  ): Promise<void> {
    await this.db.mutation("notifications:create", {
      userId: creatorId,
      type: "battle_accepted",
      title: "Battle Accepted!",
      body: "Your opponent has accepted the battle challenge!",
      data: { battleId, opponentId },
      createdAt: Date.now(),
    });
  }

  private async notifyBattleDeclined(
    creatorId: string,
    opponentId: string,
    battleId: string
  ): Promise<void> {
    await this.db.mutation("notifications:create", {
      userId: creatorId,
      type: "battle_declined",
      title: "Battle Declined",
      body: "Your battle challenge was declined. Your stake has been refunded.",
      data: { battleId, opponentId },
      createdAt: Date.now(),
    });
  }

  private generateId(): string {
    return `battle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let serviceInstance: CashBattlesService | null = null;

export function getCashBattlesService(
  db: ConvexClient,
  events: EventEmitter
): CashBattlesService {
  if (!serviceInstance) {
    serviceInstance = new CashBattlesService(db, events);
  }
  return serviceInstance;
}

export function createCashBattlesService(
  db: ConvexClient,
  events: EventEmitter,
  config?: Partial<CashBattlesConfig>
): CashBattlesService {
  return new CashBattlesService(db, events, config);
}
