/**
 * Bracket Market Integration
 *
 * Integrates bracket competitions with prediction markets for betting:
 * - Bracket pool winner markets
 * - Individual matchup markets
 * - Tournament winner futures
 * - Head-to-head markets
 * - Prop markets (upset counts, score totals, etc.)
 */

import { z } from "zod";

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

export const BracketMarketTypeSchema = z.enum([
  // Pool Markets
  "pool_winner",              // Who wins a specific bracket pool
  "pool_podium",              // Top 3 in a pool
  "pool_points_over_under",   // Total points in pool

  // Tournament Markets
  "tournament_champion",      // Who wins the tournament
  "final_four",               // Make Final Four (NCAA)
  "conference_winner",        // Conference champion
  "region_winner",            // Region winner

  // Matchup Markets
  "matchup_winner",           // Individual game winner
  "matchup_spread",           // Point spread
  "matchup_total",            // Over/under total
  "series_winner",            // Best-of series winner
  "series_length",            // How many games in series

  // Head-to-Head Markets
  "h2h_golfer",               // Golfer vs golfer
  "h2h_team_wins",            // Which team wins more games
  "h2h_player_stats",         // Player stat comparison

  // Prop Markets
  "upset_count",              // Total upsets in tournament
  "cinderella_run",           // Low seed making deep run
  "chalk_rate",               // % of favorites winning
  "perfect_bracket_bonus",    // Perfect bracket insurance
  "first_upset",              // First upset of tournament
  "biggest_upset",            // Biggest seed differential upset

  // Exotic Markets
  "bracket_bingo",            // Hit all squares on bingo card
  "survive_and_advance",      // All your picks survive round
  "champion_seed",            // Seed of eventual champion
]);

export type BracketMarketType = z.infer<typeof BracketMarketTypeSchema>;

export interface BracketMarket {
  id: string;
  type: BracketMarketType;
  bracketType: string;
  tournamentId?: string;
  poolId?: string;
  matchupId?: string;
  season: string;

  title: string;
  description: string;
  imageUrl?: string;

  // Outcomes
  outcomes: MarketOutcome[];

  // LMSR Parameters
  liquidityParameter: number;
  totalLiquidity: number;
  totalVolume: number;

  // Status
  status: "pending" | "open" | "locked" | "settled" | "cancelled" | "voided";

  // Resolution
  winningOutcomeId?: string;
  settlementValue?: number;
  settlementNotes?: string;
  resolutionSource?: string;

  // Timing
  opensAt: number;
  closesAt: number;
  settledAt?: number;

  // Limits
  minBet: number;
  maxBet: number;
  maxExposure: number;

  // Metadata
  tags: string[];
  featured: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MarketOutcome {
  id: string;
  label: string;
  description?: string;
  teamId?: string;
  playerId?: string;
  value?: number; // For numeric outcomes (over/under line, etc.)
  odds: number;
  impliedProbability: number;
  totalVolume: number;
  totalShares: number;
}

export interface BracketBet {
  id: string;
  userId: string;
  marketId: string;
  poolId?: string;
  outcomeId: string;
  outcomeLabel: string;

  // Bet Details
  amount: number;
  shares: number;
  oddsAtPlacement: number;
  impliedProbabilityAtPlacement: number;
  potentialPayout: number;

  // Status
  status: "pending" | "active" | "won" | "lost" | "cashed_out" | "voided" | "refunded";

  // Settlement
  settledAmount?: number;
  profitLoss?: number;
  settledAt?: number;

  // Cash Out
  cashOutAvailable: boolean;
  currentCashOutValue?: number;
  cashedOutAmount?: number;
  cashedOutAt?: number;

  // Timestamps
  placedAt: number;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// LMSR MARKET MAKER
// ============================================================================

export class LMSRMarketMaker {
  private b: number; // Liquidity parameter

  constructor(liquidityParameter: number = 100) {
    this.b = liquidityParameter;
  }

  /**
   * Calculate cost to buy shares
   */
  calculateCost(currentShares: number[], outcomeIndex: number, sharesToBuy: number): number {
    const currentCost = this.costFunction(currentShares);
    const newShares = [...currentShares];
    newShares[outcomeIndex] += sharesToBuy;
    const newCost = this.costFunction(newShares);
    return newCost - currentCost;
  }

