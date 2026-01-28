/**
 * Messaging Activities
 * All activities for Matrix messaging workflows
 */

// ============================================================================
// Types
// ============================================================================

export interface MatrixRoomInfo {
  roomId: string;
  name: string;
  topic?: string;
  memberCount: number;
}

export interface TradingCommand {
  detected: boolean;
  type: "buy" | "sell" | "position" | "balance" | "portfolio";
  asset?: string;
  quantity?: number;
  price?: number;
  raw: string;
}

export interface TradeResult {
  orderId: string;
  status: "submitted" | "filled" | "partially_filled" | "rejected";
  filledQuantity?: number;
  averagePrice?: number;
}

// ============================================================================
// Room Creation Activities
// ============================================================================

/**
 * Validate room creation request
 */
export async function validateRoomCreation(input: {
  creatorId: string;
  roomName: string;
  roomType: string;
  invitees: string[];
}): Promise<{ valid: boolean; reason?: string; creatorMatrixId: string }> {
  console.log(`[Messaging Activity] Validating room creation by ${input.creatorId}`);

  // Validate room name
  if (!input.roomName || input.roomName.length < 1) {
    return { valid: false, reason: "Room name is required", creatorMatrixId: "" };
  }

  if (input.roomName.length > 100) {
    return { valid: false, reason: "Room name too long (max 100 characters)", creatorMatrixId: "" };
  }

  // For DMs, must have exactly one invitee
  if (input.roomType === "dm" && input.invitees.length !== 1) {
    return { valid: false, reason: "DM must have exactly one other participant", creatorMatrixId: "" };
  }

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  const creatorMatrixId = `@${input.creatorId}:pull.com`;

  return { valid: true, creatorMatrixId };
}

/**
 * Create Matrix room
 */
export async function createMatrixRoom(input: {
  name: string;
  roomType: string;
  creatorMatrixId: string;
  preset: string;
  visibility: string;
}): Promise<{ roomId: string }> {
  console.log(`[Messaging Activity] Creating Matrix room: ${input.name}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  const response = await fetch(`${process.env.MATRIX_HOMESERVER_URL}/_matrix/client/v3/createRoom`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.MATRIX_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: input.name,
      preset: input.preset,
      visibility: input.visibility,
      room_alias_name: input.name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
      creation_content: {
        "m.federate": false,
      },
      power_level_content_override: {
        users: {
          [input.creatorMatrixId]: 100,
        },
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create Matrix room: ${error}`);
  }

  const data = await response.json();

  return { roomId: data.room_id ?? `!${crypto.randomUUID()}:pull.com` };
}

/**
 * Set room settings
 */
export async function setRoomSettings(
  roomId: string,
  settings: {
    encrypted?: boolean;
    historyVisibility?: string;
    guestAccess?: boolean;
    topic?: string;
    avatar?: string;
  }
): Promise<void> {
  console.log(`[Messaging Activity] Setting room settings for ${roomId}`);

  const baseUrl = process.env.MATRIX_HOMESERVER_URL;
  const token = process.env.MATRIX_ACCESS_TOKEN;

  // Set encryption if requested
  if (settings.encrypted) {
    await fetch(`${baseUrl}/_matrix/client/v3/rooms/${roomId}/state/m.room.encryption`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        algorithm: "m.megolm.v1.aes-sha2",
      }),
    });
  }

  // Set history visibility
  if (settings.historyVisibility) {
    await fetch(`${baseUrl}/_matrix/client/v3/rooms/${roomId}/state/m.room.history_visibility`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        history_visibility: settings.historyVisibility,
      }),
    });
  }

  // Set topic if provided
  if (settings.topic) {
    await fetch(`${baseUrl}/_matrix/client/v3/rooms/${roomId}/state/m.room.topic`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topic: settings.topic,
      }),
    });
  }
}

/**
 * Set room power levels
 */
