/**
 * Copy Trading Types for PULL Super App
 * Covers follows, copy settings, trader stats, and copy trades
 */

// ============================================================================
// FOLLOWS
// ============================================================================

/** Follow relationship between users */
export interface Follow {
  id: string;
  followerId: string;
  followedId: string;
  createdAt: Date;
}

/** Follow with user details */
export interface FollowWithUser extends Follow {
  follower?: UserSummary;
  followed?: UserSummary;
}

/** Minimal user info for social features */
export interface UserSummary {
  id: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
}

/** Follow counts for a user */
export interface FollowCounts {
  followerCount: number;
  followingCount: number;
}

// ============================================================================
// COPY SETTINGS
// ============================================================================

/** Risk level for copy trading */
export type CopyRiskLevel = "conservative" | "moderate" | "aggressive";

/** Copy trading configuration */
export interface CopySettings {
  id: string;
  userId: string;
  traderId: string;
  allocationPct: number;
  maxPositionSize: number;
  active: boolean;
  riskLevel?: CopyRiskLevel;
  copyStopLoss?: boolean;
  copyTakeProfit?: boolean;
  minTradeSize?: number;
  excludedAssets?: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** Copy settings with trader details */
export interface CopySettingsWithTrader extends CopySettings {
  trader?: UserSummary;
  traderStats?: TraderStats;
}

/** Request to create/update copy settings */
export interface CopySettingsRequest {
  traderId: string;
  allocationPct: number;
  maxPositionSize: number;
  active: boolean;
  riskLevel?: CopyRiskLevel;
  copyStopLoss?: boolean;
  copyTakeProfit?: boolean;
  minTradeSize?: number;
  excludedAssets?: string[];
}

// ============================================================================
// TRADER STATS
// ============================================================================

/** Trader performance tier */
export type TraderTier = "bronze" | "silver" | "gold" | "platinum" | "diamond";

/** Trader performance statistics */
export interface TraderStats {
  id: string;
  userId: string;
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  profitableTrades: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  tradingVolume: number;
  followerCount: number;
  copierCount: number;
  rank?: number;
  tier?: TraderTier;
  periodStart: Date;
  periodEnd: Date;
  updatedAt: Date;
}

/** Trader stats with user details */
export interface TraderStatsWithUser extends TraderStats {
  user?: UserSummary;
}

/** Leaderboard entry */
export interface LeaderboardEntry extends TraderStatsWithUser {
  rank: number;
}

/** Leaderboard response */
export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  total: number;
  hasMore: boolean;
}

/** Sort options for leaderboard */
export type LeaderboardSortBy =
  | "totalReturn"
  | "sharpeRatio"
  | "winRate"
  | "followerCount";

/** Search criteria for traders */
export interface TraderSearchCriteria {
  minReturn?: number;
  minWinRate?: number;
  minSharpeRatio?: number;
  maxDrawdown?: number;
  tier?: TraderTier;
  limit?: number;
}

// ============================================================================
// COPY TRADES
// ============================================================================

/** Copy trade status */
export type CopyTradeStatus =
  | "pending"
  | "executed"
  | "partial"
  | "failed"
  | "cancelled";

/** Record of a copied trade */
export interface CopyTrade {
  id: string;
  userId: string;
  traderId: string;
  originalOrderId: string;
  copiedOrderId: string;
  copySettingsId: string;
  originalQuantity: number;
  copiedQuantity: number;
  scaleFactor: number;
  status: CopyTradeStatus;
  failureReason?: string;
  executedAt?: Date;
  createdAt: Date;
}

/** Copy trade with related details */
export interface CopyTradeWithDetails extends CopyTrade {
  trader?: UserSummary;
  originalOrder?: OrderSummary;
  copiedOrder?: OrderSummary;
}

/** Minimal order info for copy trade display */
export interface OrderSummary {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  type: string;
  quantity: number;
  price?: number;
  status: string;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

/** Response for followers/following list */
export interface FollowListResponse {
  followers?: FollowWithUser[];
  following?: FollowWithUser[];
  hasMore: boolean;
  nextCursor?: string;
}

/** Trader profile for public viewing */
export interface TraderProfile {
  user: UserSummary;
  stats: TraderStats;
  isFollowing: boolean;
  isCopying: boolean;
  copySettings?: CopySettings;
}

/** Trader position for public viewing (with optional delay) */
export interface TraderPosition {
  symbol: string;
  assetClass: "crypto" | "prediction" | "rwa";
  side: "long" | "short";
  quantity: number;
  entryPrice?: number;
  currentPrice?: number;
  unrealizedPnL?: number;
  openedAt: Date;
  isDelayed: boolean;
  delayMinutes?: number;
}

/** Copy trading summary for a user */
export interface CopyTradingSummary {
  totalCopiedTrades: number;
  totalPnL: number;
  totalVolume: number;
  activeTraders: number;
  bestPerformingTrader?: {
    trader: UserSummary;
    pnl: number;
  };
  worstPerformingTrader?: {
    trader: UserSummary;
    pnl: number;
  };
}

// ============================================================================
// WORKFLOW INPUTS
// ============================================================================

/** Input for CalculateTraderStats workflow */
export interface CalculateTraderStatsInput {
  userId: string;
  periodStart: number;
  periodEnd: number;
}

/** Input for ExecuteCopyTrade workflow */
export interface ExecuteCopyTradeInput {
  originalOrderId: string;
  traderId: string;
}

/** Input for UpdateLeaderboard workflow */
export interface UpdateLeaderboardInput {
  sortBy?: LeaderboardSortBy;
}

/** Result of trader stats calculation */
export interface TraderStatsResult {
  userId: string;
  stats: Omit<TraderStats, "id" | "userId" | "updatedAt">;
  tradesAnalyzed: number;
}

/** Result of copy trade execution */
export interface CopyTradeResult {
  copyTradeId: string;
  copiedOrderId: string;
  status: CopyTradeStatus;
  scaleFactor: number;
  copiedQuantity: number;
  failureReason?: string;
}

/** Result of leaderboard update */
export interface LeaderboardUpdateResult {
  tradersUpdated: number;
  topTrader?: {
    userId: string;
    totalReturn: number;
  };
}
