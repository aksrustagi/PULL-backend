/**
 * KILLER FEATURE #3: Live Sweat Mode
 *
 * Real-time bet tracking with live win probability, cash-out suggestions,
 * and synchronized viewing with friends.
 *
 * WHY IT KILLS:
 * - Creates appointment viewing (must watch together)
 * - Emotional engagement through probability swings
 * - Social pressure keeps users in app during games
 * - Cash-out optimization increases trust
 *
 * K-FACTOR BOOST:
 * - "Watch party" invites to friends
 * - Live reactions shareable to social
 * - Dramatic comeback clips auto-generated
 * - "Join my sweat" deep links
 */

import { z } from "zod";

// ============================================================================
// TYPES
// ============================================================================

export const SweatStatusSchema = z.enum([
  "pre_game",      // Game hasn't started
  "sweating",      // Game in progress, bet alive
  "winning",       // Currently ahead
  "losing",        // Currently behind
  "comeback",      // Was losing, now winning
  "collapse",      // Was winning, now losing
  "clutch",        // Close game, high stakes
  "cashed_out",    // User took cash out
  "won",           // Bet won
  "lost",          // Bet lost
  "pushed",        // Push
]);

export type SweatStatus = z.infer<typeof SweatStatusSchema>;

export interface LiveBetState {
  betId: string;
  userId: string;
  eventId: string;
  eventName: string;
  sport: string;

  // Bet details
  pick: string;
  odds: number;
  amount: number;
  potentialPayout: number;

  // Live state
  status: SweatStatus;
  currentWinProbability: number;
  previousWinProbability: number;
  probabilityHistory: ProbabilityPoint[];

  // Score/game state
  score?: {
    home: number;
    away: number;
    period?: string;
    clock?: string;
  };

  // Cash out
  currentCashOutValue: number;
  cashOutRecommendation?: CashOutRecommendation;

  // Drama metrics
  swingFactor: number; // How dramatic the probability changes have been
  clutchRating: number; // How close/intense the game is

  // Social
  watchPartyId?: string;
  viewers: number;
  reactions: LiveReaction[];

  updatedAt: number;
}

export interface ProbabilityPoint {
  timestamp: number;
  probability: number;
  event?: string; // What caused the change
}

export interface CashOutRecommendation {
  action: "hold" | "cash_out" | "partial";
  partialAmount?: number;
  reason: string;
  confidence: number;
  expectedValue: number;
}

export interface LiveReaction {
  userId: string;
  username: string;
  type: "fire" | "sweat" | "pain" | "pray" | "celebrate" | "dead";
  timestamp: number;
}

export interface WatchParty {
  id: string;
  hostUserId: string;
  hostUsername: string;
  name: string;
  betIds: string[];
  participantIds: string[];
  inviteCode: string;
  isPublic: boolean;
  chatEnabled: boolean;
  createdAt: number;
}

export interface SweatAlert {
  id: string;
  betId: string;
  userId: string;
  type: "probability_swing" | "cash_out_optimal" | "clutch_moment" | "game_changer";
  title: string;
  message: string;
  urgency: "low" | "medium" | "high" | "critical";
  actionUrl?: string;
  createdAt: number;
}

export interface SweatHighlight {
  id: string;
  betId: string;
  userId: string;
  title: string;
  description: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  probabilitySwing: number;
  startTime: number;
  endTime: number;
  shareUrl: string;
}

// ============================================================================
// LIVE SWEAT SERVICE
// ============================================================================

export class LiveSweatService {
  /**
   * Calculate current status based on probability and history
   */
  calculateStatus(
    currentProb: number,
    previousProb: number,
    isGameOver: boolean,
    didWin?: boolean
  ): SweatStatus {
    if (isGameOver) {
      if (didWin === true) return "won";
      if (didWin === false) return "lost";
      return "pushed";
    }

    const swing = currentProb - previousProb;

    // Dramatic status changes
    if (swing > 0.20 && previousProb < 0.4) return "comeback";
    if (swing < -0.20 && previousProb > 0.6) return "collapse";

    // Clutch situations
    if (currentProb > 0.35 && currentProb < 0.65) return "clutch";

    // Basic winning/losing
    if (currentProb > 0.6) return "winning";
    if (currentProb < 0.4) return "losing";

    return "sweating";
  }

  /**
   * Calculate cash-out recommendation
   */
  calculateCashOutRecommendation(
    currentProb: number,
    cashOutValue: number,
    potentialPayout: number,
    probabilityHistory: ProbabilityPoint[],
    timeRemainingPct: number
  ): CashOutRecommendation {
    const expectedValue = currentProb * potentialPayout;
    const cashOutEdge = cashOutValue - expectedValue;
    const edgePercentage = cashOutEdge / potentialPayout;

    // Look at trend
    const recentHistory = probabilityHistory.slice(-10);
    let trend = 0;
    if (recentHistory.length >= 2) {
      const first = recentHistory[0].probability;
      const last = recentHistory[recentHistory.length - 1].probability;
      trend = last - first;
    }

    // Calculate volatility
    const probValues = recentHistory.map(p => p.probability);
    const volatility = this.calculateVolatility(probValues);

    // Decision logic
    if (edgePercentage > 0.15 && currentProb < 0.5) {
      return {
        action: "cash_out",
        reason: "Cash out value significantly exceeds expected value. Good time to lock in profit.",
        confidence: 0.85,
        expectedValue,
      };
    }

    if (trend < -0.15 && timeRemainingPct < 0.3 && currentProb < 0.6) {
      return {
        action: "cash_out",
        reason: "Negative momentum late in game. Consider taking guaranteed value.",
        confidence: 0.75,
        expectedValue,
      };
    }

    if (volatility > 0.2 && currentProb > 0.5 && currentProb < 0.7) {
      return {
        action: "partial",
        partialAmount: 0.5,
        reason: "High volatility game. Consider partial cash out to reduce risk.",
        confidence: 0.7,
        expectedValue,
      };
    }

    if (currentProb > 0.8) {
      return {
        action: "hold",
        reason: "Strong position. Hold for full payout unless you need the guaranteed money.",
        confidence: 0.8,
        expectedValue,
      };
    }

    return {
      action: "hold",
      reason: "Current cash out doesn't offer significant edge. Watch and wait.",
      confidence: 0.6,
      expectedValue,
    };
  }

