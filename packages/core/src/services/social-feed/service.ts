/**
 * Social Feed Service
 * Generate and manage Instagram-style activity feeds
 */

import type {
  FeedItem,
  FeedItemType,
  FeedContent,
  Visibility,
  Comment,
  FollowRelationship,
  UserFeedProfile,
  FollowSuggestion,
  CreatePostRequest,
  UpdatePostRequest,
  CreateCommentRequest,
  ReactRequest,
  FeedFilters,
  FeedResponse,
  ReactionType,
  CardData,
} from "./types";
import { FeedEngagementService, createFeedEngagementService } from "./engagement";

// ============================================================================
// SOCIAL FEED SERVICE
// ============================================================================

export class SocialFeedService {
  private feedItems: Map<string, FeedItem> = new Map();
  private userFeeds: Map<string, string[]> = new Map(); // userId -> feedItemIds
  private following: Map<string, Set<string>> = new Map(); // userId -> followeeIds
  private followers: Map<string, Set<string>> = new Map(); // userId -> followerIds
  private profiles: Map<string, UserFeedProfile> = new Map();

  private engagementService: FeedEngagementService;

  constructor() {
    this.engagementService = createFeedEngagementService();
  }

  // ==========================================================================
  // FEED GENERATION
  // ==========================================================================

  /**
   * Get personalized feed for user
   */
  async getFeed(
    userId: string,
    options: {
      feedType?: "following" | "discover" | "own";
      filters?: FeedFilters;
      limit?: number;
      cursor?: string;
    } = {}
  ): Promise<FeedResponse> {
    const { feedType = "following", filters, limit = 20, cursor } = options;

    let items: FeedItem[] = [];

    switch (feedType) {
      case "following":
        items = await this.getFollowingFeed(userId);
        break;
      case "discover":
        items = await this.getDiscoverFeed(userId);
        break;
      case "own":
        items = await this.getUserFeed(userId, userId);
        break;
    }

    // Apply filters
    if (filters) {
      items = this.applyFilters(items, filters);
    }

    // Sort by creation time (newest first)
    items.sort((a, b) => b.createdAt - a.createdAt);

    // Pagination
    const startIndex = cursor ? parseInt(cursor, 10) : 0;
    const paginatedItems = items.slice(startIndex, startIndex + limit);

    // Populate user state
    const itemsWithState = this.engagementService.populateUserState(paginatedItems, userId);

    return {
      items: itemsWithState,
      hasMore: startIndex + limit < items.length,
      cursor: startIndex + limit < items.length ? String(startIndex + limit) : undefined,
      totalCount: items.length,
    };
  }

  /**
   * Get feed from users being followed
   */
  private async getFollowingFeed(userId: string): Promise<FeedItem[]> {
    const followingIds = this.following.get(userId) ?? new Set();
    const items: FeedItem[] = [];

    // Include user's own posts
    const userItems = this.userFeeds.get(userId) ?? [];
    for (const itemId of userItems) {
      const item = this.feedItems.get(itemId);
      if (item) items.push(item);
    }

    // Include posts from following
    for (const followeeId of followingIds) {
      const followeeItems = this.userFeeds.get(followeeId) ?? [];
      for (const itemId of followeeItems) {
        const item = this.feedItems.get(itemId);
        if (item && (item.visibility === "public" || item.visibility === "followers")) {
          items.push(item);
        }
      }
    }

    return items;
  }

  /**
   * Get discover/explore feed
   */
  private async getDiscoverFeed(userId: string): Promise<FeedItem[]> {
    const followingIds = this.following.get(userId) ?? new Set();

    // Get public posts from users not followed
    const items: FeedItem[] = [];

    for (const item of this.feedItems.values()) {
      if (
        item.visibility === "public" &&
        item.authorId !== userId &&
        !followingIds.has(item.authorId)
      ) {
        items.push(item);
      }
    }

    // Sort by engagement + recency
    items.sort((a, b) => {
      const scoreA = this.calculateDiscoverScore(a);
      const scoreB = this.calculateDiscoverScore(b);
      return scoreB - scoreA;
    });

    return items;
  }

