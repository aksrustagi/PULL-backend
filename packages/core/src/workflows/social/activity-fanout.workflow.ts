/**
 * Activity Fanout Workflow
 * Fans out social activities to follower feeds
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
  sleep,
  continueAsNew,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies with retry policies
const {
  createSocialActivity,
  getFollowersForFanout,
  fanOutToFeeds,
  sendActivityNotifications,
  recordAuditLog,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 seconds",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// Activity types
type ActivityType =
  | "follow"
  | "position_opened"
  | "position_closed"
  | "position_shared"
  | "comment"
  | "like"
  | "copy_trade"
  | "achievement"
  | "leaderboard_rank"
  | "room_created"
  | "room_joined";

type ActivityVisibility = "public" | "followers" | "private";

// Workflow input type
export interface ActivityFanoutInput {
  actorId: string;
  type: ActivityType;
  targetType?: string;
  targetId?: string;
  data: unknown;
  visibility: ActivityVisibility;
  relatedUserIds: string[];
  sendNotifications?: boolean;
}

// Fanout status
export interface ActivityFanoutStatus {
  activityId?: string;
  phase: "idle" | "creating" | "fetching_followers" | "fanning_out" | "notifying" | "complete" | "failed";
  followersFetched: number;
  feedItemsCreated: number;
  notificationsSent: number;
  error?: string;
}

// Queries
export const getFanoutStatusQuery = defineQuery<ActivityFanoutStatus>("getFanoutStatus");

/**
 * Activity Fanout Workflow
 * Creates an activity and fans it out to follower feeds
 */
export async function activityFanoutWorkflow(
  input: ActivityFanoutInput
): Promise<ActivityFanoutStatus> {
  const {
    actorId,
    type,
    targetType,
    targetId,
    data,
    visibility,
    relatedUserIds,
    sendNotifications = true,
  } = input;

  const status: ActivityFanoutStatus = {
    phase: "idle",
    followersFetched: 0,
    feedItemsCreated: 0,
    notificationsSent: 0,
  };

  // Set up query handler
  setHandler(getFanoutStatusQuery, () => status);

  try {
    // =========================================================================
    // Step 1: Create activity record
    // =========================================================================
    status.phase = "creating";

    const activityId = await createSocialActivity({
      actorId,
      type,
      targetType,
      targetId,
      data,
      visibility,
      relatedUserIds,
    });

    status.activityId = activityId;

    // Skip fanout for private activities
    if (visibility === "private") {
      status.phase = "complete";
      return status;
    }

    // =========================================================================
    // Step 2: Get followers for fanout
    // =========================================================================
    status.phase = "fetching_followers";

    const activityAt = Date.now();
    let allFollowers: string[] = [];

    // Get followers in batches
    if (visibility === "followers" || visibility === "public") {
      let offset = 0;
      const batchSize = 1000;

      while (true) {
        const followers = await getFollowersForFanout({
          userId: actorId,
          limit: batchSize,
        });

        allFollowers = [...allFollowers, ...followers];
        status.followersFetched = allFollowers.length;

        if (followers.length < batchSize) {
          break;
        }

        offset += batchSize;
        await sleep("100 milliseconds");
      }
    }

    // =========================================================================
    // Step 3: Fan out to feeds
    // =========================================================================
    status.phase = "fanning_out";

    // Create feed items for followers
    if (allFollowers.length > 0) {
      const batchSize = 500;

      for (let i = 0; i < allFollowers.length; i += batchSize) {
        const batch = allFollowers.slice(i, i + batchSize);

        const feedItems = batch.map((userId) => ({
          userId,
          activityId,
          actorId,
          feedType: "following" as const,
          type,
          data,
          activityAt,
        }));

        await fanOutToFeeds({ feedItems });
        status.feedItemsCreated += feedItems.length;

        // Small delay between batches
        if (i + batchSize < allFollowers.length) {
          await sleep("100 milliseconds");
        }
      }
    }

    // Create notification feed items for related users
    if (relatedUserIds.length > 0) {
      const notificationItems = relatedUserIds
        .filter((id) => id !== actorId)
        .map((userId) => ({
          userId,
          activityId,
          actorId,
          feedType: "notifications" as const,
          type,
          data,
          activityAt,
        }));

      if (notificationItems.length > 0) {
        await fanOutToFeeds({ feedItems: notificationItems });
        status.feedItemsCreated += notificationItems.length;
      }
    }

    // =========================================================================
    // Step 4: Send push notifications
    // =========================================================================
    if (sendNotifications && relatedUserIds.length > 0) {
      status.phase = "notifying";

      const usersToNotify = relatedUserIds.filter((id) => id !== actorId);

      if (usersToNotify.length > 0) {
        await sendActivityNotifications({
          userIds: usersToNotify,
          actorId,
          activityType: type,
          data,
        });

        status.notificationsSent = usersToNotify.length;
      }
    }

    status.phase = "complete";

    await recordAuditLog({
      userId: actorId,
      action: "activity_fanout_completed",
      resourceType: "activity",
      resourceId: activityId,
      metadata: {
        type,
        followersFetched: status.followersFetched,
        feedItemsCreated: status.feedItemsCreated,
        notificationsSent: status.notificationsSent,
      },
    });

    return status;
  } catch (error) {
    status.phase = "failed";
    status.error = error instanceof Error ? error.message : String(error);

    await recordAuditLog({
      userId: actorId,
      action: "activity_fanout_failed",
      resourceType: "activity",
      resourceId: status.activityId ?? "unknown",
      metadata: { error: status.error },
    });

    throw error;
  }
}

