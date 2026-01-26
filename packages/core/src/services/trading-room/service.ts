/**
 * TradingRoomService - Social trading room management
 * Handles room creation, membership, and messaging
 */

import type { ConvexClient } from "convex/browser";
import type { Id } from "@pull/db/convex/_generated/dataModel";
import type { api } from "@pull/db/convex/_generated/api";

export interface TradingRoom {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  type: "public" | "private" | "premium";
  topic?: "crypto" | "stocks" | "predictions" | "rwa" | "general";
  memberCount: number;
  maxMembers?: number;
  status: "active" | "archived" | "suspended";
  settings?: RoomSettings;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoomSettings {
  allowTradeSharing?: boolean;
  allowLinks?: boolean;
  slowMode?: number;
  requireApproval?: boolean;
}

export interface RoomMember {
  id: string;
  roomId: string;
  userId: string;
  role: "owner" | "admin" | "moderator" | "member";
  status: "active" | "muted" | "banned" | "left";
  joinedAt: string;
  lastActiveAt: string;
  messageCount?: number;
  user?: {
    displayName?: string;
    username?: string;
    avatarUrl?: string;
  };
}

export interface RoomMessage {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  type: "text" | "trade" | "prediction" | "image" | "system";
  replyTo?: string;
  tradeData?: {
    symbol: string;
    action: "buy" | "sell";
    amount?: number;
    price?: number;
  };
  predictionData?: {
    eventId: string;
    outcome: string;
    confidence?: number;
  };
  reactions?: Array<{ emoji: string; userId: string }>;
  isEdited?: boolean;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt?: string;
  sender?: {
    displayName?: string;
    username?: string;
    avatarUrl?: string;
  };
}

export interface CreateRoomParams {
  name: string;
  description?: string;
  type: "public" | "private" | "premium";
  topic?: "crypto" | "stocks" | "predictions" | "rwa" | "general";
  maxMembers?: number;
  settings?: RoomSettings;
  imageUrl?: string;
}

export interface SendMessageParams {
  content: string;
  type?: "text" | "trade" | "prediction" | "image";
  replyTo?: string;
  tradeData?: {
    symbol: string;
    action: "buy" | "sell";
    amount?: number;
    price?: number;
  };
  predictionData?: {
    eventId: string;
    outcome: string;
    confidence?: number;
  };
}

export class TradingRoomService {
  constructor(
    private convex: ConvexClient,
    private apiModule: typeof api
  ) {}

