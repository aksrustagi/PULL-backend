/**
 * Social Trading Graph Types for PULL Super App
 * Covers follows, copy trading, trader profiles, leaderboards,
 * trading rooms, reputation, and fraud detection
 */

import type { OrderSide, AssetClass, Position, Order, Trade } from "./trading";
import type { User } from "./user";

// ============================================================================
// SOCIAL GRAPH TYPES
// ============================================================================

/** Follow relationship between traders */
export interface Follow {
  id: string;
  followerId: string;
  followeeId: string;
  notificationsEnabled: boolean;
  positionVisibility: PositionVisibility;
  followedAt: Date;
  unfollowedAt?: Date;
  isActive: boolean;
}

/** Position visibility settings for followers */
export type PositionVisibility = "all" | "entry_only" | "none";

/** Follow request with follower/followee details */
export interface FollowWithDetails extends Follow {
  follower?: UserSummary;
  followee?: UserSummary;
}

/** Lightweight user summary for social features */
export interface UserSummary {
  id: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  isVerified: boolean;
  reputationTier?: ReputationTier;
  followersCount?: number;
  copierCount?: number;
}

// ============================================================================
// TRADER PROFILE TYPES
// ============================================================================

/** Extended trader profile with track record */
export interface TraderProfile {
  id: string;
  userId: string;
  user?: UserSummary;

  // Profile settings
  isPublic: boolean;
  allowCopyTrading: boolean;
  allowAutoCopy: boolean;

  // Copy trading fees
  copyTradingFee: number;
  performanceFee: number;

  // Profile content
  bio?: string;
  tradingStyle?: string;
  tradingPhilosophy?: string;
  riskProfile?: TraderRiskProfile;
  preferredAssets: string[];

  // Social links
  twitterHandle?: string;
  discordHandle?: string;
  telegramHandle?: string;
  websiteUrl?: string;

  // Verification
  isVerified: boolean;
  verifiedAt?: Date;
  verificationBadges: string[];

  // Computed stats (from TraderStats)
  stats?: TraderStatsSnapshot;

  // Social counts
  followersCount: number;
  followingCount: number;
  copierCount: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/** Trader risk profile levels */
export type TraderRiskProfile = "conservative" | "moderate" | "aggressive" | "very_aggressive";

// ============================================================================
// TRADER STATISTICS TYPES
// ============================================================================

/** Time period for statistics */
export type StatsPeriod = "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "all_time";

/** Comprehensive trader statistics */
export interface TraderStats {
  id: string;
  userId: string;
  period: StatsPeriod;
  periodStart: Date;
  periodEnd: Date;

  // Core metrics
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;

  // P&L metrics
  totalPnL: number;
  totalPnLPercent: number;
  avgPnLPerTrade: number;
  avgWinAmount: number;
  avgLossAmount: number;
  largestWin: number;
  largestLoss: number;

  // Risk metrics
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  volatility: number;
  calmarRatio: number;

  // Volume metrics
  totalVolume: number;
  avgPositionSize: number;
  avgHoldingPeriod: number;

  // Streak data
  currentWinStreak: number;
  currentLossStreak: number;
  longestWinStreak: number;
  longestLossStreak: number;

  // Asset breakdown
  assetBreakdown?: AssetBreakdown;

  // Timestamps
  calculatedAt: Date;
  updatedAt: Date;
}

/** Snapshot of key stats for display */
export interface TraderStatsSnapshot {
  winRate: number;
  totalPnL: number;
  totalPnLPercent: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalTrades: number;
  avgHoldingPeriod: number;
}

/** Asset breakdown for portfolio analysis */
export interface AssetBreakdown {
  crypto?: AssetClassStats;
  prediction?: AssetClassStats;
  rwa?: AssetClassStats;
}

/** Stats for a single asset class */
export interface AssetClassStats {
  tradeCount: number;
  volume: number;
  pnl: number;
  pnlPercent: number;
  winRate: number;
}

// ============================================================================
// REPUTATION TYPES
// ============================================================================

/** Reputation tiers */
export type ReputationTier = "bronze" | "silver" | "gold" | "platinum" | "diamond" | "legend";

/** Comprehensive reputation score */
export interface ReputationScore {
  id: string;
  userId: string;

  // Overall score (0-1000)
  overallScore: number;

  // Component scores (0-100 each)
  performanceScore: number;
  consistencyScore: number;
  riskManagementScore: number;
  transparencyScore: number;
  socialScore: number;
  longevityScore: number;

