/**
 * Trading Room Service
 * Manages trading rooms, memberships, and messages
 */

import type {
  TradingRoom,
  TradingRoomMember,
  TradingRoomMessage,
  TradingRoomSettings,
  TradingRoomType,
  RoomAccessLevel,
  RoomMemberRole,
  RoomMemberStatus,
  NotificationLevel,
  RoomMessageType,
  SharedTradeData,
  MessageAttachment,
  CreateTradingRoomInput,
  SendRoomMessageInput,
  UserSummary,
  AssetClass,
} from "@pull/types";

// ============================================================================
// Configuration
// ============================================================================

export interface TradingRoomServiceConfig {
  maxRoomsPerUser: number;
  maxMembersPerRoom: number;
  maxMessageLength: number;
  maxAttachmentsPerMessage: number;
  messageRateLimit: number; // messages per minute
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

const DEFAULT_CONFIG: TradingRoomServiceConfig = {
  maxRoomsPerUser: 10,
  maxMembersPerRoom: 10000,
  maxMessageLength: 4000,
  maxAttachmentsPerMessage: 5,
  messageRateLimit: 30,
};

const DEFAULT_ROOM_SETTINGS: TradingRoomSettings = {
  allowPositionSharing: true,
  allowCopyTrades: false,
  positionDelay: 0,
  requireVerifiedTraders: false,
  minReputationScore: 0,
};

// ============================================================================
// Trading Room Service
// ============================================================================

export class TradingRoomService {
  private readonly config: TradingRoomServiceConfig;
  private readonly db: ConvexClient;
  private readonly logger: Logger;