  /**
   * LMSR cost function: b * ln(sum(e^(q_i/b)))
   */
  private costFunction(shares: number[]): number {
    const sum = shares.reduce((acc, q) => acc + Math.exp(q / this.b), 0);
    return this.b * Math.log(sum);
  }

  /**
   * Calculate current price (probability) for an outcome
   */
  calculatePrice(shares: number[], outcomeIndex: number): number {
    const expValues = shares.map(q => Math.exp(q / this.b));
    const sum = expValues.reduce((a, b) => a + b, 0);
    return expValues[outcomeIndex] / sum;
  }

  /**
   * Calculate prices for all outcomes
   */
  calculateAllPrices(shares: number[]): number[] {
    const expValues = shares.map(q => Math.exp(q / this.b));
    const sum = expValues.reduce((a, b) => a + b, 0);
    return expValues.map(exp => exp / sum);
  }

  /**
   * Calculate shares received for a given cost
   */
  calculateShares(currentShares: number[], outcomeIndex: number, cost: number): number {
    // Binary search for shares
    let low = 0;
    let high = cost * 10; // Upper bound estimate
    const tolerance = 0.0001;

    while (high - low > tolerance) {
      const mid = (low + high) / 2;
      const midCost = this.calculateCost(currentShares, outcomeIndex, mid);

      if (midCost < cost) {
        low = mid;
      } else {
        high = mid;
      }
    }

    return low;
  }

  /**
   * Calculate payout if outcome wins
   */
  calculatePayout(shares: number): number {
    return shares; // Each share pays out $1 if correct
  }

  /**
   * Calculate current cash out value
   */
  calculateCashOutValue(currentShares: number[], outcomeIndex: number, userShares: number): number {
    // Selling shares is buying negative shares
    return -this.calculateCost(currentShares, outcomeIndex, -userShares);
  }

  /**
   * Convert probability to American odds
   */
  probabilityToAmericanOdds(probability: number): number {
    if (probability >= 0.5) {
      return Math.round(-100 * probability / (1 - probability));
    } else {
      return Math.round(100 * (1 - probability) / probability);
    }
  }

  /**
   * Convert American odds to probability
   */
  americanOddsToProbability(odds: number): number {
    if (odds < 0) {
      return Math.abs(odds) / (Math.abs(odds) + 100);
    } else {
      return 100 / (odds + 100);
    }
  }
}

// ============================================================================
// BRACKET MARKET SERVICE
// ============================================================================

export class BracketMarketService {
  private marketMaker: LMSRMarketMaker;

  constructor(liquidityParameter: number = 100) {
    this.marketMaker = new LMSRMarketMaker(liquidityParameter);
  }