  // Tier based on score
  tier: ReputationTier;

  // Badges earned
  badges: ReputationBadge[];

  // Trust indicators
  verifiedReturns: boolean;
  auditedBy?: string;
  lastAuditAt?: Date;

  // Anti-fraud indicators
  fraudRiskScore: number;
  suspiciousActivityCount: number;
  lastReviewAt?: Date;

  // Timestamps
  calculatedAt: Date;
  updatedAt: Date;
}

/** Earned badge */
export interface ReputationBadge {
  type: string;
  name: string;
  earnedAt: Date;
}

/** Badge types */
export type BadgeType =
  | "verified_trader"
  | "consistent_winner"
  | "risk_manager"
  | "high_volume"
  | "community_leader"
  | "early_adopter"
  | "top_10"
  | "top_100"
  | "profitable_streak"
  | "low_drawdown";

// ============================================================================
// COPY TRADING TYPES
// ============================================================================

/** Copy trading subscription status */
export type CopySubscriptionStatus = "pending" | "active" | "paused" | "stopped" | "cancelled";

/** Copy mode (how to size copied positions) */
export type CopyMode = "fixed_amount" | "percentage_portfolio" | "proportional" | "fixed_ratio";

/** Copy trading subscription configuration */
export interface CopyTradingSubscription {
  id: string;
  copierId: string;
  traderId: string;

  // Copier and trader details
  copier?: UserSummary;
  trader?: TraderProfile;

  // Subscription status
  status: CopySubscriptionStatus;

  // Position sizing
  copyMode: CopyMode;
  fixedAmount?: number;
  portfolioPercentage?: number;
  copyRatio?: number;

  // Risk controls
  maxPositionSize: number;
  maxDailyLoss: number;
  maxTotalExposure: number;
  stopLossPercent?: number;
  takeProfitPercent?: number;

  // Asset filters
  copyAssetClasses: AssetClass[];
  excludedSymbols: string[];

  // Delay settings
  copyDelaySeconds: number;

  // Performance tracking
  totalCopiedTrades: number;
  totalPnL: number;
  totalFeesPaid: number;

  // Timestamps
  subscribedAt: Date;
  pausedAt?: Date;
  cancelledAt?: Date;
  updatedAt: Date;
}

/** Copy trade execution status */
export type CopyTradeStatus =
  | "pending"
  | "executing"
  | "filled"
  | "partial_fill"
  | "failed"
  | "skipped"
  | "cancelled";

/** Individual copy trade record */
export interface CopyTrade {
  id: string;
  subscriptionId: string;
  copierId: string;
  traderId: string;

  // Original trade reference
  originalOrderId: string;
  originalTradeId?: string;

  // Copy order reference
  copyOrderId?: string;
  copyTradeId?: string;

  // Status
  status: CopyTradeStatus;
  skipReason?: string;
  failureReason?: string;

  // Trade details
  symbol: string;
  side: OrderSide;
  originalQuantity: number;
  originalPrice: number;
  copyQuantity: number;
  copyPrice?: number;
  slippage?: number;

  // Fees
  copyFee: number;
  performanceFee: number;

  // P&L
  pnl?: number;
  pnlPercent?: number;

  // Timestamps
  originalExecutedAt: Date;
  copyExecutedAt?: Date;
  closedAt?: Date;
  createdAt: Date;
}

/** Input for creating a copy subscription */
export interface CreateCopySubscriptionInput {
  traderId: string;
  copyMode: CopyMode;
  fixedAmount?: number;
  portfolioPercentage?: number;
  copyRatio?: number;
  maxPositionSize: number;
  maxDailyLoss: number;
  maxTotalExposure: number;
  stopLossPercent?: number;
  takeProfitPercent?: number;
  copyAssetClasses: AssetClass[];
  excludedSymbols?: string[];
  copyDelaySeconds?: number;
}

/** Copy subscription update input */
export interface UpdateCopySubscriptionInput {
  copyMode?: CopyMode;
  fixedAmount?: number;
  portfolioPercentage?: number;
  copyRatio?: number;
  maxPositionSize?: number;
  maxDailyLoss?: number;
  maxTotalExposure?: number;
  stopLossPercent?: number;
  takeProfitPercent?: number;
  copyAssetClasses?: AssetClass[];
  excludedSymbols?: string[];
}

// ============================================================================
// POSITION COMMENT TYPES
// ============================================================================

/** Comment content type */
export type CommentContentType = "text" | "analysis" | "thesis" | "update" | "exit_rationale";

/** Attachment type */
export type AttachmentType = "image" | "chart" | "link";

/** Comment attachment */
export interface CommentAttachment {
  type: AttachmentType;
  url: string;
  title?: string;
}

/** Comment on a position/trade */
export interface PositionComment {
  id: string;
  positionId?: string;
  orderId?: string;
  tradeId?: string;
  authorId: string;
  traderId: string;

