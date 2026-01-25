/**
 * Watch Party Group Betting
 * Manage group bets and shared bet slips
 */

import {
  WatchParty,
  GroupBet,
  BetContribution,
  SharedBetSlip,
  SharedBetSlipItem,
  PartyMember,
  CreateGroupBetParams,
  ContributeToGroupBetParams,
  WATCH_PARTY_DEFAULTS,
} from "./types";

// ============================================================================
// Configuration
// ============================================================================

export interface GroupBettingConfig {
  maxGroupBetAmount: number;
  maxContributionsPerBet: number;
  minOdds: number;
  maxOdds: number;
  platformFeePercent: number;
  creatorBonusPercent: number;
}

const DEFAULT_CONFIG: GroupBettingConfig = {
  maxGroupBetAmount: 10000,
  maxContributionsPerBet: 50,
  minOdds: 1.1,
  maxOdds: 100,
  platformFeePercent: 0.02,
  creatorBonusPercent: 0.01,
};

// ============================================================================
// Group Betting Manager
// ============================================================================

export class GroupBettingManager {
  private config: GroupBettingConfig;

  constructor(config?: Partial<GroupBettingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Group Bet Creation
  // ==========================================================================

  /**
   * Create a new group bet
   */
  createGroupBet(params: CreateGroupBetParams): GroupBet {
    const {
      partyId,
      creatorId,
      eventId,
      market,
      selection,
      odds,
      targetAmount,
      minContribution = WATCH_PARTY_DEFAULTS.minContribution,
      maxContribution = WATCH_PARTY_DEFAULTS.maxContribution,
      deadline,
    } = params;

    // Validate odds
    if (odds < this.config.minOdds || odds > this.config.maxOdds) {
      throw new Error(`Odds must be between ${this.config.minOdds} and ${this.config.maxOdds}`);
    }

    // Validate target amount
    if (targetAmount > this.config.maxGroupBetAmount) {
      throw new Error(`Maximum group bet amount is $${this.config.maxGroupBetAmount}`);
    }

    // Validate deadline
    if (deadline <= new Date()) {
      throw new Error("Deadline must be in the future");
    }

    const now = new Date();

    return {
      id: `gb_${Date.now()}_${partyId}`,
      partyId,
      creatorId,
      creatorUsername: "", // Will be filled by service
      eventId,
      market,
      selection,
      odds,
      targetAmount,
      currentAmount: 0,
      contributions: [],
      minContribution,
      maxContribution,
      status: "collecting",
      deadline,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Validate group bet parameters
   */
  validateGroupBet(groupBet: GroupBet): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (groupBet.targetAmount <= 0) {
      errors.push("Target amount must be positive");
    }

    if (groupBet.minContribution > groupBet.maxContribution) {
      errors.push("Minimum contribution cannot exceed maximum");
    }

    if (groupBet.odds <= 1) {
      errors.push("Odds must be greater than 1");
    }

    return { valid: errors.length === 0, errors };
  }

  // ==========================================================================
  // Contributions
  // ==========================================================================

  /**
   * Add contribution to group bet
   */
  addContribution(
    groupBet: GroupBet,
    params: ContributeToGroupBetParams & { username: string }
  ): {
    contribution: BetContribution;
    groupBet: GroupBet;
    isFilled: boolean;
  } {
    const { userId, amount, username } = params;

    // Validate status
    if (groupBet.status !== "collecting") {
      throw new Error("Group bet is not accepting contributions");
    }

    // Check deadline
    if (new Date() > groupBet.deadline) {
      throw new Error("Contribution deadline has passed");
    }

    // Check if user already contributed
    const existingContribution = groupBet.contributions.find(c => c.userId === userId);
    if (existingContribution) {
      throw new Error("Already contributed to this group bet");
    }

    // Validate amount
    if (amount < groupBet.minContribution) {
      throw new Error(`Minimum contribution is $${groupBet.minContribution}`);
    }
    if (amount > groupBet.maxContribution) {
      throw new Error(`Maximum contribution is $${groupBet.maxContribution}`);
    }

    // Check remaining capacity
    const remainingCapacity = groupBet.targetAmount - groupBet.currentAmount;
    if (amount > remainingCapacity) {
      throw new Error(`Only $${remainingCapacity.toFixed(2)} remaining to fill this bet`);
    }

    // Check max contributions
    if (groupBet.contributions.length >= this.config.maxContributionsPerBet) {
      throw new Error("Maximum number of contributors reached");
    }

    // Create contribution
    const contribution: BetContribution = {
      userId,
      username,
      amount,
      sharePercent: 0, // Will be calculated on lock
      contributedAt: new Date(),
    };

    // Update group bet
    const newCurrentAmount = groupBet.currentAmount + amount;
    const updatedContributions = [...groupBet.contributions, contribution];

    const updatedGroupBet: GroupBet = {
      ...groupBet,
      currentAmount: newCurrentAmount,
      contributions: updatedContributions,
      updatedAt: new Date(),
    };

    const isFilled = newCurrentAmount >= groupBet.targetAmount;

    return {
      contribution,
      groupBet: updatedGroupBet,
      isFilled,
    };
  }

  /**
   * Remove contribution from group bet
   */
  removeContribution(
    groupBet: GroupBet,
    userId: string
  ): { groupBet: GroupBet; refundAmount: number } {
    if (groupBet.status !== "collecting") {
      throw new Error("Cannot remove contribution after bet is locked");
    }

    const contributionIndex = groupBet.contributions.findIndex(c => c.userId === userId);
    if (contributionIndex === -1) {
      throw new Error("No contribution found for this user");
    }

    const contribution = groupBet.contributions[contributionIndex];
    const updatedContributions = groupBet.contributions.filter((_, i) => i !== contributionIndex);

    const updatedGroupBet: GroupBet = {
      ...groupBet,
      currentAmount: groupBet.currentAmount - contribution.amount,
      contributions: updatedContributions,
      updatedAt: new Date(),
    };

    return {
      groupBet: updatedGroupBet,
      refundAmount: contribution.amount,
    };
  }

  // ==========================================================================
  // Bet Lifecycle
  // ==========================================================================

  /**
   * Lock group bet and calculate shares
   */
  lockGroupBet(groupBet: GroupBet): GroupBet {
    if (groupBet.status !== "collecting") {
      throw new Error("Group bet is not in collecting status");
    }

    if (groupBet.currentAmount === 0) {
      throw new Error("No contributions to lock");
    }

    // Calculate share percentages
    const contributionsWithShares = groupBet.contributions.map(c => ({
      ...c,
      sharePercent: (c.amount / groupBet.currentAmount) * 100,
    }));

    return {
      ...groupBet,
      contributions: contributionsWithShares,
      status: "locked",
      updatedAt: new Date(),
    };
  }

  /**
   * Mark group bet as placed
   */
  markBetPlaced(groupBet: GroupBet, actualOdds: number): GroupBet {
    if (groupBet.status !== "locked") {
      throw new Error("Group bet must be locked before placing");
    }

    return {
      ...groupBet,
      status: "placed",
      actualOdds,
      placedAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Settle group bet
   */
  settleGroupBet(
    groupBet: GroupBet,
    won: boolean
  ): {
    groupBet: GroupBet;
    payouts: { userId: string; amount: number }[];
  } {
    if (groupBet.status !== "placed") {
      throw new Error("Group bet must be placed before settling");
    }

    const odds = groupBet.actualOdds || groupBet.odds;
    const totalPayout = won ? groupBet.currentAmount * odds : 0;
    const platformFee = totalPayout * this.config.platformFeePercent;
    const creatorBonus = totalPayout * this.config.creatorBonusPercent;
    const distributeAmount = totalPayout - platformFee - creatorBonus;

    // Calculate individual payouts
    const payouts: { userId: string; amount: number }[] = [];
    const contributionsWithPayouts = groupBet.contributions.map(c => {
      const payout = won
        ? (c.sharePercent / 100) * distributeAmount
        : 0;
      payouts.push({ userId: c.userId, amount: payout });
      return { ...c, payout };
    });

    // Add creator bonus
    if (won && creatorBonus > 0) {
      const creatorPayout = payouts.find(p => p.userId === groupBet.creatorId);
      if (creatorPayout) {
        creatorPayout.amount += creatorBonus;
      }
    }

    const settledGroupBet: GroupBet = {
      ...groupBet,
      status: won ? "won" : "lost",
      contributions: contributionsWithPayouts,
      payout: totalPayout,
      profitLoss: won ? distributeAmount - groupBet.currentAmount : -groupBet.currentAmount,
      settledAt: new Date(),
      updatedAt: new Date(),
    };

    return { groupBet: settledGroupBet, payouts };
  }

  /**
   * Cancel and refund group bet
   */
  cancelGroupBet(groupBet: GroupBet): {
    groupBet: GroupBet;
    refunds: { userId: string; amount: number }[];
  } {
    if (!["collecting", "locked"].includes(groupBet.status)) {
      throw new Error("Cannot cancel group bet in current status");
    }

    const refunds = groupBet.contributions.map(c => ({
      userId: c.userId,
      amount: c.amount,
    }));

    const cancelledGroupBet: GroupBet = {
      ...groupBet,
      status: "cancelled",
      updatedAt: new Date(),
    };

    return { groupBet: cancelledGroupBet, refunds };
  }

  // ==========================================================================
  // Shared Bet Slips
  // ==========================================================================

  /**
   * Create a shared bet slip
   */
  createSharedBetSlip(
    partyId: string,
    creatorId: string,
    bets: SharedBetSlipItem[]
  ): SharedBetSlip {
    if (bets.length === 0) {
      throw new Error("Bet slip must have at least one bet");
    }

    const totalStake = bets.reduce((sum, b) => sum + b.stake, 0);
    const totalOdds = bets.reduce((prod, b) => prod * b.odds, 1);
    const potentialPayout = totalStake * totalOdds;

    return {
      id: `slip_${Date.now()}_${partyId}`,
      partyId,
      creatorId,
      bets,
      totalStake,
      totalOdds,
      potentialPayout,
      visibleToAll: true,
      copyCount: 0,
      likeCount: 0,
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Copy a shared bet slip
   */
  copyBetSlip(original: SharedBetSlip, newCreatorId: string): SharedBetSlip {
    return {
      ...original,
      id: `slip_${Date.now()}_${original.partyId}`,
      creatorId: newCreatorId,
      copyCount: 0,
      likeCount: 0,
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // ==========================================================================
  // Analytics
  // ==========================================================================

  /**
   * Calculate group bet statistics
   */
  calculateGroupBetStats(groupBets: GroupBet[]): {
    totalBets: number;
    totalVolume: number;
    winRate: number;
    avgContributors: number;
    avgBetSize: number;
    topContributor?: { userId: string; totalContributed: number };
  } {
    if (groupBets.length === 0) {
      return {
        totalBets: 0,
        totalVolume: 0,
        winRate: 0,
        avgContributors: 0,
        avgBetSize: 0,
      };
    }

    const settled = groupBets.filter(b => ["won", "lost"].includes(b.status));
    const won = settled.filter(b => b.status === "won");

    const totalVolume = groupBets.reduce((sum, b) => sum + b.currentAmount, 0);
    const totalContributors = groupBets.reduce((sum, b) => sum + b.contributions.length, 0);

    // Find top contributor
    const contributorTotals = new Map<string, number>();
    for (const bet of groupBets) {
      for (const c of bet.contributions) {
        const current = contributorTotals.get(c.userId) || 0;
        contributorTotals.set(c.userId, current + c.amount);
      }
    }

    let topContributor: { userId: string; totalContributed: number } | undefined;
    let maxContribution = 0;
    for (const [userId, total] of contributorTotals) {
      if (total > maxContribution) {
        maxContribution = total;
        topContributor = { userId, totalContributed: total };
      }
    }

    return {
      totalBets: groupBets.length,
      totalVolume,
      winRate: settled.length > 0 ? (won.length / settled.length) * 100 : 0,
      avgContributors: totalContributors / groupBets.length,
      avgBetSize: totalVolume / groupBets.length,
      topContributor,
    };
  }
}

// Export singleton instance
export const groupBettingManager = new GroupBettingManager();
