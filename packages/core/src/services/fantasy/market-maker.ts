/**
 * Fantasy Football Market Maker
 *
 * Implements a Logarithmic Market Scoring Rule (LMSR) automated market maker
 * for fantasy football prediction markets.
 */

import type {
  FantasyMarket,
  MarketOutcome,
  MarketType,
  MarketStatus,
  Bet,
  Matchup,
  Team,
  League,
} from "./types";

// =============================================================================
// LMSR MARKET MAKER
// =============================================================================

/**
 * LMSR (Logarithmic Market Scoring Rule) implementation
 *
 * The LMSR is a popular market maker for prediction markets. It provides:
 * - Automatic liquidity at all price levels
 * - Bounded loss for the market maker
 * - Prices that reflect probability estimates
 */
export class LMSRMarketMaker {
  /**
   * Calculate the cost function for LMSR
   * C(q) = b * ln(sum(exp(q_i / b)))
   */
  static costFunction(quantities: number[], b: number): number {
    const maxQ = Math.max(...quantities);
    const sumExp = quantities.reduce((sum, q) => {
      return sum + Math.exp((q - maxQ) / b);
    }, 0);
    return b * (maxQ + Math.log(sumExp));
  }

  /**
   * Calculate the price for a specific outcome
   * Price(i) = exp(q_i / b) / sum(exp(q_j / b))
   */
  static price(quantities: number[], outcomeIndex: number, b: number): number {
    const maxQ = Math.max(...quantities);
    const expValues = quantities.map((q) => Math.exp((q - maxQ) / b));
    const sumExp = expValues.reduce((sum, exp) => sum + exp, 0);
    return expValues[outcomeIndex] / sumExp;
  }

  /**
   * Calculate all prices
   */
  static prices(quantities: number[], b: number): number[] {
    const maxQ = Math.max(...quantities);
    const expValues = quantities.map((q) => Math.exp((q - maxQ) / b));
    const sumExp = expValues.reduce((sum, exp) => sum + exp, 0);
    return expValues.map((exp) => exp / sumExp);
  }

  /**
   * Calculate cost to buy shares of a specific outcome
   */
  static costToBuy(
    quantities: number[],
    outcomeIndex: number,
    sharesToBuy: number,
    b: number
  ): number {
    const currentCost = this.costFunction(quantities, b);
    const newQuantities = [...quantities];
    newQuantities[outcomeIndex] += sharesToBuy;
    const newCost = this.costFunction(newQuantities, b);
    return newCost - currentCost;
  }

  /**
   * Calculate shares received for a given investment amount
   * Uses binary search to find the number of shares
   */
  static sharesToReceive(
    quantities: number[],
    outcomeIndex: number,
    investment: number,
    b: number,
    precision: number = 0.01
  ): number {
    let low = 0;
    let high = investment * 100; // Upper bound
    let shares = 0;

    while (high - low > precision) {
      const mid = (low + high) / 2;
      const cost = this.costToBuy(quantities, outcomeIndex, mid, b);

      if (cost < investment) {
        shares = mid;
        low = mid;
      } else {
        high = mid;
      }
    }

    return shares;
  }

  /**
   * Calculate proceeds from selling shares
   */
  static proceedsFromSale(
    quantities: number[],
    outcomeIndex: number,
    sharesToSell: number,
    b: number
  ): number {
    const currentCost = this.costFunction(quantities, b);
    const newQuantities = [...quantities];
    newQuantities[outcomeIndex] -= sharesToSell;
    const newCost = this.costFunction(newQuantities, b);
    return currentCost - newCost;
  }

  /**
   * Convert price to American odds
   */
  static priceToAmericanOdds(price: number): number {
    if (price >= 0.5) {
      // Favorite: negative odds
      return Math.round((-100 * price) / (1 - price));
    } else {
      // Underdog: positive odds
      return Math.round((100 * (1 - price)) / price);
    }
  }

  /**
   * Convert price to decimal odds
   */
  static priceToDecimalOdds(price: number): number {
    return Math.round((1 / price) * 100) / 100;
  }

  /**
   * Convert American odds to price (implied probability)
   */
  static americanOddsToPrice(odds: number): number {
    if (odds > 0) {
      return 100 / (odds + 100);
    } else {
      return Math.abs(odds) / (Math.abs(odds) + 100);
    }
  }
}

// =============================================================================
// MARKET CREATION
// =============================================================================

/**
 * Create a matchup prediction market
 */
