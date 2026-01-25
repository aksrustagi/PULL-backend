/**
 * VIP Tiers Service
 * Manage user VIP status, tiers, and cashback
 */

import {
  VIPTier,
  UserVIPStatus,
  VIPProgress,
  CashbackTransaction,
  CashbackSummary,
  TierChange,
  TierReview,
  VIPEvent,
  VIPEventRegistration,
  VIP_TIER_CONFIGS,
  VIP_TIER_ORDER,
  CalculateTierParams,
  UpgradeTierParams,
  ProcessCashbackParams,
  GetVIPStatusParams,
  GetCashbackHistoryParams,
  RegisterForEventParams,
} from "./types";
import { VIPBenefitsCalculator, vipBenefitsCalculator } from "./benefits";

// ============================================================================
// Configuration
// ============================================================================

export interface VIPServiceConfig {
  gracePeriodDays: number;
  reviewPeriodDays: number;
  cashbackCreditDelayHours: number;
  cashbackExpirationDays: number;
  minimumCashbackAmount: number;
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

const DEFAULT_CONFIG: VIPServiceConfig = {
  gracePeriodDays: 30,
  reviewPeriodDays: 30,
  cashbackCreditDelayHours: 24,
  cashbackExpirationDays: 90,
  minimumCashbackAmount: 0.01,
};

// ============================================================================
// VIP Service
// ============================================================================

export class VIPService {
  private readonly config: VIPServiceConfig;
  private readonly db: ConvexClient;
  private readonly logger: Logger;
  private readonly benefitsCalculator: VIPBenefitsCalculator;

