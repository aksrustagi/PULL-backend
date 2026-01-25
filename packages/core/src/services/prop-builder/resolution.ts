/**
 * Prop Builder Resolution
 * Resolve user-created props and handle disputes
 */

import {
  UserProp,
  PropResolution,
  PropDispute,
  ResolutionSource,
  ResolutionEvidence,
  PropBet,
  PROP_DEFAULTS,
} from "./types";

// ============================================================================
// Configuration
// ============================================================================

export interface ResolutionConfig {
  disputeWindowHours: number;
  minDisputeStake: number;
  consensusThreshold: number;
  autoSettlementDelay: number;
  maxDisputesPerProp: number;
}

const DEFAULT_CONFIG: ResolutionConfig = {
  disputeWindowHours: PROP_DEFAULTS.disputeWindowHours,
  minDisputeStake: 10,
  consensusThreshold: 0.67,
  autoSettlementDelay: 1000 * 60 * 60, // 1 hour
  maxDisputesPerProp: 3,
};

// ============================================================================
// Resolution Service
// ============================================================================

export class PropResolutionService {
  private readonly config: ResolutionConfig;

  constructor(config?: Partial<ResolutionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Resolution Creation
  // ==========================================================================

  /**
   * Create resolution for a prop
   */
  createResolution(params: {
    propId: string;
    winningOutcomeId: string;
    source: ResolutionSource;
    evidence: ResolutionEvidence[];
    resolvedBy: string;
  }): PropResolution {
    const now = new Date();
    const disputeWindow = new Date(now.getTime() + this.config.disputeWindowHours * 60 * 60 * 1000);

    return {
      id: `res_${Date.now()}_${params.propId}`,
      propId: params.propId,
      winningOutcomeId: params.winningOutcomeId,
      source: params.source,
      evidence: params.evidence,
      resolvedBy: params.resolvedBy,
      resolvedAt: now,
      disputeWindow,
      disputeCount: 0,
    };
  }

  /**
   * Validate resolution evidence
   */
  validateEvidence(evidence: ResolutionEvidence[]): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    if (evidence.length === 0) {
      issues.push("At least one piece of evidence is required");
    }

    for (const item of evidence) {
      if (!item.source) {
        issues.push("Evidence must have a source");
      }
      if (!item.data) {
        issues.push("Evidence must have data");
      }

      // Validate URL evidence
      if (item.type === "url") {
        try {
          new URL(item.data);
        } catch {
          issues.push(`Invalid URL: ${item.data}`);
        }
      }

      // Validate API data evidence
      if (item.type === "api_data") {
        try {
          JSON.parse(item.data);
        } catch {
          issues.push("API data must be valid JSON");
        }
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  // ==========================================================================
  // Settlement Calculation
  // ==========================================================================

  /**
   * Calculate payouts for a resolved prop
   */
  calculatePayouts(
    prop: UserProp,
    resolution: PropResolution,
    bets: PropBet[]
  ): {
    payouts: BetPayout[];
    totalPayout: number;
    creatorEarnings: number;
    platformFees: number;
  } {
    const winningBets = bets.filter(
      bet => bet.outcomeId === resolution.winningOutcomeId && bet.status === "active"
    );
    const losingBets = bets.filter(
      bet => bet.outcomeId !== resolution.winningOutcomeId && bet.status === "active"
    );

    // Calculate total pool
    const totalPool = bets.reduce((sum, bet) => sum + bet.amount, 0);
    const losingPool = losingBets.reduce((sum, bet) => sum + bet.amount, 0);

    // Calculate fees
    const platformFees = losingPool * PROP_DEFAULTS.platformFeePercent;
    const creatorEarnings = losingPool * prop.creatorFeePercent;
    const distributePool = losingPool - platformFees - creatorEarnings;

    // Calculate winning proportions
    const totalWinningAmount = winningBets.reduce((sum, bet) => sum + bet.amount, 0);

    const payouts: BetPayout[] = winningBets.map(bet => {
      const proportion = totalWinningAmount > 0
        ? bet.amount / totalWinningAmount
        : 0;
      const winnings = distributePool * proportion;
      const payout = bet.amount + winnings; // Original stake + winnings

      return {
        betId: bet.id,
        userId: bet.userId,
        originalAmount: bet.amount,
        winnings,
        payout,
        creatorFee: creatorEarnings * proportion,
        platformFee: platformFees * proportion,
      };
    });

    // Add losing bets with zero payout
    for (const bet of losingBets) {
      payouts.push({
        betId: bet.id,
        userId: bet.userId,
        originalAmount: bet.amount,
        winnings: 0,
        payout: 0,
        creatorFee: 0,
        platformFee: 0,
      });
    }

    return {
      payouts,
      totalPayout: payouts.reduce((sum, p) => sum + p.payout, 0),
      creatorEarnings,
      platformFees,
    };
  }

  /**
   * Calculate refunds for cancelled prop
   */
  calculateRefunds(bets: PropBet[]): BetPayout[] {
    return bets.map(bet => ({
      betId: bet.id,
      userId: bet.userId,
      originalAmount: bet.amount,
      winnings: 0,
      payout: bet.amount, // Full refund
      creatorFee: 0,
      platformFee: 0,
    }));
  }

  // ==========================================================================
  // Disputes
  // ==========================================================================

  /**
   * Create a dispute
   */
  createDispute(params: {
    propId: string;
    resolutionId: string;
    disputerId: string;
    claimedOutcomeId: string;
    reason: string;
    evidence: ResolutionEvidence[];
  }): PropDispute {
    return {
      id: `dis_${Date.now()}_${params.propId}`,
      propId: params.propId,
      resolutionId: params.resolutionId,
      disputerId: params.disputerId,
      claimedOutcomeId: params.claimedOutcomeId,
      reason: params.reason,
      evidence: params.evidence,
      status: "pending",
      createdAt: new Date(),
    };
  }

  /**
   * Validate dispute eligibility
   */
  validateDisputeEligibility(
    prop: UserProp,
    resolution: PropResolution,
    userId: string,
    bets: PropBet[]
  ): { eligible: boolean; reason?: string } {
    // Check dispute window
    if (new Date() > resolution.disputeWindow) {
      return { eligible: false, reason: "Dispute window has closed" };
    }

    // Check max disputes
    if (resolution.disputeCount >= this.config.maxDisputesPerProp) {
      return { eligible: false, reason: "Maximum disputes reached for this prop" };
    }

    // Check if user has a bet on this prop
    const userBet = bets.find(b => b.userId === userId);
    if (!userBet) {
      return { eligible: false, reason: "Must have a bet on this prop to dispute" };
    }

    // Check if user bet on a different outcome
    if (userBet.outcomeId === resolution.winningOutcomeId) {
      return { eligible: false, reason: "Cannot dispute a resolution you won" };
    }

    return { eligible: true };
  }

  /**
   * Evaluate dispute
   */
  evaluateDispute(
    originalResolution: PropResolution,
    dispute: PropDispute
  ): {
    recommendation: "uphold" | "overturn" | "needs_review";
    confidence: number;
    notes: string;
  } {
    // Compare evidence strength
    const originalEvidenceScore = this.scoreEvidence(originalResolution.evidence);
    const disputeEvidenceScore = this.scoreEvidence(dispute.evidence);

    const confidence = Math.abs(originalEvidenceScore - disputeEvidenceScore) /
      Math.max(originalEvidenceScore, disputeEvidenceScore);

    if (disputeEvidenceScore > originalEvidenceScore * 1.5) {
      return {
        recommendation: "overturn",
        confidence,
        notes: "Dispute evidence significantly stronger than original",
      };
    } else if (originalEvidenceScore > disputeEvidenceScore * 1.5) {
      return {
        recommendation: "uphold",
        confidence,
        notes: "Original resolution evidence is stronger",
      };
    } else {
      return {
        recommendation: "needs_review",
        confidence,
        notes: "Evidence is comparable, requires manual review",
      };
    }
  }

  /**
   * Score evidence quality
   */
  private scoreEvidence(evidence: ResolutionEvidence[]): number {
    const typeScores: Record<ResolutionEvidence["type"], number> = {
      api_data: 10,
      document: 8,
      url: 5,
      screenshot: 3,
    };

    let totalScore = 0;

    for (const item of evidence) {
      let score = typeScores[item.type] || 1;

      // Bonus for verified evidence
      if (item.verifiedBy) {
        score *= 1.5;
      }

      // Bonus for official sources
      if (item.source.includes("official") || item.source.includes("gov")) {
        score *= 1.3;
      }

      totalScore += score;
    }

    return totalScore;
  }

  // ==========================================================================
  // Community Consensus
  // ==========================================================================

  /**
   * Calculate community consensus for resolution
   */
  calculateConsensus(
    votes: { outcomeId: string; weight: number }[]
  ): {
    winningOutcomeId: string | null;
    consensusPercent: number;
    voteDistribution: Record<string, number>;
  } {
    const distribution: Record<string, number> = {};
    let totalWeight = 0;

    for (const vote of votes) {
      distribution[vote.outcomeId] = (distribution[vote.outcomeId] || 0) + vote.weight;
      totalWeight += vote.weight;
    }

    if (totalWeight === 0) {
      return {
        winningOutcomeId: null,
        consensusPercent: 0,
        voteDistribution: distribution,
      };
    }

    // Find highest voted outcome
    let maxVotes = 0;
    let winningOutcomeId: string | null = null;

    for (const [outcomeId, votes] of Object.entries(distribution)) {
      if (votes > maxVotes) {
        maxVotes = votes;
        winningOutcomeId = outcomeId;
      }
    }

    const consensusPercent = maxVotes / totalWeight;

    return {
      winningOutcomeId: consensusPercent >= this.config.consensusThreshold
        ? winningOutcomeId
        : null,
      consensusPercent,
      voteDistribution: distribution,
    };
  }

  // ==========================================================================
  // Oracle Integration
  // ==========================================================================

  /**
   * Verify resolution against oracle data
   */
  async verifyWithOracle(
    prop: UserProp,
    claimedOutcomeId: string,
    oracleEndpoint: string
  ): Promise<{
    verified: boolean;
    oracleOutcomeId?: string;
    oracleData?: Record<string, unknown>;
    error?: string;
  }> {
    try {
      // This would call an external oracle API
      // Simplified for demo
      const response = await fetch(oracleEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propId: prop.id,
          resolutionCriteria: prop.resolutionCriteria,
        }),
      });

      if (!response.ok) {
        return { verified: false, error: "Oracle request failed" };
      }

      const data = await response.json();

      return {
        verified: data.outcomeId === claimedOutcomeId,
        oracleOutcomeId: data.outcomeId,
        oracleData: data,
      };
    } catch (error) {
      return {
        verified: false,
        error: error instanceof Error ? error.message : "Oracle verification failed",
      };
    }
  }

