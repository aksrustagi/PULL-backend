/**
 * KILLER FEATURE #8: Cash Out Plus
 *
 * Advanced cash-out system with partial cash-out, auto cash-out rules,
 * cash-out boost promotions, and social validation.
 *
 * WHY IT KILLS:
 * - Gives users control (reduces frustration)
 * - Auto-rules reduce regret
 * - Boosts create urgency and FOMO
 * - Social proof on big cash-outs
 *
 * K-FACTOR BOOST:
 * - Share cash-out wins
 * - "Would you cash out?" polls
 * - Cash-out notifications to followers
 * - Referral bonus on first cash-out
 */

import { z } from "zod";

// ============================================================================
// TYPES
// ============================================================================

export const CashOutTypeSchema = z.enum([
  "full",         // Cash out entire bet
  "partial",      // Cash out portion
  "auto",         // Triggered by rule
  "boost",        // Cash out with boost applied
]);

export type CashOutType = z.infer<typeof CashOutTypeSchema>;

export interface CashOutOffer {
  betId: string;
  userId: string;

  // Current offer
  currentValue: number;
  originalStake: number;
  potentialPayout: number;
  profitLocked: number;

  // Partial options
  minPartialAmount: number;
  maxPartialAmount: number;
  partialOptions: PartialCashOutOption[];

  // Boost if available
  boost?: CashOutBoost;
  boostedValue?: number;

  // Validity
  validUntil: number;
  isAvailable: boolean;
  unavailableReason?: string;

  // Live data
  currentWinProbability: number;
  expectedValue: number;

  updatedAt: number;
}

export interface PartialCashOutOption {
  percentage: number;
  cashOutAmount: number;
  remainingStake: number;
  remainingPotential: number;
}

export interface CashOutBoost {
  id: string;
  name: string;
  description: string;
  boostPercentage: number; // e.g., 10 = 10% more
  validUntil: number;
  usesRemaining: number;
  conditions?: {
    minCashOutValue?: number;
    sports?: string[];
    betTypes?: string[];
  };
}

export interface AutoCashOutRule {
  id: string;
  userId: string;
  name: string;
  isActive: boolean;

  // Trigger conditions
  trigger: AutoCashOutTrigger;

  // Action
  action: {
    type: "full" | "partial";
    partialPercentage?: number; // For partial cash-out
  };

  // Stats
  timesTriggered: number;
  totalCashedOut: number;
  totalSaved: number; // Amount saved vs letting bets ride

  createdAt: number;
  lastTriggeredAt?: number;
}

export interface AutoCashOutTrigger {
  type: "profit_target" | "loss_limit" | "probability" | "time_remaining" | "score_based";

  // Profit target: cash out when profit reaches X% of stake
  profitTarget?: number;

  // Loss limit: cash out when value drops to X% of stake
  lossLimit?: number;

  // Probability: cash out when win probability drops below/rises above X
  probabilityThreshold?: number;
  probabilityDirection?: "above" | "below";

  // Time remaining: cash out when X% of event time remains
  timeRemainingPct?: number;

  // Score based: specific score triggers
  scoreTrigger?: {
    leadSize?: number; // Cash out if team has X point lead
    deficitSize?: number; // Cash out if team down by X
  };
}

export interface CashOutHistory {
  id: string;
  betId: string;
  userId: string;
  type: CashOutType;

  // Amounts
  cashedOutAmount: number;
  originalStake: number;
  potentialPayout: number;

  // Partial details
  percentageCashedOut: number;
  remainingStake?: number;

  // Boost details
  boostApplied?: {
    boostId: string;
    boostPercentage: number;
    bonusAmount: number;
  };

  // Outcome
  eventResult?: "win" | "loss" | "push";
  wouldHavePaid?: number;
  decisionQuality?: "great" | "good" | "neutral" | "regret";

  // Auto-rule details
  autoRuleId?: string;
  autoRuleName?: string;

  cashedOutAt: number;
}

export interface CashOutPoll {
  id: string;
  betId: string;
  userId: string;
  username: string;

  // Bet details
  event: string;
  pick: string;
  originalStake: number;
  potentialPayout: number;
  currentCashOutValue: number;
  currentProbability: number;

  // Poll results
  cashOutVotes: number;
  letItRideVotes: number;
  totalVotes: number;

  // Status
  isOpen: boolean;
  userDecision?: "cash_out" | "let_it_ride";
  actualResult?: "win" | "loss";

  createdAt: number;
  closedAt?: number;
}

// ============================================================================
// CASH OUT PLUS SERVICE
// ============================================================================

