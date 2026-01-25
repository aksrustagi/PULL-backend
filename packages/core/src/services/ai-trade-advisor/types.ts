/**
 * AI-Powered Trade Advisor
 * Natural language trade analysis, counter-offer generation, and collusion detection
 */

export interface TradeAnalysisRequest {
  tradeId?: string;
  sport: 'nfl' | 'nba' | 'mlb' | 'golf' | 'ncaa';
  leagueId: string;
  teamIdOffering: string;
  teamIdReceiving: string;
  playersOffered: string[];
  playersReceived: string[];
  picksOffered?: DraftPick[];
  picksReceived?: DraftPick[];
  naturalLanguageQuery?: string;
}

export interface DraftPick {
  year: number;
  round: number;
  overallPick?: number;
  originalTeamId: string;
}

export interface TradeAnalysisResult {
  tradeId: string;
  fairnessScore: number; // 0-100, 50 = perfectly fair
  recommendation: 'accept' | 'reject' | 'counter' | 'needs_review';
  teamOfferingGrade: string; // A+, A, B, etc.
  teamReceivingGrade: string;
  reasoning: string;
  valueGap: number; // Positive = favors offering team
  riskFactors: string[];
  winProbabilityImpact: {
    teamOffering: number; // Change in win %
    teamReceiving: number;
  };
  collusionRisk: number; // 0-100
  vetoLikelihood: number; // 0-100 based on league history
  sportSpecificAnalysis: Record<string, unknown>;
}

export interface CounterOfferRequest {
  originalTradeId: string;
  constraints?: {
    maxPlayers?: number;
    positions?: string[];
    excludePlayerIds?: string[];
  };
}

export interface CounterOfferSuggestion {
  tradeId: string;
  playersToAdd: string[];
  playersToRemove: string[];
  picksToAdd?: DraftPick[];
  picksToRemove?: DraftPick[];
  explanation: string;
  fairnessScore: number;
}

export interface CollusionDetectionResult {
  flagged: boolean;
  confidenceScore: number; // 0-100
  reasons: string[];
  similarHistoricalTrades: string[];
  recommendedAction: 'allow' | 'review' | 'veto';
  reviewers?: string[];
}

export interface VetoProbability {
  tradeId: string;
  probability: number; // 0-100
  factors: {
    name: string;
    impact: number; // -100 to 100
    description: string;
  }[];
  historicalVetoRate: number;
  estimatedVotingOutcome: {
    approve: number;
    veto: number;
    abstain: number;
  };
}

export interface AITradeAdvisorConfig {
  modelName: string;
  perplexityApiKey?: string;
  mcpServerUrl?: string;
  collusionThreshold: number;
  vetoHistoryWindowDays: number;
}
