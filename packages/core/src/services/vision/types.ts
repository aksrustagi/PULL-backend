/**
 * Computer Vision Features
 * Screenshot parsing, TV sync, and jersey recognition
 */

export interface ScreenshotAnalysis {
  analysisId: string;
  userId: string;
  imageUrl: string;
  analysisType: 'trade_screenshot' | 'jersey_scan' | 'tv_sync' | 'lineup_screenshot';
  sport?: 'nfl' | 'nba' | 'mlb' | 'golf' | 'ncaa';
  extractedData: Record<string, unknown>;
  confidence: number;
  status: 'pending' | 'completed' | 'failed';
  createdAt: Date;
}

export interface TradeScreenshotResult {
  playersOffered: {
    name: string;
    position?: string;
    team?: string;
    confidence: number;
  }[];
  playersReceived: {
    name: string;
    position?: string;
    team?: string;
    confidence: number;
  }[];
  source: string; // 'espn', 'yahoo', 'sleeper', 'unknown'
}

export interface JerseyScanResult {
  playerName: string;
  playerNumber: string;
  team: string;
  sport: 'nfl' | 'nba' | 'mlb' | 'golf' | 'ncaa';
  confidence: number;
  fantasyStats?: {
    points: number;
    rank: number;
    recentGames: unknown[];
  };
}

export interface TVSyncResult {
  gameDetected: boolean;
  sport?: 'nfl' | 'nba' | 'mlb' | 'golf' | 'ncaa';
  teams?: string[];
  score?: {
    home: number;
    away: number;
  };
  gameTime?: string;
  relevantPlayers?: string[]; // Players on user's fantasy team
}

export interface VisionAnalysisRequest {
  imageUrl?: string;
  imageBuffer?: ArrayBuffer;
  analysisType: ScreenshotAnalysis['analysisType'];
  sport?: 'nfl' | 'nba' | 'mlb' | 'golf' | 'ncaa';
  userId: string;
}

export interface VisionConfig {
  openAiVisionApiKey?: string;
  claudeApiKey?: string;
  provider: 'openai' | 'claude';
  maxImageSize: number;
}