export function createMatchupMarket(
  matchup: Matchup,
  league: League,
  liquidityParameter: number = 100
): Omit<FantasyMarket, "id" | "createdAt" | "createdBy"> {
  // Initial prices based on projected scores
  const totalProjected = matchup.teamAProjected + matchup.teamBProjected;
  const teamAProb = totalProjected > 0
    ? matchup.teamAProjected / totalProjected
    : 0.5;
  const teamBProb = 1 - teamAProb;

  // Adjust slightly toward 50/50 to account for uncertainty
  const adjustedTeamAProb = teamAProb * 0.8 + 0.5 * 0.2;
  const adjustedTeamBProb = 1 - adjustedTeamAProb;

  return {
    leagueId: league.id,
    type: "matchup",
    title: `${matchup.teamA.name} vs ${matchup.teamB.name}`,
    description: `Week ${matchup.week} matchup. Who will win?`,
    referenceType: "matchup",
    referenceId: matchup.id,
    week: matchup.week,
    season: matchup.season,
    outcomes: [
      {
        id: matchup.teamA.id,
        label: matchup.teamA.name,
        description: `Projected: ${matchup.teamAProjected.toFixed(1)} pts`,
        odds: LMSRMarketMaker.priceToDecimalOdds(adjustedTeamAProb),
        impliedProbability: adjustedTeamAProb,
        totalVolume: 0,
      },
      {
        id: matchup.teamB.id,
        label: matchup.teamB.name,
        description: `Projected: ${matchup.teamBProjected.toFixed(1)} pts`,
        odds: LMSRMarketMaker.priceToDecimalOdds(adjustedTeamBProb),
        impliedProbability: adjustedTeamBProb,
        totalVolume: 0,
      },
    ],
    liquidityParameter,
    totalLiquidity: liquidityParameter * 2,
    totalVolume: 0,
    status: "open",
    opensAt: Date.now(),
    closesAt: matchup.scheduledAt,
  };
}

/**
 * Create a league winner prediction market
 */
export function createLeagueWinnerMarket(
  league: League,
  teams: Team[],
  liquidityParameter: number = 200
): Omit<FantasyMarket, "id" | "createdAt" | "createdBy"> {
  // Calculate probabilities based on standings
  const totalWins = teams.reduce((sum, t) => sum + t.wins + 1, 0); // +1 to avoid division by zero
  const probabilities = teams.map((t) => (t.wins + 1) / totalWins);

  // Normalize
  const totalProb = probabilities.reduce((sum, p) => sum + p, 0);
  const normalizedProbs = probabilities.map((p) => p / totalProb);

  return {
    leagueId: league.id,
    type: "league_winner",
    title: `${league.name} Champion`,
    description: `Who will win the ${league.name} championship?`,
    referenceType: "league",
    referenceId: league.id,
    season: league.season,
    outcomes: teams.map((team, i) => ({
      id: team.id,
      label: team.name,
      description: `Record: ${team.wins}-${team.losses}`,
      odds: LMSRMarketMaker.priceToDecimalOdds(normalizedProbs[i]),
      impliedProbability: normalizedProbs[i],
      totalVolume: 0,
    })),
    liquidityParameter,
    totalLiquidity: liquidityParameter * teams.length,
    totalVolume: 0,
    status: "open",
    opensAt: Date.now(),
    closesAt: league.seasonEndAt || Date.now() + 86400000 * 120, // 120 days
  };
}

/**
 * Create a weekly high score market
 */
export function createWeeklyHighScoreMarket(
  league: League,
  teams: Team[],
  week: number,
  liquidityParameter: number = 100
): Omit<FantasyMarket, "id" | "createdAt" | "createdBy"> {
  // Equal probabilities for high score (could be refined with projections)
  const probability = 1 / teams.length;

  return {
    leagueId: league.id,
    type: "weekly_high_score",
    title: `Week ${week} High Score`,
    description: `Which team will score the most points in Week ${week}?`,
    referenceType: "league",
    referenceId: league.id,
    week,
    season: league.season,
    outcomes: teams.map((team) => ({
      id: team.id,
      label: team.name,
      description: `Projected: ${team.projectedPoints.toFixed(1)} pts`,
      odds: LMSRMarketMaker.priceToDecimalOdds(probability),
      impliedProbability: probability,
      totalVolume: 0,
    })),
    liquidityParameter,
    totalLiquidity: liquidityParameter * teams.length,
    totalVolume: 0,
    status: "open",
    opensAt: Date.now(),
    closesAt: Date.now() + 86400000 * 3, // 3 days
  };
}

