/**
 * Advanced Analytics Dashboard Types
 * Monte Carlo simulations, hindsight analysis, and advanced metrics
 */

export interface PlayoffSimulation {
  simulationId: string;
  teamId: string;
  leagueId: string;
  sport: 'nfl' | 'nba' | 'mlb' | 'golf' | 'ncaa';
  iterations: number;
  results: {
    makePlayoffs: number; // Probability 0-100
    finishFirst: number;
    finishSecond: number;
    finishThird: number;
    missPlayoffs: number;
  };
  scenarioBreakdown: PlayoffScenario[];
  runDate: Date;
}

export interface PlayoffScenario {
  scenario: string;
  probability: number;
  requiredOutcomes: string[];
}

export interface BenchAnalysis {
  teamId: string;
  leagueId: string;
  sport: 'nfl' | 'nba' | 'mlb' | 'golf' | 'ncaa';
  season: string;
  totalPointsLeftOnBench: number;
  averagePointsLeftPerWeek: number;
  worstWeek: {
    week: number;
    pointsLeft: number;
    players: { name: string; points: number; position: string }[];
  };
  costlyDecisions: {
    week: number;
    startedPlayer: string;
    benchedPlayer: string;
    pointsDifference: number;
    gameOutcome: 'would_have_won' | 'would_have_lost' | 'no_impact';
  }[];
  rankInLeague: number;
}

export interface OptimalLineupHindsight {
  teamId: string;
  week: number;
  actualLineup: LineupPlayer[];
  optimalLineup: LineupPlayer[];
  actualPoints: number;
  optimalPoints: number;
  pointsLeftOnBench: number;
  decisions: LineupDecision[];
}

export interface LineupPlayer {
  playerId: string;
  playerName: string;
  position: string;
  points: number;
  inStartingLineup: boolean;
}

export interface LineupDecision {
  position: string;
  started: string;
  shouldHaveStarted: string;
  pointsDifference: number;
  correctDecision: boolean;
}

export interface HeadToHeadHistory {
  teamId: string;
  opponentId: string;
  leagueId: string;
  totalGames: number;
  wins: number;
  losses: number;
  ties: number;
  winPercentage: number;
  averageMarginOfVictory: number;
  averageMarginOfDefeat: number;
  biggestWin: { week: number; season: string; score: string };
  biggestLoss: { week: number; season: string; score: string };
  recentForm: ('W' | 'L' | 'T')[];
  streaks: { type: 'W' | 'L'; count: number; active: boolean }[];
}

export interface DraftGrade {
  teamId: string;
  leagueId: string;
  sport: 'nfl' | 'nba' | 'mlb' | 'golf' | 'ncaa';
  season: string;
  originalGrade: string;
  hindsightGrade: string;
  picks: DraftPickAnalysis[];
  valueAdded: number; // Points above/below expectation
  steals: DraftPickAnalysis[]; // Great value picks
  busts: DraftPickAnalysis[]; // Underperforming picks
  overallRank: number; // Among league
}

export interface DraftPickAnalysis {
  round: number;
  pick: number;
  overallPick: number;
  playerId: string;
  playerName: string;
  position: string;
  expectedPoints: number; // Based on ADP
  actualPoints: number;
  valueAdded: number;
  grade: string;
  analysis: string;
}

export interface WinProbabilityChart {
  gameId: string;
  teamId: string;
  opponentId: string;
  dataPoints: WinProbabilityPoint[];
  finalResult: 'win' | 'loss' | 'tie';
}

export interface WinProbabilityPoint {
  timestamp: Date;
  gameTime: string;
  probability: number; // 0-100
  teamScore: number;
  opponentScore: number;
  triggerEvent?: string; // "TD by Player X", "FG missed", etc.
}

export interface TrendAnalysis {
  playerId: string;
  playerName: string;
  sport: 'nfl' | 'nba' | 'mlb' | 'golf' | 'ncaa';
  trend: 'up' | 'down' | 'stable';
  trendStrength: number; // 0-100
  metrics: {
    [metricName: string]: {
      recent: number;
      average: number;
      change: number; // %
      trend: 'up' | 'down' | 'stable';
    };
  };
  recommendation: 'buy' | 'hold' | 'sell';
  reasoning: string;
}

export interface SportSpecificMetric {
  playerId: string;
  sport: 'nfl' | 'nba' | 'mlb' | 'golf' | 'ncaa';
  metrics: NFLMetrics | NBAMetrics | MLBMetrics | GolfMetrics | NCAAMetrics;
}

export interface NFLMetrics {
  targetShare: number;
  snapCount: number;
  snapPercentage: number;
  redZoneTargets: number;
  airYards: number;
  yardsAfterCatch: number;
  routesRun: number;
}

export interface NBAMetrics {
  usageRate: number;
  trueShootingPercentage: number;
  effectiveFieldGoalPercentage: number;
  assistPercentage: number;
  reboundPercentage: number;
  playerEfficiencyRating: number;
}

export interface MLBMetrics {
  exitVelocity: number;
  barrelRate: number;
  hardHitRate: number;
  launchAngle: number;
  xBA: number; // Expected batting average
  xSLG: number; // Expected slugging
}

export interface GolfMetrics {
  strokesGainedTotal: number;
  strokesGainedPutting: number;
  strokesGainedApproach: number;
  strokesGainedTeeToGreen: number;
  drivingAccuracy: number;
  greensInRegulation: number;
}

export interface NCAAMetrics {
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
  fieldGoalPercentage: number;
  threePointPercentage: number;
  playerEfficiencyRating: number;
}

export interface AdvancedAnalyticsConfig {
  simulationIterations: number;
  cacheResultsHours: number;
  enableRealTimeUpdates: boolean;
}
