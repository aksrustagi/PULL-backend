/**
 * PULL Stories Types
 * 15-second video stories of bets/wins with social sharing
 */

import { z } from "zod";

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export const STORY_DURATION_SECONDS = 15;
export const STORY_EXPIRY_HOURS = 24;
export const MAX_STORY_VIEWS_TRACKED = 10000;

export const StoryTypeSchema = z.enum([
  "bet_placed",        // User placed a bet
  "win_celebration",   // User won a bet
  "big_win",          // Major win (configurable threshold)
  "streak_milestone",  // Hit a streak milestone
  "prediction_share",  // Sharing a prediction
  "leaderboard_rank",  // Achieved leaderboard position
  "squad_victory",     // Squad won a battle
  "battle_victory",    // Won a cash battle
  "custom",           // User-created custom story
]);

export type StoryType = z.infer<typeof StoryTypeSchema>;

export const StoryStatusSchema = z.enum([
  "processing",   // Video being processed
  "active",       // Live and visible
  "expired",      // Passed 24-hour window
  "deleted",      // User deleted
  "flagged",      // Content flagged for review
  "removed",      // Removed by moderation
]);

export type StoryStatus = z.infer<typeof StoryStatusSchema>;

export const StoryVisibilitySchema = z.enum([
  "public",      // Anyone can view
  "followers",   // Only followers
  "private",     // Only the user
  "friends",     // Mutual follows only
]);

export type StoryVisibility = z.infer<typeof StoryVisibilitySchema>;

export const SocialPlatformSchema = z.enum([
  "twitter",
  "instagram",
  "tiktok",
  "facebook",
  "snapchat",
  "whatsapp",
  "telegram",
  "discord",
  "copy_link",
]);

export type SocialPlatform = z.infer<typeof SocialPlatformSchema>;

// ============================================================================
// CORE TYPES
// ============================================================================

export interface Story {
  id: string;
  userId: string;
  type: StoryType;
  status: StoryStatus;
  visibility: StoryVisibility;

  // Media
  videoUrl: string;
  thumbnailUrl: string;
  videoDurationMs: number;
  aspectRatio: "9:16" | "16:9" | "1:1";

  // Content
  caption?: string;
  hashtags: string[];
  mentions: string[];

  // Bet/Win context
  betContext?: StoryBetContext;

  // Engagement
  viewCount: number;
  uniqueViewers: string[];
  reactions: StoryReaction[];
  reactionCounts: Record<ReactionType, number>;

  // Referral tracking
  referralCode: string;
  referralClicks: number;
  signupsFromStory: number;
  depositsFromStory: number;

  // Social shares
  shares: StorySocialShare[];
  totalShares: number;

  // Timestamps
  createdAt: number;
  expiresAt: number;
  processedAt?: number;
  deletedAt?: number;
}

export interface StoryBetContext {
  betId?: string;
  predictionId?: string;
  marketTicker: string;
  marketTitle: string;
  outcome: string;
  stake: number;
  odds: number;
  potentialWin?: number;
  actualWin?: number;
  isWin: boolean;
  profitPercent?: number;
}

export const ReactionTypeSchema = z.enum([
  "fire",
  "money_bag",
  "rocket",
  "clap",
  "shocked",
  "crying",
  "skull",
  "goat",
]);

export type ReactionType = z.infer<typeof ReactionTypeSchema>;

export interface StoryReaction {
  id: string;
  storyId: string;
  userId: string;
  type: ReactionType;
  createdAt: number;
}

export interface StorySocialShare {
  id: string;
  storyId: string;
  userId: string;
  platform: SocialPlatform;
  referralCode: string;
  sharedAt: number;
  clickCount: number;
  signupCount: number;
}

export interface StoryView {
  id: string;
  storyId: string;
  viewerId: string;
  viewDurationMs: number;
  completedView: boolean; // Watched full story
  source: "feed" | "profile" | "direct_link" | "explore";
  referralCode?: string;
  viewedAt: number;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export const CreateStoryRequestSchema = z.object({
  type: StoryTypeSchema,
  visibility: StoryVisibilitySchema.default("public"),
  videoFile: z.string(), // Base64 or upload URL
  caption: z.string().max(280).optional(),
  hashtags: z.array(z.string().max(50)).max(10).default([]),
  mentions: z.array(z.string()).max(10).default([]),
  betContext: z.object({
    betId: z.string().optional(),
    predictionId: z.string().optional(),
    marketTicker: z.string(),
    marketTitle: z.string(),
    outcome: z.string(),
    stake: z.number().positive(),
    odds: z.number().positive(),
    potentialWin: z.number().positive().optional(),
    actualWin: z.number().positive().optional(),
    isWin: z.boolean(),
    profitPercent: z.number().optional(),
  }).optional(),
});

export type CreateStoryRequest = z.infer<typeof CreateStoryRequestSchema>;

export interface CreateStoryResponse {
  story: Story;
  uploadUrl?: string; // Presigned URL for video upload
  referralLink: string;
}

export const GetStoriesRequestSchema = z.object({
  userId: z.string().optional(), // Get specific user's stories
  feedType: z.enum(["following", "trending", "discover", "friends"]).default("following"),
  limit: z.number().min(1).max(50).default(20),
  cursor: z.string().optional(),
  includeExpired: z.boolean().default(false),
});

export type GetStoriesRequest = z.infer<typeof GetStoriesRequestSchema>;

export interface GetStoriesResponse {
  stories: Story[];
  nextCursor?: string;
  hasMore: boolean;
}

export const RecordViewRequestSchema = z.object({
  storyId: z.string(),
  viewDurationMs: z.number().min(0),
  completedView: z.boolean(),
  source: z.enum(["feed", "profile", "direct_link", "explore"]),
  referralCode: z.string().optional(),
});

export type RecordViewRequest = z.infer<typeof RecordViewRequestSchema>;

export const AddReactionRequestSchema = z.object({
  storyId: z.string(),
  type: ReactionTypeSchema,
});

export type AddReactionRequest = z.infer<typeof AddReactionRequestSchema>;

export const ShareStoryRequestSchema = z.object({
  storyId: z.string(),
  platform: SocialPlatformSchema,
});

export type ShareStoryRequest = z.infer<typeof ShareStoryRequestSchema>;

export interface ShareStoryResponse {
  shareId: string;
  shareUrl: string;
  referralCode: string;
  platform: SocialPlatform;
}

// ============================================================================
// ANALYTICS TYPES
// ============================================================================

export interface StoryAnalytics {
  storyId: string;
  totalViews: number;
  uniqueViewers: number;
  averageWatchTime: number;
  completionRate: number;
  reactionRate: number;
  shareRate: number;
  referralConversions: number;
  estimatedReach: number;
  engagementScore: number;
}

export interface UserStoryStats {
  userId: string;
  totalStories: number;
  totalViews: number;
  totalReactions: number;
  totalShares: number;
  totalReferralSignups: number;
  averageEngagementRate: number;
  topPerformingStory?: string;
  streakDays: number; // Days in a row posting
}

// ============================================================================
// MODERATION TYPES
// ============================================================================

export const FlagReasonSchema = z.enum([
  "inappropriate_content",
  "spam",
  "misleading",
  "harassment",
  "hate_speech",
  "violence",
  "copyright",
  "other",
]);

export type FlagReason = z.infer<typeof FlagReasonSchema>;

export interface StoryFlag {
  id: string;
  storyId: string;
  reporterId: string;
  reason: FlagReason;
  description?: string;
  createdAt: number;
  resolvedAt?: number;
  resolution?: "removed" | "dismissed" | "warning";
}