  // Author details
  author?: UserSummary;

  // Content
  content: string;
  contentType: CommentContentType;
  attachments: CommentAttachment[];

  // Engagement
  likesCount: number;
  repliesCount: number;
  isLikedByMe?: boolean;

  // Threading
  parentCommentId?: string;
  replies?: PositionComment[];

  // Status
  isEdited: boolean;
  isDeleted: boolean;
  isPinned: boolean;

  // Timestamps
  createdAt: Date;
  editedAt?: Date;
  deletedAt?: Date;
}

/** Input for creating a comment */
export interface CreateCommentInput {
  positionId?: string;
  orderId?: string;
  tradeId?: string;
  content: string;
  contentType: CommentContentType;
  attachments?: CommentAttachment[];
  parentCommentId?: string;
}

// ============================================================================
// TRADING ROOM TYPES
// ============================================================================

/** Trading room type */
export type TradingRoomType = "public" | "private" | "premium" | "exclusive";

/** Room access level */
export type RoomAccessLevel = "open" | "request_to_join" | "invite_only" | "subscription";

/** Subscription period */
export type SubscriptionPeriod = "monthly" | "quarterly" | "yearly";

/** Room member role */
export type RoomMemberRole = "owner" | "moderator" | "contributor" | "member" | "viewer";

/** Room member status */
export type RoomMemberStatus = "active" | "pending" | "banned" | "left";

/** Notification level */
export type NotificationLevel = "all" | "mentions" | "positions_only" | "none";

/** Trading room settings */
export interface TradingRoomSettings {
  allowPositionSharing: boolean;
  allowCopyTrades: boolean;
  positionDelay: number;
  requireVerifiedTraders: boolean;
  minReputationScore: number;
}

/** Trading room */
export interface TradingRoom {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  coverImageUrl?: string;

  // Type and access
  type: TradingRoomType;
  accessLevel: RoomAccessLevel;

  // Subscription
  subscriptionPrice?: number;
  subscriptionPeriod?: SubscriptionPeriod;

  // Ownership
  ownerId: string;
  owner?: UserSummary;
  moderatorIds: string[];
  moderators?: UserSummary[];

  // Focus
  tradingFocus: string[];
  assetClasses: AssetClass[];

  // Settings
  settings: TradingRoomSettings;

  // Stats
  memberCount: number;
  activeMembers: number;
  totalPositionsShared: number;
  totalMessages: number;

  // Status
  status: "active" | "archived" | "suspended";

  // Membership (if querying user is a member)
  membership?: TradingRoomMember;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;
}

/** Trading room member */
export interface TradingRoomMember {
  id: string;
  roomId: string;
  userId: string;
  user?: UserSummary;

  // Role and status
  role: RoomMemberRole;
  status: RoomMemberStatus;

  // Permissions
  canPost: boolean;
  canSharePositions: boolean;
  canInvite: boolean;

  // Notifications
  notificationsEnabled: boolean;
  notificationLevel: NotificationLevel;

  // Activity
  lastReadAt?: Date;
  lastPostAt?: Date;
  positionsSharedCount: number;
  messagesCount: number;

  // Subscription
  subscriptionId?: string;
  subscriptionExpiresAt?: Date;

  // Timestamps
  joinedAt: Date;
  leftAt?: Date;
  bannedAt?: Date;
  updatedAt: Date;
}

/** Room message type */
export type RoomMessageType = "text" | "position_share" | "trade_share" | "analysis" | "alert" | "system";

/** Shared trade/position data in message */
export interface SharedTradeData {
  positionId?: string;
  orderId?: string;
  tradeId?: string;
  symbol: string;
  side: "buy" | "sell" | "long" | "short";
  quantity?: number;
  price?: number;
  pnl?: number;
  pnlPercent?: number;
}

/** Message attachment */
export interface MessageAttachment {
  type: string;
  url: string;
  name?: string;
  size?: number;
}

/** Trading room message */
export interface TradingRoomMessage {
  id: string;
  roomId: string;
  senderId: string;
  sender?: UserSummary;

