/**
 * PULL Stories Service
 * Create, manage, and expire 15-second video stories
 */

import {
  Story,
  StoryType,
  StoryStatus,
  StoryVisibility,
  StoryView,
  StoryReaction,
  StorySocialShare,
  StoryAnalytics,
  UserStoryStats,
  CreateStoryRequest,
  CreateStoryResponse,
  GetStoriesRequest,
  GetStoriesResponse,
  RecordViewRequest,
  AddReactionRequest,
  ShareStoryRequest,
  ShareStoryResponse,
  ReactionType,
  SocialPlatform,
  STORY_EXPIRY_HOURS,
  STORY_DURATION_SECONDS,
} from "./types";

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface StoriesServiceConfig {
  maxStoriesPerUser: number;
  maxVideoSizeBytes: number;
  maxVideoDurationSeconds: number;
  enableAutoExpiry: boolean;
  bigWinThreshold: number; // Minimum profit for "big_win" type
  referralBaseUrl: string;
  storageBaseUrl: string;
  logger?: Logger;
}

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

interface ConvexClient {
  query<T>(name: string, args: Record<string, unknown>): Promise<T>;
  mutation<T>(name: string, args: Record<string, unknown>): Promise<T>;
}

interface StorageClient {
  generateUploadUrl(key: string, contentType: string): Promise<string>;
  getPublicUrl(key: string): string;
}

const DEFAULT_CONFIG: StoriesServiceConfig = {
  maxStoriesPerUser: 10,
  maxVideoSizeBytes: 50 * 1024 * 1024, // 50MB
  maxVideoDurationSeconds: STORY_DURATION_SECONDS,
  enableAutoExpiry: true,
  bigWinThreshold: 1000, // $1000 profit
  referralBaseUrl: "https://pull.app/r/",
  storageBaseUrl: "https://cdn.pull.app/stories/",
};

// ============================================================================
// STORIES SERVICE
// ============================================================================

export class StoriesService {
  private readonly config: StoriesServiceConfig;
  private readonly db: ConvexClient;
  private readonly storage: StorageClient;
  private readonly logger: Logger;