  /**
   * Calculate swing factor (how dramatic the bet has been)
   */
  calculateSwingFactor(history: ProbabilityPoint[]): number {
    if (history.length < 2) return 0;

    let totalSwing = 0;
    for (let i = 1; i < history.length; i++) {
      totalSwing += Math.abs(history[i].probability - history[i - 1].probability);
    }

    // Normalize to 0-10 scale
    return Math.min(10, totalSwing * 10);
  }

  /**
   * Calculate clutch rating (how close/intense)
   */
  calculateClutchRating(
    currentProb: number,
    timeRemainingPct: number,
    swingFactor: number
  ): number {
    // Highest clutch when probability near 50%, late in game, with high swings
    const closenessScore = 1 - Math.abs(currentProb - 0.5) * 2;
    const timeScore = 1 - timeRemainingPct;
    const swingScore = swingFactor / 10;

    return Math.round((closenessScore * 0.4 + timeScore * 0.4 + swingScore * 0.2) * 100);
  }

  /**
   * Create a watch party
   */
  createWatchParty(
    hostUserId: string,
    hostUsername: string,
    betIds: string[],
    options: {
      name?: string;
      isPublic?: boolean;
      chatEnabled?: boolean;
    } = {}
  ): WatchParty {
    return {
      id: `party_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      hostUserId,
      hostUsername,
      name: options.name ?? `${hostUsername}'s Sweat Session`,
      betIds,
      participantIds: [hostUserId],
      inviteCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
      isPublic: options.isPublic ?? false,
      chatEnabled: options.chatEnabled ?? true,
      createdAt: Date.now(),
    };
  }

  /**
   * Generate sweat alert
   */
  generateAlert(
    betState: LiveBetState,
    previousState: LiveBetState
  ): SweatAlert | null {
    const probSwing = betState.currentWinProbability - previousState.currentWinProbability;

    // Major probability swing
    if (Math.abs(probSwing) > 0.25) {
      const isPositive = probSwing > 0;
      return {
        id: `alert_${Date.now()}`,
        betId: betState.betId,
        userId: betState.userId,
        type: "probability_swing",
        title: isPositive ? "MOMENTUM SWING! 📈" : "DANGER ZONE! 📉",
        message: isPositive
          ? `Your bet just jumped ${Math.round(probSwing * 100)}%! You're back in it!`
          : `Big swing against you! Down ${Math.round(Math.abs(probSwing) * 100)}%`,
        urgency: isPositive ? "medium" : "high",
        createdAt: Date.now(),
      };
    }

    // Cash out optimal moment
    if (betState.cashOutRecommendation?.action === "cash_out" &&
        previousState.cashOutRecommendation?.action !== "cash_out") {
      return {
        id: `alert_${Date.now()}`,
        betId: betState.betId,
        userId: betState.userId,
        type: "cash_out_optimal",
        title: "Cash Out Window! 💰",
        message: betState.cashOutRecommendation.reason,
        urgency: "high",
        actionUrl: `/bets/${betState.betId}/cash-out`,
        createdAt: Date.now(),
      };
    }

    // Clutch moment
    if (betState.clutchRating > 80 && previousState.clutchRating <= 80) {
      return {
        id: `alert_${Date.now()}`,
        betId: betState.betId,
        userId: betState.userId,
        type: "clutch_moment",
        title: "CLUTCH TIME! ⏰",
        message: `This is it! ${Math.round(betState.currentWinProbability * 100)}% win probability in crunch time.`,
        urgency: "critical",
        createdAt: Date.now(),
      };
    }

    return null;
  }

  /**
   * Generate shareable highlight
   */
  generateHighlight(
    betState: LiveBetState,
    momentDescription: string,
    startTime: number
  ): SweatHighlight {
    const swing = betState.currentWinProbability - betState.previousWinProbability;

    return {
      id: `highlight_${Date.now()}`,
      betId: betState.betId,
      userId: betState.userId,
      title: swing > 0 ? "WHAT A SWING! 🎢" : "The Collapse 💔",
      description: momentDescription,
      probabilitySwing: swing,
      startTime,
      endTime: Date.now(),
      shareUrl: `https://pull.app/highlights/${betState.betId}/${startTime}`,
    };
  }

  /**
   * Get reaction emoji
   */
  getReactionEmoji(type: LiveReaction["type"]): string {
    const emojis: Record<LiveReaction["type"], string> = {
      fire: "🔥",
      sweat: "😰",
      pain: "😫",
      pray: "🙏",
      celebrate: "🎉",
      dead: "💀",
    };
    return emojis[type];
  }

  private calculateVolatility(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createLiveSweatService(): LiveSweatService {
  return new LiveSweatService();
}
