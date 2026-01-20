/**
 * Room Creation Workflow
 * Handles Matrix room creation with proper setup and invitations
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
  ApplicationFailure,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies
const {
  validateRoomCreation,
  createMatrixRoom,
  setRoomSettings,
  setRoomPowerLevels,
  inviteToRoom,
  acceptInviteAsBot,
  storeRoomMetadata,
  sendWelcomeMessage,
  sendRoomNotification,
  recordAuditLog,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// Workflow input type
export interface RoomCreationInput {
  creatorId: string;
  roomName: string;
  roomType: "dm" | "group" | "channel";
  invitees: string[];
  settings?: {
    encrypted?: boolean;
    historyVisibility?: "shared" | "invited" | "joined";
    guestAccess?: boolean;
    topic?: string;
    avatar?: string;
  };
}

// Room creation status type
export interface RoomCreationStatus {
  roomId?: string;
  matrixRoomId?: string;
  status:
    | "validating"
    | "creating"
    | "configuring"
    | "inviting"
    | "completed"
    | "failed";
  invitesSent: number;
  invitesAccepted: number;
  failedInvites: string[];
}

// Queries
export const getRoomCreationStatusQuery = defineQuery<RoomCreationStatus>("getRoomCreationStatus");

/**
 * Room Creation Workflow
 */
export async function roomCreationWorkflow(
  input: RoomCreationInput
): Promise<{ roomId: string; status: RoomCreationStatus }> {
  const { creatorId, roomName, roomType, invitees, settings } = input;

  // Generate room ID
  const roomId = `room_${crypto.randomUUID()}`;

  // Initialize status
  const status: RoomCreationStatus = {
    roomId,
    status: "validating",
    invitesSent: 0,
    invitesAccepted: 0,
    failedInvites: [],
  };

  // Set up query handler
  setHandler(getRoomCreationStatusQuery, () => status);

  try {
    // Log room creation start
    await recordAuditLog({
      userId: creatorId,
      action: "room_creation_started",
      resourceType: "room",
      resourceId: roomId,
      metadata: { roomName, roomType, inviteesCount: invitees.length },
    });

    // =========================================================================
    // Step 1: Validate room creation
    // =========================================================================
    const validation = await validateRoomCreation({
      creatorId,
      roomName,
      roomType,
      invitees,
    });

    if (!validation.valid) {
      status.status = "failed";
      throw ApplicationFailure.nonRetryable(`Validation failed: ${validation.reason}`);
    }

    // =========================================================================
    // Step 2: Create Matrix room
    // =========================================================================
    status.status = "creating";

    const matrixRoom = await createMatrixRoom({
      name: roomName,
      roomType,
      creatorMatrixId: validation.creatorMatrixId,
      preset: roomType === "dm" ? "trusted_private_chat" : "private_chat",
      visibility: roomType === "channel" ? "public" : "private",
    });

    status.matrixRoomId = matrixRoom.roomId;

    // =========================================================================
    // Step 3: Configure room settings
    // =========================================================================
    status.status = "configuring";

    // Set room settings
    await setRoomSettings(matrixRoom.roomId, {
      encrypted: settings?.encrypted ?? (roomType !== "channel"),
      historyVisibility: settings?.historyVisibility ?? "shared",
      guestAccess: settings?.guestAccess ?? false,
      topic: settings?.topic,
      avatar: settings?.avatar,
    });

    // Set power levels
    await setRoomPowerLevels(matrixRoom.roomId, {
      creatorId: validation.creatorMatrixId,
      roomType,
    });

    // Have bot join the room
    await acceptInviteAsBot(matrixRoom.roomId);

    // =========================================================================
    // Step 4: Store room metadata in Convex
    // =========================================================================
    await storeRoomMetadata({
      roomId,
      matrixRoomId: matrixRoom.roomId,
      creatorId,
      roomName,
      roomType,
      settings: {
        encrypted: settings?.encrypted ?? (roomType !== "channel"),
        historyVisibility: settings?.historyVisibility ?? "shared",
      },
    });

    // =========================================================================
    // Step 5: Invite members
    // =========================================================================
    status.status = "inviting";

    for (const inviteeId of invitees) {
      try {
        await inviteToRoom({
          roomId: matrixRoom.roomId,
          inviteeId,
          invitedBy: creatorId,
        });
        status.invitesSent++;
      } catch (error) {
        status.failedInvites.push(inviteeId);
        console.error(`Failed to invite ${inviteeId}:`, error);
      }
    }

    // =========================================================================
    // Step 6: Send welcome message
    // =========================================================================
    const welcomeMessages: Record<string, string> = {
      dm: `Chat started between you and your contact.`,
      group: `Welcome to ${roomName}! 👋`,
      channel: `Welcome to #${roomName}! This is a channel for team discussions.`,
    };

    await sendWelcomeMessage({
      roomId: matrixRoom.roomId,
      message: welcomeMessages[roomType],
      sender: "bot",
    });

    // =========================================================================
    // Step 7: Send notifications
    // =========================================================================
    // Notify creator
    await sendRoomNotification(creatorId, {
      type: "room_created",
      roomId,
      roomName,
      invitesCount: status.invitesSent,
    });

    // Notify invitees
    for (const inviteeId of invitees) {
      if (!status.failedInvites.includes(inviteeId)) {
        await sendRoomNotification(inviteeId, {
          type: "room_invite",
          roomId,
          roomName,
          invitedBy: creatorId,
        });
      }
    }

    // =========================================================================
    // Step 8: Finalize
    // =========================================================================
    status.status = "completed";

    await recordAuditLog({
      userId: creatorId,
      action: "room_creation_completed",
      resourceType: "room",
      resourceId: roomId,
      metadata: {
        matrixRoomId: matrixRoom.roomId,
        invitesSent: status.invitesSent,
        failedInvites: status.failedInvites.length,
      },
    });

    return { roomId, status };
  } catch (error) {
    status.status = "failed";

    await recordAuditLog({
      userId: creatorId,
      action: "room_creation_failed",
      resourceType: "room",
      resourceId: roomId,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}