  constructor(db: ConvexClient, config?: Partial<VIPServiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = db;
    this.logger = config?.logger ?? this.createDefaultLogger();
    this.benefitsCalculator = vipBenefitsCalculator;
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[VIP] ${msg}`, meta),
      info: (msg, meta) => console.info(`[VIP] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[VIP] ${msg}`, meta),
      error: (msg, meta) => console.error(`[VIP] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // VIP Status Management
  // ==========================================================================

  /**
   * Get user's VIP status
   */
  async getVIPStatus(params: GetVIPStatusParams): Promise<UserVIPStatus> {
    const { userId, includeHistory } = params;

    // Get user's VIP record
    const vipRecord = await this.db.query<{
      currentTier: VIPTier;
      previousTier?: VIPTier;
      lifetimeVolume: number;
      currentPeriodVolume: number;
      periodStartDate: number;
      periodEndDate: number;
      tierAchievedAt: number;
      tierExpiresAt?: number;
      gracePeriodEndsAt?: number;
    } | null>("vipStatus:getByUser", { userId });

    if (!vipRecord) {
      // Initialize new user at Bronze tier
      return this.initializeVIPStatus(userId);
    }

    const benefits = this.benefitsCalculator.getTierBenefits(vipRecord.currentTier);
    const progress = this.benefitsCalculator.getVolumeToNextTier(vipRecord.lifetimeVolume);
    const now = Date.now();
    const isGracePeriod = vipRecord.gracePeriodEndsAt
      ? now < vipRecord.gracePeriodEndsAt
      : false;

    return {
      userId,
      currentTier: vipRecord.currentTier,
      previousTier: vipRecord.previousTier,
      lifetimeVolume: vipRecord.lifetimeVolume,
      currentPeriodVolume: vipRecord.currentPeriodVolume,
      periodStartDate: new Date(vipRecord.periodStartDate),
      periodEndDate: new Date(vipRecord.periodEndDate),
      nextTier: progress.nextTier ?? undefined,
      volumeToNextTier: progress.volumeNeeded ?? undefined,
      percentToNextTier: progress.percentComplete,
      tierAchievedAt: new Date(vipRecord.tierAchievedAt),
      tierExpiresAt: vipRecord.tierExpiresAt ? new Date(vipRecord.tierExpiresAt) : undefined,
      benefits,
      isGracePeriod,
      gracePeriodEndsAt: vipRecord.gracePeriodEndsAt
        ? new Date(vipRecord.gracePeriodEndsAt)
        : undefined,
    };
  }

  /**
   * Initialize VIP status for new user
   */
  private async initializeVIPStatus(userId: string): Promise<UserVIPStatus> {
    const now = Date.now();
    const periodStart = now;
    const periodEnd = now + this.config.reviewPeriodDays * 24 * 60 * 60 * 1000;

    await this.db.mutation("vipStatus:create", {
      userId,
      currentTier: "bronze",
      lifetimeVolume: 0,
      currentPeriodVolume: 0,
      periodStartDate: periodStart,
      periodEndDate: periodEnd,
      tierAchievedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const benefits = this.benefitsCalculator.getTierBenefits("bronze");

    return {
      userId,
      currentTier: "bronze",
      lifetimeVolume: 0,
      currentPeriodVolume: 0,
      periodStartDate: new Date(periodStart),
      periodEndDate: new Date(periodEnd),
      nextTier: "silver",
      volumeToNextTier: 1000,
      percentToNextTier: 0,
      tierAchievedAt: new Date(now),
      benefits,
      isGracePeriod: false,
    };
  }

  /**
   * Get VIP progress details
   */
  async getVIPProgress(userId: string): Promise<VIPProgress> {
    const status = await this.getVIPStatus({ userId });
    const progress = this.benefitsCalculator.getVolumeToNextTier(status.lifetimeVolume);

    // Calculate weekly and monthly averages
    const volumeHistory = await this.db.query<{ volume: number; date: number }[]>(
      "vipVolumeHistory:getRecent",
      { userId, days: 30 }
    );

    const weeklyVolume = volumeHistory
      .filter(v => v.date > Date.now() - 7 * 24 * 60 * 60 * 1000)
      .reduce((sum, v) => sum + v.volume, 0);

    const monthlyVolume = volumeHistory.reduce((sum, v) => sum + v.volume, 0);

    // Project future tier based on current rate
    const weeklyAvg = weeklyVolume;
    const monthlyAvg = monthlyVolume / (volumeHistory.length / 30) || 0;
    let projectedTier = status.currentTier;
    let projectedDate: Date | undefined;

    if (progress.nextTier && progress.volumeNeeded && weeklyAvg > 0) {
      const weeksToNextTier = progress.volumeNeeded / weeklyAvg;
      projectedDate = new Date(Date.now() + weeksToNextTier * 7 * 24 * 60 * 60 * 1000);
      projectedTier = progress.nextTier;
    }

    return {
      currentTier: status.currentTier,
      currentVolume: status.lifetimeVolume,
      nextTier: progress.nextTier,
      nextTierThreshold: progress.nextTier
        ? VIP_TIER_CONFIGS[progress.nextTier].volumeThreshold
        : null,
      volumeNeeded: progress.volumeNeeded,
      percentComplete: progress.percentComplete,
      projectedTier,
      projectedDate,
      weeklyVolumeAvg: weeklyAvg,
      monthlyVolumeAvg: monthlyAvg,
    };
  }

  // ==========================================================================
  // Tier Calculation & Updates
  // ==========================================================================

  /**
   * Calculate and potentially update tier based on volume
   */
  async calculateAndUpdateTier(params: CalculateTierParams): Promise<{
    previousTier: VIPTier;
    newTier: VIPTier;
    changed: boolean;
    tierChange?: TierChange;
  }> {
    const { userId, volume, forceRecalculate } = params;
    const status = await this.getVIPStatus({ userId });
    const qualifyingTier = this.benefitsCalculator.calculateQualifyingTier(volume);

    // Check if tier should change
    const tierIndex = (tier: VIPTier) => VIP_TIER_ORDER.indexOf(tier);
    const currentIndex = tierIndex(status.currentTier);
    const qualifyingIndex = tierIndex(qualifyingTier);

    let newTier = status.currentTier;
    let changed = false;
    let tierChange: TierChange | undefined;

    if (qualifyingIndex > currentIndex) {
      // Upgrade
      newTier = qualifyingTier;
      changed = true;
      tierChange = await this.processTierChange(
        userId,
        status.currentTier,
        newTier,
        "upgrade",
        "volume_threshold",
        volume
      );
    } else if (qualifyingIndex < currentIndex && !status.isGracePeriod) {
      // Potential downgrade - check if grace period should start
      const shouldStartGrace = forceRecalculate !== true;

      if (shouldStartGrace) {
        // Start grace period instead of immediate downgrade
        await this.startGracePeriod(userId, status.currentTier, qualifyingTier);
      } else {
        // Immediate downgrade (e.g., after grace period)
        newTier = qualifyingTier;
        changed = true;
        tierChange = await this.processTierChange(
          userId,
          status.currentTier,
          newTier,
          "downgrade",
          "volume_threshold",
          volume
        );
      }
    }

    return {
      previousTier: status.currentTier,
      newTier,
      changed,
      tierChange,
    };
  }

  /**
   * Process tier change
   */
  private async processTierChange(
    userId: string,
    previousTier: VIPTier,
    newTier: VIPTier,
    changeType: "upgrade" | "downgrade" | "maintain",
    reason: "volume_threshold" | "manual_adjustment" | "promo" | "grace_period_end",
    volume: number
  ): Promise<TierChange> {
    const now = Date.now();

    // Create tier change record
    const tierChange: TierChange = {
      id: `tc_${now}_${userId}`,
      userId,
      previousTier,
      newTier,
      changeType,
      reason,
      volumeAtChange: volume,
      effectiveAt: new Date(now),
      createdAt: new Date(now),
    };

    await this.db.mutation("vipTierChanges:create", {
      ...tierChange,
      effectiveAt: now,
      createdAt: now,
    });

    // Update user's VIP status
    await this.db.mutation("vipStatus:update", {
      userId,
      currentTier: newTier,
      previousTier,
      tierAchievedAt: now,
      updatedAt: now,
    });

    // Send notification
    await this.sendTierChangeNotification(userId, previousTier, newTier, changeType);

    this.logger.info("Tier changed", {
      userId,
      previousTier,
      newTier,
      changeType,
      reason,
    });

    return tierChange;
  }

  /**
   * Start grace period for potential downgrade
   */
  private async startGracePeriod(
    userId: string,
    currentTier: VIPTier,
    qualifyingTier: VIPTier
  ): Promise<void> {
    const gracePeriodEndsAt = Date.now() + this.config.gracePeriodDays * 24 * 60 * 60 * 1000;

    await this.db.mutation("vipStatus:update", {
      userId,
      gracePeriodEndsAt,
      gracePeriodTargetTier: qualifyingTier,
      updatedAt: Date.now(),
    });

    // Send grace period warning notification
    await this.db.mutation("notifications:create", {
      userId,
      type: "vip_grace_period",
      title: "VIP Tier Grace Period Started",
      message: `Your trading volume has dropped below the ${currentTier} tier threshold. Maintain your tier by trading $${VIP_TIER_CONFIGS[currentTier].volumeThreshold.toLocaleString()} within the next ${this.config.gracePeriodDays} days.`,
      data: {
        currentTier,
        qualifyingTier,
        gracePeriodEndsAt,
      },
      createdAt: Date.now(),
    });

    this.logger.info("Grace period started", {
      userId,
      currentTier,
      qualifyingTier,
      gracePeriodEndsAt: new Date(gracePeriodEndsAt),
    });
  }

  /**
   * Manually upgrade tier (admin function)
   */
  async manualTierUpgrade(params: UpgradeTierParams): Promise<TierChange> {
    const { userId, newTier, reason, adminId, notes } = params;
    const status = await this.getVIPStatus({ userId });

    const tierChange = await this.processTierChange(
      userId,
      status.currentTier,
      newTier,
      "upgrade",
      reason,
      status.lifetimeVolume
    );

    // Log admin action
    await this.db.mutation("adminAuditLog:create", {
      action: "vip_tier_manual_upgrade",
      adminId,
      targetUserId: userId,
      previousValue: status.currentTier,
      newValue: newTier,
      notes,
      createdAt: Date.now(),
    });

    return tierChange;
  }

  // ==========================================================================
  // Cashback Processing
  // ==========================================================================

  /**
   * Process cashback for a trade
   */
  async processCashback(params: ProcessCashbackParams): Promise<CashbackTransaction> {
    const { userId, tradeId, tradingVolume } = params;
    const status = await this.getVIPStatus({ userId });

    const cashbackAmount = this.benefitsCalculator.calculateCashback(
      status.currentTier,
      tradingVolume
    );

    // Skip if below minimum
    if (cashbackAmount < this.config.minimumCashbackAmount) {
      return {
        id: `cb_${Date.now()}_${userId}`,
        userId,
        tier: status.currentTier,
        tradeId,
        tradingVolume,
        cashbackPercent: status.benefits.cashbackPercent,
        cashbackAmount: 0,
        status: "cancelled",
        createdAt: new Date(),
      };
    }

    const now = Date.now();
    const creditAt = now + this.config.cashbackCreditDelayHours * 60 * 60 * 1000;
    const expiresAt = now + this.config.cashbackExpirationDays * 24 * 60 * 60 * 1000;

    const transaction: CashbackTransaction = {
      id: `cb_${now}_${userId}`,
      userId,
      tier: status.currentTier,
      tradeId,
      tradingVolume,
      cashbackPercent: status.benefits.cashbackPercent,
      cashbackAmount,
      status: "pending",
      expiresAt: new Date(expiresAt),
      createdAt: new Date(now),
    };

    await this.db.mutation("vipCashback:create", {
      ...transaction,
      creditAt,
      expiresAt,
      createdAt: now,
    });

    // Update user's lifetime volume
    await this.db.mutation("vipStatus:incrementVolume", {
      userId,
      volume: tradingVolume,
      updatedAt: now,
    });

    // Check for tier upgrade
    await this.calculateAndUpdateTier({
      userId,
      volume: status.lifetimeVolume + tradingVolume,
    });

    this.logger.info("Cashback processed", {
      userId,
      tradeId,
      tradingVolume,
      cashbackAmount,
      tier: status.currentTier,
    });

    return transaction;
  }

  /**
   * Credit pending cashback
   */
  async creditPendingCashback(transactionId: string): Promise<CashbackTransaction> {
    const transaction = await this.db.query<CashbackTransaction>(
      "vipCashback:getById",
      { id: transactionId }
    );

    if (!transaction) {
      throw new Error("Cashback transaction not found");
    }

    if (transaction.status !== "pending") {
      throw new Error(`Cannot credit cashback with status: ${transaction.status}`);
    }

    const now = Date.now();

    // Credit to user's balance
    await this.db.mutation("balances:credit", {
      userId: transaction.userId,
      assetType: "usd",
      assetId: "usd",
      amount: transaction.cashbackAmount,
      reason: "vip_cashback",
      referenceId: transactionId,
    });

    // Update transaction status
    await this.db.mutation("vipCashback:update", {
      id: transactionId,
      status: "credited",
      creditedAt: now,
      updatedAt: now,
    });

    this.logger.info("Cashback credited", {
      transactionId,
      userId: transaction.userId,
      amount: transaction.cashbackAmount,
    });

    return {
      ...transaction,
      status: "credited",
      creditedAt: new Date(now),
    };
  }

  /**
   * Get cashback summary for user
   */
  async getCashbackSummary(params: GetCashbackHistoryParams): Promise<CashbackSummary> {
    const { userId, limit = 50, offset = 0, startDate, endDate } = params;

    const transactions = await this.db.query<CashbackTransaction[]>(
      "vipCashback:getByUser",
      {
        userId,
        limit,
        offset,
        startDate: startDate?.getTime(),
        endDate: endDate?.getTime(),
      }
    );

    const stats = await this.db.query<{
      totalEarned: number;
      totalPending: number;
      currentMonth: number;
      currentWeek: number;
      lifetimeVolume: number;
    }>("vipCashback:getStats", { userId });

    const avgPercent = transactions.length > 0
      ? transactions.reduce((sum, t) => sum + t.cashbackPercent, 0) / transactions.length
      : 0;

    const lastTransaction = transactions.find(t => t.status === "credited");

    return {
      userId,
      totalCashbackEarned: stats?.totalEarned ?? 0,
      totalCashbackPending: stats?.totalPending ?? 0,
      currentMonthCashback: stats?.currentMonth ?? 0,
      currentWeekCashback: stats?.currentWeek ?? 0,
      lifetimeTradingVolume: stats?.lifetimeVolume ?? 0,
      averageCashbackPercent: avgPercent,
      lastCashbackAt: lastTransaction?.creditedAt,
      transactions,
    };
  }

  // ==========================================================================
  // VIP Events
  // ==========================================================================

  /**
   * Get available VIP events
   */
  async getAvailableEvents(userId: string): Promise<VIPEvent[]> {
    const status = await this.getVIPStatus({ userId });
    const tierIndex = VIP_TIER_ORDER.indexOf(status.currentTier);

    const events = await this.db.query<VIPEvent[]>("vipEvents:getActive", {});

    // Filter events by minimum tier requirement
    return events.filter(event => {
      const requiredIndex = VIP_TIER_ORDER.indexOf(event.minimumTier);
      return tierIndex >= requiredIndex;
    });
  }

  /**
   * Register for VIP event
   */
  async registerForEvent(params: RegisterForEventParams): Promise<VIPEventRegistration> {
    const { userId, eventId } = params;
    const status = await this.getVIPStatus({ userId });

    const event = await this.db.query<VIPEvent | null>("vipEvents:getById", { id: eventId });

    if (!event) {
      throw new Error("Event not found");
    }

    // Check tier eligibility
    const userTierIndex = VIP_TIER_ORDER.indexOf(status.currentTier);
    const requiredTierIndex = VIP_TIER_ORDER.indexOf(event.minimumTier);

    if (userTierIndex < requiredTierIndex) {
      throw new Error(`This event requires ${event.minimumTier} tier or higher`);
    }

    // Check capacity
    if (event.maxAttendees && event.currentAttendees >= event.maxAttendees) {
      throw new Error("Event is at capacity");
    }

    // Check if already registered
    const existing = await this.db.query<VIPEventRegistration | null>(
      "vipEventRegistrations:getByUserAndEvent",
      { userId, eventId }
    );

    if (existing) {
      throw new Error("Already registered for this event");
    }

    const now = Date.now();
    const registration: VIPEventRegistration = {
      id: `ver_${now}_${userId}`,
      eventId,
      userId,
      userTier: status.currentTier,
      status: "registered",
      registeredAt: new Date(now),
      rewardsGranted: [],
    };

    await this.db.mutation("vipEventRegistrations:create", {
      ...registration,
      registeredAt: now,
    });

    // Update event attendee count
    await this.db.mutation("vipEvents:incrementAttendees", { id: eventId });

    this.logger.info("Event registration created", {
      userId,
      eventId,
      tier: status.currentTier,
    });

    return registration;
  }

  // ==========================================================================
  // Notifications
  // ==========================================================================

  private async sendTierChangeNotification(
    userId: string,
    previousTier: VIPTier,
    newTier: VIPTier,
    changeType: "upgrade" | "downgrade" | "maintain"
  ): Promise<void> {
    const tierConfig = VIP_TIER_CONFIGS[newTier];

    const title = changeType === "upgrade"
      ? `Congratulations! You've reached ${tierConfig.name} tier!`
      : `VIP Tier Update`;

    const message = changeType === "upgrade"
      ? `You've been upgraded to ${tierConfig.name} tier! Enjoy ${tierConfig.cashbackPercent}% cashback and exclusive benefits.`
      : `Your VIP tier has been adjusted to ${tierConfig.name}. Continue trading to upgrade!`;

    await this.db.mutation("notifications:create", {
      userId,
      type: changeType === "upgrade" ? "vip_upgrade" : "vip_downgrade",
      title,
      message,
      data: {
        previousTier,
        newTier,
        benefits: tierConfig.benefits,
      },
      createdAt: Date.now(),
    });
  }

  // ==========================================================================
  // Batch Operations
  // ==========================================================================

  /**
   * Process tier reviews for all users
   */
  async processMonthlyTierReviews(): Promise<TierReview[]> {
    const users = await this.db.query<{ userId: string; currentTier: VIPTier; periodVolume: number }[]>(
      "vipStatus:getAllForReview",
      {}
    );

    const reviews: TierReview[] = [];

    for (const user of users) {
      const qualifyingTier = this.benefitsCalculator.calculateQualifyingTier(user.periodVolume);
      const currentIndex = VIP_TIER_ORDER.indexOf(user.currentTier);
      const qualifyingIndex = VIP_TIER_ORDER.indexOf(qualifyingTier);

      let recommendation: "upgrade" | "downgrade" | "maintain" = "maintain";
      if (qualifyingIndex > currentIndex) {
        recommendation = "upgrade";
      } else if (qualifyingIndex < currentIndex) {
        recommendation = "downgrade";
      }

      reviews.push({
        userId: user.userId,
        reviewPeriodStart: new Date(Date.now() - this.config.reviewPeriodDays * 24 * 60 * 60 * 1000),
        reviewPeriodEnd: new Date(),
        periodVolume: user.periodVolume,
        currentTier: user.currentTier,
        qualifyingTier,
        recommendation,
        gracePeriodEligible: recommendation === "downgrade",
      });
    }

    return reviews;
  }

  /**
   * Process expired grace periods
   */
  async processExpiredGracePeriods(): Promise<number> {
    const now = Date.now();
    const expiredUsers = await this.db.query<{ userId: string; currentTier: VIPTier; gracePeriodTargetTier: VIPTier }[]>(
      "vipStatus:getExpiredGracePeriods",
      { now }
    );

    let processed = 0;
    for (const user of expiredUsers) {
      await this.processTierChange(
        user.userId,
        user.currentTier,
        user.gracePeriodTargetTier,
        "downgrade",
        "grace_period_end",
        0
      );
      processed++;
    }

    this.logger.info("Processed expired grace periods", { count: processed });
    return processed;
  }
}

export default VIPService;
