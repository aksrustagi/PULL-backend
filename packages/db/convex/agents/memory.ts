import { v } from "convex/values";
import { mutation, query, action } from "../_generated/server";
import { api } from "../_generated/api";

/**
 * Agent Memory System for PULL
 * Provides persistent memory, vector search, and context management for AI agents
 */

// ============================================================================
// TYPES
// ============================================================================

export const AgentType = v.union(
  v.literal("trading"),
  v.literal("email"),
  v.literal("research"),
  v.literal("assistant")
);

export const MemoryType = v.union(
  v.literal("interaction"),
  v.literal("preference"),
  v.literal("insight"),
  v.literal("context"),
  v.literal("summary")
);

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get a specific memory entry by key
 */
export const getMemory = query({
  args: {
    userId: v.id("users"),
    agentType: v.string(),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentMemory")
      .withIndex("by_key", (q) =>
        q
          .eq("userId", args.userId)
          .eq("agentType", args.agentType)
          .eq("key", args.key)
      )
      .unique();
  },
});

/**
 * Get all memories for a user and agent type
 */
export const getMemories = query({
  args: {
    userId: v.id("users"),
    agentType: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentMemory")
      .withIndex("by_user_agent", (q) =>
        q.eq("userId", args.userId).eq("agentType", args.agentType)
      )
      .order("desc")
      .take(args.limit ?? 100);
  },
});

/**
 * Get recent interactions for an agent
 */
export const getRecentInteractions = query({
  args: {
    userId: v.id("users"),
    agentType: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const memories = await ctx.db
      .query("agentMemory")
      .withIndex("by_user_agent", (q) =>
        q.eq("userId", args.userId).eq("agentType", args.agentType)
      )
      .order("desc")
      .take(args.limit ?? 10);

    // Filter to only interactions
    return memories.filter(
      (m) => m.value?.type === "interaction" || m.key.startsWith("interaction:")
    );
  },
});

/**
 * Get session memories
 */
export const getSessionMemories = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentMemory")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .collect();
  },
});

/**
 * Get user preferences for an agent
 */
