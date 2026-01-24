/**
 * Messaging Workflows
 * Re-exports messaging workflows for Temporal worker registration
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
  ApplicationFailure,
} from "@temporalio/workflow";
import type * as activities from "../activities/messaging";

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
  parseMessage,
  detectTradingCommand,
  validateTradingAuthorization,
  executeTrade,
  broadcastToRoom,
  storeMessage,
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

// ============================================================================
// Room Creation Workflow
// ============================================================================

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

export const getRoomCreationStatusQuery = defineQuery<RoomCreationStatus>("getRoomCreationStatus");

export async function roomCreationWorkflow(
  input: RoomCreationInput
): Promise<{ roomId: string; status: RoomCreationStatus }> {
  const { creatorId, roomName, roomType, invitees, settings } = input;

  const roomId = `room_${crypto.randomUUID()}`;

  const status: RoomCreationStatus = {
    roomId,
    status: "validating",
    invitesSent: 0,
    invitesAccepted: 0,
    failedInvites: [],
  };

  setHandler(getRoomCreationStatusQuery, () => status);

  try {
    await recordAuditLog({
      userId: creatorId,
      action: "room_creation_started",
      resourceType: "room",
      resourceId: roomId,
      metadata: { roomName, roomType, inviteesCount: invitees.length },
    });

    // Step 1: Validate room creation
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

    // Step 2: Create Matrix room
    status.status = "creating";

    const matrixRoom = await createMatrixRoom({
      name: roomName,
      roomType,
      creatorMatrixId: validation.creatorMatrixId,
      preset: roomType === "dm" ? "trusted_private_chat" : "private_chat",
      visibility: roomType === "channel" ? "public" : "private",
    });

    status.matrixRoomId = matrixRoom.roomId;

    // Step 3: Configure room settings
    status.status = "configuring";

    await setRoomSettings(matrixRoom.roomId, {
      encrypted: settings?.encrypted ?? (roomType !== "channel"),
      historyVisibility: settings?.historyVisibility ?? "shared",
      guestAccess: settings?.guestAccess ?? false,
      topic: settings?.topic,
      avatar: settings?.avatar,
    });

    await setRoomPowerLevels(matrixRoom.roomId, {
      creatorId: validation.creatorMatrixId,
      roomType,
    });

    await acceptInviteAsBot(matrixRoom.roomId);

    // Step 4: Store room metadata in Convex
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

    // Step 5: Invite members
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

    // Step 6: Send welcome message
    const welcomeMessages: Record<string, string> = {
      dm: `Chat started between you and your contact.`,
      group: `Welcome to ${roomName}!`,
      channel: `Welcome to #${roomName}! This is a channel for team discussions.`,
    };

    await sendWelcomeMessage({
      roomId: matrixRoom.roomId,
      message: welcomeMessages[roomType],
      sender: "bot",
    });

    // Step 7: Send notifications
    await sendRoomNotification(creatorId, {
      type: "room_created",
      roomId,
      roomName,
      invitesCount: status.invitesSent,
    });

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

    // Step 8: Finalize
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

// ============================================================================
// Bridge Message Workflow
// ============================================================================

export interface BridgeMessageInput {
  roomId: string;
  senderId: string;
  messageContent: string;
  messageType: "text" | "command" | "trade";
}

export interface BridgeMessageStatus {
  messageId: string;
  status: "parsing" | "processing" | "executing" | "broadcasting" | "completed" | "failed";
  isTradingCommand: boolean;
  tradeExecuted: boolean;
  tradeResult?: {
    orderId: string;
    status: string;
  };
  bridgedTo: string[];
}

export const getBridgeMessageStatusQuery = defineQuery<BridgeMessageStatus>("getBridgeMessageStatus");

export async function bridgeMessageWorkflow(
  input: BridgeMessageInput
): Promise<BridgeMessageStatus> {
  const { roomId, senderId, messageContent, messageType } = input;

  const messageId = `msg_${crypto.randomUUID()}`;

  const status: BridgeMessageStatus = {
    messageId,
    status: "parsing",
    isTradingCommand: false,
    tradeExecuted: false,
    bridgedTo: [],
  };

  setHandler(getBridgeMessageStatusQuery, () => status);

  try {
    // Step 1: Parse message
    const parsedMessage = await parseMessage({
      content: messageContent,
      messageType,
    });

    // Step 2: Check for trading commands
    status.status = "processing";

    const tradingCommand = await detectTradingCommand(messageContent);
    status.isTradingCommand = tradingCommand.detected;

    if (tradingCommand.detected) {
      // Step 3: Validate trading authorization
      const authorization = await validateTradingAuthorization({
        userId: senderId,
        roomId,
        commandType: tradingCommand.type,
      });

      if (!authorization.authorized) {
        await broadcastToRoom({
          roomId,
          message: `Warning: Trading command not authorized: ${authorization.reason}`,
          sender: "bot",
        });

        await recordAuditLog({
          userId: senderId,
          action: "trading_command_unauthorized",
          resourceType: "message",
          resourceId: messageId,
          metadata: {
            command: tradingCommand.type,
            reason: authorization.reason,
          },
        });

        status.status = "completed";
        return status;
      }

      // Step 4: Execute trade
      status.status = "executing";

      try {
        const tradeResult = await executeTrade({
          userId: senderId,
          command: tradingCommand,
          roomId,
        });

        status.tradeExecuted = true;
        status.tradeResult = {
          orderId: tradeResult.orderId,
          status: tradeResult.status,
        };

        const confirmationMessage = formatTradeConfirmation(tradingCommand, tradeResult);
        await broadcastToRoom({
          roomId,
          message: confirmationMessage,
          sender: "bot",
        });

        await recordAuditLog({
          userId: senderId,
          action: "trading_command_executed",
          resourceType: "trade",
          resourceId: tradeResult.orderId,
          metadata: {
            command: tradingCommand.type,
            asset: tradingCommand.asset,
            quantity: tradingCommand.quantity,
          },
        });
      } catch (tradeError) {
        await broadcastToRoom({
          roomId,
          message: `Trade failed: ${tradeError instanceof Error ? tradeError.message : "Unknown error"}`,
          sender: "bot",
        });

        await recordAuditLog({
          userId: senderId,
          action: "trading_command_failed",
          resourceType: "message",
          resourceId: messageId,
          metadata: {
            command: tradingCommand.type,
            error: tradeError instanceof Error ? tradeError.message : String(tradeError),
          },
        });
      }
    }

    // Step 5: Store message
    await storeMessage({
      messageId,
      roomId,
      senderId,
      content: messageContent,
      messageType: parsedMessage.type,
      metadata: {
        isTradingCommand: status.isTradingCommand,
        tradingCommand: status.isTradingCommand ? {
          type: tradingCommand.type,
          asset: tradingCommand.asset,
          quantity: tradingCommand.quantity,
        } : undefined,
        tradeExecuted: status.tradeExecuted,
        tradeResult: status.tradeResult,
      },
    });

    // Step 6: Broadcast to connected bridges
    status.status = "broadcasting";

    // Step 7: Finalize
    status.status = "completed";

    return status;
  } catch (error) {
    status.status = "failed";

    await recordAuditLog({
      userId: senderId,
      action: "bridge_message_failed",
      resourceType: "message",
      resourceId: messageId,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}

// Helper function to format trade confirmation
function formatTradeConfirmation(
  command: { type: string; asset?: string; quantity?: number; price?: number },
  result: { orderId: string; status: string; filledQuantity?: number; averagePrice?: number }
): string {
  const action = command.type.toUpperCase();

  if (result.status === "filled") {
    return `${action} Order Filled - Asset: ${command.asset}, Quantity: ${result.filledQuantity ?? command.quantity}, Price: $${result.averagePrice?.toFixed(2) ?? command.price?.toFixed(2) ?? "Market"}, Order ID: ${result.orderId}`;
  }

  return `${action} Order Submitted - Asset: ${command.asset}, Quantity: ${command.quantity}, ${command.price ? `Limit Price: $${command.price.toFixed(2)}` : "Type: Market"}, Order ID: ${result.orderId}, Status: ${result.status}`;
}