export async function setRoomPowerLevels(
  roomId: string,
  config: {
    creatorId: string;
    roomType: string;
  }
): Promise<void> {
  console.log(`[Messaging Activity] Setting power levels for ${roomId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

/**
 * Invite user to room
 */
export async function inviteToRoom(input: {
  roomId: string;
  inviteeId: string;
  invitedBy: string;
}): Promise<void> {
  console.log(`[Messaging Activity] Inviting ${input.inviteeId} to ${input.roomId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  const inviteeMatrixId = `@${input.inviteeId}:pull.com`;

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  const response = await fetch(
    `${process.env.MATRIX_HOMESERVER_URL}/_matrix/client/v3/rooms/${input.roomId}/invite`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MATRIX_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: inviteeMatrixId,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to invite user: ${error}`);
  }
}

/**
 * Accept room invite as bot
 */
export async function acceptInviteAsBot(roomId: string): Promise<void> {
  console.log(`[Messaging Activity] Bot joining room ${roomId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

/**
 * Store room metadata in Convex
 */
export async function storeRoomMetadata(input: {
  roomId: string;
  matrixRoomId: string;
  creatorId: string;
  roomName: string;
  roomType: string;
  settings: Record<string, unknown>;
}): Promise<void> {
  console.log(`[Messaging Activity] Storing room metadata: ${input.roomId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

/**
 * Send welcome message
 */
export async function sendWelcomeMessage(input: {
  roomId: string;
  message: string;
  sender: string;
}): Promise<void> {
  console.log(`[Messaging Activity] Sending welcome message to ${input.roomId}`);

  await sendMatrixMessage({
    roomId: input.roomId,
    message: input.message,
    msgtype: "m.text",
  });
}

/**
 * Send room notification
 */
export async function sendRoomNotification(
  userId: string,
  data: {
    type: string;
    roomId: string;
    roomName: string;
    invitesCount?: number;
    invitedBy?: string;
  }
): Promise<void> {
  console.log(`[Messaging Activity] Sending room notification to ${userId}: ${data.type}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

// ============================================================================
// Message Handling Activities
// ============================================================================

/**
 * Parse message content
 */
export async function parseMessage(input: {
  content: string;
  messageType: string;
}): Promise<{ type: string; parsed: Record<string, unknown> }> {
  console.log(`[Messaging Activity] Parsing message`);

  // Check if it's a command
  if (input.content.startsWith("/")) {
    return {
      type: "command",
      parsed: { command: input.content.split(" ")[0].slice(1) },
    };
  }

  return {
    type: "text",
    parsed: {},
  };
}

/**
 * Detect trading command
 */
export async function detectTradingCommand(content: string): Promise<TradingCommand> {
  console.log(`[Messaging Activity] Detecting trading command`);

  const patterns = {
    buy: /^\/buy\s+(\d+)\s+([A-Z]+)(?:\s+@\s*(\d+\.?\d*))?$/i,
    sell: /^\/sell\s+(\d+)\s+([A-Z]+)(?:\s+@\s*(\d+\.?\d*))?$/i,
    position: /^\/position\s+([A-Z]+)$/i,
    balance: /^\/balance$/i,
    portfolio: /^\/portfolio$/i,
  };

  // Check buy command
  const buyMatch = content.match(patterns.buy);
  if (buyMatch) {
    return {
      detected: true,
      type: "buy",
      quantity: parseInt(buyMatch[1]),
      asset: buyMatch[2].toUpperCase(),
      price: buyMatch[3] ? parseFloat(buyMatch[3]) : undefined,
      raw: content,
    };
  }

  // Check sell command
  const sellMatch = content.match(patterns.sell);
  if (sellMatch) {
    return {
      detected: true,
      type: "sell",
      quantity: parseInt(sellMatch[1]),
      asset: sellMatch[2].toUpperCase(),
      price: sellMatch[3] ? parseFloat(sellMatch[3]) : undefined,
      raw: content,
    };
  }

  // Check position command
  const positionMatch = content.match(patterns.position);
  if (positionMatch) {
    return {
      detected: true,
      type: "position",
      asset: positionMatch[1].toUpperCase(),
      raw: content,
    };
  }

  // Check balance command
  if (patterns.balance.test(content)) {
    return {
      detected: true,
      type: "balance",
      raw: content,
    };
  }

  // Check portfolio command
  if (patterns.portfolio.test(content)) {
    return {
      detected: true,
      type: "portfolio",
      raw: content,
    };
  }

  return {
    detected: false,
    type: "buy", // default
    raw: content,
  };
}

/**
 * Validate trading authorization
 */
export async function validateTradingAuthorization(input: {
  userId: string;
  roomId: string;
  commandType: string;
}): Promise<{ authorized: boolean; reason?: string }> {
  console.log(`[Messaging Activity] Validating trading auth for ${input.userId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  // 1. Connected their account
  // 2. Enabled chat trading
  // 3. Room has trading enabled
  // 4. User has appropriate KYC level

  return { authorized: true };
}

/**
 * Execute trade from chat command
 */
export async function executeTrade(input: {
  userId: string;
  command: TradingCommand;
  roomId: string;
}): Promise<TradeResult> {
  console.log(`[Messaging Activity] Executing trade: ${input.command.type} ${input.command.quantity} ${input.command.asset}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag

  return {
    orderId: `ord_${crypto.randomUUID()}`,
    status: "submitted",
  };
}

/**
 * Send Matrix message
 */
export async function sendMatrixMessage(input: {
  roomId: string;
  message: string;
  msgtype?: string;
}): Promise<{ eventId: string }> {
  console.log(`[Messaging Activity] Sending message to ${input.roomId}`);

  const txnId = crypto.randomUUID();

  const response = await fetch(
    `${process.env.MATRIX_HOMESERVER_URL}/_matrix/client/v3/rooms/${input.roomId}/send/m.room.message/${txnId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${process.env.MATRIX_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        msgtype: input.msgtype ?? "m.text",
        body: input.message,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send message: ${error}`);
  }

  const data = await response.json();

  return { eventId: data.event_id ?? `$${crypto.randomUUID()}` };
}

/**
 * Broadcast message to room
 */
export async function broadcastToRoom(input: {
  roomId: string;
  message: string;
  sender: string;
}): Promise<void> {
  console.log(`[Messaging Activity] Broadcasting to ${input.roomId}`);

  await sendMatrixMessage({
    roomId: input.roomId,
    message: input.message,
  });
}

/**
 * Send bridge notification
 */
export async function sendBridgeNotification(
  userId: string,
  data: Record<string, unknown>
): Promise<void> {
  console.log(`[Messaging Activity] Sending bridge notification to ${userId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

/**
 * Store message in Convex
 */
export async function storeMessage(input: {
  messageId: string;
  roomId: string;
  senderId: string;
  content: string;
  messageType: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  console.log(`[Messaging Activity] Storing message ${input.messageId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

// ============================================================================
// Room Query Activities
// ============================================================================

/**
 * Get Matrix room history
 */
export async function getMatrixRoomHistory(
  roomId: string,
  limit: number = 50
): Promise<Array<{ eventId: string; sender: string; content: string; timestamp: number }>> {
  console.log(`[Messaging Activity] Getting room history for ${roomId}`);

  const response = await fetch(
    `${process.env.MATRIX_HOMESERVER_URL}/_matrix/client/v3/rooms/${roomId}/messages?dir=b&limit=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.MATRIX_ACCESS_TOKEN}`,
      },
    }
  );

  if (!response.ok) {
    return [];
  }

  const data = await response.json();

  return (data.chunk ?? [])
    .filter((e: { type: string }) => e.type === "m.room.message")
    .map((e: { event_id: string; sender: string; content: { body: string }; origin_server_ts: number }) => ({
      eventId: e.event_id,
      sender: e.sender,
      content: e.content?.body ?? "",
      timestamp: e.origin_server_ts,
    }));
}

/**
 * Search messages
 */
export async function searchMessages(input: {
  roomId?: string;
  query: string;
  limit?: number;
}): Promise<Array<{ eventId: string; roomId: string; sender: string; content: string }>> {
  console.log(`[Messaging Activity] Searching messages: ${input.query}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return [];
}

// ============================================================================
// Audit Activities
// ============================================================================

/**
 * Record audit log
 */
export async function recordAuditLog(event: {
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  console.log(`[Messaging Activity] Audit log: ${event.action} on ${event.resourceType}/${event.resourceId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}