  /**
   * Get user's own feed (profile view)
   */
  async getUserFeed(
    viewerId: string,
    targetUserId: string
  ): Promise<FeedItem[]> {
    const userItems = this.userFeeds.get(targetUserId) ?? [];
    const items: FeedItem[] = [];

    const isFollowing = this.following.get(viewerId)?.has(targetUserId);
    const isSelf = viewerId === targetUserId;

    for (const itemId of userItems) {
      const item = this.feedItems.get(itemId);
      if (!item) continue;

      // Visibility check
      if (isSelf) {
        items.push(item);
      } else if (item.visibility === "public") {
        items.push(item);
      } else if (item.visibility === "followers" && isFollowing) {
        items.push(item);
      }
    }

    return items;
  }

  /**
   * Calculate discover score for ranking
   */
  private calculateDiscoverScore(item: FeedItem): number {
    const hoursSincePost = (Date.now() - item.createdAt) / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 100 - hoursSincePost * 2);

    const engagementScore =
      item.reactions.total * 2 +
      item.commentCount * 5 +
      item.shareCount * 10 +
      item.copyCount * 15;

    // Boost wins and high-odds bets
    let contentBoost = 0;
    if (item.content.bet?.result === "won") contentBoost += 20;
    if (item.content.parlay?.result === "won") contentBoost += 50;
    if ((item.content.bet?.odds ?? 0) > 200) contentBoost += 10;

