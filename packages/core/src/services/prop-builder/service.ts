/**
 * Prop Builder Service
 * Create and manage user-generated proposition bets
 */

import {
  UserProp,
  PropStatus,
  PropType,
  PropCategory,
  PropOutcome,
  PropBet,
  PropCreatorProfile,
  PropResolution,
  PropDispute,
  CreatePropParams,
  UpdatePropParams,
  PlacePropBetParams,
  VoteOnPropParams,
  ModeratePropParams,
  ResolvePropParams,
  DisputeResolutionParams,
  GetPropsParams,
  CommunityVote,
  ModerationAction,
  PROP_CREATOR_TIERS,
  PROP_DEFAULTS,
} from "./types";
import { PropModerationService, propModerationService, contentFilter } from "./moderation";
import { PropResolutionService, propResolutionService, BetPayout } from "./resolution";

// ============================================================================
// Configuration
// ============================================================================

export interface PropBuilderServiceConfig {
  enableAutoModeration: boolean;
  enableCommunityVoting: boolean;
  minVotesForApproval: number;
  approvalThreshold: number;
  platformFeePercent: number;
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

const DEFAULT_CONFIG: PropBuilderServiceConfig = {
  enableAutoModeration: true,
  enableCommunityVoting: true,
  minVotesForApproval: PROP_DEFAULTS.minVotesForApproval,
  approvalThreshold: PROP_DEFAULTS.approvalThreshold,
  platformFeePercent: PROP_DEFAULTS.platformFeePercent,
};

// ============================================================================
// Prop Builder Service
// ============================================================================

export class PropBuilderService {
  private readonly config: PropBuilderServiceConfig;
  private readonly db: ConvexClient;
  private readonly logger: Logger;
  private readonly moderationService: PropModerationService;
  private readonly resolutionService: PropResolutionService;