/**
 * Create an over/under market for a player
 */
export function createPlayerPropMarket(
  playerId: string,
  playerName: string,
  playerTeam: string,
  line: number,
  propType: "points" | "touchdowns" | "yards",
  week: number,
  season: string,
  liquidityParameter: number = 50
): Omit<FantasyMarket, "id" | "createdAt" | "createdBy"> {
  const propLabel = propType === "points"
    ? "Fantasy Points"
    : propType === "touchdowns"
      ? "Touchdowns"
      : "Yards";

  return {
    type: "player_prop",
    title: `${playerName} ${propLabel} O/U ${line}`,
    description: `Will ${playerName} (${playerTeam}) score over or under ${line} ${propLabel.toLowerCase()} in Week ${week}?`,
    referenceType: "player",
    referenceId: playerId,
    week,
    season,
    outcomes: [
      {
        id: "over",
        label: `Over ${line}`,
        description: `${playerName} scores more than ${line} ${propLabel.toLowerCase()}`,
        odds: 2.0,
        impliedProbability: 0.5,
        totalVolume: 0,
      },
      {
        id: "under",
        label: `Under ${line}`,
        description: `${playerName} scores ${line} or fewer ${propLabel.toLowerCase()}`,
        odds: 2.0,
        impliedProbability: 0.5,
        totalVolume: 0,
      },
    ],
    liquidityParameter,
    totalLiquidity: liquidityParameter * 2,
    totalVolume: 0,
    status: "open",
    opensAt: Date.now(),
    closesAt: Date.now() + 86400000 * 3, // 3 days
  };
}

// =============================================================================
// BETTING OPERATIONS
// =============================================================================

export interface PlaceBetResult {
  success: boolean;
  bet?: Omit<Bet, "id">;
  error?: string;
  updatedMarket?: FantasyMarket;
}

/**
 * Place a bet on a market
 */
export function placeBet(
  market: FantasyMarket,
  userId: string,
  outcomeId: string,
  amount: number,
  maxSlippage: number = 0.05
): PlaceBetResult {
  // Validate market is open
  if (market.status !== "open") {
    return { success: false, error: "Market is not open for betting" };
  }

  // Validate market hasn't closed
  if (Date.now() >= market.closesAt) {
    return { success: false, error: "Market has closed" };
  }

  // Find outcome
  const outcomeIndex = market.outcomes.findIndex((o) => o.id === outcomeId);
  if (outcomeIndex === -1) {
    return { success: false, error: "Invalid outcome" };
  }

  const outcome = market.outcomes[outcomeIndex];

  // Get current quantities from volumes
  const quantities = market.outcomes.map((o) => o.totalVolume);
  const b = market.liquidityParameter;

  // Calculate current price
  const currentPrice = LMSRMarketMaker.price(quantities, outcomeIndex, b);

  // Calculate shares to receive
  const shares = LMSRMarketMaker.sharesToReceive(
    quantities,
    outcomeIndex,
    amount,
    b
  );

  if (shares <= 0) {
    return { success: false, error: "Invalid bet amount" };
  }

  // Calculate new price after bet
  const newQuantities = [...quantities];
  newQuantities[outcomeIndex] += shares;
  const newPrice = LMSRMarketMaker.price(newQuantities, outcomeIndex, b);

  // Check slippage
  const slippage = (newPrice - currentPrice) / currentPrice;
  if (slippage > maxSlippage) {
    return {
      success: false,
      error: `Price slippage (${(slippage * 100).toFixed(1)}%) exceeds maximum (${(maxSlippage * 100).toFixed(1)}%)`,
    };
  }

  // Calculate potential payout (1 share = 1 unit if outcome wins)
  const potentialPayout = shares;

  // Create bet
  const bet: Omit<Bet, "id"> = {
    userId,
    marketId: market.id,
    leagueId: market.leagueId,
    outcomeId,
    outcomeLabel: outcome.label,
    amount,
    oddsAtPlacement: LMSRMarketMaker.priceToDecimalOdds(currentPrice),
    impliedProbabilityAtPlacement: currentPrice,
    potentialPayout,
    status: "active",
    placedAt: Date.now(),
  };

  // Update market
  const updatedOutcomes = market.outcomes.map((o, i) => {
    const newQuantity = quantities[i] + (i === outcomeIndex ? shares : 0);
    const newOddsPrice = LMSRMarketMaker.price(newQuantities, i, b);
    return {
      ...o,
      totalVolume: newQuantity,
      odds: LMSRMarketMaker.priceToDecimalOdds(newOddsPrice),
      impliedProbability: newOddsPrice,
    };
  });

  const updatedMarket: FantasyMarket = {
    ...market,
    outcomes: updatedOutcomes,
    totalVolume: market.totalVolume + amount,
  };

  return {
    success: true,
    bet,
    updatedMarket,
  };
}

