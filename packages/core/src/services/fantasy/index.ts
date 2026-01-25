/**
 * Fantasy Football Service
 *
 * Core fantasy football functionality including scoring, markets, and league management.
 */

export * from "./types";
export * from "./scoring";
export * from "./market-maker";

// Re-export key functions for convenience
export {
  calculatePlayerScore,
  calculatePlayerScoreAllFormats,
  calculateTeamScore,
  calculateProjectedTeamScore,
  calculateRosterPoints,
  optimizeLineup,
  validateLineup,
  calculateWinProbability,
  calculateStandings,
  determinePlayoffSeeds,
} from "./scoring";

export {
  LMSRMarketMaker,
  createMatchupMarket,
  createLeagueWinnerMarket,
  createWeeklyHighScoreMarket,
  createPlayerPropMarket,
  placeBet,
  calculateCashOutValue,
  executeCashOut,
  settleMarket,
  voidMarket,
  formatOdds,
  getOddsMovement,
} from "./market-maker";

export {
  DEFAULT_PPR_RULES,
  DEFAULT_HALF_PPR_RULES,
  DEFAULT_STANDARD_RULES,
  DEFAULT_LEAGUE_SETTINGS,
  DEFAULT_ROSTER_POSITIONS,
  getScoringRules,
  EMPTY_STATS,
  STARTER_SLOTS,
  BENCH_SLOTS,
} from "./types";