  constructor(db: ConvexClient, config?: Partial<PropBuilderServiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = db;
    this.logger = config?.logger ?? this.createDefaultLogger();
    this.moderationService = propModerationService;
    this.resolutionService = propResolutionService;
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[PropBuilder] ${msg}`, meta),
      info: (msg, meta) => console.info(`[PropBuilder] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[PropBuilder] ${msg}`, meta),
      error: (msg, meta) => console.error(`[PropBuilder] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // Prop Creation
  // ==========================================================================

  /**
   * Create a new prop
   */
  async createProp(params: CreatePropParams): Promise<UserProp> {
    const { creatorId, outcomes, ...propData } = params;

    // Get creator profile
    const creator = await this.getOrCreateCreatorProfile(creatorId);

    // Check creator limits
    if (creator.activeProps >= creator.maxActiveProps) {
      throw new Error(`Maximum active props (${creator.maxActiveProps}) reached`);
    }

    // Validate content
    const validation = contentFilter.validateProp({
      title: propData.title,
      description: propData.description,
      resolutionCriteria: propData.resolutionCriteria,
      outcomes: outcomes.map(o => ({ ...o, id: "", propId: "", currentOdds: o.initialOdds, impliedProbability: 0, totalBets: 0, totalVolume: 0 })),
      bettingCloses: propData.bettingCloses,
      resolutionDeadline: propData.resolutionDeadline,
    });

    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
    }

    const now = Date.now();
    const propId = `prop_${now}_${creatorId}`;

    // Create outcomes
    const propOutcomes: PropOutcome[] = outcomes.map((o, index) => ({
      id: `out_${propId}_${index}`,
      propId,
      label: o.label,
      description: o.description,
      initialOdds: o.initialOdds,
      currentOdds: o.initialOdds,
      impliedProbability: 1 / o.initialOdds,
      totalBets: 0,
      totalVolume: 0,
    }));

    // Get creator username
    const user = await this.db.query<{ username: string } | null>(
      "users:getById",
      { id: creatorId }
    );

    const prop: UserProp = {
      id: propId,
      creatorId,
      creatorUsername: user?.username || "anonymous",
      title: propData.title,
      description: propData.description,
      category: propData.category,
      subcategory: propData.subcategory,
      tags: propData.tags || [],
      imageUrl: propData.imageUrl,
      type: propData.type,
      outcomes: propOutcomes,
      status: "pending_review",
      resolutionCriteria: propData.resolutionCriteria,
      resolutionSource: propData.resolutionSource,
      resolutionSourceUrl: propData.resolutionSourceUrl,
      resolutionDeadline: propData.resolutionDeadline,
      bettingOpens: propData.bettingOpens,
      bettingCloses: propData.bettingCloses,
      eventTime: propData.eventTime,
      minBet: propData.minBet ?? PROP_DEFAULTS.minBet,
      maxBet: Math.min(propData.maxBet ?? PROP_DEFAULTS.maxBet, creator.maxSinglePropLiquidity),
      maxTotalLiquidity: Math.min(
        propData.maxTotalLiquidity ?? PROP_DEFAULTS.maxTotalLiquidity,
        creator.maxSinglePropLiquidity
      ),
      currentLiquidity: 0,
      communityVotes: [],
      totalVotes: 0,
      approvalPercent: 0,
      viewCount: 0,
      uniqueBettors: 0,
      creatorFeePercent: creator.creatorFeeRate,
      creatorEarnings: 0,
      platformFeePercent: this.config.platformFeePercent,
      moderationStatus: "pending",
      flagCount: 0,
      flagReasons: [],
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };

    // Save prop
    await this.db.mutation("userProps:create", {
      ...prop,
      createdAt: now,
      updatedAt: now,
      bettingOpens: propData.bettingOpens.getTime(),
      bettingCloses: propData.bettingCloses.getTime(),
      resolutionDeadline: propData.resolutionDeadline.getTime(),
      eventTime: propData.eventTime?.getTime(),
    });

    // Run auto-moderation if enabled
    if (this.config.enableAutoModeration) {
      const autoResult = this.moderationService.autoModerate(prop);
      if (autoResult.action === "approve") {
        await this.approveProp(propId, "system");
      } else if (autoResult.action === "reject") {
        await this.rejectProp(propId, "system", autoResult.reason);
      }
    }

    this.logger.info("Prop created", {
      propId,
      creatorId,
      title: propData.title,
    });

    return prop;
  }

  /**
   * Update prop (before approval only)
   */
  async updateProp(params: UpdatePropParams): Promise<UserProp> {
    const { propId, ...updates } = params;

    const prop = await this.getProp(propId);
    if (!prop) {
      throw new Error("Prop not found");
    }

    if (!["draft", "pending_review"].includes(prop.status)) {
      throw new Error("Cannot update prop after approval");
    }

    const now = Date.now();

    await this.db.mutation("userProps:update", {
      id: propId,
      ...updates,
      bettingCloses: updates.bettingCloses?.getTime(),
      updatedAt: now,
    });

    return {
      ...prop,
      ...updates,
      updatedAt: new Date(now),
    };
  }

  // ==========================================================================
  // Betting
  // ==========================================================================