  constructor(
    db: ConvexClient,
    storage: StorageClient,
    config?: Partial<StoriesServiceConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = db;
    this.storage = storage;
    this.logger = config?.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[Stories] ${msg}`, meta),
      info: (msg, meta) => console.info(`[Stories] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[Stories] ${msg}`, meta),
      error: (msg, meta) => console.error(`[Stories] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // STORY CREATION
  // ==========================================================================

  async createStory(
    userId: string,
    request: CreateStoryRequest
  ): Promise<CreateStoryResponse> {
    // Check user's active story count
    const activeCount = await this.getActiveStoryCount(userId);
    if (activeCount >= this.config.maxStoriesPerUser) {
      throw new Error(`Maximum ${this.config.maxStoriesPerUser} active stories allowed`);
    }

    // Generate unique story ID and referral code
    const storyId = this.generateId();
    const referralCode = this.generateReferralCode(userId, storyId);

    // Generate upload URL for video
    const videoKey = `stories/${userId}/${storyId}/video.mp4`;
    const thumbnailKey = `stories/${userId}/${storyId}/thumbnail.jpg`;
    const uploadUrl = await this.storage.generateUploadUrl(videoKey, "video/mp4");

    const now = Date.now();
    const expiresAt = now + STORY_EXPIRY_HOURS * 60 * 60 * 1000;

    const story: Story = {
      id: storyId,
      userId,
      type: request.type,
      status: "processing",
      visibility: request.visibility,
      videoUrl: this.storage.getPublicUrl(videoKey),
      thumbnailUrl: this.storage.getPublicUrl(thumbnailKey),
      videoDurationMs: 0, // Updated after processing
      aspectRatio: "9:16", // Default for mobile
      caption: request.caption,
      hashtags: request.hashtags,
      mentions: request.mentions,
      betContext: request.betContext,
      viewCount: 0,
      uniqueViewers: [],
      reactions: [],
      reactionCounts: {
        fire: 0,
        money_bag: 0,
        rocket: 0,
        clap: 0,
        shocked: 0,
        crying: 0,
        skull: 0,
        goat: 0,
      },
      referralCode,
      referralClicks: 0,
      signupsFromStory: 0,
      depositsFromStory: 0,
      shares: [],
      totalShares: 0,
      createdAt: now,
      expiresAt,
    };

    // Save to database
    await this.db.mutation("stories:create", { story });

    // Notify mentioned users
    if (request.mentions.length > 0) {
      await this.notifyMentions(storyId, userId, request.mentions);
    }

    this.logger.info("Story created", { storyId, userId, type: request.type });

    return {
      story,
      uploadUrl,
      referralLink: `${this.config.referralBaseUrl}${referralCode}`,
    };
  }

  async completeVideoUpload(storyId: string, videoDurationMs: number): Promise<Story> {
    const story = await this.getStory(storyId);
    if (!story) {
      throw new Error("Story not found");
    }

    if (videoDurationMs > this.config.maxVideoDurationSeconds * 1000) {
      throw new Error(`Video exceeds ${this.config.maxVideoDurationSeconds} seconds`);
    }

    const updatedStory = await this.db.mutation<Story>("stories:update", {
      storyId,
      updates: {
        status: "active",
        videoDurationMs,
        processedAt: Date.now(),
      },
    });

    this.logger.info("Story video processed", { storyId, videoDurationMs });

    return updatedStory;
  }

  // ==========================================================================
  // STORY RETRIEVAL
  // ==========================================================================

  async getStory(storyId: string): Promise<Story | null> {
    return await this.db.query<Story | null>("stories:get", { storyId });
  }

  async getStories(request: GetStoriesRequest): Promise<GetStoriesResponse> {
    const now = Date.now();

    const result = await this.db.query<{ stories: Story[]; nextCursor?: string }>(
      "stories:list",
      {
        ...request,
        currentTime: now,
        excludeExpired: !request.includeExpired,
      }
    );

    return {
      stories: result.stories,
      nextCursor: result.nextCursor,
      hasMore: !!result.nextCursor,
    };
  }

  async getUserStories(
    userId: string,
    viewerId?: string,
    includeExpired: boolean = false
  ): Promise<Story[]> {
    const stories = await this.db.query<Story[]>("stories:getByUser", {
      userId,
      includeExpired,
      currentTime: Date.now(),
    });

    // Filter by visibility based on viewer relationship
    return this.filterByVisibility(stories, viewerId);
  }

  async getFeedStories(
    userId: string,
    feedType: "following" | "trending" | "discover" | "friends",
    limit: number = 20,
    cursor?: string
  ): Promise<GetStoriesResponse> {
    const now = Date.now();

    switch (feedType) {
      case "following":
        return this.getFollowingFeed(userId, limit, cursor, now);
      case "trending":
        return this.getTrendingFeed(limit, cursor, now);
      case "discover":
        return this.getDiscoverFeed(userId, limit, cursor, now);
      case "friends":
        return this.getFriendsFeed(userId, limit, cursor, now);
      default:
        return { stories: [], hasMore: false };
    }
  }

  private async getFollowingFeed(
    userId: string,
    limit: number,
    cursor: string | undefined,
    now: number
  ): Promise<GetStoriesResponse> {
    const result = await this.db.query<{ stories: Story[]; nextCursor?: string }>(
      "stories:followingFeed",
      { userId, limit, cursor, currentTime: now }
    );

    return {
      stories: result.stories,
      nextCursor: result.nextCursor,
      hasMore: !!result.nextCursor,
    };
  }

  private async getTrendingFeed(
    limit: number,
    cursor: string | undefined,
    now: number
  ): Promise<GetStoriesResponse> {
    const result = await this.db.query<{ stories: Story[]; nextCursor?: string }>(
      "stories:trendingFeed",
      { limit, cursor, currentTime: now }
    );

    return {
      stories: result.stories,
      nextCursor: result.nextCursor,
      hasMore: !!result.nextCursor,
    };
  }

  private async getDiscoverFeed(
    userId: string,
    limit: number,
    cursor: string | undefined,
    now: number
  ): Promise<GetStoriesResponse> {
    const result = await this.db.query<{ stories: Story[]; nextCursor?: string }>(
      "stories:discoverFeed",
      { userId, limit, cursor, currentTime: now }
    );

    return {
      stories: result.stories,
      nextCursor: result.nextCursor,
      hasMore: !!result.nextCursor,
    };
  }

  private async getFriendsFeed(
    userId: string,
    limit: number,
    cursor: string | undefined,
    now: number
  ): Promise<GetStoriesResponse> {
    const result = await this.db.query<{ stories: Story[]; nextCursor?: string }>(
      "stories:friendsFeed",
      { userId, limit, cursor, currentTime: now }
    );

    return {
      stories: result.stories,
      nextCursor: result.nextCursor,
      hasMore: !!result.nextCursor,
    };
  }

  // ==========================================================================
  // ENGAGEMENT
  // ==========================================================================

  async recordView(userId: string, request: RecordViewRequest): Promise<void> {
    const story = await this.getStory(request.storyId);
    if (!story || story.status !== "active") {
      return;
    }

    const view: StoryView = {
      id: this.generateId(),
      storyId: request.storyId,
      viewerId: userId,
      viewDurationMs: request.viewDurationMs,
      completedView: request.completedView,
      source: request.source,
      referralCode: request.referralCode,
      viewedAt: Date.now(),
    };

    await this.db.mutation("storyViews:create", { view });

    // Update story view count
    const isNewViewer = !story.uniqueViewers.includes(userId);
    await this.db.mutation("stories:incrementViews", {
      storyId: request.storyId,
      isNewViewer,
      viewerId: userId,
    });

    // Track referral click if present
    if (request.referralCode) {
      await this.trackReferralClick(request.storyId, request.referralCode);
    }
  }

  async addReaction(userId: string, request: AddReactionRequest): Promise<StoryReaction> {
    const story = await this.getStory(request.storyId);
    if (!story || story.status !== "active") {
      throw new Error("Story not found or inactive");
    }

    // Check for existing reaction
    const existingReaction = await this.db.query<StoryReaction | null>(
      "storyReactions:getByUserAndStory",
      { userId, storyId: request.storyId }
    );

    if (existingReaction) {
      // Update existing reaction
      const updated = await this.db.mutation<StoryReaction>("storyReactions:update", {
        reactionId: existingReaction.id,
        oldType: existingReaction.type,
        newType: request.type,
        storyId: request.storyId,
      });
      return updated;
    }

    // Create new reaction
    const reaction: StoryReaction = {
      id: this.generateId(),
      storyId: request.storyId,
      userId,
      type: request.type,
      createdAt: Date.now(),
    };

    await this.db.mutation("storyReactions:create", { reaction });
    await this.db.mutation("stories:incrementReaction", {
      storyId: request.storyId,
      type: request.type,
    });

    // Notify story owner
    if (story.userId !== userId) {
      await this.notifyReaction(story.userId, userId, request.storyId, request.type);
    }

    return reaction;
  }

  async removeReaction(userId: string, storyId: string): Promise<void> {
    const existingReaction = await this.db.query<StoryReaction | null>(
      "storyReactions:getByUserAndStory",
      { userId, storyId }
    );

    if (existingReaction) {
      await this.db.mutation("storyReactions:delete", {
        reactionId: existingReaction.id,
        storyId,
        type: existingReaction.type,
      });
    }
  }

  async shareStory(userId: string, request: ShareStoryRequest): Promise<ShareStoryResponse> {
    const story = await this.getStory(request.storyId);
    if (!story || story.status !== "active") {
      throw new Error("Story not found or inactive");
    }

    // Generate unique share referral code
    const referralCode = this.generateShareReferralCode(userId, request.storyId, request.platform);

    const share: StorySocialShare = {
      id: this.generateId(),
      storyId: request.storyId,
      userId,
      platform: request.platform,
      referralCode,
      sharedAt: Date.now(),
      clickCount: 0,
      signupCount: 0,
    };

    await this.db.mutation("storyShares:create", { share });
    await this.db.mutation("stories:incrementShares", { storyId: request.storyId });

    // Generate platform-specific share URL
    const shareUrl = this.generateShareUrl(story, referralCode, request.platform);

    this.logger.info("Story shared", {
      storyId: request.storyId,
      userId,
      platform: request.platform,
    });

    return {
      shareId: share.id,
      shareUrl,
      referralCode,
      platform: request.platform,
    };
  }

  // ==========================================================================
  // EXPIRATION
  // ==========================================================================

  async expireStories(): Promise<number> {
    const now = Date.now();

    const expiredCount = await this.db.mutation<number>("stories:expireOld", {
      currentTime: now,
    });

    this.logger.info("Expired stories", { count: expiredCount });

    return expiredCount;
  }

  async deleteStory(userId: string, storyId: string): Promise<void> {
    const story = await this.getStory(storyId);
    if (!story) {
      throw new Error("Story not found");
    }

    if (story.userId !== userId) {
      throw new Error("Unauthorized to delete this story");
    }

    await this.db.mutation("stories:delete", {
      storyId,
      deletedAt: Date.now(),
    });

    this.logger.info("Story deleted", { storyId, userId });
  }

  // ==========================================================================
  // ANALYTICS
  // ==========================================================================

  async getStoryAnalytics(storyId: string): Promise<StoryAnalytics> {
    const story = await this.getStory(storyId);
    if (!story) {
      throw new Error("Story not found");
    }

    const views = await this.db.query<StoryView[]>("storyViews:getByStory", { storyId });

    const totalViews = story.viewCount;
    const uniqueViewers = story.uniqueViewers.length;
    const totalWatchTime = views.reduce((sum, v) => sum + v.viewDurationMs, 0);
    const completedViews = views.filter((v) => v.completedView).length;
    const totalReactions = Object.values(story.reactionCounts).reduce((sum, c) => sum + c, 0);

    return {
      storyId,
      totalViews,
      uniqueViewers,
      averageWatchTime: views.length > 0 ? totalWatchTime / views.length : 0,
      completionRate: views.length > 0 ? (completedViews / views.length) * 100 : 0,
      reactionRate: uniqueViewers > 0 ? (totalReactions / uniqueViewers) * 100 : 0,
      shareRate: uniqueViewers > 0 ? (story.totalShares / uniqueViewers) * 100 : 0,
      referralConversions: story.signupsFromStory,
      estimatedReach: this.calculateEstimatedReach(story),
      engagementScore: this.calculateEngagementScore(story, views),
    };
  }

  async getUserStoryStats(userId: string): Promise<UserStoryStats> {
    const stories = await this.db.query<Story[]>("stories:getAllByUser", { userId });

    const totalViews = stories.reduce((sum, s) => sum + s.viewCount, 0);
    const totalReactions = stories.reduce(
      (sum, s) => sum + Object.values(s.reactionCounts).reduce((r, c) => r + c, 0),
      0
    );
    const totalShares = stories.reduce((sum, s) => sum + s.totalShares, 0);
    const totalSignups = stories.reduce((sum, s) => sum + s.signupsFromStory, 0);

    const uniqueViewers = new Set(stories.flatMap((s) => s.uniqueViewers)).size;
    const avgEngagement = uniqueViewers > 0 ? (totalReactions + totalShares) / uniqueViewers : 0;

    // Find top performing story
    const topStory = stories.reduce(
      (best, story) => {
        const score = story.viewCount + Object.values(story.reactionCounts).reduce((s, c) => s + c, 0) * 2;
        return score > best.score ? { id: story.id, score } : best;
      },
      { id: "", score: 0 }
    );

    return {
      userId,
      totalStories: stories.length,
      totalViews,
      totalReactions,
      totalShares,
      totalReferralSignups: totalSignups,
      averageEngagementRate: avgEngagement,
      topPerformingStory: topStory.id || undefined,
      streakDays: await this.calculatePostingStreak(userId),
    };
  }

  // ==========================================================================
  // REFERRAL TRACKING
  // ==========================================================================

  async trackReferralClick(storyId: string, referralCode: string): Promise<void> {
    await this.db.mutation("stories:incrementReferralClicks", { storyId });
    await this.db.mutation("referralTracking:recordClick", {
      referralCode,
      source: "story",
      sourceId: storyId,
      timestamp: Date.now(),
    });
  }

  async trackReferralSignup(referralCode: string, newUserId: string): Promise<void> {
    const tracking = await this.db.query<{ storyId?: string; userId?: string } | null>(
      "referralTracking:getByCode",
      { referralCode }
    );

    if (tracking?.storyId) {
      await this.db.mutation("stories:incrementReferralSignups", {
        storyId: tracking.storyId,
      });
    }
  }

  async trackReferralDeposit(referralCode: string, depositAmount: number): Promise<void> {
    const tracking = await this.db.query<{ storyId?: string; userId?: string } | null>(
      "referralTracking:getByCode",
      { referralCode }
    );

    if (tracking?.storyId) {
      await this.db.mutation("stories:incrementReferralDeposits", {
        storyId: tracking.storyId,
      });
    }
  }

  // ==========================================================================
  // AUTO STORY GENERATION
  // ==========================================================================

  async createAutoStoryForWin(
    userId: string,
    betContext: Story["betContext"]
  ): Promise<Story | null> {
    if (!betContext || !betContext.isWin) {
      return null;
    }

    // Check if it's a big win
    const isBigWin =
      betContext.actualWin && betContext.actualWin >= this.config.bigWinThreshold;

    // Generate video from bet data (placeholder - would use video generation service)
    const videoUrl = await this.generateWinVideo(betContext);
    if (!videoUrl) {
      return null;
    }

    const request: CreateStoryRequest = {
      type: isBigWin ? "big_win" : "win_celebration",
      visibility: "public",
      videoFile: videoUrl,
      caption: this.generateWinCaption(betContext, isBigWin),
      hashtags: this.generateWinHashtags(betContext),
      mentions: [],
      betContext,
    };

    const response = await this.createStory(userId, request);
    return response.story;
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private async getActiveStoryCount(userId: string): Promise<number> {
    return await this.db.query<number>("stories:countActive", {
      userId,
      currentTime: Date.now(),
    });
  }

  private filterByVisibility(stories: Story[], viewerId?: string): Story[] {
    return stories.filter((story) => {
      if (story.visibility === "public") return true;
      if (!viewerId) return false;
      if (story.visibility === "private") return story.userId === viewerId;
      // For followers/friends, would need to check relationship
      return true; // Simplified
    });
  }

  private generateId(): string {
    return `story_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateReferralCode(userId: string, storyId: string): string {
    const hash = this.simpleHash(`${userId}:${storyId}:${Date.now()}`);
    return `S${hash.substr(0, 8).toUpperCase()}`;
  }

  private generateShareReferralCode(
    userId: string,
    storyId: string,
    platform: SocialPlatform
  ): string {
    const hash = this.simpleHash(`${userId}:${storyId}:${platform}:${Date.now()}`);
    return `SH${hash.substr(0, 7).toUpperCase()}`;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private generateShareUrl(
    story: Story,
    referralCode: string,
    platform: SocialPlatform
  ): string {
    const baseUrl = `https://pull.app/s/${story.id}?ref=${referralCode}`;

    switch (platform) {
      case "twitter":
        const text = encodeURIComponent(
          story.caption || `Check out this ${story.betContext?.isWin ? "winning" : ""} prediction!`
        );
        return `https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(baseUrl)}`;

      case "whatsapp":
        const waText = encodeURIComponent(`${story.caption || "Check this out!"} ${baseUrl}`);
        return `https://wa.me/?text=${waText}`;

      case "telegram":
        const tgText = encodeURIComponent(story.caption || "Check this out!");
        return `https://t.me/share/url?url=${encodeURIComponent(baseUrl)}&text=${tgText}`;

      default:
        return baseUrl;
    }
  }

  private calculateEstimatedReach(story: Story): number {
    // Estimate reach based on shares and platform multipliers
    const platformMultipliers: Record<SocialPlatform, number> = {
      twitter: 50,
      instagram: 100,
      tiktok: 200,
      facebook: 30,
      snapchat: 20,
      whatsapp: 5,
      telegram: 10,
      discord: 15,
      copy_link: 2,
    };

    let estimatedReach = story.viewCount;
    for (const share of story.shares) {
      estimatedReach += platformMultipliers[share.platform] * (1 + share.clickCount * 0.1);
    }

    return Math.round(estimatedReach);
  }

  private calculateEngagementScore(story: Story, views: StoryView[]): number {
    if (views.length === 0) return 0;

    const completionRate = views.filter((v) => v.completedView).length / views.length;
    const reactionRate =
      Object.values(story.reactionCounts).reduce((s, c) => s + c, 0) / views.length;
    const shareRate = story.totalShares / views.length;
    const referralRate = story.signupsFromStory / Math.max(story.referralClicks, 1);

    return Math.round(
      (completionRate * 30 + reactionRate * 25 + shareRate * 25 + referralRate * 20) * 100
    );
  }

  private async calculatePostingStreak(userId: string): Promise<number> {
    const recentStories = await this.db.query<Story[]>("stories:getRecentByUser", {
      userId,
      limit: 30,
    });

    if (recentStories.length === 0) return 0;

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 30; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const dayStart = checkDate.getTime();
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;

      const hasStory = recentStories.some(
        (s) => s.createdAt >= dayStart && s.createdAt < dayEnd
      );

      if (hasStory) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }

    return streak;
  }

  private async generateWinVideo(betContext: Story["betContext"]): Promise<string | null> {
    // Placeholder - would integrate with video generation service
    return null;
  }

  private generateWinCaption(
    betContext: NonNullable<Story["betContext"]>,
    isBigWin: boolean
  ): string {
    const profit = betContext.actualWin! - betContext.stake;
    const profitPercent = ((profit / betContext.stake) * 100).toFixed(0);

    if (isBigWin) {
      return `MASSIVE W! +$${profit.toFixed(2)} (${profitPercent}%) on ${betContext.marketTitle}!`;
    }

    return `Another W! +$${profit.toFixed(2)} on ${betContext.marketTitle}`;
  }

  private generateWinHashtags(betContext: NonNullable<Story["betContext"]>): string[] {
    return [
      "PULLWIN",
      "Predictions",
      betContext.marketTicker.replace(/[^a-zA-Z0-9]/g, ""),
    ];
  }

  private async notifyMentions(
    storyId: string,
    authorId: string,
    mentions: string[]
  ): Promise<void> {
    for (const mentionedUser of mentions) {
      await this.db.mutation("notifications:create", {
        userId: mentionedUser,
        type: "story_mention",
        title: "You were mentioned in a story",
        body: "Someone mentioned you in their PULL story",
        data: { storyId, authorId },
        createdAt: Date.now(),
      });
    }
  }

  private async notifyReaction(
    storyOwnerId: string,
    reactorId: string,
    storyId: string,
    reactionType: ReactionType
  ): Promise<void> {
    await this.db.mutation("notifications:create", {
      userId: storyOwnerId,
      type: "story_reaction",
      title: "New reaction on your story",
      body: `Someone reacted with ${reactionType} to your story`,
      data: { storyId, reactorId, reactionType },
      createdAt: Date.now(),
    });
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let serviceInstance: StoriesService | null = null;

export function getStoriesService(
  db: ConvexClient,
  storage: StorageClient
): StoriesService {
  if (!serviceInstance) {
    serviceInstance = new StoriesService(db, storage);
  }
  return serviceInstance;
}

export function createStoriesService(
  db: ConvexClient,
  storage: StorageClient,
  config?: Partial<StoriesServiceConfig>
): StoriesService {
  return new StoriesService(db, storage, config);
}
