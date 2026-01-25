/**
 * PULL Stories API Routes
 * REST endpoints for 15-second video stories with social sharing
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import {
  CreateStoryRequestSchema,
  GetStoriesRequestSchema,
  RecordViewRequestSchema,
  AddReactionRequestSchema,
  ShareStoryRequestSchema,
  StoryTypeSchema,
  StoryVisibilitySchema,
  ReactionTypeSchema,
  SocialPlatformSchema,
} from "@pull/core/services/stories";

const app = new Hono<Env>();

// ============================================================================
// STORY CRUD
// ============================================================================

/**
 * Create a new story
 */
app.post("/", zValidator("json", CreateStoryRequestSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    // TODO: Inject actual StoriesService
    const storyId = crypto.randomUUID();
    const referralCode = `S${Date.now().toString(36).toUpperCase().slice(-8)}`;

    return c.json({
      success: true,
      data: {
        story: {
          id: storyId,
          userId,
          type: body.type,
          status: "processing",
          visibility: body.visibility,
          caption: body.caption,
          hashtags: body.hashtags,
          mentions: body.mentions,
          betContext: body.betContext,
          viewCount: 0,
          referralCode,
          createdAt: Date.now(),
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        },
        uploadUrl: `https://upload.pull.app/stories/${storyId}`,
        referralLink: `https://pull.app/r/${referralCode}`,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "CREATE_STORY_FAILED",
          message: error instanceof Error ? error.message : "Failed to create story",
        },
      },
      500
    );
  }
});

/**
 * Get stories feed
 */
app.get("/feed", async (c) => {
  const userId = c.get("userId");
  const feedType = c.req.query("type") ?? "following";
  const limit = parseInt(c.req.query("limit") ?? "20", 10);
  const cursor = c.req.query("cursor");

  try {
    return c.json({
      success: true,
      data: {
        stories: [],
        nextCursor: undefined,
        hasMore: false,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_FEED_FAILED",
          message: error instanceof Error ? error.message : "Failed to get stories feed",
        },
      },
      500
    );
  }
});

/**
 * Get user's stories
 */
app.get("/user/:userId", async (c) => {
  const targetUserId = c.req.param("userId");
  const viewerId = c.get("userId");

  try {
    return c.json({
      success: true,
      data: { stories: [] },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_USER_STORIES_FAILED",
          message: error instanceof Error ? error.message : "Failed to get user stories",
        },
      },
      500
    );
  }
});

/**
 * Get single story
 */
app.get("/:storyId", async (c) => {
  const storyId = c.req.param("storyId");

  try {
    return c.json({
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_STORY_FAILED",
          message: error instanceof Error ? error.message : "Failed to get story",
        },
      },
      500
    );
  }
});

/**
 * Delete story
 */
app.delete("/:storyId", async (c) => {
  const userId = c.get("userId");
  const storyId = c.req.param("storyId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: { deleted: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "DELETE_STORY_FAILED",
          message: error instanceof Error ? error.message : "Failed to delete story",
        },
      },
      500
    );
  }
});

// ============================================================================
// ENGAGEMENT
// ============================================================================

/**
 * Record story view
 */
app.post("/:storyId/view", zValidator("json", RecordViewRequestSchema.omit({ storyId: true })), async (c) => {
  const userId = c.get("userId");
  const storyId = c.req.param("storyId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: { recorded: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "RECORD_VIEW_FAILED",
          message: error instanceof Error ? error.message : "Failed to record view",
        },
      },
      500
    );
  }
});

/**
 * Add reaction to story
 */
app.post("/:storyId/react", zValidator("json", z.object({ type: ReactionTypeSchema })), async (c) => {
  const userId = c.get("userId");
  const storyId = c.req.param("storyId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: {
        id: crypto.randomUUID(),
        storyId,
        userId,
        type: body.type,
        createdAt: Date.now(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "ADD_REACTION_FAILED",
          message: error instanceof Error ? error.message : "Failed to add reaction",
        },
      },
      500
    );
  }
});

/**
 * Remove reaction from story
 */
app.delete("/:storyId/react", async (c) => {
  const userId = c.get("userId");
  const storyId = c.req.param("storyId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: { removed: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "REMOVE_REACTION_FAILED",
          message: error instanceof Error ? error.message : "Failed to remove reaction",
        },
      },
      500
    );
  }
});

/**
 * Share story to social platform
 */
app.post("/:storyId/share", zValidator("json", z.object({ platform: SocialPlatformSchema })), async (c) => {
  const userId = c.get("userId");
  const storyId = c.req.param("storyId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    const shareId = crypto.randomUUID();
    const referralCode = `SH${Date.now().toString(36).toUpperCase().slice(-7)}`;

    return c.json({
      success: true,
      data: {
        shareId,
        shareUrl: `https://pull.app/s/${storyId}?ref=${referralCode}`,
        referralCode,
        platform: body.platform,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "SHARE_STORY_FAILED",
          message: error instanceof Error ? error.message : "Failed to share story",
        },
      },
      500
    );
  }
});

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Get story analytics
 */
app.get("/:storyId/analytics", async (c) => {
  const userId = c.get("userId");
  const storyId = c.req.param("storyId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: {
        storyId,
        totalViews: 0,
        uniqueViewers: 0,
        averageWatchTime: 0,
        completionRate: 0,
        reactionRate: 0,
        shareRate: 0,
        referralConversions: 0,
        estimatedReach: 0,
        engagementScore: 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_ANALYTICS_FAILED",
          message: error instanceof Error ? error.message : "Failed to get analytics",
        },
      },
      500
    );
  }
});

/**
 * Get user's story stats
 */
app.get("/stats/me", async (c) => {
  const userId = c.get("userId");

  if (!userId) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
      401
    );
  }

  try {
    return c.json({
      success: true,
      data: {
        userId,
        totalStories: 0,
        totalViews: 0,
        totalReactions: 0,
        totalShares: 0,
        totalReferralSignups: 0,
        averageEngagementRate: 0,
        streakDays: 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "GET_STATS_FAILED",
          message: error instanceof Error ? error.message : "Failed to get stats",
        },
      },
      500
    );
  }
});

export { app as storiesRoutes };
