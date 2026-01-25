/**
 * Social Graph & League Discovery
 * Friend connections, league recommendations, and reputation scoring
 */

export interface UserConnection {
  userId: string;
  connectedUserId: string;
  connectionType: 'friend' | 'league_mate' | 'competitor' | 'pending';
  source: 'contact_import' | 'mutual_league' | 'search' | 'recommendation';
  commonLeagues: string[];
  createdAt: Date;
}

export interface LeagueReputation {
  leagueId: string;
  reputationScore: number; // 0-100
  metrics: {
    completionRate: number;
    payoutHistory: 'perfect' | 'good' | 'issues' | 'unknown';
    activityLevel: 'high' | 'medium' | 'low';
    memberRetention: number; // % returning members
    averageTenure: number; // years
  };
  reviews?: UserReview[];
  verified: boolean;
  badges: string[];
}

export interface UserReview {
  userId: string;
  rating: number; // 1-5
  comment?: string;
  season: string;
  createdAt: Date;
}

export interface ContactImport {
  importId: string;
  userId: string;
  source: 'google' | 'apple' | 'csv';
  contactsFound: number;
  matchedUsers: string[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
}

export interface LeagueRecommendation {
  leagueId: string;
  leagueName: string;
  sport: 'nfl' | 'nba' | 'mlb' | 'golf' | 'ncaa';
  buyIn: number;
  openSpots: number;
  competitivenessLevel: 'casual' | 'competitive' | 'hardcore';
  reputationScore: number;
  matchReason: string;
  mutualConnections: string[];
  recommendationScore: number; // 0-100
}

export interface ConnectionSuggestion {
  userId: string;
  userName: string;
  mutualFriends: string[];
  mutualLeagues: string[];
  suggestionReason: string;
  confidence: number;
}

export interface PublicLeagueSearchFilters {
  sport?: 'nfl' | 'nba' | 'mlb' | 'golf' | 'ncaa';
  buyInMin?: number;
  buyInMax?: number;
  competitivenessLevel?: LeagueRecommendation['competitivenessLevel'];
  minReputation?: number;
  openSpotsOnly?: boolean;
}

export interface SocialGraphConfig {
  maxConnectionsPerUser: number;
  recommendationLimit: number;
  mutualConnectionWeight: number;
}
