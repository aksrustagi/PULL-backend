/**
 * Matrix Bridge Service
 * Bridges Matrix rooms with external messaging platforms
 */

import { EventEmitter } from "events";
import type {
  MatrixConfig,
  Logger,
  BridgePlatform,
  BridgeRoomMapping,
  BridgeSettings,
  ExternalMessage,
  ExternalAttachment,
  BridgeResult,
  MessageContent,
} from "./types";
import { MatrixClient, MatrixApiError } from "./client";

// ============================================================================
// Bridge Error
// ============================================================================

export class BridgeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly platform?: BridgePlatform
  ) {
    super(message);
    this.name = "BridgeError";
  }
}

// ============================================================================
// Platform Handlers
// ============================================================================

/** Platform handler interface */
export interface PlatformHandler {
  platform: BridgePlatform;
  sendMessage(message: ExternalMessage): Promise<string>;
  deleteMessage(messageId: string, roomId: string): Promise<void>;
  editMessage(messageId: string, roomId: string, content: string): Promise<void>;
  sendReaction(messageId: string, roomId: string, emoji: string): Promise<void>;
  getUser(userId: string): Promise<{
    id: string;
    name: string;
    avatar?: string;
  } | null>;
}

/** Telegram handler */
export class TelegramHandler implements PlatformHandler {
  platform: BridgePlatform = "telegram";

  constructor(
    private readonly botToken: string,
    private readonly logger?: Logger
  ) {}