  /**
   * Place a bet on a prop
   */
  async placeBet(params: PlacePropBetParams): Promise<PropBet> {
    const { userId, propId, outcomeId, amount } = params;

    const prop = await this.getProp(propId);
    if (!prop) {
      throw new Error("Prop not found");
    }

    // Validate betting window
    const now = new Date();
    if (now < prop.bettingOpens) {
      throw new Error("Betting has not opened yet");
    }
    if (now > prop.bettingCloses) {
      throw new Error("Betting has closed");
    }
    if (prop.status !== "active") {
      throw new Error("Prop is not active");
    }

    // Validate amount
    if (amount < prop.minBet) {
      throw new Error(`Minimum bet is $${prop.minBet}`);
    }
    if (amount > prop.maxBet) {
      throw new Error(`Maximum bet is $${prop.maxBet}`);
    }
    if (prop.currentLiquidity + amount > prop.maxTotalLiquidity) {
      throw new Error("Would exceed prop liquidity limit");
    }

    // Validate outcome
    const outcome = prop.outcomes.find(o => o.id === outcomeId);
    if (!outcome) {
      throw new Error("Invalid outcome");
    }

    // Check user balance
    const balance = await this.db.query<{ available: number } | null>(
      "balances:getByUserAsset",
      { userId, assetType: "usd", assetId: "usd" }
    );

    if (!balance || balance.available < amount) {
      throw new Error("Insufficient balance");
    }

    // Deduct from balance
    await this.db.mutation("balances:debit", {
      userId,
      assetType: "usd",
      assetId: "usd",
      amount,
      reason: "prop_bet",
      referenceId: propId,
    });

    // Calculate potential payout
    const potentialPayout = amount * outcome.currentOdds;

    const bet: PropBet = {
      id: `bet_${Date.now()}_${userId}`,
      propId,
      userId,
      outcomeId,
      amount,
      odds: outcome.currentOdds,
      potentialPayout,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Save bet
    await this.db.mutation("propBets:create", {
      ...bet,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Update prop liquidity and outcome volume
    await this.db.mutation("userProps:incrementLiquidity", {
      id: propId,
      amount,
      outcomeId,
    });

    // Update odds based on new liquidity distribution
    await this.updateOdds(propId);

    this.logger.info("Prop bet placed", {
      betId: bet.id,
      propId,
      userId,
      amount,
      outcomeId,
    });

    return bet;
  }

  /**
   * Update odds based on current betting distribution
   */
  private async updateOdds(propId: string): Promise<void> {
    const prop = await this.getProp(propId);
    if (!prop) return;

    const totalVolume = prop.outcomes.reduce((sum, o) => sum + o.totalVolume, 0);
    if (totalVolume === 0) return;

    const updatedOutcomes = prop.outcomes.map(outcome => {
      const proportion = outcome.totalVolume / totalVolume;
      // Simple odds calculation based on proportion
      // Higher volume on an outcome = lower odds
      const impliedProbability = proportion > 0 ? proportion : 0.1;
      const newOdds = Math.max(1.01, 1 / impliedProbability);

      return {
        ...outcome,
        currentOdds: Math.round(newOdds * 100) / 100,
        impliedProbability,
      };
    });

    await this.db.mutation("userProps:updateOutcomes", {
      id: propId,
      outcomes: updatedOutcomes,
      updatedAt: Date.now(),
    });
  }

  // ==========================================================================
  // Community Voting
  // ==========================================================================

  /**
   * Vote on a prop
   */
  async voteOnProp(params: VoteOnPropParams): Promise<{
    newApprovalPercent: number;
    totalVotes: number;
    propStatus: PropStatus;
  }> {
    const { userId, propId, vote, reason } = params;

    const prop = await this.getProp(propId);
    if (!prop) {
      throw new Error("Prop not found");
    }

    if (prop.status !== "pending_review") {
      throw new Error("Prop is not accepting votes");
    }

    // Check if user already voted
    const existingVote = prop.communityVotes.find(v => v.userId === userId);
    if (existingVote) {
      throw new Error("Already voted on this prop");
    }

    const newVote: CommunityVote = {
      userId,
      vote,
      reason,
      votedAt: new Date(),
    };

    // Process vote
    const result = this.moderationService.processVote(prop, newVote);

    // Save vote
    await this.db.mutation("userProps:addVote", {
      id: propId,
      vote: {
        ...newVote,
        votedAt: Date.now(),
      },
      approvalPercent: result.newApprovalPercent,
      totalVotes: result.totalVotes,
      updatedAt: Date.now(),
    });

    // Check for auto-approval/rejection
    let newStatus = prop.status;
    if (result.recommendedAction === "approve" && this.config.enableAutoModeration) {
      await this.approveProp(propId, "community");
      newStatus = "approved";
    } else if (result.recommendedAction === "reject" && this.config.enableAutoModeration) {
      await this.rejectProp(propId, "community", "Community rejection threshold reached");
      newStatus = "rejected";
    }

    this.logger.info("Prop vote recorded", {
      propId,
      userId,
      vote,
      newApprovalPercent: result.newApprovalPercent,
    });

    return {
      newApprovalPercent: result.newApprovalPercent,
      totalVotes: result.totalVotes,
      propStatus: newStatus,
    };
  }

  // ==========================================================================
  // Moderation
  // ==========================================================================

  /**
   * Moderate a prop
   */
  async moderateProp(params: ModeratePropParams): Promise<ModerationAction> {
    const { moderatorId, propId, action, reason, changes } = params;

    const prop = await this.getProp(propId);
    if (!prop) {
      throw new Error("Prop not found");
    }

    // Validate action
    const validation = this.moderationService.validateAction(prop, action);
    if (!validation.valid) {
      throw new Error(validation.reason);
    }

    const newStatus = this.moderationService.getNewStatus(prop.status, action);
    const now = Date.now();

    const moderationAction: ModerationAction = {
      id: `mod_${now}_${propId}`,
      propId,
      moderatorId,
      action,
      reason,
      previousStatus: prop.status,
      newStatus,
      changes,
      createdAt: new Date(now),
    };

    // Save moderation action
    await this.db.mutation("propModerationActions:create", {
      ...moderationAction,
      createdAt: now,
    });

    // Update prop status
    await this.db.mutation("userProps:update", {
      id: propId,
      status: newStatus,
      moderationStatus: this.moderationService.getModerationStatus(newStatus),
      moderatedBy: moderatorId,
      moderatedAt: now,
      moderationNotes: reason,
      updatedAt: now,
    });

    // If approved, publish the prop
    if (action === "approve") {
      await this.db.mutation("userProps:update", {
        id: propId,
        status: "active",
        publishedAt: now,
      });
    }

    this.logger.info("Prop moderated", {
      propId,
      moderatorId,
      action,
      previousStatus: prop.status,
      newStatus,
    });

    return moderationAction;
  }

  private async approveProp(propId: string, approvedBy: string): Promise<void> {
    const now = Date.now();
    await this.db.mutation("userProps:update", {
      id: propId,
      status: "active",
      moderationStatus: "approved",
      moderatedBy: approvedBy,
      moderatedAt: now,
      publishedAt: now,
      updatedAt: now,
    });
  }

  private async rejectProp(propId: string, rejectedBy: string, reason: string): Promise<void> {
    await this.db.mutation("userProps:update", {
      id: propId,
      status: "rejected",
      moderationStatus: "rejected",
      moderatedBy: rejectedBy,
      moderatedAt: Date.now(),
      moderationNotes: reason,
      updatedAt: Date.now(),
    });
  }

  // ==========================================================================
  // Resolution
  // ==========================================================================

  /**
   * Resolve a prop
   */
  async resolveProp(params: ResolvePropParams): Promise<PropResolution> {
    const { propId, winningOutcomeId, source, evidence, resolvedBy } = params;

    const prop = await this.getProp(propId);
    if (!prop) {
      throw new Error("Prop not found");
    }

    if (!["active", "closed"].includes(prop.status)) {
      throw new Error("Prop cannot be resolved in current state");
    }

    // Validate evidence
    const evidenceValidation = this.resolutionService.validateEvidence(
      evidence.map(e => ({ ...e, verifiedAt: new Date() }))
    );
    if (!evidenceValidation.valid) {
      throw new Error(`Evidence validation failed: ${evidenceValidation.issues.join(", ")}`);
    }

    // Validate outcome
    const outcome = prop.outcomes.find(o => o.id === winningOutcomeId);
    if (!outcome) {
      throw new Error("Invalid winning outcome");
    }

    // Create resolution
    const resolution = this.resolutionService.createResolution({
      propId,
      winningOutcomeId,
      source,
      evidence: evidence.map(e => ({ ...e, verifiedAt: new Date() })),
      resolvedBy,
    });

    // Save resolution
    await this.db.mutation("propResolutions:create", {
      ...resolution,
      resolvedAt: resolution.resolvedAt.getTime(),
      disputeWindow: resolution.disputeWindow.getTime(),
    });

    // Update prop status
    await this.db.mutation("userProps:update", {
      id: propId,
      status: "settling",
      winningOutcomeId,
      updatedAt: Date.now(),
    });

    this.logger.info("Prop resolved", {
      propId,
      winningOutcomeId,
      source,
      resolvedBy,
    });

    return resolution;
  }

  /**
   * Settle a prop (distribute payouts)
   */
  async settleProp(propId: string): Promise<{
    settled: boolean;
    payouts: BetPayout[];
    creatorEarnings: number;
  }> {
    const prop = await this.getProp(propId);
    if (!prop) {
      throw new Error("Prop not found");
    }

    const resolution = await this.db.query<PropResolution | null>(
      "propResolutions:getByPropId",
      { propId }
    );
    if (!resolution) {
      throw new Error("No resolution found");
    }

    // Check if can settle
    const canSettle = this.resolutionService.canSettle(prop, resolution);
    if (!canSettle.canSettle) {
      throw new Error(canSettle.reason);
    }

    // Get all bets
    const bets = await this.db.query<PropBet[]>("propBets:getByPropId", { propId });

    // Calculate payouts
    const payoutResult = this.resolutionService.calculatePayouts(prop, resolution, bets);

    // Process payouts
    for (const payout of payoutResult.payouts) {
      if (payout.payout > 0) {
        await this.db.mutation("balances:credit", {
          userId: payout.userId,
          assetType: "usd",
          assetId: "usd",
          amount: payout.payout,
          reason: "prop_payout",
          referenceId: propId,
        });
      }

      // Update bet status
      await this.db.mutation("propBets:update", {
        id: payout.betId,
        status: payout.payout > 0 ? "won" : "lost",
        settledAt: Date.now(),
        payoutAmount: payout.payout,
        creatorFee: payout.creatorFee,
        platformFee: payout.platformFee,
      });
    }

    // Credit creator earnings
    if (payoutResult.creatorEarnings > 0) {
      await this.db.mutation("balances:credit", {
        userId: prop.creatorId,
        assetType: "usd",
        assetId: "usd",
        amount: payoutResult.creatorEarnings,
        reason: "prop_creator_fee",
        referenceId: propId,
      });

      // Update creator profile
      await this.db.mutation("propCreatorProfiles:addEarnings", {
        userId: prop.creatorId,
        amount: payoutResult.creatorEarnings,
      });
    }

    // Update prop status
    const now = Date.now();
    await this.db.mutation("userProps:update", {
      id: propId,
      status: "settled",
      creatorEarnings: payoutResult.creatorEarnings,
      settledAt: now,
      updatedAt: now,
    });

    // Finalize resolution
    await this.db.mutation("propResolutions:update", {
      id: resolution.id,
      finalizedAt: now,
    });

    this.logger.info("Prop settled", {
      propId,
      totalPayouts: payoutResult.totalPayout,
      creatorEarnings: payoutResult.creatorEarnings,
      betsProcessed: payoutResult.payouts.length,
    });

    return {
      settled: true,
      payouts: payoutResult.payouts,
      creatorEarnings: payoutResult.creatorEarnings,
    };
  }

  /**
   * Dispute a resolution
   */
  async disputeResolution(params: DisputeResolutionParams): Promise<PropDispute> {
    const { userId, propId, claimedOutcomeId, reason, evidence } = params;

    const prop = await this.getProp(propId);
    if (!prop) {
      throw new Error("Prop not found");
    }

    const resolution = await this.db.query<PropResolution | null>(
      "propResolutions:getByPropId",
      { propId }
    );
    if (!resolution) {
      throw new Error("No resolution found to dispute");
    }

    // Get user's bets
    const userBets = await this.db.query<PropBet[]>("propBets:getByUserAndProp", {
      userId,
      propId,
    });

    // Validate eligibility
    const eligibility = this.resolutionService.validateDisputeEligibility(
      prop,
      resolution,
      userId,
      userBets
    );
    if (!eligibility.eligible) {
      throw new Error(eligibility.reason);
    }

    // Create dispute
    const dispute = this.resolutionService.createDispute({
      propId,
      resolutionId: resolution.id,
      disputerId: userId,
      claimedOutcomeId,
      reason,
      evidence: evidence.map(e => ({ ...e, verifiedAt: new Date() })),
    });

    // Save dispute
    await this.db.mutation("propDisputes:create", {
      ...dispute,
      createdAt: dispute.createdAt.getTime(),
    });

    // Increment resolution dispute count
    await this.db.mutation("propResolutions:incrementDisputeCount", {
      id: resolution.id,
    });

    // Update prop status
    await this.db.mutation("userProps:update", {
      id: propId,
      status: "disputed",
      updatedAt: Date.now(),
    });

    this.logger.info("Resolution disputed", {
      disputeId: dispute.id,
      propId,
      userId,
      claimedOutcomeId,
    });

    return dispute;
  }

  // ==========================================================================
  // Queries
  // ==========================================================================

  /**
   * Get prop by ID
   */
  async getProp(propId: string): Promise<UserProp | null> {
    return await this.db.query<UserProp | null>("userProps:getById", { id: propId });
  }

  /**
   * Get props with filters
   */
  async getProps(params: GetPropsParams): Promise<{
    props: UserProp[];
    total: number;
    hasMore: boolean;
  }> {
    const { limit = 50, offset = 0, ...filters } = params;

    const result = await this.db.query<{ props: UserProp[]; total: number }>(
      "userProps:list",
      { ...filters, limit, offset }
    );

    return {
      props: result.props,
      total: result.total,
      hasMore: offset + limit < result.total,
    };
  }

  /**
   * Get or create creator profile
   */
  async getOrCreateCreatorProfile(userId: string): Promise<PropCreatorProfile> {
    let profile = await this.db.query<PropCreatorProfile | null>(
      "propCreatorProfiles:getByUserId",
      { userId }
    );

    if (!profile) {
      const user = await this.db.query<{ username: string; displayName: string; avatarUrl?: string } | null>(
        "users:getById",
        { id: userId }
      );

      const tierConfig = PROP_CREATOR_TIERS.new;
      profile = {
        userId,
        username: user?.username || "anonymous",
        displayName: user?.displayName || "Anonymous",
        avatarUrl: user?.avatarUrl,
        totalPropsCreated: 0,
        activeProps: 0,
        settledProps: 0,
        approvalRate: 0,
        accuracyRate: 0,
        totalVolume: 0,
        totalEarnings: 0,
        reputationScore: 0,
        verifiedCreator: false,
        creatorTier: "new",
        badges: [],
        maxActiveProps: tierConfig.maxActiveProps,
        maxSinglePropLiquidity: tierConfig.maxSinglePropLiquidity,
        creatorFeeRate: tierConfig.creatorFeeRate,
        joinedAt: new Date(),
      };

      await this.db.mutation("propCreatorProfiles:create", {
        ...profile,
        joinedAt: Date.now(),
      });
    }

    return profile;
  }

  /**
   * Get user's bets on props
   */
  async getUserPropBets(userId: string, params?: {
    status?: PropBet["status"];
    limit?: number;
    offset?: number;
  }): Promise<{ bets: PropBet[]; total: number }> {
    return await this.db.query("propBets:getByUser", {
      userId,
      ...params,
    });
  }
}

export default PropBuilderService;
