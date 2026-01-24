import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * Matrix messaging queries and mutations for PULL
 */

// ============================================================================
// ROOM QUERIES
// ============================================================================

/**
 * Get rooms created by a user
 */
export const getRoomsByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("matrixRooms")
      .withIndex("by_creator", (q) => q.eq("creatorId", args.userId))
      .order("desc")
      .collect();
  },
});

/**
 * Get room by Matrix room ID
 */
export const getRoomByMatrixId = query({
  args: { matrixRoomId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("matrixRooms")
      .withIndex("by_matrix_id", (q) => q.eq("matrixRoomId", args.matrixRoomId))
      .unique();
  },
});

/**
 * Get room by ID
 */
export const getRoomById = query({
  args: { id: v.id("matrixRooms") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ============================================================================
// ROOM MUTATIONS
// ============================================================================

/**
 * Create a new Matrix room
 */
export const createRoom = mutation({
  args: {
    matrixRoomId: v.string(),
    type: v.union(v.literal("direct"), v.literal("group"), v.literal("public"), v.literal("space")),
    name: v.optional(v.string()),
    creatorId: v.id("users"),
    isEncrypted: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("matrixRooms", {
      ...args,
      memberCount: 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update room details
 */
export const updateRoom = mutation({
  args: {
    id: v.id("matrixRooms"),
    name: v.optional(v.string()),
    topic: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    memberCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const filteredUpdates: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    }

    if (Object.keys(filteredUpdates).length > 0) {
      filteredUpdates.updatedAt = Date.now();
      await ctx.db.patch(id, filteredUpdates);
    }

    return id;
  },
});

// ============================================================================
// MESSAGE QUERIES
// ============================================================================

/**
 * Get messages for a room
 */
export const getMessages = query({
  args: {
    roomId: v.id("matrixRooms"),
    limit: v.optional(v.number()),
    before: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let messages = await ctx.db
      .query("matrixMessages")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .take(args.limit ?? 50);

    if (args.before) {
      messages = messages.filter(m => m.timestamp < args.before!);
    }

    return messages.reverse(); // Return in chronological order
  },
});

/**
 * Get message by Matrix event ID
 */
export const getMessageByEventId = query({
  args: { matrixEventId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("matrixMessages")
      .withIndex("by_matrix_event", (q) => q.eq("matrixEventId", args.matrixEventId))
      .unique();
  },
});

/**
 * Get messages by sender
 */
export const getMessagesBySender = query({
  args: {
    senderId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("matrixMessages")
      .withIndex("by_sender", (q) => q.eq("senderId", args.senderId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

/**
 * Search messages
 */
export const searchMessages = query({
  args: {
    roomId: v.id("matrixRooms"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("matrixMessages")
      .withSearchIndex("search_messages", (q) =>
        q.search("body", args.query).eq("roomId", args.roomId)
      )
      .take(args.limit ?? 20);
  },
});

// ============================================================================
// MESSAGE MUTATIONS
// ============================================================================

/**
 * Create a new message
 */
export const createMessage = mutation({
  args: {
    matrixEventId: v.string(),
    roomId: v.id("matrixRooms"),
    senderId: v.id("users"),
    contentType: v.string(),
    body: v.string(),
    formattedBody: v.optional(v.string()),
    replyToId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const msgId = await ctx.db.insert("matrixMessages", {
      ...args,
      isEdited: false,
      isDeleted: false,
      timestamp: now,
    });

    // Update room's last message
    await ctx.db.patch(args.roomId, {
      lastMessageAt: now,
      lastMessagePreview: args.body.substring(0, 100),
      updatedAt: now,
    });

    return msgId;
  },
});

/**
 * Edit a message
 */
export const editMessage = mutation({
  args: {
    id: v.id("matrixMessages"),
    body: v.string(),
    formattedBody: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.id);
    if (!message) {
      throw new Error("Message not found");
    }

    await ctx.db.patch(args.id, {
      body: args.body,
      formattedBody: args.formattedBody,
      isEdited: true,
    });

    return args.id;
  },
});

/**
 * Delete a message (soft delete)
 */
export const deleteMessage = mutation({
  args: { id: v.id("matrixMessages") },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.id);
    if (!message) {
      throw new Error("Message not found");
    }

    await ctx.db.patch(args.id, {
      isDeleted: true,
      body: "[deleted]",
    });

    return args.id;
  },
});

/**
 * Sync message from Matrix (upsert)
 */
export const syncMessage = mutation({
  args: {
    matrixEventId: v.string(),
    roomId: v.id("matrixRooms"),
    senderId: v.id("users"),
    contentType: v.string(),
    body: v.string(),
    formattedBody: v.optional(v.string()),
    replyToId: v.optional(v.string()),
    timestamp: v.number(),
    isEdited: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Check if message already exists
    const existing = await ctx.db
      .query("matrixMessages")
      .withIndex("by_matrix_event", (q) => q.eq("matrixEventId", args.matrixEventId))
      .unique();

    if (existing) {
      // Update existing message
      await ctx.db.patch(existing._id, {
        body: args.body,
        formattedBody: args.formattedBody,
        isEdited: args.isEdited ?? existing.isEdited,
      });
      return existing._id;
    }

    // Create new message
    const msgId = await ctx.db.insert("matrixMessages", {
      matrixEventId: args.matrixEventId,
      roomId: args.roomId,
      senderId: args.senderId,
      contentType: args.contentType,
      body: args.body,
      formattedBody: args.formattedBody,
      replyToId: args.replyToId,
      isEdited: args.isEdited ?? false,
      isDeleted: false,
      timestamp: args.timestamp,
    });

    // Update room's last message if this is the newest
    const room = await ctx.db.get(args.roomId);
    if (room && (!room.lastMessageAt || args.timestamp > room.lastMessageAt)) {
      await ctx.db.patch(args.roomId, {
        lastMessageAt: args.timestamp,
        lastMessagePreview: args.body.substring(0, 100),
        updatedAt: Date.now(),
      });
    }

    return msgId;
  },
});
