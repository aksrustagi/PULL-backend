/**
 * Social Feed Types
 * Instagram-style feed for bets, wins, picks, and analysis
 */

import { z } from "zod";

// ============================================================================
// ENUMS & SCHEMAS
// ============================================================================

export const FeedItemTypeSchema = z.enum([
  "bet_placed",         // User placed a bet
  "bet_won",            // User won a bet
  "bet_lost",           // User lost a bet
  "parlay_placed",      // User placed a parlay
  "parlay_won",         // User won a parlay
  "pick_shared",        // User shared a pick/prediction
  "analysis",           // User posted analysis
  "achievement",        // User earned achievement
  "streak",             // User hit a streak milestone
  "leaderboard",        // User ranked on leaderboard
  "cashout",            // User cashed out
  "tip_received",       // User received tips in live room
  "room_hosted",        // User hosted a live room
  "game_won",           // User won prediction game
  "follow",             // User followed someone
  "milestone",          // User hit a milestone (wins, profit, etc.)
]);

export type FeedItemType = z.infer<typeof FeedItemTypeSchema>;

export const VisibilitySchema = z.enum([
  "public",             // Anyone can see
  "followers",          // Only followers can see
  "private",            // Only user can see
]);

export type Visibility = z.infer<typeof VisibilitySchema>;

export const ReactionTypeSchema = z.enum([
  "like",
  "fire",
  "clap",
  "thinking",
  "money",
]);

export type ReactionType = z.infer<typeof ReactionTypeSchema>;

// ============================================================================
// CORE TYPES
// ============================================================================

export interface FeedItem {
  id: string;

  // Author
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl?: string;
  authorBadges: string[];
  isVerified: boolean;

  // Content
  type: FeedItemType;
  content: FeedContent;
  visibility: Visibility;

  // Rich content
  images?: string[];
  cardData?: CardData;

  // Engagement
  reactions: ReactionCounts;
  commentCount: number;
  shareCount: number;
  copyCount: number;           // For bets/parlays
  viewCount: number;

  // User interaction state (populated per request)
  hasLiked?: boolean;
  hasCommented?: boolean;
  hasCopied?: boolean;
  hasShared?: boolean;

  // Metadata
  tags: string[];
  mentions: string[];          // @usernames mentioned
  sport?: string;
  league?: string;

  // Settings
  commentsEnabled: boolean;
  allowCopy: boolean;

  // Timestamps
  createdAt: number;
  updatedAt: number;
  editedAt?: number;
}

export interface FeedContent {
  // Text content
  text?: string;
  headline?: string;

  // Bet content
  bet?: BetContent;
  parlay?: ParlayContent;
  pick?: PickContent;

  // Achievement content
  achievement?: AchievementContent;
  streak?: StreakContent;
  milestone?: MilestoneContent;

  // Other content
  leaderboard?: LeaderboardContent;
  cashout?: CashoutContent;
  liveRoom?: LiveRoomContent;
  predictionGame?: PredictionGameContent;
}

export interface BetContent {
  betId: string;
  eventId: string;
  eventName: string;
  selection: string;
  betType: string;
  odds: number;
  oddsDisplay: string;
  stake?: number;              // May be hidden
  potentialPayout?: number;
  actualPayout?: number;
  result?: "won" | "lost" | "push" | "pending";
  isLive: boolean;
  sport: string;
  league: string;
  eventStartTime: number;
}

export interface ParlayContent {
  parlayId: string;
  legs: Array<{
    eventName: string;
    selection: string;
    odds: number;
    result?: "won" | "lost" | "push" | "pending";
  }>;
  combinedOdds: number;
  oddsDisplay: string;
  stake?: number;
  potentialPayout?: number;
  actualPayout?: number;
  result?: "won" | "lost" | "partial" | "pending";
  cardUrl?: string;
}

export interface PickContent {
  pickId: string;
  eventId: string;
  eventName: string;
  selection: string;
  confidence: number;          // 1-5 or percentage
  reasoning?: string;
  stats?: Record<string, string | number>;
  result?: "correct" | "incorrect" | "pending";
  sport: string;
  eventStartTime: number;
}

export interface AchievementContent {
  achievementId: string;
  name: string;
  description: string;
  iconUrl: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  unlockedAt: number;
}

export interface StreakContent {
  type: "win" | "correct_pick" | "profitable_day";
  length: number;
  startedAt: number;
  isActive: boolean;
}