export class CashOutPlusService {
  /**
   * Calculate cash-out value using EV model
   */
  calculateCashOutValue(
    stake: number,
    potentialPayout: number,
    currentWinProbability: number,
    houseEdge: number = 0.05
  ): number {
    // Base expected value
    const ev = currentWinProbability * potentialPayout;

    // Apply house edge (reduces cash-out value)
    const adjustedEV = ev * (1 - houseEdge);

    // Cash-out value should never exceed potential payout
    // or be less than a small % of stake (unless prob is ~0)
    const minValue = stake * 0.05;
    const maxValue = potentialPayout * 0.98;

    return Math.max(minValue, Math.min(maxValue, adjustedEV));
  }

  /**
   * Generate partial cash-out options
   */
  generatePartialOptions(
    cashOutValue: number,
    stake: number,
    potentialPayout: number
  ): PartialCashOutOption[] {
    const percentages = [25, 50, 75];

    return percentages.map(pct => {
      const cashOutPortion = cashOutValue * (pct / 100);
      const remainingStakePortion = stake * (1 - pct / 100);
      const remainingPotentialPortion = potentialPayout * (1 - pct / 100);

      return {
        percentage: pct,
        cashOutAmount: Math.round(cashOutPortion * 100) / 100,
        remainingStake: Math.round(remainingStakePortion * 100) / 100,
        remainingPotential: Math.round(remainingPotentialPortion * 100) / 100,
      };
    });
  }

  /**
   * Apply cash-out boost
   */
  applyBoost(
    cashOutValue: number,
    boost: CashOutBoost
  ): { boostedValue: number; bonusAmount: number } {
    const bonusAmount = cashOutValue * (boost.boostPercentage / 100);
    return {
      boostedValue: cashOutValue + bonusAmount,
      bonusAmount,
    };
  }

  /**
   * Check if auto cash-out rule should trigger
   */
  shouldAutoTrigger(
    rule: AutoCashOutRule,
    betState: {
      currentValue: number;
      originalStake: number;
      potentialPayout: number;
      winProbability: number;
      timeRemainingPct: number;
      leadDeficit?: number;
    }
  ): boolean {
    const { trigger } = rule;

    switch (trigger.type) {
      case "profit_target":
        if (!trigger.profitTarget) return false;
        const currentProfit = betState.currentValue - betState.originalStake;
        const targetProfit = betState.originalStake * (trigger.profitTarget / 100);
        return currentProfit >= targetProfit;

      case "loss_limit":
        if (!trigger.lossLimit) return false;
        const valuePct = (betState.currentValue / betState.originalStake) * 100;
        return valuePct <= trigger.lossLimit;

      case "probability":
        if (!trigger.probabilityThreshold) return false;
        if (trigger.probabilityDirection === "above") {
          return betState.winProbability >= trigger.probabilityThreshold;
        } else {
          return betState.winProbability <= trigger.probabilityThreshold;
        }

      case "time_remaining":
        if (!trigger.timeRemainingPct) return false;
        return betState.timeRemainingPct <= trigger.timeRemainingPct;

      case "score_based":
        if (!trigger.scoreTrigger || betState.leadDeficit === undefined) return false;
        if (trigger.scoreTrigger.leadSize && betState.leadDeficit >= trigger.scoreTrigger.leadSize) {
          return true;
        }
        if (trigger.scoreTrigger.deficitSize && betState.leadDeficit <= -trigger.scoreTrigger.deficitSize) {
          return true;
        }
        return false;

      default:
        return false;
    }
  }

  /**
   * Evaluate cash-out decision quality after event concludes
   */
  evaluateDecision(
    cashedOutAmount: number,
    wouldHavePaid: number,
    originalStake: number
  ): {
    quality: "great" | "good" | "neutral" | "regret";
    explanation: string;
  } {
    const difference = cashedOutAmount - wouldHavePaid;
    const pctDifference = (difference / originalStake) * 100;

    if (wouldHavePaid === 0) {
      // Bet would have lost
      if (cashedOutAmount > originalStake) {
        return {
          quality: "great",
          explanation: `Locked in $${(cashedOutAmount - originalStake).toFixed(2)} profit on a losing bet!`,
        };
      } else {
        return {
          quality: "good",
          explanation: `Saved $${(originalStake - cashedOutAmount).toFixed(2)} by cashing out before the loss.`,
        };
      }
    } else {
      // Bet would have won
      if (difference > 0) {
        return {
          quality: "neutral",
          explanation: "Rare case where cash-out exceeded payout.",
        };
      } else if (pctDifference > -20) {
        return {
          quality: "neutral",
          explanation: `Missed out on $${Math.abs(difference).toFixed(2)}, but the guaranteed value was reasonable.`,
        };
      } else {
        return {
          quality: "regret",
          explanation: `Left $${Math.abs(difference).toFixed(2)} on the table. But hindsight is 20/20!`,
        };
      }
    }
  }