  async sendMessage(message: ExternalMessage): Promise<string> {
    this.logger?.debug(`Sending Telegram message to ${message.roomId}`);

    const response = await fetch(
      `https://api.telegram.org/bot${this.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: message.roomId,
          text: message.content,
          reply_to_message_id: message.replyToId,
          parse_mode: "MarkdownV2",
        }),
      }
    );

    if (!response.ok) {
      throw new BridgeError("Failed to send Telegram message", "SEND_FAILED", "telegram");
    }

    const data = (await response.json()) as { result: { message_id: number } };
    return String(data.result.message_id);
  }

  async deleteMessage(messageId: string, roomId: string): Promise<void> {
    this.logger?.debug(`Deleting Telegram message ${messageId} from ${roomId}`);

    await fetch(`https://api.telegram.org/bot${this.botToken}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: roomId,
        message_id: parseInt(messageId),
      }),
    });
  }

  async editMessage(messageId: string, roomId: string, content: string): Promise<void> {
    this.logger?.debug(`Editing Telegram message ${messageId} in ${roomId}`);

    await fetch(`https://api.telegram.org/bot${this.botToken}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: roomId,
        message_id: parseInt(messageId),
        text: content,
        parse_mode: "MarkdownV2",
      }),
    });
  }

  async sendReaction(messageId: string, roomId: string, emoji: string): Promise<void> {
    this.logger?.debug(`Sending reaction ${emoji} to Telegram message ${messageId}`);

    await fetch(`https://api.telegram.org/bot${this.botToken}/setMessageReaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: roomId,
        message_id: parseInt(messageId),
        reaction: [{ type: "emoji", emoji }],
      }),
    });
  }

  async getUser(userId: string): Promise<{
    id: string;
    name: string;
    avatar?: string;
  } | null> {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${this.botToken}/getChat?chat_id=${userId}`
      );

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        result: {
          id: number;
          first_name?: string;
          last_name?: string;
          username?: string;
          photo?: { small_file_id: string };
        };
      };

      return {
        id: String(data.result.id),
        name: [data.result.first_name, data.result.last_name]
          .filter(Boolean)
          .join(" ") || data.result.username || "Unknown",
        avatar: data.result.photo?.small_file_id,
      };
    } catch {
      return null;
    }
  }
}

/** Discord handler */
export class DiscordHandler implements PlatformHandler {
  platform: BridgePlatform = "discord";

  constructor(
    private readonly botToken: string,
    private readonly logger?: Logger
  ) {}

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bot ${this.botToken}`,
      "Content-Type": "application/json",
    };
  }

  async sendMessage(message: ExternalMessage): Promise<string> {
    this.logger?.debug(`Sending Discord message to ${message.roomId}`);

    const body: Record<string, unknown> = {
      content: message.content,
    };

    if (message.replyToId) {
      body["message_reference"] = { message_id: message.replyToId };
    }

    const response = await fetch(
      `https://discord.com/api/v10/channels/${message.roomId}/messages`,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      throw new BridgeError("Failed to send Discord message", "SEND_FAILED", "discord");
    }

    const data = (await response.json()) as { id: string };
    return data.id;
  }

  async deleteMessage(messageId: string, roomId: string): Promise<void> {
    this.logger?.debug(`Deleting Discord message ${messageId} from ${roomId}`);

    await fetch(
      `https://discord.com/api/v10/channels/${roomId}/messages/${messageId}`,
      {
        method: "DELETE",
        headers: this.headers,
      }
    );
  }

  async editMessage(messageId: string, roomId: string, content: string): Promise<void> {
    this.logger?.debug(`Editing Discord message ${messageId} in ${roomId}`);

    await fetch(
      `https://discord.com/api/v10/channels/${roomId}/messages/${messageId}`,
      {
        method: "PATCH",
        headers: this.headers,
        body: JSON.stringify({ content }),
      }
    );
  }

  async sendReaction(messageId: string, roomId: string, emoji: string): Promise<void> {
    this.logger?.debug(`Sending reaction ${emoji} to Discord message ${messageId}`);

    const encodedEmoji = encodeURIComponent(emoji);
    await fetch(
      `https://discord.com/api/v10/channels/${roomId}/messages/${messageId}/reactions/${encodedEmoji}/@me`,
      {
        method: "PUT",
        headers: this.headers,
      }
    );
  }

  async getUser(userId: string): Promise<{
    id: string;
    name: string;
    avatar?: string;
  } | null> {
    try {
      const response = await fetch(`https://discord.com/api/v10/users/${userId}`, {
        headers: this.headers,
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        id: string;
        username: string;
        global_name?: string;
        avatar?: string;
      };

      return {
        id: data.id,
        name: data.global_name ?? data.username,
        avatar: data.avatar
          ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png`
          : undefined,
      };
    } catch {
      return null;
    }
  }
}

/** Slack handler */
export class SlackHandler implements PlatformHandler {
  platform: BridgePlatform = "slack";

  constructor(
    private readonly botToken: string,
    private readonly logger?: Logger
  ) {}

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.botToken}`,
      "Content-Type": "application/json",
    };
  }

  async sendMessage(message: ExternalMessage): Promise<string> {
    this.logger?.debug(`Sending Slack message to ${message.roomId}`);

    const body: Record<string, unknown> = {
      channel: message.roomId,
      text: message.content,
    };

    if (message.replyToId) {
      body["thread_ts"] = message.replyToId;
    }

    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new BridgeError("Failed to send Slack message", "SEND_FAILED", "slack");
    }

    const data = (await response.json()) as { ok: boolean; ts: string; error?: string };

    if (!data.ok) {
      throw new BridgeError(data.error ?? "Unknown error", "SEND_FAILED", "slack");
    }

    return data.ts;
  }

  async deleteMessage(messageId: string, roomId: string): Promise<void> {
    this.logger?.debug(`Deleting Slack message ${messageId} from ${roomId}`);

    await fetch("https://slack.com/api/chat.delete", {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        channel: roomId,
        ts: messageId,
      }),
    });
  }

  async editMessage(messageId: string, roomId: string, content: string): Promise<void> {
    this.logger?.debug(`Editing Slack message ${messageId} in ${roomId}`);

    await fetch("https://slack.com/api/chat.update", {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        channel: roomId,
        ts: messageId,
        text: content,
      }),
    });
  }

  async sendReaction(messageId: string, roomId: string, emoji: string): Promise<void> {
    this.logger?.debug(`Sending reaction ${emoji} to Slack message ${messageId}`);

    // Slack uses emoji names without colons
    const emojiName = emoji.replace(/:/g, "");

    await fetch("https://slack.com/api/reactions.add", {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        channel: roomId,
        timestamp: messageId,
        name: emojiName,
      }),
    });
  }

  async getUser(userId: string): Promise<{
    id: string;
    name: string;
    avatar?: string;
  } | null> {
    try {
      const response = await fetch(
        `https://slack.com/api/users.info?user=${userId}`,
        { headers: this.headers }
      );

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        ok: boolean;
        user?: {
          id: string;
          real_name?: string;
          name: string;
          profile?: { image_48?: string };
        };
      };

      if (!data.ok || !data.user) {
        return null;
      }

      return {
        id: data.user.id,
        name: data.user.real_name ?? data.user.name,
        avatar: data.user.profile?.image_48,
      };
    } catch {
      return null;
    }
  }
}

