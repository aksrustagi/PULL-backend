/**
 * Squad Wars Service
 * Manages squad vs squad battles
 */

import {
  SquadWar,
  WarStatus,
  WarType,
  WarRound,
  WarMarket,
  SquadPrediction,
  PredictionVote,
  SquadWarMessage,
  Squad,
  SquadMember,
  StartWarRequest,
  StartWarResponse,
  SubmitVoteRequest,
  GetWarsRequest,
  GetWarsResponse,
  SquadEvent,
  SQUAD_WAR_DURATION_HOURS,
} from "./types";

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface SquadWarsConfig {
  votingDurationMinutes: number;
  prepDurationMinutes: number;
  minParticipationPercent: number; // Minimum % of members who must vote
  defaultVotingMethod: "majority" | "captain_override";
  platformFeePercent: number;
  maxActiveWarsPerSquad: number;
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
  emit(event: string, data: SquadEvent): void;
}

const DEFAULT_CONFIG: SquadWarsConfig = {
  votingDurationMinutes: 30,
  prepDurationMinutes: 15,
  minParticipationPercent: 60,
  defaultVotingMethod: "majority",
  platformFeePercent: 5,
  maxActiveWarsPerSquad: 3,
};

// ============================================================================
// SQUAD WARS SERVICE
// ============================================================================

export class SquadWarsService {
  private readonly config: SquadWarsConfig;
  private readonly db: ConvexClient;
  private readonly events: EventEmitter;
  private readonly logger: Logger;

