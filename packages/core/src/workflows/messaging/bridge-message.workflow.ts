/**
 * Bridge Message Workflow
 * Handles message bridging between Matrix and other services,
 * including trading command detection and execution
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
  parseMessage,
  detectTradingCommand,
  validateTradingAuthorization,
  executeTrade,
  broadcastToRoom,
  sendBridgeNotification,
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

// Workflow input type
export interface BridgeMessageInput {
  roomId: string;
  senderId: string;
  messageContent: string;
  messageType: "text" | "command" | "trade";
}

// Bridge message status type
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

// Trading command patterns
const TRADING_COMMANDS = {
  BUY: /^\/buy\s+(\d+)\s+([A-Z]+)(?:\s+@\s*(\d+\.?\d*))?$/i,
  SELL: /^\/sell\s+(\d+)\s+([A-Z]+)(?:\s+@\s*(\d+\.?\d*))?$/i,
  POSITION: /^\/position\s+([A-Z]+)$/i,
  BALANCE: /^\/balance$/i,
  PORTFOLIO: /^\/portfolio$/i,
};

// Queries
export const getBridgeMessageStatusQuery = defineQuery<BridgeMessageStatus>("getBridgeMessageStatus");

/**
 * Bridge Message Workflow
 */
export async function bridgeMessageWorkflow(
  input: BridgeMessageInput
): Promise<BridgeMessageStatus> {
  const { roomId, senderId, messageContent, messageType } = input;

  // Generate message ID
  const messageId = `msg_${crypto.randomUUID()}`;

  // Initialize status
  const status: BridgeMessageStatus = {
    messageId,
    status: "parsing",
    isTradingCommand: false,
    tradeExecuted: false,
    bridgedTo: [],
  };

  // Set up query handler
  setHandler(getBridgeMessageStatusQuery, () => status);

  try {
    // =========================================================================
    // Step 1: Parse message
    // =========================================================================
    const parsedMessage = await parseMessage({
      content: messageContent,
      messageType,
    });

    // =========================================================================
    // Step 2: Check for trading commands
    // =========================================================================
    status.status = "processing";

    const tradingCommand = await detectTradingCommand(messageContent);
    status.isTradingCommand = tradingCommand.detected;

    if (tradingCommand.detected) {
      // =========================================================================
      // Step 3: Validate trading authorization
      // =========================================================================
      const authorization = await validateTradingAuthorization({
        userId: senderId,
        roomId,
        commandType: tradingCommand.type,
      });

      if (!authorization.authorized) {
        // Send unauthorized message
        await broadcastToRoom({
          roomId,
          message: `⚠️ Trading command not authorized: ${authorization.reason}`,
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

      // =========================================================================
      // Step 4: Execute trade
      // =========================================================================
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

        // Send confirmation
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
        // Send error message
        await broadcastToRoom({
          roomId,
          message: `❌ Trade failed: ${tradeError instanceof Error ? tradeError.message : "Unknown error"}`,
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

    // =========================================================================
    // Step 5: Store message
    // =========================================================================
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

    // =========================================================================
    // Step 6: Broadcast to connected bridges
    // =========================================================================
    status.status = "broadcasting";

    // Get connected bridges for this room
    // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag

    // =========================================================================
    // Step 7: Finalize
    // =========================================================================
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
  const emoji = result.status === "filled" ? "✅" : "⏳";
  const action = command.type.toUpperCase();

  if (result.status === "filled") {
    return `${emoji} **${action} Order Filled**
Asset: ${command.asset}
Quantity: ${result.filledQuantity ?? command.quantity}
Price: $${result.averagePrice?.toFixed(2) ?? command.price?.toFixed(2) ?? "Market"}
Order ID: \`${result.orderId}\``;
  }

  return `${emoji} **${action} Order Submitted**
Asset: ${command.asset}
Quantity: ${command.quantity}
${command.price ? `Limit Price: $${command.price.toFixed(2)}` : "Type: Market"}
Order ID: \`${result.orderId}\`
Status: ${result.status}`;
}