// ============================================================================
// Bridge Service
// ============================================================================

export interface BridgeServiceConfig extends MatrixConfig {
  platformHandlers?: Map<BridgePlatform, PlatformHandler>;
}

export class MatrixBridgeService extends EventEmitter {
  private readonly matrixClient: MatrixClient;
  private readonly logger: Logger | undefined;
  private readonly platformHandlers: Map<BridgePlatform, PlatformHandler>;
  private readonly roomMappings: Map<string, BridgeRoomMapping>;
  private readonly messageIdMappings: Map<string, { matrixEventId: string; externalId: string }>;

  constructor(config: BridgeServiceConfig) {
    super();
    this.matrixClient = new MatrixClient(config);
    this.logger = config.logger;
    this.platformHandlers = config.platformHandlers ?? new Map();
    this.roomMappings = new Map();
    this.messageIdMappings = new Map();
  }

  // ==========================================================================
  // Platform Handler Management
  // ==========================================================================

  /**
   * Register a platform handler
   */
  registerHandler(handler: PlatformHandler): void {
    this.logger?.info(`Registering handler for platform: ${handler.platform}`);
    this.platformHandlers.set(handler.platform, handler);
  }

  /**
   * Get a platform handler
   */
  getHandler(platform: BridgePlatform): PlatformHandler | undefined {
    return this.platformHandlers.get(platform);
  }

  /**
   * Remove a platform handler
   */
  removeHandler(platform: BridgePlatform): boolean {
    return this.platformHandlers.delete(platform);
  }

  // ==========================================================================
  // Room Bridging
  // ==========================================================================

