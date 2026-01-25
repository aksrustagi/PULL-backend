/**
 * Predictive Injury Alerts
 * ML-based injury risk scoring and insurance pricing
 */

export interface InjuryRiskScore {
  playerId: string;
  sport: 'nfl' | 'nba' | 'mlb' | 'golf' | 'ncaa';
  riskScore: number; // 0-100, higher = more risk
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  factors: InjuryRiskFactor[];
  prediction: {
    injuryType?: string;
    probabilityPercent: number;
    timeframe: 'thisWeek' | 'thisMonth' | 'thisSeason';
  };
  insurancePrice?: number;
  lastUpdated: Date;
}

export interface InjuryRiskFactor {
  name: string;
  value: number | string;
  impact: number; // Contribution to overall risk score
  description: string;
}

export interface InjuryHistory {
  playerId: string;
  sport: 'nfl' | 'nba' | 'mlb' | 'golf' | 'ncaa';
  injuries: InjuryEvent[];
}

export interface InjuryEvent {
  date: Date;
  injuryType: string;
  bodyPart: string;
  severity: 'minor' | 'moderate' | 'major' | 'career_threatening';
  gamesMissed: number;
  recoveryTime?: number; // days
  circumstances?: string;
}

export interface LineupRiskAssessment {
  teamId: string;
  totalRisk: number;
  highRiskPlayers: {
    playerId: string;
    playerName: string;
    position: string;
    riskScore: number;
    recommendation: string;
  }[];
  averageRisk: number;
  comparedToLeague: number; // % higher/lower than league average
}

export interface InsuranceQuote {
  playerId: string;
  premium: number; // Cost in league currency
  payout: number; // If player is injured
  duration: 'game' | 'week' | 'month' | 'season';
  riskScore: number;
  terms: string;
}

export interface InjuryPredictionConfig {
  modelVersion: string;
  updateFrequency: 'daily' | 'hourly' | 'realtime';
  sportSpecificWeights: Record<string, number>;
}