/**
 * Position Share Fanout Workflow
 * Specialized workflow for position sharing activities
 */
export interface PositionShareInput {
  traderId: string;
  positionId: string;
  symbol: string;
  side: "long" | "short";
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  message?: string;
}

export async function positionShareFanoutWorkflow(
  input: PositionShareInput
): Promise<ActivityFanoutStatus> {
  const {
    traderId,
    positionId,
    symbol,
    side,
    quantity,
    entryPrice,
    currentPrice,
    unrealizedPnL,
    unrealizedPnLPercent,
    message,
  } = input;

  return await activityFanoutWorkflow({
    actorId: traderId,
    type: "position_shared",
    targetType: "position",
    targetId: positionId,
    data: {
      symbol,
      side,
      quantity,
      entryPrice,
      currentPrice,
      unrealizedPnL,
      unrealizedPnLPercent,
      message,
    },
    visibility: "followers",
    relatedUserIds: [],
    sendNotifications: true,
  });
}

/**
 * Follow Activity Workflow
 * Creates follow activity and notifies the followed user
 */
export interface FollowActivityInput {
  followerId: string;
  followeeId: string;
  followerName?: string;
}

export async function followActivityWorkflow(
  input: FollowActivityInput
): Promise<ActivityFanoutStatus> {
  const { followerId, followeeId, followerName } = input;

  return await activityFanoutWorkflow({
    actorId: followerId,
    type: "follow",
    targetType: "user",
    targetId: followeeId,
    data: {
      followeeId,
      followerName,
    },
    visibility: "followers",
    relatedUserIds: [followeeId],
    sendNotifications: true,
  });
}

/**
 * Achievement Activity Workflow
 * Announces an achievement to followers
 */
export interface AchievementActivityInput {
  userId: string;
  achievementType: string;
  achievementName: string;
  description?: string;
}

export async function achievementActivityWorkflow(
  input: AchievementActivityInput
): Promise<ActivityFanoutStatus> {
  const { userId, achievementType, achievementName, description } = input;

  return await activityFanoutWorkflow({
    actorId: userId,
    type: "achievement",
    targetType: "achievement",
    targetId: achievementType,
    data: {
      achievementType,
      achievementName,
      description,
    },
    visibility: "public",
    relatedUserIds: [],
    sendNotifications: false,
  });
}

/**
 * Leaderboard Rank Activity Workflow
 * Announces leaderboard position changes
 */
export interface LeaderboardRankActivityInput {
  userId: string;
  leaderboardType: string;
  period: string;
  rank: number;
  previousRank?: number;
  value: number;
}

export async function leaderboardRankActivityWorkflow(
  input: LeaderboardRankActivityInput
): Promise<ActivityFanoutStatus> {
  const { userId, leaderboardType, period, rank, previousRank, value } = input;

  // Only announce significant achievements (top 100 or significant rank change)
  if (rank > 100 && (!previousRank || Math.abs(previousRank - rank) < 10)) {
    return {
      phase: "complete",
      followersFetched: 0,
      feedItemsCreated: 0,
      notificationsSent: 0,
    };
  }

  return await activityFanoutWorkflow({
    actorId: userId,
    type: "leaderboard_rank",
    targetType: "leaderboard",
    targetId: `${leaderboardType}_${period}`,
    data: {
      leaderboardType,
      period,
      rank,
      previousRank,
      value,
      improvement: previousRank ? previousRank - rank : undefined,
    },
    visibility: "public",
    relatedUserIds: [],
    sendNotifications: false,
  });
}