  /**
   * Bridge a Matrix room with an external platform room
   */
  async bridgeRoom(
    matrixRoomId: string,
    externalId: string,
    platform: BridgePlatform,
    settings: Partial<BridgeSettings> = {}
  ): Promise<BridgeRoomMapping> {
    this.logger?.info(`Bridging room ${matrixRoomId} to ${platform}:${externalId}`);

    // Verify handler exists
    if (!this.platformHandlers.has(platform)) {
      throw new BridgeError(
        `No handler registered for platform: ${platform}`,
        "NO_HANDLER",
        platform
      );
    }

    // Create mapping
    const mapping: BridgeRoomMapping = {
      id: crypto.randomUUID(),
      matrixRoomId,
      externalId,
      platform,
      settings: {
        syncHistory: settings.syncHistory ?? false,
        maxHistoryMessages: settings.maxHistoryMessages ?? 100,
        bidirectional: settings.bidirectional ?? true,
        relayBots: settings.relayBots ?? false,
        formatMarkdown: settings.formatMarkdown ?? true,
        bridgeEdits: settings.bridgeEdits ?? true,
        bridgeDeletes: settings.bridgeDeletes ?? true,
        bridgeReactions: settings.bridgeReactions ?? true,
        bridgeFiles: settings.bridgeFiles ?? true,
        mentionMapping: settings.mentionMapping ?? {},
      },
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Store mapping
    this.roomMappings.set(mapping.id, mapping);

    // Set up Matrix event listeners for this room
    this.setupRoomListeners(mapping);

    // Emit event
    this.emit("room.bridged", mapping);

    return mapping;
  }

  /**
   * Unbridge a room
   */
  async unbridgeRoom(mappingId: string): Promise<void> {
    const mapping = this.roomMappings.get(mappingId);

    if (!mapping) {
      throw new BridgeError("Room mapping not found", "MAPPING_NOT_FOUND");
    }

    this.logger?.info(`Unbridging room ${mapping.matrixRoomId}`);

    // Remove mapping
    this.roomMappings.delete(mappingId);

    // Emit event
    this.emit("room.unbridged", mapping);
  }

  /**
   * Get room mapping
   */
  getRoomMapping(mappingId: string): BridgeRoomMapping | undefined {
    return this.roomMappings.get(mappingId);
  }

  /**
   * Get all mappings for a Matrix room
   */
  getMappingsByMatrixRoom(matrixRoomId: string): BridgeRoomMapping[] {
    return Array.from(this.roomMappings.values()).filter(
      (m) => m.matrixRoomId === matrixRoomId
    );
  }

  /**
   * Get mapping by external ID
   */
  getMappingByExternalId(
    platform: BridgePlatform,
    externalId: string
  ): BridgeRoomMapping | undefined {
    return Array.from(this.roomMappings.values()).find(
      (m) => m.platform === platform && m.externalId === externalId
    );
  }

  /**
   * Update bridge settings
   */
  updateBridgeSettings(
    mappingId: string,
    settings: Partial<BridgeSettings>
  ): BridgeRoomMapping {
    const mapping = this.roomMappings.get(mappingId);

    if (!mapping) {
      throw new BridgeError("Room mapping not found", "MAPPING_NOT_FOUND");
    }

    mapping.settings = { ...mapping.settings, ...settings };
    mapping.updatedAt = new Date();

    this.emit("room.settings_updated", mapping);

    return mapping;
  }

  /**
   * Pause bridging for a room
   */
  pauseBridge(mappingId: string): BridgeRoomMapping {
    const mapping = this.roomMappings.get(mappingId);

    if (!mapping) {
      throw new BridgeError("Room mapping not found", "MAPPING_NOT_FOUND");
    }

    mapping.status = "paused";
    mapping.updatedAt = new Date();

    this.emit("room.paused", mapping);

    return mapping;
  }

  /**
   * Resume bridging for a room
   */
  resumeBridge(mappingId: string): BridgeRoomMapping {
    const mapping = this.roomMappings.get(mappingId);

    if (!mapping) {
      throw new BridgeError("Room mapping not found", "MAPPING_NOT_FOUND");
    }

    mapping.status = "active";
    mapping.updatedAt = new Date();

    this.emit("room.resumed", mapping);

    return mapping;
  }

  // ==========================================================================
  // Message Handling
  // ==========================================================================

  /**
   * Handle incoming external message
   */
  async handleExternalMessage(message: ExternalMessage): Promise<BridgeResult> {
    this.logger?.debug(`Handling external message from ${message.platform}`);

    // Find mapping for this external room
    const mapping = this.getMappingByExternalId(message.platform, message.roomId);

    if (!mapping) {
      return {
        success: false,
        error: "No bridge mapping found for this room",
      };
    }

    if (mapping.status !== "active") {
      return {
        success: false,
        error: "Bridge is paused or in error state",
      };
    }

    try {
      // Format message content
      const content = await this.formatExternalMessage(message, mapping);

      // Send to Matrix
      const result = await this.matrixClient.sendMessage(mapping.matrixRoomId, content);

      // Store message ID mapping
      this.messageIdMappings.set(message.id, {
        matrixEventId: result.eventId,
        externalId: message.id,
      });

      // Emit event
      this.emit("message.bridged_to_matrix", {
        message,
        matrixEventId: result.eventId,
        mapping,
      });

      return {
        success: true,
        matrixEventId: result.eventId,
        externalMessageId: message.id,
      };
    } catch (error) {
      this.logger?.error("Failed to bridge external message:", error);

      // Update mapping status on repeated failures
      if (mapping.status === "active") {
        mapping.status = "error";
        this.emit("room.error", { mapping, error });
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Send message to external platform
   */
  async sendToExternal(
    matrixRoomId: string,
    content: string,
    options: {
      sender?: string;
      replyToExternalId?: string;
      attachments?: ExternalAttachment[];
    } = {}
  ): Promise<BridgeResult[]> {
    this.logger?.debug(`Sending to external from ${matrixRoomId}`);

    const mappings = this.getMappingsByMatrixRoom(matrixRoomId);
    const results: BridgeResult[] = [];

    for (const mapping of mappings) {
      if (mapping.status !== "active" || !mapping.settings.bidirectional) {
        continue;
      }

      const handler = this.platformHandlers.get(mapping.platform);

      if (!handler) {
        results.push({
          success: false,
          error: `No handler for platform: ${mapping.platform}`,
        });
        continue;
      }

      try {
        const message: ExternalMessage = {
          id: crypto.randomUUID(),
          platform: mapping.platform,
          roomId: mapping.externalId,
          senderId: "matrix_bridge",
          senderName: options.sender ?? "Matrix User",
          content: this.formatMatrixContent(content, mapping),
          contentType: "text",
          replyToId: options.replyToExternalId,
          attachments: options.attachments,
          timestamp: new Date(),
        };

        const externalId = await handler.sendMessage(message);

        results.push({
          success: true,
          externalMessageId: externalId,
        });

        // Emit event
        this.emit("message.bridged_to_external", {
          content,
          externalId,
          mapping,
        });
      } catch (error) {
        this.logger?.error(`Failed to send to ${mapping.platform}:`, error);

        results.push({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return results;
  }

  /**
   * Handle external message edit
   */
  async handleExternalEdit(
    platform: BridgePlatform,
    externalRoomId: string,
    externalMessageId: string,
    newContent: string
  ): Promise<BridgeResult> {
    const mapping = this.getMappingByExternalId(platform, externalRoomId);

    if (!mapping || mapping.status !== "active" || !mapping.settings.bridgeEdits) {
      return { success: false, error: "Bridge not active or edits not enabled" };
    }

    // Find Matrix event ID
    const idMapping = Array.from(this.messageIdMappings.values()).find(
      (m) => m.externalId === externalMessageId
    );

    if (!idMapping) {
      return { success: false, error: "Original message not found" };
    }

    try {
      await this.matrixClient.editMessage(
        mapping.matrixRoomId,
        idMapping.matrixEventId,
        newContent
      );

      return { success: true, matrixEventId: idMapping.matrixEventId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Handle external message deletion
   */
  async handleExternalDelete(
    platform: BridgePlatform,
    externalRoomId: string,
    externalMessageId: string
  ): Promise<BridgeResult> {
    const mapping = this.getMappingByExternalId(platform, externalRoomId);

    if (!mapping || mapping.status !== "active" || !mapping.settings.bridgeDeletes) {
      return { success: false, error: "Bridge not active or deletes not enabled" };
    }

    // Find Matrix event ID
    const idMapping = Array.from(this.messageIdMappings.values()).find(
      (m) => m.externalId === externalMessageId
    );

    if (!idMapping) {
      return { success: false, error: "Original message not found" };
    }

    try {
      await this.matrixClient.redactMessage(
        mapping.matrixRoomId,
        idMapping.matrixEventId,
        "Message deleted on bridged platform"
      );

      return { success: true, matrixEventId: idMapping.matrixEventId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Handle external reaction
   */
  async handleExternalReaction(
    platform: BridgePlatform,
    externalRoomId: string,
    externalMessageId: string,
    emoji: string
  ): Promise<BridgeResult> {
    const mapping = this.getMappingByExternalId(platform, externalRoomId);

    if (!mapping || mapping.status !== "active" || !mapping.settings.bridgeReactions) {
      return { success: false, error: "Bridge not active or reactions not enabled" };
    }

    // Find Matrix event ID
    const idMapping = Array.from(this.messageIdMappings.values()).find(
      (m) => m.externalId === externalMessageId
    );

    if (!idMapping) {
      return { success: false, error: "Original message not found" };
    }

    try {
      const result = await this.matrixClient.sendReaction(
        mapping.matrixRoomId,
        idMapping.matrixEventId,
        emoji
      );

      return { success: true, matrixEventId: result.eventId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ==========================================================================
  // Content Formatting
  // ==========================================================================

  /**
   * Format external message for Matrix
   */
  private async formatExternalMessage(
    message: ExternalMessage,
    mapping: BridgeRoomMapping
  ): Promise<MessageContent> {
    // Build sender prefix
    const senderPrefix = `**[${message.platform}] ${message.senderName}:**`;

    // Format content
    let body = `${senderPrefix}\n${message.content}`;
    let formattedBody = `<strong>[${message.platform}] ${this.escapeHtml(message.senderName)}:</strong><br/>${this.escapeHtml(message.content)}`;

    // Handle attachments
    if (message.attachments?.length && mapping.settings.bridgeFiles) {
      for (const attachment of message.attachments) {
        body += `\n[${attachment.type}: ${attachment.filename}](${attachment.url})`;
        formattedBody += `<br/><a href="${attachment.url}">[${attachment.type}: ${this.escapeHtml(attachment.filename)}]</a>`;
      }
    }

    return {
      msgtype: "m.text",
      body,
      format: "org.matrix.custom.html",
      formatted_body: formattedBody,
    };
  }

  /**
   * Format Matrix content for external platform
   */
  private formatMatrixContent(content: string, mapping: BridgeRoomMapping): string {
    if (!mapping.settings.formatMarkdown) {
      // Strip markdown
      return content
        .replace(/\*\*/g, "")
        .replace(/\*/g, "")
        .replace(/__/g, "")
        .replace(/_/g, "")
        .replace(/~~/g, "")
        .replace(/`/g, "");
    }

    // Apply mention mapping
    let formatted = content;

    for (const [matrixId, externalMention] of Object.entries(
      mapping.settings.mentionMapping
    )) {
      formatted = formatted.replace(new RegExp(matrixId, "g"), externalMention);
    }

    return formatted;
  }

  /**
   * Escape HTML entities
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ==========================================================================
  // Matrix Event Listeners
  // ==========================================================================

  /**
   * Set up listeners for Matrix room events
   */
  private setupRoomListeners(mapping: BridgeRoomMapping): void {
    // Listen for messages in the bridged room
    this.matrixClient.on("room.message", async (event) => {
      if (event.roomId !== mapping.matrixRoomId) {
        return;
      }

      if (mapping.status !== "active" || !mapping.settings.bidirectional) {
        return;
      }

      // Don't bridge messages from the bridge itself
      if (event.event.sender === this.matrixClient.currentUserId) {
        return;
      }

      const content = event.event.content as MessageContent;

      await this.sendToExternal(mapping.matrixRoomId, content.body, {
        sender: event.event.sender,
      });
    });

    // Listen for reactions
    this.matrixClient.on("room.reaction", async (event) => {
      if (event.roomId !== mapping.matrixRoomId) {
        return;
      }

      if (mapping.status !== "active" || !mapping.settings.bridgeReactions) {
        return;
      }

      const handler = this.platformHandlers.get(mapping.platform);
      if (!handler) {
        return;
      }

      const relatesTo = event.event.content?.["m.relates_to"] as {
        event_id?: string;
        key?: string;
      };

      if (!relatesTo?.event_id || !relatesTo.key) {
        return;
      }

      // Find external message ID
      const idMapping = Array.from(this.messageIdMappings.values()).find(
        (m) => m.matrixEventId === relatesTo.event_id
      );

      if (idMapping) {
        try {
          await handler.sendReaction(
            idMapping.externalId,
            mapping.externalId,
            relatesTo.key
          );
        } catch (error) {
          this.logger?.error("Failed to bridge reaction:", error);
        }
      }
    });
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Start the bridge service
   */
  async start(): Promise<void> {
    this.logger?.info("Starting Matrix bridge service");

    // Start Matrix sync
    await this.matrixClient.startSync();
  }

  /**
   * Stop the bridge service
   */
  stop(): void {
    this.logger?.info("Stopping Matrix bridge service");

    // Stop Matrix sync
    this.matrixClient.stopSync();

    // Clear mappings
    this.roomMappings.clear();
    this.messageIdMappings.clear();
  }

  /**
   * Get the underlying Matrix client
   */
  getMatrixClient(): MatrixClient {
    return this.matrixClient;
  }
}