  constructor(
    db: ConvexClient,
    events: EventEmitter,
    config?: Partial<SquadWarsConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = db;
    this.events = events;
    this.logger = config?.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[SquadWars] ${msg}`, meta),
      info: (msg, meta) => console.info(`[SquadWars] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[SquadWars] ${msg}`, meta),
      error: (msg, meta) => console.error(`[SquadWars] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // WAR CREATION
  // ==========================================================================

  async startWar(
    userId: string,
    request: StartWarRequest
  ): Promise<StartWarResponse> {
    // Validate user is captain of challenger squad
    const member = await this.getSquadMember(request.challengerSquadId, userId);
    if (!member || (member.role !== "captain" && member.role !== "co_captain")) {
      throw new Error("Only captains can start wars");
    }

    // Check active war limit
    const activeWars = await this.getActiveWarCount(request.challengerSquadId);
    if (activeWars >= this.config.maxActiveWarsPerSquad) {
      throw new Error(`Maximum ${this.config.maxActiveWarsPerSquad} active wars allowed`);
    }

    // Get challenger squad
    const challengerSquad = await this.getSquad(request.challengerSquadId);
    if (!challengerSquad) {
      throw new Error("Challenger squad not found");
    }

    // Validate stake against pool balance
    if (request.type === "cash" && request.stakePerSquad > 0) {
      if (challengerSquad.poolBalance < request.stakePerSquad) {
        throw new Error("Insufficient pool balance for stake");
      }
    }

    // Get market details
    const markets = await this.getMarkets(request.marketIds);
    if (markets.length !== request.marketIds.length) {
      throw new Error("One or more markets not found");
    }

    const now = Date.now();
    const warId = this.generateId();
    const roundCount = request.roundCount ?? markets.length;

    const war: SquadWar = {
      id: warId,
      type: request.type,
      status: request.defenderSquadId ? "pending" : "matching",
      challengerSquadId: request.challengerSquadId,
      defenderSquadId: request.defenderSquadId,
      challengerSquad: challengerSquad,
      stakePerSquad: request.stakePerSquad,
      totalPot: request.stakePerSquad * 2,
      currency: "USD",
      marketIds: request.marketIds,
      markets: markets.map((m) => ({
        marketId: m.id,
        ticker: m.ticker,
        title: m.title,
        closeTime: m.closeTime,
      })),
      roundCount,
      currentRound: 1,
      rounds: this.initializeRounds(markets, roundCount),
      challengerScore: 0,
      defenderScore: 0,
      isTie: false,
      chatEnabled: true,
      chatMessages: [],
      createdAt: now,
    };

    // Hold challenger's stake
    if (request.type === "cash" && request.stakePerSquad > 0) {
      await this.holdPoolFunds(request.challengerSquadId, request.stakePerSquad);
    }

    // Save war
    await this.db.mutation("squadWars:create", { war });

    // Notify defender squad captain if direct challenge
    if (request.defenderSquadId) {
      await this.notifyWarChallenge(warId, request.challengerSquadId, request.defenderSquadId);
    }

    this.events.emit("squad", {
      type: "war_created",
      war,
    });

    this.logger.info("Squad war started", {
      warId,
      challengerSquadId: request.challengerSquadId,
      type: request.type,
    });

    return {
      war,
      shareLink: `https://pull.app/war/${warId}`,
    };
  }

  async acceptWar(userId: string, warId: string): Promise<SquadWar> {
    const war = await this.getWar(warId);
    if (!war) {
      throw new Error("War not found");
    }

    if (war.status !== "pending" && war.status !== "matched") {
      throw new Error(`War cannot be accepted in ${war.status} status`);
    }

    if (!war.defenderSquadId) {
      throw new Error("No defender squad assigned");
    }

    // Validate user is captain of defender squad
    const member = await this.getSquadMember(war.defenderSquadId, userId);
    if (!member || (member.role !== "captain" && member.role !== "co_captain")) {
      throw new Error("Only captains can accept wars");
    }

    // Get defender squad
    const defenderSquad = await this.getSquad(war.defenderSquadId);
    if (!defenderSquad) {
      throw new Error("Defender squad not found");
    }

    // Validate stake
    if (war.type === "cash" && war.stakePerSquad > 0) {
      if (defenderSquad.poolBalance < war.stakePerSquad) {
        throw new Error("Insufficient pool balance for stake");
      }
      await this.holdPoolFunds(war.defenderSquadId, war.stakePerSquad);
    }

    const now = Date.now();
    const prepStartsAt = now;
    const startsAt = now + this.config.prepDurationMinutes * 60 * 1000;
    const endsAt = startsAt + SQUAD_WAR_DURATION_HOURS * 60 * 60 * 1000;

    const updatedWar = await this.db.mutation<SquadWar>("squadWars:update", {
      warId,
      updates: {
        status: "preparation",
        defenderSquad,
        prepStartsAt,
        startsAt,
        endsAt,
      },
    });

    this.events.emit("squad", {
      type: "war_accepted",
      war: updatedWar,
    });

    // Notify all members
    await this.notifyWarAccepted(updatedWar);

    this.logger.info("Squad war accepted", { warId, defenderSquadId: war.defenderSquadId });

    return updatedWar;
  }

  async declineWar(userId: string, warId: string): Promise<void> {
    const war = await this.getWar(warId);
    if (!war) {
      throw new Error("War not found");
    }

    if (war.status !== "pending") {
      throw new Error("War cannot be declined");
    }

    if (!war.defenderSquadId) {
      throw new Error("No defender squad assigned");
    }

    // Validate user is captain of defender squad
    const member = await this.getSquadMember(war.defenderSquadId, userId);
    if (!member || (member.role !== "captain" && member.role !== "co_captain")) {
      throw new Error("Only captains can decline wars");
    }

    // Release challenger's stake
    if (war.type === "cash" && war.stakePerSquad > 0) {
      await this.releasePoolFunds(war.challengerSquadId, war.stakePerSquad);
    }

    await this.db.mutation("squadWars:update", {
      warId,
      updates: { status: "cancelled" },
    });

    this.logger.info("Squad war declined", { warId });
  }

  // ==========================================================================
  // VOTING
  // ==========================================================================

  async submitVote(userId: string, request: SubmitVoteRequest): Promise<PredictionVote> {
    const war = await this.getWar(request.warId);
    if (!war) {
      throw new Error("War not found");
    }

    if (war.status !== "active" && war.status !== "voting") {
      throw new Error(`Cannot vote in ${war.status} status`);
    }

    // Get user's squad membership
    const challengerMember = await this.getSquadMember(war.challengerSquadId, userId);
    const defenderMember = war.defenderSquadId
      ? await this.getSquadMember(war.defenderSquadId, userId)
      : null;

    let squadId: string;
    if (challengerMember?.status === "active") {
      squadId = war.challengerSquadId;
    } else if (defenderMember?.status === "active") {
      squadId = war.defenderSquadId!;
    } else {
      throw new Error("You are not a member of either squad");
    }

    // Check if round is still open for voting
    const round = war.rounds[request.roundNumber - 1];
    if (!round || round.status !== "voting") {
      throw new Error("Round is not open for voting");
    }

    // Check if user already voted
    const votes = squadId === war.challengerSquadId
      ? round.challengerVotes
      : round.defenderVotes;

    if (votes.some((v) => v.userId === userId)) {
      throw new Error("You have already voted for this round");
    }

    const vote: PredictionVote = {
      id: this.generateId(),
      warId: request.warId,
      roundNumber: request.roundNumber,
      squadId,
      userId,
      outcome: request.outcome,
      confidence: request.confidence ?? 50,
      votedAt: Date.now(),
    };

    await this.db.mutation("squadWars:addVote", { vote });

    this.events.emit("squad", {
      type: "vote_submitted",
      warId: request.warId,
      squadId,
      roundNumber: request.roundNumber,
    });

    // Check if voting is complete
    await this.checkVotingComplete(request.warId, request.roundNumber);

    this.logger.info("Vote submitted", {
      warId: request.warId,
      userId,
      roundNumber: request.roundNumber,
    });

    return vote;
  }

  async captainOverride(
    userId: string,
    warId: string,
    roundNumber: number,
    outcome: string
  ): Promise<SquadPrediction> {
    const war = await this.getWar(warId);
    if (!war) {
      throw new Error("War not found");
    }

    // Determine which squad
    const challengerMember = await this.getSquadMember(war.challengerSquadId, userId);
    const defenderMember = war.defenderSquadId
      ? await this.getSquadMember(war.defenderSquadId, userId)
      : null;

    let squadId: string;
    if (challengerMember?.role === "captain") {
      squadId = war.challengerSquadId;
    } else if (defenderMember?.role === "captain") {
      squadId = war.defenderSquadId!;
    } else {
      throw new Error("Only captains can override");
    }

    const prediction: SquadPrediction = {
      id: this.generateId(),
      warId,
      roundNumber,
      squadId,
      outcome,
      confidence: 100,
      votingMethod: "captain_override",
      lockedAt: Date.now(),
    };

    await this.db.mutation("squadWars:lockPrediction", { prediction });

    this.events.emit("squad", {
      type: "round_locked",
      warId,
      roundNumber,
    });

    return prediction;
  }

  private async checkVotingComplete(warId: string, roundNumber: number): Promise<void> {
    const war = await this.getWar(warId);
    if (!war) return;

    const round = war.rounds[roundNumber - 1];
    if (!round || round.status !== "voting") return;

    // Get squad sizes
    const challengerSquad = await this.getSquad(war.challengerSquadId);
    const defenderSquad = war.defenderSquadId
      ? await this.getSquad(war.defenderSquadId)
      : null;

    if (!challengerSquad || !defenderSquad) return;

    const challengerActiveMembers = challengerSquad.members.filter(
      (m) => m.status === "active"
    ).length;
    const defenderActiveMembers = defenderSquad.members.filter(
      (m) => m.status === "active"
    ).length;

    const challengerVoteCount = round.challengerVotes.length;
    const defenderVoteCount = round.defenderVotes.length;

    const challengerParticipation = (challengerVoteCount / challengerActiveMembers) * 100;
    const defenderParticipation = (defenderVoteCount / defenderActiveMembers) * 100;

    // Check if minimum participation reached for both squads
    if (
      challengerParticipation >= this.config.minParticipationPercent &&
      defenderParticipation >= this.config.minParticipationPercent
    ) {
      await this.lockRound(warId, roundNumber);
    }
  }

  private async lockRound(warId: string, roundNumber: number): Promise<void> {
    const war = await this.getWar(warId);
    if (!war) return;

    const round = war.rounds[roundNumber - 1];
    if (!round) return;

    // Determine majority outcome for each squad
    const challengerOutcome = this.getMajorityOutcome(round.challengerVotes);
    const defenderOutcome = this.getMajorityOutcome(round.defenderVotes);

    const challengerPrediction: SquadPrediction = {
      id: this.generateId(),
      warId,
      roundNumber,
      squadId: war.challengerSquadId,
      outcome: challengerOutcome.outcome,
      confidence: challengerOutcome.avgConfidence,
      votingMethod: "majority",
      lockedAt: Date.now(),
    };

    const defenderPrediction: SquadPrediction = {
      id: this.generateId(),
      warId,
      roundNumber,
      squadId: war.defenderSquadId!,
      outcome: defenderOutcome.outcome,
      confidence: defenderOutcome.avgConfidence,
      votingMethod: "majority",
      lockedAt: Date.now(),
    };

    await this.db.mutation("squadWars:lockRound", {
      warId,
      roundNumber,
      challengerPrediction,
      defenderPrediction,
    });

    this.events.emit("squad", {
      type: "round_locked",
      warId,
      roundNumber,
    });

    this.logger.info("Round locked", { warId, roundNumber });
  }

  private getMajorityOutcome(votes: PredictionVote[]): {
    outcome: string;
    avgConfidence: number;
  } {
    if (votes.length === 0) {
      return { outcome: "abstain", avgConfidence: 0 };
    }

    const outcomeCounts = new Map<string, { count: number; totalConfidence: number }>();

    for (const vote of votes) {
      const existing = outcomeCounts.get(vote.outcome) ?? { count: 0, totalConfidence: 0 };
      outcomeCounts.set(vote.outcome, {
        count: existing.count + 1,
        totalConfidence: existing.totalConfidence + vote.confidence,
      });
    }

    let bestOutcome = "";
    let bestCount = 0;
    let bestConfidence = 0;

    for (const [outcome, data] of outcomeCounts) {
      if (data.count > bestCount || (data.count === bestCount && data.totalConfidence > bestConfidence)) {
        bestOutcome = outcome;
        bestCount = data.count;
        bestConfidence = data.totalConfidence;
      }
    }

    return {
      outcome: bestOutcome,
      avgConfidence: Math.round(bestConfidence / bestCount),
    };
  }

  // ==========================================================================
  // RESOLUTION
  // ==========================================================================

  async resolveWar(warId: string): Promise<SquadWar> {
    const war = await this.getWar(warId);
    if (!war) {
      throw new Error("War not found");
    }

    if (war.status !== "active" && war.status !== "awaiting_results") {
      throw new Error(`Cannot resolve war in ${war.status} status`);
    }

    // Resolve each round
    let challengerScore = 0;
    let defenderScore = 0;
    const mvpCandidates: Map<string, { correct: number; total: number }> = new Map();

    for (let i = 0; i < war.rounds.length; i++) {
      const round = war.rounds[i];
      const market = war.markets[i];

      if (!market.outcome) {
        // Get market outcome
        const marketData = await this.db.query<{ outcome?: string }>("predictionMarkets:get", {
          marketId: market.marketId,
        });
        if (!marketData?.outcome) {
          continue; // Market not yet resolved
        }
        market.outcome = marketData.outcome;
      }

      // Determine round winner
      let roundWinnerId: string | undefined;

      if (round.challengerPrediction?.outcome === market.outcome) {
        challengerScore++;
        roundWinnerId = war.challengerSquadId;
      }

      if (round.defenderPrediction?.outcome === market.outcome) {
        defenderScore++;
        if (roundWinnerId) {
          roundWinnerId = undefined; // Both correct = tie
        } else {
          roundWinnerId = war.defenderSquadId;
        }
      }

      // Track MVP candidates
      for (const vote of round.challengerVotes) {
        const stats = mvpCandidates.get(vote.userId) ?? { correct: 0, total: 0 };
        stats.total++;
        if (vote.outcome === market.outcome) stats.correct++;
        mvpCandidates.set(vote.userId, stats);
      }

      for (const vote of round.defenderVotes) {
        const stats = mvpCandidates.get(vote.userId) ?? { correct: 0, total: 0 };
        stats.total++;
        if (vote.outcome === market.outcome) stats.correct++;
        mvpCandidates.set(vote.userId, stats);
      }

      // Update round
      await this.db.mutation("squadWars:updateRound", {
        warId,
        roundNumber: i + 1,
        winnerId: roundWinnerId,
        status: "resolved",
        resolvedAt: Date.now(),
      });

      this.events.emit("squad", {
        type: "round_resolved",
        warId,
        roundNumber: i + 1,
        winnerId: roundWinnerId,
      });
    }

    // Determine overall winner
    let winnerSquadId: string | undefined;
    let isTie = false;

    if (challengerScore > defenderScore) {
      winnerSquadId = war.challengerSquadId;
    } else if (defenderScore > challengerScore) {
      winnerSquadId = war.defenderSquadId;
    } else {
      isTie = true;
    }

    // Determine MVP
    let mvpUserId: string | undefined;
    let mvpStats: { correctPredictions: number; totalPredictions: number; accuracy: number } | undefined;

    let bestAccuracy = 0;
    for (const [userId, stats] of mvpCandidates) {
      const accuracy = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
      if (accuracy > bestAccuracy || (accuracy === bestAccuracy && stats.total > (mvpStats?.totalPredictions ?? 0))) {
        bestAccuracy = accuracy;
        mvpUserId = userId;
        mvpStats = {
          correctPredictions: stats.correct,
          totalPredictions: stats.total,
          accuracy: Math.round(accuracy),
        };
      }
    }

    // Update war
    const resolvedWar = await this.db.mutation<SquadWar>("squadWars:update", {
      warId,
      updates: {
        status: "resolved",
        challengerScore,
        defenderScore,
        winnerSquadId,
        isTie,
        mvpUserId,
        mvpStats,
        resolvedAt: Date.now(),
      },
    });

    // Distribute rewards
    await this.distributeWarRewards(resolvedWar);

    // Update squad stats
    await this.updateSquadStats(resolvedWar);

    this.events.emit("squad", {
      type: "war_resolved",
      war: resolvedWar,
    });

    this.logger.info("Squad war resolved", {
      warId,
      winnerSquadId,
      isTie,
      challengerScore,
      defenderScore,
    });

    return resolvedWar;
  }

  private async distributeWarRewards(war: SquadWar): Promise<void> {
    if (war.type !== "cash" || war.stakePerSquad === 0) {
      await this.db.mutation("squadWars:update", {
        warId: war.id,
        updates: { status: "completed", completedAt: Date.now() },
      });
      return;
    }

    const platformFee = war.totalPot * (this.config.platformFeePercent / 100);
    const winnerPayout = war.totalPot - platformFee;

    if (war.isTie) {
      // Refund both squads (minus small fee)
      const refundAmount = war.stakePerSquad * 0.99;
      await Promise.all([
        this.releasePoolFunds(war.challengerSquadId, refundAmount),
        this.releasePoolFunds(war.defenderSquadId!, refundAmount),
      ]);
    } else if (war.winnerSquadId) {
      await this.releasePoolFunds(war.winnerSquadId, winnerPayout);
    }

    await this.db.mutation("squadWars:update", {
      warId: war.id,
      updates: { status: "completed", completedAt: Date.now() },
    });
  }

  private async updateSquadStats(war: SquadWar): Promise<void> {
    // Update challenger stats
    await this.db.mutation("squads:updateWarStats", {
      squadId: war.challengerSquadId,
      isWin: war.winnerSquadId === war.challengerSquadId,
      isLoss: war.winnerSquadId === war.defenderSquadId,
      isTie: war.isTie,
      earnings: war.winnerSquadId === war.challengerSquadId
        ? war.totalPot - war.stakePerSquad
        : war.isTie
        ? 0
        : -war.stakePerSquad,
    });

    // Update defender stats
    if (war.defenderSquadId) {
      await this.db.mutation("squads:updateWarStats", {
        squadId: war.defenderSquadId,
        isWin: war.winnerSquadId === war.defenderSquadId,
        isLoss: war.winnerSquadId === war.challengerSquadId,
        isTie: war.isTie,
        earnings: war.winnerSquadId === war.defenderSquadId
          ? war.totalPot - war.stakePerSquad
          : war.isTie
          ? 0
          : -war.stakePerSquad,
      });
    }

    // Update MVP count
    if (war.mvpUserId) {
      const mvpMember = await this.getSquadMember(
        war.winnerSquadId ?? war.challengerSquadId,
        war.mvpUserId
      );
      if (mvpMember) {
        await this.db.mutation("squadMembers:incrementMvp", {
          squadId: mvpMember.squadId,
          userId: war.mvpUserId,
        });
      }
    }
  }

  // ==========================================================================
  // RETRIEVAL
  // ==========================================================================

  async getWar(warId: string): Promise<SquadWar | null> {
    return await this.db.query<SquadWar | null>("squadWars:get", { warId });
  }

  async getWars(request: GetWarsRequest): Promise<GetWarsResponse> {
    const result = await this.db.query<{ wars: SquadWar[]; nextCursor?: string }>(
      "squadWars:list",
      request
    );

    return {
      wars: result.wars,
      nextCursor: result.nextCursor,
      hasMore: !!result.nextCursor,
    };
  }

  async getSquadWars(squadId: string, status?: WarStatus[]): Promise<SquadWar[]> {
    return await this.db.query<SquadWar[]>("squadWars:getBySquad", {
      squadId,
      status,
    });
  }

  private async getActiveWarCount(squadId: string): Promise<number> {
    const activeStatuses: WarStatus[] = [
      "pending",
      "matching",
      "matched",
      "preparation",
      "active",
      "voting",
      "awaiting_results",
    ];

    const wars = await this.getSquadWars(squadId, activeStatuses);
    return wars.length;
  }

  // ==========================================================================
  // CHAT
  // ==========================================================================

  async sendWarMessage(
    userId: string,
    warId: string,
    message: string
  ): Promise<SquadWarMessage> {
    const war = await this.getWar(warId);
    if (!war) {
      throw new Error("War not found");
    }

    if (!war.chatEnabled) {
      throw new Error("Chat is disabled for this war");
    }

    // Get user's squad
    const challengerMember = await this.getSquadMember(war.challengerSquadId, userId);
    const defenderMember = war.defenderSquadId
      ? await this.getSquadMember(war.defenderSquadId, userId)
      : null;

    let squadId: string;
    if (challengerMember?.status === "active") {
      squadId = war.challengerSquadId;
    } else if (defenderMember?.status === "active") {
      squadId = war.defenderSquadId!;
    } else {
      throw new Error("You are not a member of either squad");
    }

    const chatMessage: SquadWarMessage = {
      id: this.generateId(),
      warId,
      squadId,
      userId,
      message,
      isSystem: false,
      createdAt: Date.now(),
    };

    await this.db.mutation("squadWarChat:send", { message: chatMessage });

    this.events.emit("squad", {
      type: "war_chat",
      message: chatMessage,
    });

    return chatMessage;
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private initializeRounds(
    markets: Array<{ id: string; ticker: string; title: string; closeTime: number }>,
    roundCount: number
  ): WarRound[] {
    return Array.from({ length: roundCount }, (_, i) => {
      const market = markets[i % markets.length];
      return {
        roundNumber: i + 1,
        marketId: market.id,
        marketTitle: market.title,
        status: "pending" as const,
        challengerVotes: [],
        defenderVotes: [],
      };
    });
  }

  private async getSquad(squadId: string): Promise<Squad | null> {
    return await this.db.query<Squad | null>("squads:get", { squadId });
  }

  private async getSquadMember(
    squadId: string,
    userId: string
  ): Promise<SquadMember | null> {
    return await this.db.query<SquadMember | null>("squadMembers:getByUser", {
      squadId,
      userId,
    });
  }

  private async getMarkets(
    marketIds: string[]
  ): Promise<Array<{ id: string; ticker: string; title: string; closeTime: number }>> {
    return await this.db.query("predictionMarkets:getMany", { marketIds });
  }

  private async holdPoolFunds(squadId: string, amount: number): Promise<void> {
    await this.db.mutation("squads:holdPoolFunds", { squadId, amount });
  }

  private async releasePoolFunds(squadId: string, amount: number): Promise<void> {
    await this.db.mutation("squads:releasePoolFunds", { squadId, amount });
  }

  private async notifyWarChallenge(
    warId: string,
    challengerSquadId: string,
    defenderSquadId: string
  ): Promise<void> {
    const defenderSquad = await this.getSquad(defenderSquadId);
    if (!defenderSquad) return;

    await this.db.mutation("notifications:create", {
      userId: defenderSquad.captainId,
      type: "war_challenge",
      title: "Squad War Challenge!",
      body: "Another squad has challenged your squad to war!",
      data: { warId, challengerSquadId },
      createdAt: Date.now(),
    });
  }

  private async notifyWarAccepted(war: SquadWar): Promise<void> {
    // Notify all members of both squads
    const challengerSquad = await this.getSquad(war.challengerSquadId);
    const defenderSquad = war.defenderSquadId
      ? await this.getSquad(war.defenderSquadId)
      : null;

    const allMembers = [
      ...(challengerSquad?.members ?? []),
      ...(defenderSquad?.members ?? []),
    ];

    for (const member of allMembers) {
      if (member.status !== "active") continue;

      await this.db.mutation("notifications:create", {
        userId: member.userId,
        type: "war_starting",
        title: "Squad War Starting!",
        body: `War begins at ${new Date(war.startsAt!).toLocaleTimeString()}`,
        data: { warId: war.id },
        createdAt: Date.now(),
      });
    }
  }

  private generateId(): string {
    return `war_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let serviceInstance: SquadWarsService | null = null;

export function getSquadWarsService(
  db: ConvexClient,
  events: EventEmitter
): SquadWarsService {
  if (!serviceInstance) {
    serviceInstance = new SquadWarsService(db, events);
  }
  return serviceInstance;
}

export function createSquadWarsService(
  db: ConvexClient,
  events: EventEmitter,
  config?: Partial<SquadWarsConfig>
): SquadWarsService {
  return new SquadWarsService(db, events, config);
}
