/**
 * Social Feed Engagement
 * Likes, comments, shares, and copy functionality
 */

import type {
  FeedItem,
  Comment,
  ReactionType,
  ReactionCounts,
  SocialNotification,
  SocialNotificationType,
  ReactRequest,
  CreateCommentRequest,
} from "./types";

// ============================================================================
// ENGAGEMENT SERVICE
// ============================================================================

export class FeedEngagementService {
  private reactions: Map<string, Map<string, ReactionType>> = new Map(); // itemId -> userId -> reaction
  private comments: Map<string, Comment[]> = new Map(); // itemId -> comments
  private shares: Map<string, Set<string>> = new Map(); // itemId -> userIds who shared
  private copies: Map<string, Set<string>> = new Map(); // itemId -> userIds who copied
  private notifications: Map<string, SocialNotification[]> = new Map(); // userId -> notifications

  // ==========================================================================
  // REACTIONS
  // ==========================================================================

  /**
   * Add or update reaction
   */
  async react(
    request: ReactRequest,
    userId: string,
    item: FeedItem | Comment
  ): Promise<ReactionCounts> {
    const itemReactions = this.reactions.get(request.targetId) ?? new Map<string, ReactionType>();
    const previousReaction = itemReactions.get(userId);

    // Toggle off if same reaction
    if (previousReaction === request.reactionType) {
      itemReactions.delete(userId);
    } else {
      itemReactions.set(userId, request.reactionType);

      // Send notification if new reaction
      if (!previousReaction && "authorId" in item && item.authorId !== userId) {
        await this.createNotification({
          userId: item.authorId,
          type: "like",
          title: "New reaction",
          body: `Someone reacted to your post`,
          actorId: userId,
          feedItemId: request.targetType === "post" ? request.targetId : undefined,
          commentId: request.targetType === "comment" ? request.targetId : undefined,
        });
      }
    }

    this.reactions.set(request.targetId, itemReactions);

    return this.calculateReactionCounts(request.targetId);
  }

  /**
   * Remove reaction
   */
  async unreact(targetId: string, userId: string): Promise<ReactionCounts> {
    const itemReactions = this.reactions.get(targetId);
    if (itemReactions) {
      itemReactions.delete(userId);
    }
    return this.calculateReactionCounts(targetId);
  }

  /**
   * Get user's reaction on an item
   */
  getUserReaction(targetId: string, userId: string): ReactionType | null {
    const itemReactions = this.reactions.get(targetId);
    return itemReactions?.get(userId) ?? null;
  }

  /**
   * Calculate reaction counts
   */
  calculateReactionCounts(targetId: string): ReactionCounts {
    const itemReactions = this.reactions.get(targetId);
    if (!itemReactions) {
      return { total: 0, like: 0, fire: 0, clap: 0, thinking: 0, money: 0 };
    }

    const counts: ReactionCounts = {
      total: itemReactions.size,
      like: 0,
      fire: 0,
      clap: 0,
      thinking: 0,
      money: 0,
    };

    for (const reaction of itemReactions.values()) {
      counts[reaction]++;
    }

    return counts;
  }

  /**
   * Get users who reacted
   */
  getReactors(
    targetId: string,
    reactionType?: ReactionType,
    limit: number = 50
  ): string[] {
    const itemReactions = this.reactions.get(targetId);
    if (!itemReactions) return [];

    const users: string[] = [];
    for (const [userId, type] of itemReactions) {
      if (!reactionType || type === reactionType) {
        users.push(userId);
        if (users.length >= limit) break;
      }
    }

    return users;
  }

  // ==========================================================================
  // COMMENTS
  // ==========================================================================