  // Message type
  type: RoomMessageType;

  // Content
  content: string;
  formattedContent?: string;

  // Shared data
  sharedData?: SharedTradeData;

  // Attachments
  attachments: MessageAttachment[];

  // Engagement
  likesCount: number;
  repliesCount: number;
  copyCount: number;
  isLikedByMe?: boolean;

  // Threading
  replyToId?: string;
  replyTo?: TradingRoomMessage;

  // Status
  isEdited: boolean;
  isDeleted: boolean;
  isPinned: boolean;

  // Timestamps
  createdAt: Date;
  editedAt?: Date;
  deletedAt?: Date;
}

/** Input for creating a trading room */
export interface CreateTradingRoomInput {
  name: string;
  description?: string;
  avatarUrl?: string;
  coverImageUrl?: string;
  type: TradingRoomType;
  accessLevel: RoomAccessLevel;
  subscriptionPrice?: number;
  subscriptionPeriod?: SubscriptionPeriod;
  tradingFocus?: string[];
  assetClasses?: AssetClass[];
  settings?: Partial<TradingRoomSettings>;
}

/** Input for sending a room message */
export interface SendRoomMessageInput {
  roomId: string;
  type: RoomMessageType;
  content: string;
  sharedData?: SharedTradeData;
  attachments?: MessageAttachment[];
  replyToId?: string;
}

// ============================================================================
// LEADERBOARD TYPES
// ============================================================================

/** Leaderboard metric types */
export type LeaderboardType =
  | "pnl"
  | "pnl_percent"
  | "sharpe_ratio"
  | "win_rate"
  | "total_trades"
  | "followers"
  | "copiers"
  | "reputation";

/** Leaderboard time periods */
export type LeaderboardPeriod = "daily" | "weekly" | "monthly" | "all_time";

/** Leaderboard entry */
export interface LeaderboardEntry {
  rank: number;
  previousRank?: number;
  userId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  value: number;
  change?: number;
  changePercent?: number;
  tier?: ReputationTier;
  isVerified: boolean;
}

/** Leaderboard snapshot */
export interface LeaderboardSnapshot {
  id: string;
  leaderboardType: LeaderboardType;
  period: LeaderboardPeriod;
  assetClass?: AssetClass;
  periodStart: Date;
  periodEnd: Date;
  entries: LeaderboardEntry[];
  totalParticipants: number;
  minQualifyingValue?: number;
  calculatedAt: Date;
  createdAt: Date;
}

/** User's leaderboard position history */
export interface UserLeaderboardPosition {
  id: string;
  userId: string;
  leaderboardType: string;
  period: string;
  rank: number;
  value: number;
  percentile: number;
  snapshotId: string;
  periodStart: Date;
  recordedAt: Date;
}

/** Leaderboard query parameters */
export interface LeaderboardQuery {
  type: LeaderboardType;
  period: LeaderboardPeriod;
  assetClass?: AssetClass;
  limit?: number;
  offset?: number;
}

// ============================================================================
// FRAUD DETECTION TYPES
// ============================================================================

/** Fraud alert types */
export type FraudAlertType =
  | "wash_trading"
  | "manipulation"
  | "front_running"
  | "fake_performance"
  | "collusion"
  | "unusual_activity"
  | "bot_behavior";

/** Fraud severity levels */
export type FraudSeverity = "low" | "medium" | "high" | "critical";

/** Fraud alert status */
export type FraudAlertStatus = "pending" | "investigating" | "confirmed" | "dismissed" | "resolved";

/** Evidence item */
export interface FraudEvidence {
  type: string;
  description: string;
  data: unknown;
  timestamp: Date;
}

/** Fraud alert */
export interface FraudAlert {
  id: string;
  userId: string;
  alertType: FraudAlertType;
  severity: FraudSeverity;
  detectionMethod: string;
  confidence: number;
  evidence: FraudEvidence[];
  relatedOrderIds: string[];
  relatedTradeIds: string[];
  relatedUserIds: string[];
  status: FraudAlertStatus;
  reviewedBy?: string;
  reviewNotes?: string;
  resolution?: string;
  actionTaken?: string;
  detectedAt: Date;
  reviewedAt?: Date;
  resolvedAt?: Date;
}

/** Trading pattern features for ML */
export interface TradingPatternFeatures {
  // Timing patterns
  avgTimeBetweenTrades: number;
  stdTimeBetweenTrades: number;
  peakTradingHours: number[];