  /**
   * Create a new trading room
   */
  async createRoom(userId: string, params: CreateRoomParams): Promise<TradingRoom> {
    const now = Date.now();

    const roomId = await this.convex.mutation(this.apiModule.social.mutations.createTradingRoom, {
      userId: userId as Id<"users">,
      name: params.name,
      description: params.description,
      type: params.type,
      topic: params.topic,
      maxMembers: params.maxMembers,
      settings: params.settings,
      imageUrl: params.imageUrl,
    });

    return {
      id: roomId,
      name: params.name,
      description: params.description,
      ownerId: userId,
      type: params.type,
      topic: params.topic,
      memberCount: 1,
      maxMembers: params.maxMembers,
      status: "active",
      settings: params.settings,
      imageUrl: params.imageUrl,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
  }

  /**
   * Get a room by ID
   */
  async getRoom(roomId: string, userId?: string): Promise<TradingRoom | null> {
    const room = await this.convex.query(this.apiModule.social.queries.getTradingRoom, {
      roomId: roomId as Id<"tradingRooms">,
      userId: userId as Id<"users"> | undefined,
    });

    if (!room) return null;

    return {
      id: room._id,
      name: room.name,
      description: room.description,
      ownerId: room.ownerId,
      type: room.type,
      topic: room.topic,
      memberCount: room.memberCount,
      maxMembers: room.maxMembers,
      status: room.status,
      settings: room.settings,
      imageUrl: room.imageUrl,
      createdAt: new Date(room.createdAt).toISOString(),
      updatedAt: new Date(room.updatedAt).toISOString(),
    };
  }

  /**
   * Search for rooms
   */
  async searchRooms(params: {
    query?: string;
    type?: "public" | "private" | "premium";
    topic?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ rooms: TradingRoom[]; cursor?: string }> {
    const result = await this.convex.query(this.apiModule.social.queries.searchTradingRooms, {
      query: params.query,
      type: params.type,
      topic: params.topic as any,
      limit: params.limit ?? 20,
      cursor: params.cursor,
    });

    return {
      rooms: result.rooms.map((room: any) => ({
        id: room._id,
        name: room.name,
        description: room.description,
        ownerId: room.ownerId,
        type: room.type,
        topic: room.topic,
        memberCount: room.memberCount,
        maxMembers: room.maxMembers,
        status: room.status,
        settings: room.settings,
        imageUrl: room.imageUrl,
        createdAt: new Date(room.createdAt).toISOString(),
        updatedAt: new Date(room.updatedAt).toISOString(),
      })),
      cursor: result.cursor,
    };
  }

  /**
   * Get rooms the user is a member of
   */
  async getMyRooms(userId: string, limit?: number): Promise<TradingRoom[]> {
    const result = await this.convex.query(this.apiModule.social.queries.getUserTradingRooms, {
      userId: userId as Id<"users">,
      limit: limit ?? 50,
    });

    return result.rooms.map((room: any) => ({
      id: room._id,
      name: room.name,
      description: room.description,
      ownerId: room.ownerId,
      type: room.type,
      topic: room.topic,
      memberCount: room.memberCount,
      maxMembers: room.maxMembers,
      status: room.status,
      settings: room.settings,
      imageUrl: room.imageUrl,
      createdAt: new Date(room.createdAt).toISOString(),
      updatedAt: new Date(room.updatedAt).toISOString(),
    }));
  }

  /**
   * Get popular rooms
   */
  async getPopularRooms(limit?: number): Promise<TradingRoom[]> {
    const result = await this.convex.query(this.apiModule.social.queries.getPopularTradingRooms, {
      limit: limit ?? 10,
    });

    return result.rooms.map((room: any) => ({
      id: room._id,
      name: room.name,
      description: room.description,
      ownerId: room.ownerId,
      type: room.type,
      topic: room.topic,
      memberCount: room.memberCount,
      maxMembers: room.maxMembers,
      status: room.status,
      settings: room.settings,
      imageUrl: room.imageUrl,
      createdAt: new Date(room.createdAt).toISOString(),
      updatedAt: new Date(room.updatedAt).toISOString(),
    }));
  }

  /**
   * Join a room
   */
  async joinRoom(roomId: string, userId: string): Promise<RoomMember> {
    const result = await this.convex.mutation(this.apiModule.social.mutations.joinTradingRoom, {
      roomId: roomId as Id<"tradingRooms">,
      userId: userId as Id<"users">,
    });

    return {
      id: result.memberId,
      roomId,
      userId,
      role: "member",
      status: "active",
      joinedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };
  }

  /**
   * Leave a room
   */
  async leaveRoom(roomId: string, userId: string): Promise<boolean> {
    await this.convex.mutation(this.apiModule.social.mutations.leaveTradingRoom, {
      roomId: roomId as Id<"tradingRooms">,
      userId: userId as Id<"users">,
    });

    return true;
  }

  /**
   * Get room members
   */
  async getRoomMembers(roomId: string, limit?: number): Promise<RoomMember[]> {
    const result = await this.convex.query(this.apiModule.social.queries.getTradingRoomMembers, {
      roomId: roomId as Id<"tradingRooms">,
      limit: limit ?? 100,
    });

    return result.members.map((member: any) => ({
      id: member._id,
      roomId: member.roomId,
      userId: member.userId,
      role: member.role,
      status: member.status,
      joinedAt: new Date(member.joinedAt).toISOString(),
      lastActiveAt: new Date(member.lastActiveAt).toISOString(),
      messageCount: member.messageCount,
      user: member.user ? {
        displayName: member.user.displayName,
        username: member.user.username,
        avatarUrl: member.user.avatarUrl,
      } : undefined,
    }));
  }

  /**
   * Get room messages
   */
  async getMessages(
    roomId: string,
    userId: string,
    params?: { limit?: number; cursor?: string }
  ): Promise<{ messages: RoomMessage[]; cursor?: string }> {
    const result = await this.convex.query(this.apiModule.social.queries.getTradingRoomMessages, {
      roomId: roomId as Id<"tradingRooms">,
      userId: userId as Id<"users">,
      limit: params?.limit ?? 50,
      cursor: params?.cursor,
    });

    return {
      messages: result.messages.map((msg: any) => ({
        id: msg._id,
        roomId: msg.roomId,
        senderId: msg.senderId,
        content: msg.content,
        type: msg.type,
        replyTo: msg.replyTo,
        tradeData: msg.tradeData,
        predictionData: msg.predictionData,
        reactions: msg.reactions,
        isEdited: msg.isEdited,
        isDeleted: msg.isDeleted,
        createdAt: new Date(msg.createdAt).toISOString(),
        updatedAt: msg.updatedAt ? new Date(msg.updatedAt).toISOString() : undefined,
        sender: msg.sender ? {
          displayName: msg.sender.displayName,
          username: msg.sender.username,
          avatarUrl: msg.sender.avatarUrl,
        } : undefined,
      })),
      cursor: result.cursor,
    };
  }

  /**
   * Send a message to a room
   */
  async sendMessage(
    roomId: string,
    userId: string,
    params: SendMessageParams
  ): Promise<RoomMessage> {
    const messageId = await this.convex.mutation(this.apiModule.social.mutations.sendTradingRoomMessage, {
      roomId: roomId as Id<"tradingRooms">,
      userId: userId as Id<"users">,
      content: params.content,
      type: params.type ?? "text",
      replyTo: params.replyTo as Id<"tradingRoomMessages"> | undefined,
      tradeData: params.tradeData,
      predictionData: params.predictionData,
    });

    return {
      id: messageId,
      roomId,
      senderId: userId,
      content: params.content,
      type: params.type ?? "text",
      replyTo: params.replyTo,
      tradeData: params.tradeData,
      predictionData: params.predictionData,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Update room settings (owner/admin only)
   */
  async updateRoom(
    roomId: string,
    userId: string,
    updates: Partial<Pick<TradingRoom, "name" | "description" | "settings" | "imageUrl" | "maxMembers">>
  ): Promise<TradingRoom> {
    await this.convex.mutation(this.apiModule.social.mutations.updateTradingRoom, {
      roomId: roomId as Id<"tradingRooms">,
      userId: userId as Id<"users">,
      ...updates,
    });

    const room = await this.getRoom(roomId, userId);
    if (!room) throw new Error("Room not found after update");
    return room;
  }

  /**
   * Delete/archive a room (owner only)
   */
  async archiveRoom(roomId: string, userId: string): Promise<boolean> {
    await this.convex.mutation(this.apiModule.social.mutations.archiveTradingRoom, {
      roomId: roomId as Id<"tradingRooms">,
      userId: userId as Id<"users">,
    });

    return true;
  }

  /**
   * Kick/ban a member (owner/admin only)
   */
  async kickMember(
    roomId: string,
    adminUserId: string,
    targetUserId: string,
    ban?: boolean
  ): Promise<boolean> {
    await this.convex.mutation(this.apiModule.social.mutations.kickTradingRoomMember, {
      roomId: roomId as Id<"tradingRooms">,
      adminUserId: adminUserId as Id<"users">,
      targetUserId: targetUserId as Id<"users">,
      ban: ban ?? false,
    });

    return true;
  }

  /**
   * Promote/demote a member (owner only)
   */
  async updateMemberRole(
    roomId: string,
    adminUserId: string,
    targetUserId: string,
    role: "admin" | "moderator" | "member"
  ): Promise<RoomMember> {
    await this.convex.mutation(this.apiModule.social.mutations.updateTradingRoomMemberRole, {
      roomId: roomId as Id<"tradingRooms">,
      adminUserId: adminUserId as Id<"users">,
      targetUserId: targetUserId as Id<"users">,
      role,
    });

    const members = await this.getRoomMembers(roomId);
    const member = members.find(m => m.userId === targetUserId);
    if (!member) throw new Error("Member not found after update");
    return member;
  }
}

// Singleton instance factory
let instance: TradingRoomService | null = null;

export function getTradingRoomService(
  convex: ConvexClient,
  apiModule: typeof api
): TradingRoomService {
  if (!instance) {
    instance = new TradingRoomService(convex, apiModule);
  }
  return instance;
}

export function resetTradingRoomService(): void {
  instance = null;
}