  /**
   * Create markets for a bracket pool
   */
  createPoolMarkets(pool: {
    id: string;
    name: string;
    bracketType: string;
    season: string;
    lockTime: number;
    participants: Array<{ userId: string; userName: string; bracketId: string }>;
  }): BracketMarket[] {
    const markets: BracketMarket[] = [];

    // Pool Winner Market
    if (pool.participants.length >= 2) {
      markets.push({
        id: `pool_winner_${pool.id}`,
        type: "pool_winner",
        bracketType: pool.bracketType,
        poolId: pool.id,
        season: pool.season,
        title: `${pool.name} - Pool Winner`,
        description: `Who will win the ${pool.name} bracket pool?`,
        outcomes: pool.participants.map(p => ({
          id: `outcome_${p.userId}`,
          label: p.userName,
          odds: 0,
          impliedProbability: 1 / pool.participants.length,
          totalVolume: 0,
          totalShares: 0,
        })),
        liquidityParameter: 100,
        totalLiquidity: 0,
        totalVolume: 0,
        status: "pending",
        opensAt: Date.now(),
        closesAt: pool.lockTime,
        minBet: 1,
        maxBet: 1000,
        maxExposure: 10000,
        tags: ["bracket", "pool", pool.bracketType],
        featured: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    return markets;
  }

  /**
   * Create markets for tournament matchups
   */
  createMatchupMarkets(matchup: {
    id: string;
    round: number;
    roundName: string;
    team1: { id: string; name: string; seed?: number };
    team2: { id: string; name: string; seed?: number };
    scheduledAt: number;
    bracketType: string;
    season: string;
  }): BracketMarket[] {
    const markets: BracketMarket[] = [];

    // Winner Market
    markets.push({
      id: `matchup_winner_${matchup.id}`,
      type: "matchup_winner",
      bracketType: matchup.bracketType,
      matchupId: matchup.id,
      season: matchup.season,
      title: `${matchup.team1.name} vs ${matchup.team2.name}`,
      description: `${matchup.roundName}: Who will win?`,
      outcomes: [
        {
          id: `outcome_${matchup.team1.id}`,
          label: matchup.team1.seed ? `(${matchup.team1.seed}) ${matchup.team1.name}` : matchup.team1.name,
          teamId: matchup.team1.id,
          odds: 0,
          impliedProbability: 0.5,
          totalVolume: 0,
          totalShares: 0,
        },
        {
          id: `outcome_${matchup.team2.id}`,
          label: matchup.team2.seed ? `(${matchup.team2.seed}) ${matchup.team2.name}` : matchup.team2.name,
          teamId: matchup.team2.id,
          odds: 0,
          impliedProbability: 0.5,
          totalVolume: 0,
          totalShares: 0,
        },
      ],
      liquidityParameter: 100,
      totalLiquidity: 0,
      totalVolume: 0,
      status: "pending",
      opensAt: Date.now(),
      closesAt: matchup.scheduledAt - 5 * 60 * 1000, // 5 min before game
      minBet: 1,
      maxBet: 500,
      maxExposure: 5000,
      tags: ["bracket", "matchup", matchup.bracketType, matchup.roundName.toLowerCase().replace(" ", "_")],
      featured: matchup.round >= 4, // Feature later rounds
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return markets;
  }

  /**
   * Create head-to-head golfer markets
   */
  createGolfH2HMarkets(matchups: Array<{
    id: string;
    tournamentId: string;
    tournamentName: string;
    golfer1: { id: string; name: string; worldRank?: number };
    golfer2: { id: string; name: string; worldRank?: number };
    round?: number; // For tournament rounds
    scheduledAt: number;
    season: string;
  }>): BracketMarket[] {
    return matchups.map(matchup => ({
      id: `golf_h2h_${matchup.id}`,
      type: "h2h_golfer",
      bracketType: "golf_head_to_head",
      tournamentId: matchup.tournamentId,
      matchupId: matchup.id,
      season: matchup.season,
      title: `${matchup.golfer1.name} vs ${matchup.golfer2.name}`,
      description: matchup.round
        ? `${matchup.tournamentName} - Round ${matchup.round} Head-to-Head`
        : `${matchup.tournamentName} - Tournament H2H`,
      outcomes: [
        {
          id: `outcome_${matchup.golfer1.id}`,
          label: matchup.golfer1.name,
          playerId: matchup.golfer1.id,
          odds: 0,
          impliedProbability: 0.5,
          totalVolume: 0,
          totalShares: 0,
        },
        {
          id: `outcome_${matchup.golfer2.id}`,
          label: matchup.golfer2.name,
          playerId: matchup.golfer2.id,
          odds: 0,
          impliedProbability: 0.5,
          totalVolume: 0,
          totalShares: 0,
        },
        {
          id: "outcome_tie",
          label: "Tie",
          odds: 0,
          impliedProbability: 0.1,
          totalVolume: 0,
          totalShares: 0,
        },
      ],
      liquidityParameter: 50,
      totalLiquidity: 0,
      totalVolume: 0,
      status: "pending",
      opensAt: Date.now(),
      closesAt: matchup.scheduledAt - 30 * 60 * 1000, // 30 min before tee time
      minBet: 1,
      maxBet: 200,
      maxExposure: 2000,
      tags: ["golf", "h2h", matchup.tournamentName.toLowerCase().replace(/ /g, "_")],
      featured: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
  }

  /**
   * Create tournament futures markets
   */
  createFuturesMarkets(tournament: {
    id: string;
    name: string;
    bracketType: string;
    season: string;
    teams: Array<{ id: string; name: string; seed?: number; odds?: number }>;
    startDate: number;
  }): BracketMarket[] {
    const markets: BracketMarket[] = [];

    // Tournament Winner
    markets.push({
      id: `futures_champion_${tournament.id}`,
      type: "tournament_champion",
      bracketType: tournament.bracketType,
      tournamentId: tournament.id,
      season: tournament.season,
      title: `${tournament.name} - Tournament Champion`,
      description: `Who will win the ${tournament.name}?`,
      outcomes: tournament.teams.map(team => ({
        id: `outcome_${team.id}`,
        label: team.seed ? `(${team.seed}) ${team.name}` : team.name,
        teamId: team.id,
        odds: team.odds ?? 0,
        impliedProbability: team.odds
          ? this.marketMaker.americanOddsToProbability(team.odds)
          : 1 / tournament.teams.length,
        totalVolume: 0,
        totalShares: 0,
      })),
      liquidityParameter: 500,
      totalLiquidity: 0,
      totalVolume: 0,
      status: "pending",
      opensAt: Date.now(),
      closesAt: tournament.startDate - 60 * 60 * 1000, // 1 hour before start
      minBet: 1,
      maxBet: 1000,
      maxExposure: 50000,
      tags: ["futures", "champion", tournament.bracketType],
      featured: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return markets;
  }

  /**
   * Create prop markets for tournaments
   */
  createPropMarkets(tournament: {
    id: string;
    name: string;
    bracketType: string;
    season: string;
    numGames: number;
    startDate: number;
  }): BracketMarket[] {
    const markets: BracketMarket[] = [];

    // Upset Count Market
    const expectedUpsets = Math.round(tournament.numGames * 0.3); // ~30% upsets typical
    markets.push({
      id: `prop_upsets_${tournament.id}`,
      type: "upset_count",
      bracketType: tournament.bracketType,
      tournamentId: tournament.id,
      season: tournament.season,
      title: `${tournament.name} - Total Upsets`,
      description: `How many upsets (lower seed wins) in the tournament?`,
      outcomes: [
        {
          id: "under",
          label: `Under ${expectedUpsets}.5`,
          value: expectedUpsets,
          odds: -110,
          impliedProbability: 0.5,
          totalVolume: 0,
          totalShares: 0,
        },
        {
          id: "over",
          label: `Over ${expectedUpsets}.5`,
          value: expectedUpsets,
          odds: -110,
          impliedProbability: 0.5,
          totalVolume: 0,
          totalShares: 0,
        },
      ],
      liquidityParameter: 100,
      totalLiquidity: 0,
      totalVolume: 0,
      status: "pending",
      opensAt: Date.now(),
      closesAt: tournament.startDate,
      minBet: 1,
      maxBet: 500,
      maxExposure: 5000,
      tags: ["prop", "upsets", tournament.bracketType],
      featured: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Champion Seed Market
    markets.push({
      id: `prop_champ_seed_${tournament.id}`,
      type: "champion_seed",
      bracketType: tournament.bracketType,
      tournamentId: tournament.id,
      season: tournament.season,
      title: `${tournament.name} - Champion Seed`,
      description: `What seed will the champion be?`,
      outcomes: [
        { id: "seed_1", label: "1 Seed", odds: 150, impliedProbability: 0.4, totalVolume: 0, totalShares: 0 },
        { id: "seed_2", label: "2 Seed", odds: 300, impliedProbability: 0.25, totalVolume: 0, totalShares: 0 },
        { id: "seed_3", label: "3 Seed", odds: 600, impliedProbability: 0.14, totalVolume: 0, totalShares: 0 },
        { id: "seed_4_5", label: "4 or 5 Seed", odds: 800, impliedProbability: 0.11, totalVolume: 0, totalShares: 0 },
        { id: "seed_6_plus", label: "6+ Seed", odds: 1000, impliedProbability: 0.1, totalVolume: 0, totalShares: 0 },
      ],
      liquidityParameter: 100,
      totalLiquidity: 0,
      totalVolume: 0,
      status: "pending",
      opensAt: Date.now(),
      closesAt: tournament.startDate,
      minBet: 1,
      maxBet: 200,
      maxExposure: 2000,
      tags: ["prop", "seed", tournament.bracketType],
      featured: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return markets;
  }

  /**
   * Place a bet on a bracket market
   */
  placeBet(
    market: BracketMarket,
    outcomeId: string,
    amount: number,
    userId: string
  ): { bet: BracketBet; updatedMarket: BracketMarket } {
    const outcomeIndex = market.outcomes.findIndex(o => o.id === outcomeId);
    if (outcomeIndex === -1) {
      throw new Error("Invalid outcome");
    }

    if (market.status !== "open") {
      throw new Error("Market is not open for betting");
    }

    if (amount < market.minBet || amount > market.maxBet) {
      throw new Error(`Bet must be between ${market.minBet} and ${market.maxBet}`);
    }

    const currentShares = market.outcomes.map(o => o.totalShares);
    const shares = this.marketMaker.calculateShares(currentShares, outcomeIndex, amount);
    const prices = this.marketMaker.calculateAllPrices(currentShares);
    const currentOdds = this.marketMaker.probabilityToAmericanOdds(prices[outcomeIndex]);

    // Update outcome
    const updatedOutcomes = market.outcomes.map((outcome, i) => {
      const newShares = i === outcomeIndex ? outcome.totalShares + shares : outcome.totalShares;
      const allShares = currentShares.map((s, j) => j === outcomeIndex ? s + shares : s);
      const newPrices = this.marketMaker.calculateAllPrices(allShares);

      return {
        ...outcome,
        totalShares: newShares,
        totalVolume: outcome.totalVolume + (i === outcomeIndex ? amount : 0),
        impliedProbability: newPrices[i],
        odds: this.marketMaker.probabilityToAmericanOdds(newPrices[i]),
      };
    });

    const bet: BracketBet = {
      id: `bet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      marketId: market.id,
      poolId: market.poolId,
      outcomeId,
      outcomeLabel: market.outcomes[outcomeIndex].label,
      amount,
      shares,
      oddsAtPlacement: currentOdds,
      impliedProbabilityAtPlacement: prices[outcomeIndex],
      potentialPayout: shares,
      status: "active",
      cashOutAvailable: true,
      placedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updatedMarket: BracketMarket = {
      ...market,
      outcomes: updatedOutcomes,
      totalVolume: market.totalVolume + amount,
      updatedAt: Date.now(),
    };

    return { bet, updatedMarket };
  }

  /**
   * Calculate cash out value for a bet
   */
  calculateCashOut(market: BracketMarket, bet: BracketBet): number {
    const outcomeIndex = market.outcomes.findIndex(o => o.id === bet.outcomeId);
    if (outcomeIndex === -1) return 0;

    const currentShares = market.outcomes.map(o => o.totalShares);
    return this.marketMaker.calculateCashOutValue(currentShares, outcomeIndex, bet.shares);
  }

  /**
   * Settle a market
   */
  settleMarket(
    market: BracketMarket,
    winningOutcomeId: string,
    bets: BracketBet[]
  ): { settledMarket: BracketMarket; settledBets: BracketBet[] } {
    const settledBets = bets.map(bet => {
      const won = bet.outcomeId === winningOutcomeId;
      return {
        ...bet,
        status: won ? "won" as const : "lost" as const,
        settledAmount: won ? bet.shares : 0,
        profitLoss: won ? bet.shares - bet.amount : -bet.amount,
        settledAt: Date.now(),
        updatedAt: Date.now(),
      };
    });

    const settledMarket: BracketMarket = {
      ...market,
      status: "settled",
      winningOutcomeId,
      settledAt: Date.now(),
      updatedAt: Date.now(),
    };

    return { settledMarket, settledBets };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createBracketMarketService(liquidityParameter?: number): BracketMarketService {
  return new BracketMarketService(liquidityParameter);
}

export function createLMSRMarketMaker(liquidityParameter?: number): LMSRMarketMaker {
  return new LMSRMarketMaker(liquidityParameter);
}