  // Size patterns
  avgOrderSize: number;
  stdOrderSize: number;
  medianOrderSize: number;

  // Price patterns
  avgPriceImprovement: number;
  avgSlippage: number;
  limitOrderFillRate: number;

  // Behavioral indicators
  cancelToFillRatio: number;
  selfTradeRatio: number;
  roundTripRatio: number;
  consecutiveSameSideRatio: number;

  // Performance patterns
  winAfterLossRatio: number;
  lossAfterWinRatio: number;
  streakCorrelation: number;
}

/** Trading patterns analysis */
export interface TradingPatterns {
  id: string;
  userId: string;
  periodStart: Date;
  periodEnd: Date;
  features: TradingPatternFeatures;

  // ML classification scores
  alphaScore: number;
  luckScore: number;
  skillScore: number;
  manipulationScore: number;

  calculatedAt: Date;
}

// ============================================================================
// ACTIVITY FEED TYPES
// ============================================================================

/** Social activity types */
export type SocialActivityType =
  | "follow"
  | "position_opened"
  | "position_closed"
  | "position_shared"
  | "comment"
  | "like"
  | "copy_trade"
  | "achievement"
  | "leaderboard_rank"
  | "room_created"
  | "room_joined";

/** Activity visibility */
export type ActivityVisibility = "public" | "followers" | "private";

/** Social activity item */
export interface SocialActivity {
  id: string;
  actorId: string;
  actor?: UserSummary;
  type: SocialActivityType;
  targetType?: string;
  targetId?: string;
  data: unknown;
  visibility: ActivityVisibility;
  relatedUserIds: string[];
  createdAt: Date;
  expiresAt?: Date;
}

/** Feed types */
export type FeedType = "following" | "discover" | "notifications";

/** User feed item */
export interface FeedItem {
  id: string;
  userId: string;
  activityId: string;
  actorId: string;
  actor?: UserSummary;
  feedType: FeedType;
  type: string;
  data: unknown;
  isRead: boolean;
  activityAt: Date;
  cachedAt: Date;
}

/** Feed query parameters */
export interface FeedQuery {
  feedType: FeedType;
  limit?: number;
  cursor?: string;
  unreadOnly?: boolean;
}

// ============================================================================
// SEARCH & DISCOVERY TYPES
// ============================================================================

/** Trader search filters */
export interface TraderSearchFilters {
  query?: string;
  minWinRate?: number;
  maxWinRate?: number;
  minSharpeRatio?: number;
  minTotalTrades?: number;
  assetClasses?: AssetClass[];
  riskProfile?: TraderRiskProfile[];
  tiers?: ReputationTier[];
  allowCopyTrading?: boolean;
  isVerified?: boolean;
}

/** Trader search result */
export interface TraderSearchResult {
  trader: TraderProfile;
  matchScore: number;
  highlightedBio?: string;
}

/** Trader recommendation */
export interface TraderRecommendation {
  trader: TraderProfile;
  reason: string;
  matchScore: number;
  commonFollowers?: UserSummary[];
}

// ============================================================================
// ANALYTICS TYPES
// ============================================================================

/** Copy trading analytics */
export interface CopyTradingAnalytics {
  subscriptionId: string;
  period: StatsPeriod;
  totalCopiedTrades: number;
  successfulCopies: number;
  failedCopies: number;
  skippedCopies: number;
  totalPnL: number;
  totalFees: number;
  avgSlippage: number;
  avgCopyDelay: number;
  topPerformingSymbols: SymbolPerformance[];
  worstPerformingSymbols: SymbolPerformance[];
}

/** Symbol performance */
export interface SymbolPerformance {
  symbol: string;
  tradeCount: number;
  pnl: number;
  pnlPercent: number;
  winRate: number;
}

/** Social engagement analytics */
export interface SocialAnalytics {
  userId: string;
  period: StatsPeriod;
  newFollowers: number;
  lostFollowers: number;
  netFollowerChange: number;
  newCopiers: number;
  lostCopiers: number;
  netCopierChange: number;
  positionsShared: number;
  commentsReceived: number;
  likesReceived: number;
  profileViews: number;
  engagementRate: number;
}