export interface MilestoneContent {
  type: string;
  value: number;
  label: string;
  previousValue?: number;
}

export interface LeaderboardContent {
  leaderboardName: string;
  rank: number;
  previousRank?: number;
  score?: number;
  period: string;
}

export interface CashoutContent {
  amount: number;
  originalBetId?: string;
  originalPotentialPayout?: number;
  percentOfOriginal: number;
}

export interface LiveRoomContent {
  roomId: string;
  roomTitle: string;
  listenerCount: number;
  duration: number;
  tipsReceived?: number;
}

export interface PredictionGameContent {
  gameId: string;
  gameName: string;
  rank: number;
  score: number;
  prizeWon?: string;
}

export interface CardData {
  template: string;
  title: string;
  subtitle?: string;
  primaryStat?: { label: string; value: string };
  secondaryStats?: Array<{ label: string; value: string }>;
  imageUrl?: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
}

export interface ReactionCounts {
  total: number;
  like: number;
  fire: number;
  clap: number;
  thinking: number;
  money: number;
}

// ============================================================================
// COMMENT TYPES
// ============================================================================

export interface Comment {
  id: string;
  feedItemId: string;

  // Author
  authorId: string;
  authorUsername: string;
  authorAvatarUrl?: string;
  isVerified: boolean;

  // Content
  content: string;
  mentions: string[];

  // Threading
  parentCommentId?: string;
  replyCount: number;

  // Engagement
  reactions: ReactionCounts;

  // User state
  hasLiked?: boolean;

  createdAt: number;
  editedAt?: number;
}

// ============================================================================
// FOLLOW TYPES
// ============================================================================

export interface FollowRelationship {
  id: string;
  followerId: string;
  followeeId: string;

  // Settings
  notificationsEnabled: boolean;
  showInFeed: boolean;

  // Stats at follow time
  followeeStats?: {
    winRate?: number;
    profit?: number;
    followers?: number;
  };

  createdAt: number;
}

export interface UserFeedProfile {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  isVerified: boolean;
  badges: string[];

  // Counts
  followerCount: number;
  followingCount: number;
  postCount: number;

  // Stats
  winRate?: number;
  totalProfit?: number;
  currentStreak?: number;
  bestStreak?: number;

  // Relationship
  isFollowing?: boolean;
  isFollowedBy?: boolean;

  // Settings
  isPublic: boolean;
  allowDirectMessages: boolean;
}

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

export interface SocialNotification {
  id: string;
  userId: string;

  type: SocialNotificationType;
  title: string;
  body: string;

  // Actor (who triggered)
  actorId?: string;
  actorUsername?: string;
  actorAvatarUrl?: string;

  // Target
  feedItemId?: string;
  commentId?: string;

  // State
  isRead: boolean;
  readAt?: number;

  createdAt: number;
}

export type SocialNotificationType =
  | "new_follower"
  | "like"
  | "comment"
  | "mention"
  | "reply"
  | "share"
  | "copy_bet"
  | "milestone";

// ============================================================================
// API TYPES
// ============================================================================

export interface CreatePostRequest {
  type: FeedItemType;
  content: {
    text?: string;
    betId?: string;
    parlayId?: string;
    pickId?: string;
    reasoning?: string;
  };
  visibility?: Visibility;
  images?: string[];
  tags?: string[];
  commentsEnabled?: boolean;
  allowCopy?: boolean;
}

export interface UpdatePostRequest {
  text?: string;
  visibility?: Visibility;
  commentsEnabled?: boolean;
  allowCopy?: boolean;
}

export interface CreateCommentRequest {
  feedItemId: string;
  content: string;
  parentCommentId?: string;
}

export interface ReactRequest {
  targetId: string;              // Feed item or comment ID
  targetType: "post" | "comment";
  reactionType: ReactionType;
}

export interface FeedFilters {
  types?: FeedItemType[];
  sports?: string[];
  visibility?: Visibility;
  authorId?: string;
  result?: "won" | "lost" | "pending";
  minOdds?: number;
  hasImages?: boolean;
}

export interface FeedResponse {
  items: FeedItem[];
  hasMore: boolean;
  cursor?: string;
  totalCount?: number;
}

export interface FollowSuggestion {
  user: UserFeedProfile;
  reason: string;
  mutualFollowers?: number;
  commonInterests?: string[];
}