export const getUserPreferences = query({
  args: {
    userId: v.id("users"),
    agentType: v.string(),
  },
  handler: async (ctx, args) => {
    const memories = await ctx.db
      .query("agentMemory")
      .withIndex("by_user_agent", (q) =>
        q.eq("userId", args.userId).eq("agentType", args.agentType)
      )
      .collect();

    // Filter to preferences
    return memories.filter(
      (m) => m.value?.type === "preference" || m.key.startsWith("pref:")
    );
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Store a memory entry
 */
export const storeMemory = mutation({
  args: {
    userId: v.id("users"),
    agentType: v.string(),
    key: v.string(),
    value: v.any(),
    sessionId: v.optional(v.string()),
    embedding: v.optional(v.array(v.float64())),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if memory exists
    const existing = await ctx.db
      .query("agentMemory")
      .withIndex("by_key", (q) =>
        q
          .eq("userId", args.userId)
          .eq("agentType", args.agentType)
          .eq("key", args.key)
      )
      .unique();

    if (existing) {
      // Update existing
      const updateData: Record<string, unknown> = {
        value: args.value,
        updatedAt: now,
      };

      if (args.embedding) {
        updateData.embedding = args.embedding;
      }
      if (args.expiresAt !== undefined) {
        updateData.expiresAt = args.expiresAt;
      }
      if (args.sessionId !== undefined) {
        updateData.sessionId = args.sessionId;
      }

      await ctx.db.patch(existing._id, updateData);
      return existing._id;
    }

    // Create new
    const insertData: Record<string, unknown> = {
      userId: args.userId,
      agentType: args.agentType,
      key: args.key,
      value: args.value,
      createdAt: now,
      updatedAt: now,
    };

    if (args.sessionId) {
      insertData.sessionId = args.sessionId;
    }
    if (args.embedding) {
      insertData.embedding = args.embedding;
    }
    if (args.expiresAt) {
      insertData.expiresAt = args.expiresAt;
    }

    return await ctx.db.insert("agentMemory", insertData as never);
  },
});

/**
 * Store an interaction (conversation turn)
 */
export const storeInteraction = mutation({
  args: {
    userId: v.id("users"),
    agentType: v.string(),
    sessionId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    metadata: v.optional(v.any()),
    embedding: v.optional(v.array(v.float64())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const key = `interaction:${args.sessionId}:${now}`;

    const insertData: Record<string, unknown> = {
      userId: args.userId,
      agentType: args.agentType,
      sessionId: args.sessionId,
      key,
      value: {
        type: "interaction",
        role: args.role,
        content: args.content,
        metadata: args.metadata,
        timestamp: now,
      },
      createdAt: now,
      updatedAt: now,
    };

    if (args.embedding) {
      insertData.embedding = args.embedding;
    }

    return await ctx.db.insert("agentMemory", insertData as never);
  },
});

/**
 * Store user preference
 */
export const storePreference = mutation({
  args: {
    userId: v.id("users"),
    agentType: v.string(),
    preference: v.string(),
    value: v.any(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const key = `pref:${args.preference}`;

    const existing = await ctx.db
      .query("agentMemory")
      .withIndex("by_key", (q) =>
        q
          .eq("userId", args.userId)
          .eq("agentType", args.agentType)
          .eq("key", key)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: {
          type: "preference",
          preference: args.preference,
          value: args.value,
        },
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("agentMemory", {
      userId: args.userId,
      agentType: args.agentType,
      key,
      value: {
        type: "preference",
        preference: args.preference,
        value: args.value,
      },
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Delete a specific memory
 */
export const deleteMemory = mutation({
  args: {
    userId: v.id("users"),
    agentType: v.string(),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const memory = await ctx.db
      .query("agentMemory")
      .withIndex("by_key", (q) =>
        q
          .eq("userId", args.userId)
          .eq("agentType", args.agentType)
          .eq("key", args.key)
      )
      .unique();

    if (memory) {
      await ctx.db.delete(memory._id);
      return true;
    }
    return false;
  },
});

/**
 * Clear all memories for a user and agent type
 */
export const clearMemory = mutation({
  args: {
    userId: v.id("users"),
    agentType: v.string(),
  },
  handler: async (ctx, args) => {
    const memories = await ctx.db
      .query("agentMemory")
      .withIndex("by_user_agent", (q) =>
        q.eq("userId", args.userId).eq("agentType", args.agentType)
      )
      .collect();

    for (const memory of memories) {
      await ctx.db.delete(memory._id);
    }

    // Log audit
    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "agent.memory_cleared",
      resourceType: "agentMemory",
      resourceId: args.agentType,
      metadata: { clearedCount: memories.length },
      timestamp: Date.now(),
    });

    return { clearedCount: memories.length };
  },
});

/**
 * Clear session memories
 */
export const clearSession = mutation({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const memories = await ctx.db
      .query("agentMemory")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    for (const memory of memories) {
      await ctx.db.delete(memory._id);
    }

    return { clearedCount: memories.length };
  },
});

/**
 * Clean up expired memories
 */
export const cleanupExpired = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let cleanedCount = 0;

    // Get all memories and filter expired ones
    // Note: In production, you'd want a more efficient approach with proper indexing
    const allMemories = await ctx.db.query("agentMemory").collect();

    for (const memory of allMemories) {
      if (memory.expiresAt && memory.expiresAt < now) {
        await ctx.db.delete(memory._id);
        cleanedCount++;
      }
    }

    return { cleanedCount };
  },
});

// ============================================================================
// ACTIONS (for vector search with embeddings)
// ============================================================================

/**
 * Search memories using vector similarity
 */
export const searchMemory = action({
  args: {
    userId: v.id("users"),
    agentType: v.string(),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Array<{
    _id: string;
    key: string;
    value: unknown;
    score: number;
  }>> => {
    // Generate embedding for the query
    const embedding = await generateEmbedding(args.query);

    if (!embedding) {
      // Fall back to text search if embedding fails
      const memories = await ctx.runQuery(api.agents.memory.getMemories, {
        userId: args.userId,
        agentType: args.agentType,
        limit: args.limit ?? 10,
      });

      // Simple text matching fallback
      const queryLower = args.query.toLowerCase();
      return memories
        .filter((m) => {
          const valueStr = JSON.stringify(m.value).toLowerCase();
          return valueStr.includes(queryLower);
        })
        .map((m) => ({
          _id: m._id,
          key: m.key,
          value: m.value,
          score: 0.5, // Default score for text matches
        }));
    }

    // Perform vector search
    const results = await ctx.vectorSearch("agentMemory", "embedding_index", {
      vector: embedding,
      limit: args.limit ?? 10,
      filter: (q) =>
        q.and(
          q.eq("userId", args.userId),
          q.eq("agentType", args.agentType)
        ),
    });

    return results.map((r) => ({
      _id: r._id,
      key: "", // Will be populated by caller if needed
      value: null, // Will be populated by caller if needed
      score: r._score,
    }));
  },
});

/**
 * Store memory with auto-generated embedding
 */
export const storeMemoryWithEmbedding = action({
  args: {
    userId: v.id("users"),
    agentType: v.string(),
    key: v.string(),
    value: v.any(),
    sessionId: v.optional(v.string()),
    textForEmbedding: v.string(),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Generate embedding
    const embedding = await generateEmbedding(args.textForEmbedding);

    // Store with embedding
    return await ctx.runMutation(api.agents.memory.storeMemory, {
      userId: args.userId,
      agentType: args.agentType,
      key: args.key,
      value: args.value,
      sessionId: args.sessionId,
      embedding: embedding ?? undefined,
      expiresAt: args.expiresAt,
    });
  },
});

/**
 * Build context from memory for agent prompt
 */
export const buildContext = action({
  args: {
    userId: v.id("users"),
    agentType: v.string(),
    query: v.string(),
    maxTokens: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxTokens = args.maxTokens ?? 2000;
    const context: string[] = [];
    let estimatedTokens = 0;

    // Get user preferences
    const preferences = await ctx.runQuery(
      api.agents.memory.getUserPreferences,
      {
        userId: args.userId,
        agentType: args.agentType,
      }
    );

    if (preferences.length > 0) {
      context.push("## User Preferences");
      for (const pref of preferences) {
        const prefStr = `- ${pref.value?.preference}: ${JSON.stringify(pref.value?.value)}`;
        const tokens = Math.ceil(prefStr.length / 4);
        if (estimatedTokens + tokens < maxTokens) {
          context.push(prefStr);
          estimatedTokens += tokens;
        }
      }
    }

    // Get recent interactions
    const interactions = await ctx.runQuery(
      api.agents.memory.getRecentInteractions,
      {
        userId: args.userId,
        agentType: args.agentType,
        limit: 5,
      }
    );

    if (interactions.length > 0) {
      context.push("\n## Recent Conversation");
      for (const interaction of interactions.reverse()) {
        const role = interaction.value?.role === "user" ? "User" : "Assistant";
        const content = interaction.value?.content ?? "";
        const interactionStr = `${role}: ${content}`;
        const tokens = Math.ceil(interactionStr.length / 4);
        if (estimatedTokens + tokens < maxTokens) {
          context.push(interactionStr);
          estimatedTokens += tokens;
        }
      }
    }

    // Search for relevant memories
    const relevantMemories = await ctx.runAction(
      api.agents.memory.searchMemory,
      {
        userId: args.userId,
        agentType: args.agentType,
        query: args.query,
        limit: 5,
      }
    );

    if (relevantMemories.length > 0) {
      context.push("\n## Relevant Context");
      for (const memory of relevantMemories) {
        if (memory.score > 0.7) {
          const memStr = JSON.stringify(memory.value);
          const tokens = Math.ceil(memStr.length / 4);
          if (estimatedTokens + tokens < maxTokens) {
            context.push(`- ${memStr}`);
            estimatedTokens += tokens;
          }
        }
      }
    }

    return {
      context: context.join("\n"),
      estimatedTokens,
    };
  },
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate embedding using OpenAI's API
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("OPENAI_API_KEY not set, skipping embedding generation");
    return null;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
        dimensions: 1536,
      }),
    });

    if (!response.ok) {
      console.error("Embedding API error:", await response.text());
      return null;
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    return null;
  }
}