    return recencyScore + engagementScore + contentBoost;
  }

  /**
   * Apply filters to feed items
   */
  private applyFilters(items: FeedItem[], filters: FeedFilters): FeedItem[] {
    let filtered = [...items];

    if (filters.types && filters.types.length > 0) {
      filtered = filtered.filter((i) => filters.types!.includes(i.type));
    }

    if (filters.sports && filters.sports.length > 0) {
      filtered = filtered.filter((i) => i.sport && filters.sports!.includes(i.sport));
    }

    if (filters.visibility) {
      filtered = filtered.filter((i) => i.visibility === filters.visibility);
    }

    if (filters.authorId) {
      filtered = filtered.filter((i) => i.authorId === filters.authorId);
    }

    if (filters.result) {
      filtered = filtered.filter((i) => {
        const bet = i.content.bet ?? i.content.parlay;
        return bet?.result === filters.result;
      });
    }

    if (filters.minOdds !== undefined) {
      filtered = filtered.filter((i) => {
        const odds = i.content.bet?.odds ?? i.content.parlay?.combinedOdds ?? 0;
        return odds >= filters.minOdds!;
      });
    }

    if (filters.hasImages) {
      filtered = filtered.filter((i) => i.images && i.images.length > 0);
    }

    return filtered;
  }

  // ==========================================================================
  // POST MANAGEMENT
  // ==========================================================================

  /**
   * Create a new feed item
   */
  async createPost(
    userId: string,
    username: string,
    request: CreatePostRequest,
    userProfile?: {
      displayName?: string;
      avatarUrl?: string;
      badges?: string[];
      isVerified?: boolean;
    }
  ): Promise<FeedItem> {
    const itemId = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Build content based on type
    const content = await this.buildContent(request);

    // Extract mentions and tags
    const mentions = this.extractMentions(request.content.text ?? "");

    // Determine sport from content
    const sport = content.bet?.sport ?? content.parlay?.legs?.[0]?.eventName?.includes("NFL")
      ? "nfl"
      : undefined;

    // Generate card data if applicable
    const cardData = this.generateCardData(request.type, content);

    const item: FeedItem = {
      id: itemId,
      authorId: userId,
      authorUsername: username,
      authorDisplayName: userProfile?.displayName ?? username,
      authorAvatarUrl: userProfile?.avatarUrl,
      authorBadges: userProfile?.badges ?? [],
      isVerified: userProfile?.isVerified ?? false,
      type: request.type,
      content,
      visibility: request.visibility ?? "public",
      images: request.images,
      cardData,
      reactions: { total: 0, like: 0, fire: 0, clap: 0, thinking: 0, money: 0 },
      commentCount: 0,
      shareCount: 0,
      copyCount: 0,
      viewCount: 0,
      tags: request.tags ?? [],
      mentions,
      sport,
      commentsEnabled: request.commentsEnabled ?? true,
      allowCopy: request.allowCopy ?? true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.feedItems.set(itemId, item);

    // Add to user's feed
    const userFeed = this.userFeeds.get(userId) ?? [];
    userFeed.unshift(itemId);
    this.userFeeds.set(userId, userFeed);

    return item;
  }

  /**
   * Build content from request
   */
  private async buildContent(request: CreatePostRequest): Promise<FeedContent> {
    const content: FeedContent = {
      text: request.content.text,
    };

    // In production, fetch bet/parlay details from betting service
    if (request.content.betId) {
      content.bet = this.getMockBetContent(request.content.betId);
    }

    if (request.content.parlayId) {
      content.parlay = this.getMockParlayContent(request.content.parlayId);
    }

    if (request.content.pickId) {
      content.pick = {
        pickId: request.content.pickId,
        eventId: "event_1",
        eventName: "Chiefs vs Raiders",
        selection: "Chiefs",
        confidence: 4,
        reasoning: request.content.reasoning,
        sport: "nfl",
        eventStartTime: Date.now() + 86400000,
      };
    }

    return content;
  }

  /**
   * Mock bet content (replace with real data in production)
   */
  private getMockBetContent(betId: string): FeedContent["bet"] {
    return {
      betId,
      eventId: "event_1",
      eventName: "Chiefs vs Raiders",
      selection: "Chiefs -3.5",
      betType: "spread",
      odds: -110,
      oddsDisplay: "-110",
      stake: 100,
      potentialPayout: 190.91,
      isLive: false,
      sport: "nfl",
      league: "NFL",
      eventStartTime: Date.now() + 86400000,
    };
  }

  /**
   * Mock parlay content
   */
  private getMockParlayContent(parlayId: string): FeedContent["parlay"] {
    return {
      parlayId,
      legs: [
        { eventName: "Chiefs vs Raiders", selection: "Chiefs -3.5", odds: -110, result: "pending" },
        { eventName: "Bills vs Dolphins", selection: "Bills ML", odds: -150, result: "pending" },
        { eventName: "Cowboys vs Eagles", selection: "Over 48.5", odds: -105, result: "pending" },
      ],
      combinedOdds: 595,
      oddsDisplay: "+595",
      stake: 25,
      potentialPayout: 173.75,
    };
  }

  /**
   * Generate card data for rich display
   */
  private generateCardData(type: FeedItemType, content: FeedContent): CardData | undefined {
    if (type === "bet_won" && content.bet) {
      return {
        template: "win",
        title: "BET WON!",
        subtitle: content.bet.eventName,
        primaryStat: { label: "Payout", value: `$${content.bet.actualPayout ?? content.bet.potentialPayout}` },
        secondaryStats: [
          { label: "Odds", value: content.bet.oddsDisplay },
          { label: "Pick", value: content.bet.selection },
        ],
        backgroundColor: "#1a472a",
        textColor: "#ffffff",
        accentColor: "#00ff88",
      };
    }

    if (type === "parlay_won" && content.parlay) {
      return {
        template: "parlay_win",
        title: `${content.parlay.legs.length}-LEG PARLAY HIT!`,
        subtitle: content.parlay.oddsDisplay,
        primaryStat: { label: "Payout", value: `$${content.parlay.actualPayout ?? content.parlay.potentialPayout}` },
        backgroundColor: "#1a1a2e",
        textColor: "#ffffff",
        accentColor: "#ffd700",
      };
    }

    if (type === "streak" && content.streak) {
      return {
        template: "streak",
        title: `${content.streak.length} ${content.streak.type.toUpperCase()} STREAK!`,
        subtitle: "On fire!",
        primaryStat: { label: "Streak", value: String(content.streak.length) },
        backgroundColor: "#2d132c",
        textColor: "#ffffff",
        accentColor: "#ff4444",
      };
    }

    return undefined;
  }

  /**
   * Update a post
   */
  async updatePost(
    postId: string,
    userId: string,
    request: UpdatePostRequest
  ): Promise<FeedItem> {
    const item = this.feedItems.get(postId);
    if (!item) throw new Error("Post not found");
    if (item.authorId !== userId) throw new Error("Not authorized");

    if (request.text !== undefined) {
      item.content.text = request.text;
      item.mentions = this.extractMentions(request.text);
    }
    if (request.visibility !== undefined) {
      item.visibility = request.visibility;
    }
    if (request.commentsEnabled !== undefined) {
      item.commentsEnabled = request.commentsEnabled;
    }
    if (request.allowCopy !== undefined) {
      item.allowCopy = request.allowCopy;
    }

    item.updatedAt = Date.now();
    item.editedAt = Date.now();

    this.feedItems.set(postId, item);
    return item;
  }

  /**
   * Delete a post
   */
  async deletePost(postId: string, userId: string): Promise<boolean> {
    const item = this.feedItems.get(postId);
    if (!item) return false;
    if (item.authorId !== userId) throw new Error("Not authorized");

    this.feedItems.delete(postId);

    // Remove from user's feed
    const userFeed = this.userFeeds.get(userId) ?? [];
    const index = userFeed.indexOf(postId);
    if (index !== -1) {
      userFeed.splice(index, 1);
      this.userFeeds.set(userId, userFeed);
    }

    return true;
  }

  /**
   * Get single post
   */
  async getPost(postId: string, viewerId?: string): Promise<FeedItem | null> {
    const item = this.feedItems.get(postId);
    if (!item) return null;

    // Check visibility
    if (item.visibility === "private" && item.authorId !== viewerId) {
      return null;
    }
    if (item.visibility === "followers") {
      if (!viewerId || (item.authorId !== viewerId && !this.following.get(viewerId)?.has(item.authorId))) {
        return null;
      }
    }

    // Track view
    item.viewCount++;
    this.feedItems.set(postId, item);

    // Populate user state if viewer
    if (viewerId) {
      return this.engagementService.populateUserState([item], viewerId)[0];
    }

    return item;
  }

  /**
   * Extract mentions from text
   */
  private extractMentions(text: string): string[] {
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      mentions.push(match[1]);
    }

    return [...new Set(mentions)];
  }

  // ==========================================================================
  // FOLLOWING SYSTEM
  // ==========================================================================

  /**
   * Follow a user
   */
  async follow(followerId: string, followeeId: string): Promise<void> {
    if (followerId === followeeId) throw new Error("Cannot follow yourself");

    // Add to following
    const followingSet = this.following.get(followerId) ?? new Set();
    followingSet.add(followeeId);
    this.following.set(followerId, followingSet);

    // Add to followers
    const followersSet = this.followers.get(followeeId) ?? new Set();
    followersSet.add(followerId);
    this.followers.set(followeeId, followersSet);

    // Update profile counts
    const followerProfile = this.profiles.get(followerId);
    if (followerProfile) {
      followerProfile.followingCount = followingSet.size;
    }
    const followeeProfile = this.profiles.get(followeeId);
    if (followeeProfile) {
      followeeProfile.followerCount = followersSet.size;
    }
  }

  /**
   * Unfollow a user
   */
  async unfollow(followerId: string, followeeId: string): Promise<void> {
    const followingSet = this.following.get(followerId);
    if (followingSet) {
      followingSet.delete(followeeId);
    }

    const followersSet = this.followers.get(followeeId);
    if (followersSet) {
      followersSet.delete(followerId);
    }

    // Update profile counts
    const followerProfile = this.profiles.get(followerId);
    if (followerProfile && followingSet) {
      followerProfile.followingCount = followingSet.size;
    }
    const followeeProfile = this.profiles.get(followeeId);
    if (followeeProfile && followersSet) {
      followeeProfile.followerCount = followersSet.size;
    }
  }

  /**
   * Get followers
   */
  getFollowers(userId: string, limit: number = 50): string[] {
    const followersSet = this.followers.get(userId) ?? new Set();
    return Array.from(followersSet).slice(0, limit);
  }

  /**
   * Get following
   */
  getFollowing(userId: string, limit: number = 50): string[] {
    const followingSet = this.following.get(userId) ?? new Set();
    return Array.from(followingSet).slice(0, limit);
  }

  /**
   * Check if following
   */
  isFollowing(followerId: string, followeeId: string): boolean {
    return this.following.get(followerId)?.has(followeeId) ?? false;
  }

  /**
   * Get follow suggestions
   */
  async getFollowSuggestions(
    userId: string,
    limit: number = 10
  ): Promise<FollowSuggestion[]> {
    const following = this.following.get(userId) ?? new Set();
    const suggestions: FollowSuggestion[] = [];

    for (const [profileId, profile] of this.profiles) {
      if (profileId === userId || following.has(profileId)) continue;

      // Calculate mutual followers
      const profileFollowers = this.followers.get(profileId) ?? new Set();
      const mutualFollowers = [...following].filter((id) => profileFollowers.has(id)).length;

      // Determine reason
      let reason = "Popular in community";
      if (mutualFollowers > 0) {
        reason = `Followed by ${mutualFollowers} people you follow`;
      } else if (profile.winRate && profile.winRate > 55) {
        reason = `${profile.winRate}% win rate`;
      }

      suggestions.push({
        user: {
          ...profile,
          isFollowing: false,
          isFollowedBy: this.followers.get(userId)?.has(profileId) ?? false,
        },
        reason,
        mutualFollowers,
      });
    }

    // Sort by mutual followers, then by popularity
    suggestions.sort((a, b) => {
      if ((b.mutualFollowers ?? 0) !== (a.mutualFollowers ?? 0)) {
        return (b.mutualFollowers ?? 0) - (a.mutualFollowers ?? 0);
      }
      return b.user.followerCount - a.user.followerCount;
    });

    return suggestions.slice(0, limit);
  }

  // ==========================================================================
  // PROFILES
  // ==========================================================================

  /**
   * Get user profile
   */
  getProfile(userId: string, viewerId?: string): UserFeedProfile | null {
    const profile = this.profiles.get(userId);
    if (!profile) return null;

    return {
      ...profile,
      isFollowing: viewerId ? this.isFollowing(viewerId, userId) : undefined,
      isFollowedBy: viewerId ? this.isFollowing(userId, viewerId) : undefined,
    };
  }

  /**
   * Update user profile
   */
  updateProfile(userId: string, updates: Partial<UserFeedProfile>): UserFeedProfile {
    const existing = this.profiles.get(userId) ?? {
      userId,
      username: updates.username ?? "user",
      displayName: updates.displayName ?? "User",
      isVerified: false,
      badges: [],
      followerCount: 0,
      followingCount: 0,
      postCount: 0,
      isPublic: true,
      allowDirectMessages: true,
    };

    const updated = { ...existing, ...updates };
    this.profiles.set(userId, updated);
    return updated;
  }

  // ==========================================================================
  // ENGAGEMENT PASSTHROUGH
  // ==========================================================================

  /**
   * React to item
   */
  async react(request: ReactRequest, userId: string): Promise<void> {
    const item = this.feedItems.get(request.targetId);
    if (!item && request.targetType === "post") throw new Error("Post not found");

    const counts = await this.engagementService.react(request, userId, item!);

    // Update item reaction counts
    if (item) {
      item.reactions = counts;
      this.feedItems.set(request.targetId, item);
    }
  }

  /**
   * Add comment
   */
  async addComment(
    request: CreateCommentRequest,
    userId: string,
    username: string,
    avatarUrl?: string
  ): Promise<Comment> {
    const item = this.feedItems.get(request.feedItemId);
    if (!item) throw new Error("Post not found");
    if (!item.commentsEnabled) throw new Error("Comments are disabled");

    const comment = await this.engagementService.addComment(request, userId, username, avatarUrl);

    // Update comment count
    item.commentCount = this.engagementService.getCommentCount(request.feedItemId);
    this.feedItems.set(request.feedItemId, item);

    return comment;
  }

  /**
   * Get comments
   */
  getComments(feedItemId: string, options?: Parameters<FeedEngagementService["getComments"]>[1]): Comment[] {
    return this.engagementService.getComments(feedItemId, options);
  }

  /**
   * Record share
   */
  async recordShare(feedItemId: string, userId: string): Promise<void> {
    const item = this.feedItems.get(feedItemId);
    if (!item) throw new Error("Post not found");

    const shareCount = await this.engagementService.recordShare(feedItemId, userId);
    item.shareCount = shareCount;
    this.feedItems.set(feedItemId, item);
  }

  /**
   * Record copy (tail bet)
   */
  async recordCopy(feedItemId: string, userId: string): Promise<void> {
    const item = this.feedItems.get(feedItemId);
    if (!item) throw new Error("Post not found");
    if (!item.allowCopy) throw new Error("Copying not allowed");

    const { copyCount } = await this.engagementService.recordCopy(feedItemId, userId, item);
    item.copyCount = copyCount;
    this.feedItems.set(feedItemId, item);
  }

  /**
   * Get notifications
   */
  getNotifications(userId: string, options?: Parameters<FeedEngagementService["getNotifications"]>[1]) {
    return this.engagementService.getNotifications(userId, options);
  }

  /**
   * Mark notifications read
   */
  async markNotificationsRead(userId: string, notificationIds?: string[]): Promise<number> {
    return this.engagementService.markNotificationsRead(userId, notificationIds);
  }

  /**
   * Get engagement service
   */
  getEngagementService(): FeedEngagementService {
    return this.engagementService;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createSocialFeedService(): SocialFeedService {
  return new SocialFeedService();
}