  // ==========================================================================
  // Settlement Timing
  // ==========================================================================

  /**
   * Check if prop can be settled
   */
  canSettle(prop: UserProp, resolution: PropResolution): {
    canSettle: boolean;
    reason?: string;
    waitTime?: number;
  } {
    const now = new Date();

    // Check dispute window
    if (now < resolution.disputeWindow) {
      const waitTime = resolution.disputeWindow.getTime() - now.getTime();
      return {
        canSettle: false,
        reason: "Dispute window still open",
        waitTime,
      };
    }

    // Check for pending disputes
    if (resolution.disputeCount > 0) {
      return {
        canSettle: false,
        reason: "Has pending disputes",
      };
    }

    return { canSettle: true };
  }

  /**
   * Calculate settlement delay
   */
  calculateSettlementDelay(
    prop: UserProp,
    resolution: PropResolution
  ): number {
    let delay = this.config.autoSettlementDelay;

    // Higher liquidity = longer delay
    if (prop.currentLiquidity > 10000) {
      delay *= 2;
    }
    if (prop.currentLiquidity > 50000) {
      delay *= 2;
    }

    // Community-sourced resolution = longer delay
    if (resolution.source === "community_consensus") {
      delay *= 1.5;
    }

    return delay;
  }
}

// ============================================================================
// Types
// ============================================================================

export interface BetPayout {
  betId: string;
  userId: string;
  originalAmount: number;
  winnings: number;
  payout: number;
  creatorFee: number;
  platformFee: number;
}

// Export singleton instance
export const propResolutionService = new PropResolutionService();