  /**
   * Create a cash-out poll for social validation
   */
  createPoll(
    betId: string,
    userId: string,
    username: string,
    betDetails: {
      event: string;
      pick: string;
      stake: number;
      potentialPayout: number;
      currentCashOutValue: number;
      currentProbability: number;
    }
  ): CashOutPoll {
    return {
      id: `poll_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      betId,
      userId,
      username,
      event: betDetails.event,
      pick: betDetails.pick,
      originalStake: betDetails.stake,
      potentialPayout: betDetails.potentialPayout,
      currentCashOutValue: betDetails.currentCashOutValue,
      currentProbability: betDetails.currentProbability,
      cashOutVotes: 0,
      letItRideVotes: 0,
      totalVotes: 0,
      isOpen: true,
      createdAt: Date.now(),
    };
  }

  /**
   * Get popular auto cash-out rule templates
   */
  getAutoRuleTemplates(): Array<{
    name: string;
    description: string;
    trigger: AutoCashOutTrigger;
    action: { type: "full" | "partial"; partialPercentage?: number };
  }> {
    return [
      {
        name: "Lock In Profits",
        description: "Cash out when you've doubled your stake",
        trigger: {
          type: "profit_target",
          profitTarget: 100, // 100% profit = doubled
        },
        action: { type: "full" },
      },
      {
        name: "Cut Losses",
        description: "Cash out if value drops to 30% of stake",
        trigger: {
          type: "loss_limit",
          lossLimit: 30,
        },
        action: { type: "full" },
      },
      {
        name: "Probability Protection",
        description: "Cash out if win probability drops below 30%",
        trigger: {
          type: "probability",
          probabilityThreshold: 0.30,
          probabilityDirection: "below",
        },
        action: { type: "full" },
      },
      {
        name: "Half & Hold",
        description: "Cash out 50% when profit reaches 50%",
        trigger: {
          type: "profit_target",
          profitTarget: 50,
        },
        action: { type: "partial", partialPercentage: 50 },
      },
      {
        name: "Late Game Lock",
        description: "Cash out in the final 10% of game time",
        trigger: {
          type: "time_remaining",
          timeRemainingPct: 10,
        },
        action: { type: "full" },
      },
      {
        name: "Blowout Protection",
        description: "Cash out if your team goes up by 20+",
        trigger: {
          type: "score_based",
          scoreTrigger: { leadSize: 20 },
        },
        action: { type: "partial", partialPercentage: 75 },
      },
    ];
  }

  /**
   * Generate shareable cash-out card
   */
  generateShareCard(history: CashOutHistory): {
    title: string;
    subtitle: string;
    stats: Array<{ label: string; value: string }>;
    verdict: string;
    shareUrl: string;
  } {
    const profit = history.cashedOutAmount - history.originalStake;
    const profitPct = (profit / history.originalStake) * 100;

    return {
      title: profit >= 0 ? "CASHED OUT A WINNER! 💰" : "Smart Cash Out",
      subtitle: history.boostApplied
        ? `+${history.boostApplied.boostPercentage}% Boost Applied!`
        : "",
      stats: [
        { label: "Original Stake", value: `$${history.originalStake.toFixed(2)}` },
        { label: "Cashed Out", value: `$${history.cashedOutAmount.toFixed(2)}` },
        { label: "Profit", value: `${profit >= 0 ? "+" : ""}$${profit.toFixed(2)}` },
        { label: "ROI", value: `${profitPct >= 0 ? "+" : ""}${profitPct.toFixed(1)}%` },
      ],
      verdict: history.decisionQuality === "great"
        ? "PERFECT TIMING! 🎯"
        : history.decisionQuality === "good"
        ? "Good call! 👍"
        : history.decisionQuality === "regret"
        ? "Live and learn 🤷"
        : "Solid move",
      shareUrl: `https://pull.app/cashout/${history.id}`,
    };
  }
}

// ============================================================================
// CASH OUT BOOSTS
// ============================================================================

export const CASH_OUT_BOOSTS: CashOutBoost[] = [
  {
    id: "welcome_boost",
    name: "Welcome Boost",
    description: "10% extra on your first cash-out",
    boostPercentage: 10,
    validUntil: 0, // Set on signup
    usesRemaining: 1,
  },
  {
    id: "parlay_boost",
    name: "Parlay Cash-Out Boost",
    description: "5% extra when cashing out parlays",
    boostPercentage: 5,
    validUntil: 0,
    usesRemaining: 3,
    conditions: {
      betTypes: ["parlay"],
    },
  },
  {
    id: "big_bet_boost",
    name: "High Roller Boost",
    description: "8% extra on cash-outs over $500",
    boostPercentage: 8,
    validUntil: 0,
    usesRemaining: 1,
    conditions: {
      minCashOutValue: 500,
    },
  },
];

// ============================================================================
// FACTORY
// ============================================================================

export function createCashOutPlusService(): CashOutPlusService {
  return new CashOutPlusService();
}