  /**
   * Add comment
   */
  async addComment(
    request: CreateCommentRequest,
    userId: string,
    username: string,
    avatarUrl?: string
  ): Promise<Comment> {
    const commentId = `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Extract mentions
    const mentions = this.extractMentions(request.content);

    const comment: Comment = {
      id: commentId,
      feedItemId: request.feedItemId,
      authorId: userId,
      authorUsername: username,
      authorAvatarUrl: avatarUrl,
      isVerified: false,
      content: request.content,
      mentions,
      parentCommentId: request.parentCommentId,
      replyCount: 0,
      reactions: { total: 0, like: 0, fire: 0, clap: 0, thinking: 0, money: 0 },
      createdAt: Date.now(),
    };

    const itemComments = this.comments.get(request.feedItemId) ?? [];
    itemComments.push(comment);
    this.comments.set(request.feedItemId, itemComments);

    // Update reply count on parent
    if (request.parentCommentId) {
      const parentComment = itemComments.find((c) => c.id === request.parentCommentId);
      if (parentComment) {
        parentComment.replyCount++;

        // Notify parent comment author
        if (parentComment.authorId !== userId) {
          await this.createNotification({
            userId: parentComment.authorId,
            type: "reply",
            title: "New reply",
            body: `${username} replied to your comment`,
            actorId: userId,
            actorUsername: username,
            feedItemId: request.feedItemId,
            commentId: comment.id,
          });
        }
      }
    }

    // Notify mentioned users
    for (const mention of mentions) {
      await this.createNotification({
        userId: mention, // This would need to be resolved to userId
        type: "mention",
        title: "You were mentioned",
        body: `${username} mentioned you in a comment`,
        actorId: userId,
        actorUsername: username,
        feedItemId: request.feedItemId,
        commentId: comment.id,
      });
    }

    return comment;
  }

  /**
   * Get comments for a feed item
   */
  getComments(
    feedItemId: string,
    options: {
      parentCommentId?: string;
      limit?: number;
      cursor?: string;
      sortBy?: "newest" | "oldest" | "popular";
    } = {}
  ): Comment[] {
    const { parentCommentId, limit = 50, sortBy = "newest" } = options;
    let itemComments = this.comments.get(feedItemId) ?? [];

    // Filter by parent
    if (parentCommentId === undefined) {
      // Top-level comments only
      itemComments = itemComments.filter((c) => !c.parentCommentId);
    } else if (parentCommentId) {
      // Replies to specific comment
      itemComments = itemComments.filter((c) => c.parentCommentId === parentCommentId);
    }

    // Sort
    switch (sortBy) {
      case "newest":
        itemComments.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case "oldest":
        itemComments.sort((a, b) => a.createdAt - b.createdAt);
        break;
      case "popular":
        itemComments.sort((a, b) => b.reactions.total - a.reactions.total);
        break;
    }

    return itemComments.slice(0, limit);
  }

  /**
   * Delete comment
   */
  async deleteComment(commentId: string, userId: string): Promise<boolean> {
    for (const [feedItemId, comments] of this.comments) {
      const index = comments.findIndex(
        (c) => c.id === commentId && c.authorId === userId
      );
      if (index !== -1) {
        comments.splice(index, 1);
        this.comments.set(feedItemId, comments);
        return true;
      }
    }
    return false;
  }

  /**
   * Get comment count
   */
  getCommentCount(feedItemId: string): number {
    return (this.comments.get(feedItemId) ?? []).length;
  }

  /**
   * Extract @mentions from text
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
  // SHARES
  // ==========================================================================

  /**
   * Record a share
   */
  async recordShare(
    feedItemId: string,
    userId: string,
    platform?: string
  ): Promise<number> {
    const itemShares = this.shares.get(feedItemId) ?? new Set<string>();
    itemShares.add(userId);
    this.shares.set(feedItemId, itemShares);

    return itemShares.size;
  }

  /**
   * Get share count
   */
  getShareCount(feedItemId: string): number {
    return this.shares.get(feedItemId)?.size ?? 0;
  }

  /**
   * Check if user shared
   */
  hasShared(feedItemId: string, userId: string): boolean {
    return this.shares.get(feedItemId)?.has(userId) ?? false;
  }

  // ==========================================================================
  // COPIES (Tailing bets/parlays)
  // ==========================================================================

  /**
   * Record a copy (tail)
   */
  async recordCopy(
    feedItemId: string,
    userId: string,
    item: FeedItem
  ): Promise<{ copyCount: number; notified: boolean }> {
    const itemCopies = this.copies.get(feedItemId) ?? new Set<string>();
    const isNewCopy = !itemCopies.has(userId);
    itemCopies.add(userId);
    this.copies.set(feedItemId, itemCopies);

    // Notify original poster
    if (isNewCopy && item.authorId !== userId) {
      await this.createNotification({
        userId: item.authorId,
        type: "copy_bet",
        title: "Someone copied your bet!",
        body: "Your pick is gaining traction",
        actorId: userId,
        feedItemId,
      });
    }

    return { copyCount: itemCopies.size, notified: isNewCopy };
  }

  /**
   * Get copy count
   */
  getCopyCount(feedItemId: string): number {
    return this.copies.get(feedItemId)?.size ?? 0;
  }

  /**
   * Check if user copied
   */
  hasCopied(feedItemId: string, userId: string): boolean {
    return this.copies.get(feedItemId)?.has(userId) ?? false;
  }

  /**
   * Get users who copied
   */
  getCopiers(feedItemId: string, limit: number = 50): string[] {
    const itemCopies = this.copies.get(feedItemId);
    if (!itemCopies) return [];
    return Array.from(itemCopies).slice(0, limit);
  }

  // ==========================================================================
  // NOTIFICATIONS
  // ==========================================================================

  /**
   * Create notification
   */
  private async createNotification(params: {
    userId: string;
    type: SocialNotificationType;
    title: string;
    body: string;
    actorId?: string;
    actorUsername?: string;
    actorAvatarUrl?: string;
    feedItemId?: string;
    commentId?: string;
  }): Promise<SocialNotification> {
    const notification: SocialNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      actorId: params.actorId,
      actorUsername: params.actorUsername,
      actorAvatarUrl: params.actorAvatarUrl,
      feedItemId: params.feedItemId,
      commentId: params.commentId,
      isRead: false,
      createdAt: Date.now(),
    };

    const userNotifications = this.notifications.get(params.userId) ?? [];
    userNotifications.unshift(notification);

    // Keep only last 100 notifications
    if (userNotifications.length > 100) {
      userNotifications.pop();
    }

    this.notifications.set(params.userId, userNotifications);

    return notification;
  }

  /**
   * Get user notifications
   */
  getNotifications(
    userId: string,
    options: { unreadOnly?: boolean; limit?: number } = {}
  ): SocialNotification[] {
    const { unreadOnly = false, limit = 50 } = options;
    let userNotifications = this.notifications.get(userId) ?? [];

    if (unreadOnly) {
      userNotifications = userNotifications.filter((n) => !n.isRead);
    }

    return userNotifications.slice(0, limit);
  }

  /**
   * Mark notifications as read
   */
  async markNotificationsRead(
    userId: string,
    notificationIds?: string[]
  ): Promise<number> {
    const userNotifications = this.notifications.get(userId) ?? [];
    let count = 0;

    for (const notification of userNotifications) {
      if (!notification.isRead) {
        if (!notificationIds || notificationIds.includes(notification.id)) {
          notification.isRead = true;
          notification.readAt = Date.now();
          count++;
        }
      }
    }

    return count;
  }

  /**
   * Get unread notification count
   */
  getUnreadCount(userId: string): number {
    const userNotifications = this.notifications.get(userId) ?? [];
    return userNotifications.filter((n) => !n.isRead).length;
  }

  // ==========================================================================
  // ENGAGEMENT STATS
  // ==========================================================================

  /**
   * Get engagement stats for a feed item
   */
  getEngagementStats(feedItemId: string): {
    reactions: ReactionCounts;
    commentCount: number;
    shareCount: number;
    copyCount: number;
    engagementRate: number;
  } {
    const reactions = this.calculateReactionCounts(feedItemId);
    const commentCount = this.getCommentCount(feedItemId);
    const shareCount = this.getShareCount(feedItemId);
    const copyCount = this.getCopyCount(feedItemId);

    // Simple engagement rate calculation
    const totalEngagements = reactions.total + commentCount + shareCount + copyCount;

    return {
      reactions,
      commentCount,
      shareCount,
      copyCount,
      engagementRate: totalEngagements, // Would need view count for true rate
    };
  }

  /**
   * Populate user interaction state on items
   */
  populateUserState(items: FeedItem[], userId: string): FeedItem[] {
    return items.map((item) => ({
      ...item,
      hasLiked: this.getUserReaction(item.id, userId) !== null,
      hasCommented: (this.comments.get(item.id) ?? []).some(
        (c) => c.authorId === userId
      ),
      hasCopied: this.hasCopied(item.id, userId),
      hasShared: this.hasShared(item.id, userId),
    }));
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createFeedEngagementService(): FeedEngagementService {
  return new FeedEngagementService();
}