/**
 * Calculate cash out value for a bet
 */
export function calculateCashOutValue(
  market: FantasyMarket,
  bet: Bet
): number {
  if (bet.status !== "active" || market.status !== "open") {
    return 0;
  }

  const outcomeIndex = market.outcomes.findIndex((o) => o.id === bet.outcomeId);
  if (outcomeIndex === -1) return 0;

  const quantities = market.outcomes.map((o) => o.totalVolume);
  const b = market.liquidityParameter;

  // Calculate current value of position
  const currentPrice = LMSRMarketMaker.price(quantities, outcomeIndex, b);

  // Simple cash out: current price * shares owned
  // The shares owned can be approximated from the original bet
  const sharesOwned = bet.potentialPayout;
  const currentValue = sharesOwned * currentPrice;

  // Apply a small cash out fee (2%)
  const cashOutValue = currentValue * 0.98;

  return Math.max(0, Math.round(cashOutValue * 100) / 100);
}

/**
 * Execute cash out
 */
export function executeCashOut(
  market: FantasyMarket,
  bet: Bet
): { success: boolean; amount: number; error?: string } {
  if (bet.status !== "active") {
    return { success: false, amount: 0, error: "Bet is not active" };
  }

  if (market.status !== "open") {
    return { success: false, amount: 0, error: "Market is not open" };
  }

  const amount = calculateCashOutValue(market, bet);
  if (amount <= 0) {
    return { success: false, amount: 0, error: "Cash out value is zero" };
  }

  return { success: true, amount };
}

/**
 * Settle a market
 */
export function settleMarket(
  market: FantasyMarket,
  winningOutcomeId: string,
  bets: Bet[]
): { market: FantasyMarket; settledBets: Bet[] } {
  const winningOutcome = market.outcomes.find((o) => o.id === winningOutcomeId);
  if (!winningOutcome) {
    throw new Error("Invalid winning outcome");
  }

  const settledMarket: FantasyMarket = {
    ...market,
    status: "settled",
    winningOutcomeId,
    settlementValue: 1,
    settlesAt: Date.now(),
  };

  const settledBets = bets.map((bet) => {
    if (bet.status !== "active") return bet;

    const won = bet.outcomeId === winningOutcomeId;
    const settledAmount = won ? bet.potentialPayout : 0;
    const profitLoss = won ? settledAmount - bet.amount : -bet.amount;

    return {
      ...bet,
      status: won ? "won" : "lost",
      settledAmount,
      profitLoss,
      settledAt: Date.now(),
    } as Bet;
  });

  return { market: settledMarket, settledBets };
}

/**
 * Void a market (refund all bets)
 */
export function voidMarket(
  market: FantasyMarket,
  bets: Bet[],
  reason: string
): { market: FantasyMarket; refundedBets: Bet[] } {
  const voidedMarket: FantasyMarket = {
    ...market,
    status: "voided",
    settlementNotes: reason,
    settlesAt: Date.now(),
  };

  const refundedBets = bets.map((bet) => {
    if (bet.status !== "active") return bet;

    return {
      ...bet,
      status: "refunded",
      settledAmount: bet.amount,
      profitLoss: 0,
      settledAt: Date.now(),
    } as Bet;
  });

  return { market: voidedMarket, refundedBets };
}

// =============================================================================
// ODDS DISPLAY HELPERS
// =============================================================================

/**
 * Format odds for display
 */
export function formatOdds(
  price: number,
  format: "american" | "decimal" | "probability" = "american"
): string {
  switch (format) {
    case "american":
      const american = LMSRMarketMaker.priceToAmericanOdds(price);
      return american > 0 ? `+${american}` : `${american}`;
    case "decimal":
      return LMSRMarketMaker.priceToDecimalOdds(price).toFixed(2);
    case "probability":
      return `${(price * 100).toFixed(1)}%`;
  }
}

/**
 * Get odds movement indicator
 */
export function getOddsMovement(
  currentPrice: number,
  previousPrice: number
): "up" | "down" | "stable" {
  const diff = currentPrice - previousPrice;
  if (Math.abs(diff) < 0.01) return "stable";
  return diff > 0 ? "up" : "down";
}