  constructor(db: ConvexClient, config?: Partial<TradingRoomServiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = db;
    this.logger = config?.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[TradingRoom] ${msg}`, meta),
      info: (msg, meta) => console.info(`[TradingRoom] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[TradingRoom] ${msg}`, meta),
      error: (msg, meta) => console.error(`[TradingRoom] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // Room Management
  // ==========================================================================

  /**
   * Create a new trading room
   */
  async createRoom(ownerId: string, input: CreateTradingRoomInput): Promise<TradingRoom> {
    // Check room limit
    const ownedRooms = await this.db.query<number>("tradingRooms:countByOwner", {
      ownerId,
    });

    if (ownedRooms >= this.config.maxRoomsPerUser) {
      throw new TradingRoomError(
        `Cannot create more than ${this.config.maxRoomsPerUser} rooms`,
        "MAX_ROOMS_EXCEEDED"
      );
    }

    const now = Date.now();
    const room = await this.db.mutation<TradingRoom>("tradingRooms:create", {
      name: input.name,
      description: input.description,
      avatarUrl: input.avatarUrl,
      coverImageUrl: input.coverImageUrl,
      type: input.type,
      accessLevel: input.accessLevel,
      subscriptionPrice: input.subscriptionPrice,
      subscriptionPeriod: input.subscriptionPeriod,
      ownerId,
      moderatorIds: [],
      tradingFocus: input.tradingFocus ?? [],
      assetClasses: input.assetClasses ?? [],
      settings: { ...DEFAULT_ROOM_SETTINGS, ...input.settings },
      memberCount: 1,
      activeMembers: 1,
      totalPositionsShared: 0,
      totalMessages: 0,
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
    });

    // Add owner as first member
    await this.addMemberInternal(room.id, ownerId, "owner");

    this.logger.info("Trading room created", { roomId: room.id, ownerId, name: input.name });
    return room;
  }

  /**
   * Update room settings
   */
  async updateRoom(
    roomId: string,
    userId: string,
    updates: Partial<Omit<CreateTradingRoomInput, "type">>
  ): Promise<TradingRoom> {
    const room = await this.getRoom(roomId);

    // Only owner can update
    if (room.ownerId !== userId) {
      throw new TradingRoomError("Only the owner can update the room", "NOT_AUTHORIZED");
    }

    return await this.db.mutation<TradingRoom>("tradingRooms:update", {
      id: roomId,
      ...updates,
      settings: updates.settings ? { ...room.settings, ...updates.settings } : undefined,
      updatedAt: Date.now(),
    });
  }

  /**
   * Archive a room
   */
  async archiveRoom(roomId: string, userId: string): Promise<void> {
    const room = await this.getRoom(roomId);

    if (room.ownerId !== userId) {
      throw new TradingRoomError("Only the owner can archive the room", "NOT_AUTHORIZED");
    }

    await this.db.mutation("tradingRooms:update", {
      id: roomId,
      status: "archived",
      updatedAt: Date.now(),
    });

    this.logger.info("Trading room archived", { roomId, userId });
  }

  /**
   * Get room by ID
   */
  async getRoom(roomId: string, userId?: string): Promise<TradingRoom> {
    const room = await this.db.query<TradingRoom | null>("tradingRooms:get", { id: roomId });

    if (!room) {
      throw new TradingRoomError("Room not found", "NOT_FOUND");
    }

    // Add membership info if userId provided
    if (userId) {
      const membership = await this.db.query<TradingRoomMember | null>(
        "tradingRoomMembers:getByRoomAndUser",
        { roomId, userId }
      );
      return { ...room, membership: membership ?? undefined };
    }

    return room;
  }

  /**
   * Search rooms
   */
  async searchRooms(
    query?: string,
    options?: {
      type?: TradingRoomType;
      assetClasses?: AssetClass[];
      limit?: number;
      cursor?: string;
    }
  ): Promise<{ rooms: TradingRoom[]; cursor?: string }> {
    return await this.db.query("tradingRooms:search", {
      query,
      type: options?.type,
      assetClasses: options?.assetClasses,
      limit: options?.limit ?? 20,
      cursor: options?.cursor,
    });
  }

  /**
   * Get popular rooms
   */
  async getPopularRooms(options?: { limit?: number }): Promise<TradingRoom[]> {
    return await this.db.query("tradingRooms:getPopular", {
      limit: options?.limit ?? 10,
    });
  }

  /**
   * Get user's rooms
   */
  async getUserRooms(
    userId: string,
    options?: { role?: RoomMemberRole; limit?: number; cursor?: string }
  ): Promise<{ rooms: TradingRoom[]; cursor?: string }> {
    return await this.db.query("tradingRooms:getByUser", {
      userId,
      role: options?.role,
      limit: options?.limit ?? 50,
      cursor: options?.cursor,
    });
  }

  // ==========================================================================
  // Membership Management
  // ==========================================================================

  /**
   * Join a room
   */
  async joinRoom(roomId: string, userId: string): Promise<TradingRoomMember> {
    const room = await this.getRoom(roomId);

    // Check if already a member
    const existingMember = await this.db.query<TradingRoomMember | null>(
      "tradingRoomMembers:getByRoomAndUser",
      { roomId, userId }
    );

    if (existingMember?.status === "active") {
      throw new TradingRoomError("Already a member of this room", "ALREADY_MEMBER");
    }

    if (existingMember?.status === "banned") {
      throw new TradingRoomError("You are banned from this room", "BANNED");
    }

    // Check access level
    if (room.accessLevel === "invite_only") {
      throw new TradingRoomError("This room is invite-only", "INVITE_ONLY");
    }

    if (room.accessLevel === "subscription" && !room.subscriptionPrice) {
      throw new TradingRoomError("Subscription required", "SUBSCRIPTION_REQUIRED");
    }

    // Check room capacity
    if (room.memberCount >= this.config.maxMembersPerRoom) {
      throw new TradingRoomError("Room is at capacity", "ROOM_FULL");
    }

    // Check reputation requirements
    if (room.settings.requireVerifiedTraders || room.settings.minReputationScore > 0) {
      const reputation = await this.db.query<{ overallScore: number; isVerified: boolean } | null>(
        "reputationScores:get",
        { userId }
      );

      if (room.settings.requireVerifiedTraders && !reputation?.isVerified) {
        throw new TradingRoomError("Verified trader status required", "NOT_VERIFIED");
      }

      if ((reputation?.overallScore ?? 0) < room.settings.minReputationScore) {
        throw new TradingRoomError(
          `Minimum reputation score of ${room.settings.minReputationScore} required`,
          "INSUFFICIENT_REPUTATION"
        );
      }
    }

    // Determine initial status
    const status: RoomMemberStatus =
      room.accessLevel === "request_to_join" ? "pending" : "active";

    const member = await this.addMemberInternal(roomId, userId, "member", status);

    if (status === "active") {
      await this.updateMemberCount(roomId);
    }

    this.logger.info("User joined room", { roomId, userId, status });
    return member;
  }

  /**
   * Leave a room
   */
  async leaveRoom(roomId: string, userId: string): Promise<void> {
    const room = await this.getRoom(roomId);

    if (room.ownerId === userId) {
      throw new TradingRoomError("Owner cannot leave the room", "OWNER_CANNOT_LEAVE");
    }

    const member = await this.getMember(roomId, userId);

    await this.db.mutation("tradingRoomMembers:update", {
      id: member.id,
      status: "left",
      leftAt: Date.now(),
      updatedAt: Date.now(),
    });

    await this.updateMemberCount(roomId);

    this.logger.info("User left room", { roomId, userId });
  }

  /**
   * Invite a user to a room
   */
  async inviteUser(
    roomId: string,
    inviterId: string,
    inviteeId: string
  ): Promise<TradingRoomMember> {
    const room = await this.getRoom(roomId);
    const inviter = await this.getMember(roomId, inviterId);

    if (!inviter.canInvite && inviter.role !== "owner" && inviter.role !== "moderator") {
      throw new TradingRoomError("You do not have permission to invite", "NOT_AUTHORIZED");
    }

    // Check if already a member
    const existing = await this.db.query<TradingRoomMember | null>(
      "tradingRoomMembers:getByRoomAndUser",
      { roomId, userId: inviteeId }
    );

    if (existing?.status === "active") {
      throw new TradingRoomError("User is already a member", "ALREADY_MEMBER");
    }

    const member = await this.addMemberInternal(roomId, inviteeId, "member", "active");
    await this.updateMemberCount(roomId);

    this.logger.info("User invited to room", { roomId, inviterId, inviteeId });
    return member;
  }

  /**
   * Kick a member from a room
   */
  async kickMember(roomId: string, kickerId: string, targetId: string): Promise<void> {
    const room = await this.getRoom(roomId);
    const kicker = await this.getMember(roomId, kickerId);

    if (kicker.role !== "owner" && kicker.role !== "moderator") {
      throw new TradingRoomError("Only owners and moderators can kick members", "NOT_AUTHORIZED");
    }

    if (targetId === room.ownerId) {
      throw new TradingRoomError("Cannot kick the owner", "CANNOT_KICK_OWNER");
    }

    const target = await this.getMember(roomId, targetId);

    if (kicker.role === "moderator" && target.role === "moderator") {
      throw new TradingRoomError("Moderators cannot kick other moderators", "NOT_AUTHORIZED");
    }

    await this.db.mutation("tradingRoomMembers:update", {
      id: target.id,
      status: "left",
      leftAt: Date.now(),
      updatedAt: Date.now(),
    });

    await this.updateMemberCount(roomId);

    this.logger.info("Member kicked from room", { roomId, kickerId, targetId });
  }

  /**
   * Ban a member from a room
   */
  async banMember(roomId: string, bannerId: string, targetId: string): Promise<void> {
    const room = await this.getRoom(roomId);

    if (room.ownerId !== bannerId) {
      throw new TradingRoomError("Only the owner can ban members", "NOT_AUTHORIZED");
    }

    if (targetId === room.ownerId) {
      throw new TradingRoomError("Cannot ban yourself", "CANNOT_BAN_SELF");
    }

    const target = await this.db.query<TradingRoomMember | null>(
      "tradingRoomMembers:getByRoomAndUser",
      { roomId, userId: targetId }
    );

    if (target) {
      await this.db.mutation("tradingRoomMembers:update", {
        id: target.id,
        status: "banned",
        bannedAt: Date.now(),
        updatedAt: Date.now(),
      });
    } else {
      // Create a banned record
      await this.addMemberInternal(roomId, targetId, "member", "banned");
    }

    await this.updateMemberCount(roomId);

    this.logger.info("Member banned from room", { roomId, bannerId, targetId });
  }

  /**
   * Update member role
   */
  async updateMemberRole(
    roomId: string,
    ownerId: string,
    targetId: string,
    role: RoomMemberRole
  ): Promise<TradingRoomMember> {
    const room = await this.getRoom(roomId);

    if (room.ownerId !== ownerId) {
      throw new TradingRoomError("Only the owner can change roles", "NOT_AUTHORIZED");
    }

    if (role === "owner") {
      throw new TradingRoomError("Cannot assign owner role", "CANNOT_ASSIGN_OWNER");
    }

    const target = await this.getMember(roomId, targetId);

    if (target.role === "owner") {
      throw new TradingRoomError("Cannot change owner's role", "CANNOT_CHANGE_OWNER");
    }

    // Update moderator IDs list
    if (role === "moderator" && !room.moderatorIds.includes(targetId)) {
      await this.db.mutation("tradingRooms:update", {
        id: roomId,
        moderatorIds: [...room.moderatorIds, targetId],
        updatedAt: Date.now(),
      });
    } else if (role !== "moderator" && room.moderatorIds.includes(targetId)) {
      await this.db.mutation("tradingRooms:update", {
        id: roomId,
        moderatorIds: room.moderatorIds.filter((id) => id !== targetId),
        updatedAt: Date.now(),
      });
    }

    // Set permissions based on role
    const permissions = this.getRolePermissions(role);

    return await this.db.mutation<TradingRoomMember>("tradingRoomMembers:update", {
      id: target.id,
      role,
      ...permissions,
      updatedAt: Date.now(),
    });
  }

  private async getMember(roomId: string, userId: string): Promise<TradingRoomMember> {
    const member = await this.db.query<TradingRoomMember | null>(
      "tradingRoomMembers:getByRoomAndUser",
      { roomId, userId }
    );

    if (!member || member.status !== "active") {
      throw new TradingRoomError("Not a member of this room", "NOT_MEMBER");
    }

    return member;
  }

  private async addMemberInternal(
    roomId: string,
    userId: string,
    role: RoomMemberRole,
    status: RoomMemberStatus = "active"
  ): Promise<TradingRoomMember> {
    const now = Date.now();
    const permissions = this.getRolePermissions(role);

    return await this.db.mutation<TradingRoomMember>("tradingRoomMembers:create", {
      roomId,
      userId,
      role,
      status,
      ...permissions,
      notificationsEnabled: true,
      notificationLevel: "all",
      positionsSharedCount: 0,
      messagesCount: 0,
      joinedAt: now,
      updatedAt: now,
    });
  }

  private getRolePermissions(role: RoomMemberRole): {
    canPost: boolean;
    canSharePositions: boolean;
    canInvite: boolean;
  } {
    switch (role) {
      case "owner":
      case "moderator":
        return { canPost: true, canSharePositions: true, canInvite: true };
      case "contributor":
        return { canPost: true, canSharePositions: true, canInvite: false };
      case "member":
        return { canPost: true, canSharePositions: false, canInvite: false };
      case "viewer":
        return { canPost: false, canSharePositions: false, canInvite: false };
      default:
        return { canPost: false, canSharePositions: false, canInvite: false };
    }
  }

  private async updateMemberCount(roomId: string): Promise<void> {
    const count = await this.db.query<number>("tradingRoomMembers:countActive", { roomId });
    await this.db.mutation("tradingRooms:update", {
      id: roomId,
      memberCount: count,
      updatedAt: Date.now(),
    });
  }

  // ==========================================================================
  // Messaging
  // ==========================================================================

  /**
   * Send a message to a room
   */
  async sendMessage(userId: string, input: SendRoomMessageInput): Promise<TradingRoomMessage> {
    const room = await this.getRoom(input.roomId);
    const member = await this.getMember(input.roomId, userId);

    // Check permissions
    if (!member.canPost) {
      throw new TradingRoomError("You do not have permission to post", "NOT_AUTHORIZED");
    }

    if (input.type === "position_share" && !member.canSharePositions) {
      throw new TradingRoomError("You do not have permission to share positions", "NOT_AUTHORIZED");
    }

    // Validate content
    if (input.content.length > this.config.maxMessageLength) {
      throw new TradingRoomError(
        `Message exceeds maximum length of ${this.config.maxMessageLength}`,
        "MESSAGE_TOO_LONG"
      );
    }

    if (input.attachments && input.attachments.length > this.config.maxAttachmentsPerMessage) {
      throw new TradingRoomError(
        `Maximum ${this.config.maxAttachmentsPerMessage} attachments allowed`,
        "TOO_MANY_ATTACHMENTS"
      );
    }

    // Check rate limit
    await this.checkMessageRateLimit(input.roomId, userId);

    const now = Date.now();
    const message = await this.db.mutation<TradingRoomMessage>("tradingRoomMessages:create", {
      roomId: input.roomId,
      senderId: userId,
      type: input.type,
      content: input.content,
      sharedData: input.sharedData,
      attachments: input.attachments ?? [],
      likesCount: 0,
      repliesCount: 0,
      copyCount: 0,
      replyToId: input.replyToId,
      isEdited: false,
      isDeleted: false,
      isPinned: false,
      createdAt: now,
    });

    // Update room stats
    await this.db.mutation("tradingRooms:incrementStats", {
      id: input.roomId,
      totalMessages: 1,
      totalPositionsShared: input.type === "position_share" ? 1 : 0,
      lastActivityAt: now,
    });

    // Update member stats
    await this.db.mutation("tradingRoomMembers:incrementStats", {
      id: member.id,
      messagesCount: 1,
      positionsSharedCount: input.type === "position_share" ? 1 : 0,
      lastPostAt: now,
    });

    this.logger.debug("Message sent", { roomId: input.roomId, userId, type: input.type });
    return message;
  }

  /**
   * Edit a message
   */
  async editMessage(
    roomId: string,
    messageId: string,
    userId: string,
    newContent: string
  ): Promise<TradingRoomMessage> {
    const message = await this.getMessage(messageId);

    if (message.senderId !== userId) {
      throw new TradingRoomError("Can only edit your own messages", "NOT_AUTHORIZED");
    }

    if (message.isDeleted) {
      throw new TradingRoomError("Cannot edit deleted message", "MESSAGE_DELETED");
    }

    if (newContent.length > this.config.maxMessageLength) {
      throw new TradingRoomError(
        `Message exceeds maximum length of ${this.config.maxMessageLength}`,
        "MESSAGE_TOO_LONG"
      );
    }

    return await this.db.mutation<TradingRoomMessage>("tradingRoomMessages:update", {
      id: messageId,
      content: newContent,
      isEdited: true,
      editedAt: Date.now(),
    });
  }

  /**
   * Delete a message
   */
  async deleteMessage(roomId: string, messageId: string, userId: string): Promise<void> {
    const room = await this.getRoom(roomId);
    const message = await this.getMessage(messageId);

    // Check permissions
    const canDelete =
      message.senderId === userId ||
      room.ownerId === userId ||
      room.moderatorIds.includes(userId);

    if (!canDelete) {
      throw new TradingRoomError("Not authorized to delete this message", "NOT_AUTHORIZED");
    }

    await this.db.mutation("tradingRoomMessages:update", {
      id: messageId,
      isDeleted: true,
      deletedAt: Date.now(),
    });

    this.logger.debug("Message deleted", { roomId, messageId, userId });
  }

  /**
   * Pin/unpin a message
   */
  async togglePinMessage(roomId: string, messageId: string, userId: string): Promise<TradingRoomMessage> {
    const room = await this.getRoom(roomId);

    if (room.ownerId !== userId && !room.moderatorIds.includes(userId)) {
      throw new TradingRoomError("Only owners and moderators can pin messages", "NOT_AUTHORIZED");
    }

    const message = await this.getMessage(messageId);

    return await this.db.mutation<TradingRoomMessage>("tradingRoomMessages:update", {
      id: messageId,
      isPinned: !message.isPinned,
    });
  }

  /**
   * Like a message
   */
  async likeMessage(roomId: string, messageId: string, userId: string): Promise<void> {
    await this.getMember(roomId, userId); // Verify membership

    await this.db.mutation("tradingRoomMessages:like", {
      messageId,
      userId,
    });
  }

  /**
   * Unlike a message
   */
  async unlikeMessage(roomId: string, messageId: string, userId: string): Promise<void> {
    await this.getMember(roomId, userId); // Verify membership

    await this.db.mutation("tradingRoomMessages:unlike", {
      messageId,
      userId,
    });
  }

  /**
   * Get messages from a room
   */
  async getMessages(
    roomId: string,
    userId: string,
    options?: { limit?: number; cursor?: string; type?: RoomMessageType }
  ): Promise<{ messages: TradingRoomMessage[]; cursor?: string }> {
    await this.getMember(roomId, userId); // Verify membership

    return await this.db.query("tradingRoomMessages:getByRoom", {
      roomId,
      type: options?.type,
      limit: options?.limit ?? 50,
      cursor: options?.cursor,
    });
  }

  /**
   * Get pinned messages
   */
  async getPinnedMessages(roomId: string, userId: string): Promise<TradingRoomMessage[]> {
    await this.getMember(roomId, userId);

    return await this.db.query("tradingRoomMessages:getPinned", { roomId });
  }

  private async getMessage(messageId: string): Promise<TradingRoomMessage> {
    const message = await this.db.query<TradingRoomMessage | null>("tradingRoomMessages:get", {
      id: messageId,
    });

    if (!message) {
      throw new TradingRoomError("Message not found", "NOT_FOUND");
    }

    return message;
  }

  private async checkMessageRateLimit(roomId: string, userId: string): Promise<void> {
    const oneMinuteAgo = Date.now() - 60000;

    const recentCount = await this.db.query<number>("tradingRoomMessages:countRecent", {
      roomId,
      senderId: userId,
      since: oneMinuteAgo,
    });

    if (recentCount >= this.config.messageRateLimit) {
      throw new TradingRoomError("Rate limit exceeded", "RATE_LIMITED");
    }
  }
}

// ============================================================================
// Errors
// ============================================================================

export class TradingRoomError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "TradingRoomError";
  }
}

export default TradingRoomService;
