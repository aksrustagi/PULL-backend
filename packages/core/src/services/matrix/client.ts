/**
 * Matrix Client Service
 * Full-featured Matrix client with encryption support (Megolm)
 */

import { EventEmitter } from "events";
import type {
  MatrixConfig,
  Logger,
  RegisterResponse,
  LoginResponse,
  CreateRoomOptions,
  CreateRoomResponse,
  RoomInfo,
  RoomSummary,
  JoinedRoomsResponse,
  RoomMember,
  MessageContent,
  SendMessageResponse,
  ReactionContent,
  MatrixEvent,
  MessagesResponse,
  SyncResponse,
  SyncFilter,
  MatrixErrorResponse,
  MegolmSession,
  EncryptedContent,
  DeviceInfo,
} from "./types";

// ============================================================================
// Error Classes
// ============================================================================

export class MatrixApiError extends Error {
  constructor(
    message: string,
    public readonly errcode: string,
    public readonly statusCode: number,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "MatrixApiError";
  }
}

// ============================================================================
// Matrix Client
// ============================================================================

export class MatrixClient extends EventEmitter {
  private readonly baseUrl: string;
  private accessToken: string | undefined;
  private userId: string | undefined;
  private deviceId: string | undefined;
  private readonly timeout: number;
  private readonly logger: Logger | undefined;

  // Sync state
  private syncToken: string | undefined;
  private isSyncing = false;
  private syncAbortController: AbortController | undefined;

  // Encryption state
  private isEncryptionEnabled = false;
  private megolmSessions: Map<string, MegolmSession> = new Map();
  private deviceKeys: DeviceInfo | undefined;

  constructor(config: MatrixConfig) {
    super();
    this.baseUrl = config.homeserverUrl.replace(/\/$/, "");
    this.accessToken = config.accessToken;
    this.userId = config.userId;
    this.deviceId = config.deviceId;
    this.timeout = config.timeout ?? 30000;
    this.logger = config.logger;
  }

  // ==========================================================================
  // HTTP Helpers
  // ==========================================================================

  private async request<T>(
    method: string,
    path: string,
    options: {
      body?: unknown;
      query?: Record<string, string | number | boolean | undefined>;
      requiresAuth?: boolean;
      timeout?: number;
    } = {}
  ): Promise<T> {
    const { body, query, requiresAuth = true, timeout = this.timeout } = options;

    // Build URL with query params
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    // Build headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (requiresAuth && this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      this.logger?.debug(`Matrix API: ${method} ${path}`);

      const response = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as MatrixErrorResponse;
        throw new MatrixApiError(
          errorData.error ?? `HTTP ${response.status}`,
          errorData.errcode ?? "M_UNKNOWN",
          response.status,
          errorData.retry_after_ms
        );
      }

      if (response.status === 204) {
        return {} as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof MatrixApiError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new MatrixApiError("Request timeout", "M_TIMEOUT", 408);
      }

      throw new MatrixApiError(
        error instanceof Error ? error.message : "Unknown error",
        "M_UNKNOWN",
        500
      );
    }
  }

  // ==========================================================================
  // Authentication
  // ==========================================================================

  /**
   * Register a new user
   */
  async register(
    username: string,
    password: string,
    options: {
      displayName?: string;
      deviceId?: string;
      inhibitLogin?: boolean;
    } = {}
  ): Promise<RegisterResponse> {
    this.logger?.info(`Registering user: ${username}`);

    const response = await this.request<{
      user_id: string;
      access_token?: string;
      device_id?: string;
      home_server: string;
    }>("POST", "/_matrix/client/v3/register", {
      body: {
        username,
        password,
        device_id: options.deviceId,
        initial_device_display_name: options.displayName ?? "PULL Client",
        inhibit_login: options.inhibitLogin ?? false,
        auth: {
          type: "m.login.dummy",
        },
      },
      requiresAuth: false,
    });

    if (response.access_token) {
      this.accessToken = response.access_token;
      this.userId = response.user_id;
      this.deviceId = response.device_id;
    }

    return {
      userId: response.user_id,
      accessToken: response.access_token ?? "",
      deviceId: response.device_id ?? "",
      homeServer: response.home_server,
    };
  }

  /**
   * Login with username and password
   */
  async login(
    username: string,
    password: string,
    options: {
      deviceId?: string;
      displayName?: string;
    } = {}
  ): Promise<LoginResponse> {
    this.logger?.info(`Logging in user: ${username}`);

    const response = await this.request<{
      user_id: string;
      access_token: string;
      device_id: string;
      home_server: string;
      well_known?: {
        "m.homeserver": { base_url: string };
        "m.identity_server"?: { base_url: string };
      };
    }>("POST", "/_matrix/client/v3/login", {
      body: {
        type: "m.login.password",
        identifier: {
          type: "m.id.user",
          user: username,
        },
        password,
        device_id: options.deviceId,
        initial_device_display_name: options.displayName ?? "PULL Client",
      },
      requiresAuth: false,
    });

    this.accessToken = response.access_token;
    this.userId = response.user_id;
    this.deviceId = response.device_id;

    return {
      userId: response.user_id,
      accessToken: response.access_token,
      deviceId: response.device_id,
      homeServer: response.home_server,
      wellKnown: response.well_known,
    };
  }

  /**
   * Logout and invalidate access token
   */
  async logout(): Promise<void> {
    this.logger?.info("Logging out");

    await this.request("POST", "/_matrix/client/v3/logout");

    this.accessToken = undefined;
    this.userId = undefined;
    this.deviceId = undefined;
    this.stopSync();
  }

  /**
   * Logout all sessions
   */
  async logoutAll(): Promise<void> {
    this.logger?.info("Logging out all sessions");

    await this.request("POST", "/_matrix/client/v3/logout/all");

    this.accessToken = undefined;
    this.userId = undefined;
    this.deviceId = undefined;
    this.stopSync();
  }

  // ==========================================================================
  // Room Management
  // ==========================================================================

  /**
   * Create a new room
   */
  async createRoom(options: CreateRoomOptions = {}): Promise<CreateRoomResponse> {
    this.logger?.info(`Creating room: ${options.name ?? "unnamed"}`);

    const response = await this.request<{
      room_id: string;
      room_alias?: string;
    }>("POST", "/_matrix/client/v3/createRoom", {
      body: {
        name: options.name,
        topic: options.topic,
        room_alias_name: options.roomAliasName,
        visibility: options.visibility ?? "private",
        preset: options.preset ?? "private_chat",
        is_direct: options.isDirect,
        invite: options.invite,
        initial_state: options.initialState?.map((s) => ({
          type: s.type,
          state_key: s.stateKey ?? "",
          content: s.content,
        })),
        creation_content: {
          "m.federate": false,
          ...options.creationContent,
        },
        power_level_content_override: options.powerLevelContentOverride,
      },
    });

    return {
      roomId: response.room_id,
      roomAlias: response.room_alias,
    };
  }

  /**
   * Invite a user to a room
   */
  async inviteUser(roomId: string, userId: string): Promise<void> {
    this.logger?.info(`Inviting ${userId} to room ${roomId}`);

    await this.request("POST", `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`, {
      body: { user_id: userId },
    });
  }

  /**
   * Join a room by ID or alias
   */
  async joinRoom(
    roomIdOrAlias: string,
    options: {
      serverName?: string[];
      reason?: string;
    } = {}
  ): Promise<{ roomId: string }> {
    this.logger?.info(`Joining room: ${roomIdOrAlias}`);

    const query: Record<string, string> = {};
    if (options.serverName?.length) {
      query["server_name"] = options.serverName.join(",");
    }

    const response = await this.request<{ room_id: string }>(
      "POST",
      `/_matrix/client/v3/join/${encodeURIComponent(roomIdOrAlias)}`,
      {
        body: options.reason ? { reason: options.reason } : {},
        query,
      }
    );

    return { roomId: response.room_id };
  }

  /**
   * Leave a room
   */
  async leaveRoom(roomId: string, reason?: string): Promise<void> {
    this.logger?.info(`Leaving room: ${roomId}`);

    await this.request("POST", `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/leave`, {
      body: reason ? { reason } : {},
    });
  }

  /**
   * Kick a user from a room
   */
  async kickUser(roomId: string, userId: string, reason?: string): Promise<void> {
    this.logger?.info(`Kicking ${userId} from room ${roomId}`);

    await this.request("POST", `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/kick`, {
      body: {
        user_id: userId,
        reason,
      },
    });
  }

  /**
   * Ban a user from a room
   */
  async banUser(roomId: string, userId: string, reason?: string): Promise<void> {
    this.logger?.info(`Banning ${userId} from room ${roomId}`);

    await this.request("POST", `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/ban`, {
      body: {
        user_id: userId,
        reason,
      },
    });
  }

  /**
   * Unban a user from a room
   */
  async unbanUser(roomId: string, userId: string): Promise<void> {
    this.logger?.info(`Unbanning ${userId} from room ${roomId}`);

    await this.request("POST", `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/unban`, {
      body: { user_id: userId },
    });
  }

  /**
   * Get list of joined rooms
   */
  async getRooms(): Promise<string[]> {
    this.logger?.debug("Getting joined rooms");

    const response = await this.request<JoinedRoomsResponse>(
      "GET",
      "/_matrix/client/v3/joined_rooms"
    );

    return response.joinedRooms;
  }

  /**
   * Get room state
   */
  async getRoomState(roomId: string): Promise<MatrixEvent[]> {
    this.logger?.debug(`Getting state for room ${roomId}`);

    return this.request<MatrixEvent[]>(
      "GET",
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state`
    );
  }

  /**
   * Get room info from state
   */
  async getRoomInfo(roomId: string): Promise<RoomInfo> {
    const state = await this.getRoomState(roomId);

    const getName = (events: MatrixEvent[]) =>
      events.find((e) => e.type === "m.room.name")?.content?.["name"] as string | undefined;

    const getTopic = (events: MatrixEvent[]) =>
      events.find((e) => e.type === "m.room.topic")?.content?.["topic"] as string | undefined;

    const getAvatar = (events: MatrixEvent[]) =>
      events.find((e) => e.type === "m.room.avatar")?.content?.["url"] as string | undefined;

    const getAlias = (events: MatrixEvent[]) =>
      events.find((e) => e.type === "m.room.canonical_alias")?.content?.["alias"] as
        | string
        | undefined;

    const getJoinRule = (events: MatrixEvent[]) =>
      events.find((e) => e.type === "m.room.join_rules")?.content?.["join_rule"] as
        | "public"
        | "invite"
        | "knock"
        | "restricted"
        | undefined;

    const getGuestAccess = (events: MatrixEvent[]) =>
      events.find((e) => e.type === "m.room.guest_access")?.content?.["guest_access"] as
        | "can_join"
        | "forbidden"
        | undefined;

    const getHistoryVisibility = (events: MatrixEvent[]) =>
      events.find((e) => e.type === "m.room.history_visibility")?.content?.["history_visibility"] as
        | "shared"
        | "invited"
        | "joined"
        | "world_readable"
        | undefined;

    const isEncrypted = state.some((e) => e.type === "m.room.encryption");

    const createEvent = state.find((e) => e.type === "m.room.create");

    return {
      roomId,
      name: getName(state),
      topic: getTopic(state),
      avatarUrl: getAvatar(state),
      canonicalAlias: getAlias(state),
      joinRule: getJoinRule(state),
      guestAccess: getGuestAccess(state),
      historyVisibility: getHistoryVisibility(state),
      isEncrypted,
      creator: createEvent?.sender,
      creationTs: createEvent?.originServerTs,
    };
  }

  /**
   * Set room name
   */
  async setRoomName(roomId: string, name: string): Promise<void> {
    this.logger?.info(`Setting room ${roomId} name to: ${name}`);

    await this.request(
      "PUT",
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.name`,
      {
        body: { name },
      }
    );
  }

  /**
   * Set room topic
   */
  async setRoomTopic(roomId: string, topic: string): Promise<void> {
    this.logger?.info(`Setting room ${roomId} topic`);

    await this.request(
      "PUT",
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.topic`,
      {
        body: { topic },
      }
    );
  }

  /**
   * Set room avatar
   */
  async setRoomAvatar(roomId: string, avatarUrl: string): Promise<void> {
    this.logger?.info(`Setting room ${roomId} avatar`);

    await this.request(
      "PUT",
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.avatar`,
      {
        body: { url: avatarUrl },
      }
    );
  }

  // ==========================================================================
  // Room Members
  // ==========================================================================

  /**
   * Get room members
   */
  async getRoomMembers(
    roomId: string,
    options: {
      membership?: "join" | "invite" | "leave" | "ban";
      notMembership?: "join" | "invite" | "leave" | "ban";
    } = {}
  ): Promise<RoomMember[]> {
    this.logger?.debug(`Getting members of room ${roomId}`);

    const response = await this.request<{
      chunk: Array<{
        type: string;
        state_key: string;
        content: {
          membership: string;
          displayname?: string;
          avatar_url?: string;
        };
      }>;
    }>(`GET`, `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/members`, {
      query: {
        membership: options.membership,
        not_membership: options.notMembership,
      },
    });

    // Get power levels to determine member power
    const powerLevels = await this.getRoomPowerLevels(roomId);

    return response.chunk.map((event) => ({
      userId: event.state_key,
      displayName: event.content.displayname,
      avatarUrl: event.content.avatar_url,
      membership: event.content.membership as RoomMember["membership"],
      powerLevel: powerLevels.users?.[event.state_key] ?? powerLevels.usersDefault ?? 0,
    }));
  }

  /**
   * Get room power levels
   */
  private async getRoomPowerLevels(roomId: string): Promise<{
    users?: Record<string, number>;
    usersDefault?: number;
  }> {
    try {
      const response = await this.request<{
        users?: Record<string, number>;
        users_default?: number;
      }>(
        "GET",
        `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.power_levels`
      );

      return {
        users: response.users,
        usersDefault: response.users_default,
      };
    } catch {
      return {};
    }
  }

  // ==========================================================================
  // Messaging
  // ==========================================================================

  /**
   * Send a message to a room
   */
  async sendMessage(
    roomId: string,
    content: string | MessageContent
  ): Promise<SendMessageResponse> {
    const txnId = crypto.randomUUID();

    const messageContent: MessageContent =
      typeof content === "string"
        ? { msgtype: "m.text", body: content }
        : content;

    this.logger?.debug(`Sending message to room ${roomId}`);

    // Check if room is encrypted and encrypt if needed
    const roomInfo = await this.getRoomInfo(roomId);
    const finalContent = roomInfo.isEncrypted && this.isEncryptionEnabled
      ? await this.encryptMessage(roomId, messageContent)
      : messageContent;

    const eventType = roomInfo.isEncrypted && this.isEncryptionEnabled
      ? "m.room.encrypted"
      : "m.room.message";

    const response = await this.request<{ event_id: string }>(
      "PUT",
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/${eventType}/${txnId}`,
      {
        body: finalContent,
      }
    );

    return { eventId: response.event_id };
  }

  /**
   * Send a reaction to a message
   */
  async sendReaction(roomId: string, eventId: string, emoji: string): Promise<SendMessageResponse> {
    const txnId = crypto.randomUUID();

    this.logger?.debug(`Sending reaction ${emoji} to event ${eventId} in room ${roomId}`);

    const content: ReactionContent = {
      "m.relates_to": {
        rel_type: "m.annotation",
        event_id: eventId,
        key: emoji,
      },
    };

    const response = await this.request<{ event_id: string }>(
      "PUT",
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.reaction/${txnId}`,
      {
        body: content,
      }
    );

    return { eventId: response.event_id };
  }

  /**
   * Send a reply to a message
   */
  async sendReply(
    roomId: string,
    eventId: string,
    content: string,
    originalContent?: string
  ): Promise<SendMessageResponse> {
    const txnId = crypto.randomUUID();

    this.logger?.debug(`Sending reply to event ${eventId} in room ${roomId}`);

    const replyBody = originalContent
      ? `> ${originalContent.split("\n").join("\n> ")}\n\n${content}`
      : content;

    const messageContent: MessageContent = {
      msgtype: "m.text",
      body: replyBody,
      format: "org.matrix.custom.html",
      formatted_body: originalContent
        ? `<mx-reply><blockquote>${originalContent}</blockquote></mx-reply>${content}`
        : content,
      "m.relates_to": {
        "m.in_reply_to": {
          event_id: eventId,
        },
      },
    };

    const response = await this.request<{ event_id: string }>(
      "PUT",
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      {
        body: messageContent,
      }
    );

    return { eventId: response.event_id };
  }

  /**
   * Edit a message
   */
  async editMessage(
    roomId: string,
    eventId: string,
    newContent: string
  ): Promise<SendMessageResponse> {
    const txnId = crypto.randomUUID();

    this.logger?.debug(`Editing message ${eventId} in room ${roomId}`);

    const messageContent: MessageContent = {
      msgtype: "m.text",
      body: `* ${newContent}`,
      "m.new_content": {
        msgtype: "m.text",
        body: newContent,
      },
      "m.relates_to": {
        rel_type: "m.replace",
        event_id: eventId,
      },
    };

    const response = await this.request<{ event_id: string }>(
      "PUT",
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      {
        body: messageContent,
      }
    );

    return { eventId: response.event_id };
  }

  /**
   * Redact (delete) a message
   */
  async redactMessage(roomId: string, eventId: string, reason?: string): Promise<void> {
    const txnId = crypto.randomUUID();

    this.logger?.debug(`Redacting message ${eventId} in room ${roomId}`);

    await this.request(
      "PUT",
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/redact/${encodeURIComponent(eventId)}/${txnId}`,
      {
        body: reason ? { reason } : {},
      }
    );
  }

  /**
   * Get messages from a room with pagination
   */
  async getMessages(
    roomId: string,
    limit = 50,
    from?: string,
    direction: "b" | "f" = "b"
  ): Promise<MessagesResponse> {
    this.logger?.debug(`Getting messages from room ${roomId}`);

    const response = await this.request<{
      chunk: Array<{
        event_id: string;
        type: string;
        content: Record<string, unknown>;
        sender: string;
        origin_server_ts: number;
        room_id: string;
        unsigned?: Record<string, unknown>;
      }>;
      start: string;
      end?: string;
      state?: Array<{
        event_id: string;
        type: string;
        content: Record<string, unknown>;
        sender: string;
        origin_server_ts: number;
      }>;
    }>("GET", `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages`, {
      query: {
        limit,
        from,
        dir: direction,
      },
    });

    return {
      chunk: response.chunk.map((e) => ({
        eventId: e.event_id,
        type: e.type,
        content: e.content,
        sender: e.sender,
        originServerTs: e.origin_server_ts,
        roomId: e.room_id,
        unsigned: e.unsigned,
      })),
      start: response.start,
      end: response.end,
      state: response.state?.map((e) => ({
        eventId: e.event_id,
        type: e.type,
        content: e.content,
        sender: e.sender,
        originServerTs: e.origin_server_ts,
      })),
    };
  }

  // ==========================================================================
  // Typing & Read Receipts
  // ==========================================================================

  /**
   * Send typing indicator
   */
  async sendTyping(roomId: string, typing: boolean, timeout = 30000): Promise<void> {
    await this.request(
      "PUT",
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/typing/${encodeURIComponent(this.userId ?? "")}`,
      {
        body: {
          typing,
          timeout: typing ? timeout : undefined,
        },
      }
    );
  }

  /**
   * Send read receipt
   */
  async sendReadReceipt(roomId: string, eventId: string): Promise<void> {
    await this.request(
      "POST",
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/receipt/m.read/${encodeURIComponent(eventId)}`,
      {
        body: {},
      }
    );
  }

  /**
   * Mark room as read
   */
  async markRoomAsRead(roomId: string, eventId: string): Promise<void> {
    await this.request(
      "POST",
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/read_markers`,
      {
        body: {
          "m.fully_read": eventId,
          "m.read": eventId,
        },
      }
    );
  }

  // ==========================================================================
  // Sync
  // ==========================================================================

  /**
   * Start syncing
   */
  async startSync(options: {
    filter?: SyncFilter;
    timeout?: number;
    fullState?: boolean;
  } = {}): Promise<void> {
    if (this.isSyncing) {
      this.logger?.warn("Already syncing");
      return;
    }

    this.isSyncing = true;
    this.logger?.info("Starting sync");

    const syncLoop = async () => {
      while (this.isSyncing) {
        try {
          this.syncAbortController = new AbortController();

          const response = await this.sync({
            since: this.syncToken,
            filter: options.filter,
            timeout: options.timeout ?? 30000,
            fullState: options.fullState,
          });

          this.syncToken = response.nextBatch;
          this.emit("sync", response);

          // Process rooms
          if (response.rooms?.join) {
            for (const [roomId, room] of Object.entries(response.rooms.join)) {
              this.processJoinedRoom(roomId, room);
            }
          }

          if (response.rooms?.invite) {
            for (const [roomId, room] of Object.entries(response.rooms.invite)) {
              this.emit("room.invite", { roomId, inviteState: room.inviteState });
            }
          }

          if (response.rooms?.leave) {
            for (const [roomId] of Object.entries(response.rooms.leave)) {
              this.emit("room.leave", { roomId });
            }
          }

          // Process presence
          if (response.presence?.events) {
            for (const event of response.presence.events) {
              this.emit("presence", event);
            }
          }
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            break;
          }

          this.logger?.error("Sync error:", error);
          this.emit("sync.error", error);

          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
    };

    void syncLoop();
  }

  /**
   * Process joined room data
   */
  private processJoinedRoom(
    roomId: string,
    room: {
      summary?: Record<string, unknown>;
      state?: { events: MatrixEvent[] };
      timeline?: { events: MatrixEvent[]; limited?: boolean; prevBatch?: string };
      ephemeral?: { events: MatrixEvent[] };
      accountData?: { events: MatrixEvent[] };
      unreadNotifications?: { highlightCount?: number; notificationCount?: number };
    }
  ): void {
    // Process timeline events
    if (room.timeline?.events) {
      for (const event of room.timeline.events) {
        if (event.type === "m.room.message") {
          this.emit("room.message", { roomId, event });
        } else if (event.type === "m.room.encrypted") {
          this.emit("room.encrypted", { roomId, event });
        } else if (event.type === "m.reaction") {
          this.emit("room.reaction", { roomId, event });
        }
      }
    }

    // Process ephemeral events (typing, read receipts)
    if (room.ephemeral?.events) {
      for (const event of room.ephemeral.events) {
        if (event.type === "m.typing") {
          this.emit("room.typing", { roomId, userIds: event.content?.["user_ids"] ?? [] });
        } else if (event.type === "m.receipt") {
          this.emit("room.receipt", { roomId, content: event.content });
        }
      }
    }

    // Emit unread notifications
    if (room.unreadNotifications) {
      this.emit("room.unread", {
        roomId,
        notificationCount: room.unreadNotifications.notificationCount ?? 0,
        highlightCount: room.unreadNotifications.highlightCount ?? 0,
      });
    }
  }

  /**
   * Stop syncing
   */
  stopSync(): void {
    this.isSyncing = false;
    this.syncAbortController?.abort();
    this.logger?.info("Stopped sync");
  }

  /**
   * Perform a single sync
   */
  async sync(options: {
    since?: string;
    filter?: SyncFilter;
    timeout?: number;
    fullState?: boolean;
  } = {}): Promise<SyncResponse> {
    const response = await this.request<{
      next_batch: string;
      rooms?: {
        join?: Record<
          string,
          {
            summary?: Record<string, unknown>;
            state?: { events: unknown[] };
            timeline?: { events: unknown[]; limited?: boolean; prev_batch?: string };
            ephemeral?: { events: unknown[] };
            account_data?: { events: unknown[] };
            unread_notifications?: {
              highlight_count?: number;
              notification_count?: number;
            };
          }
        >;
        invite?: Record<string, { invite_state?: { events: unknown[] } }>;
        leave?: Record<string, unknown>;
      };
      presence?: { events: unknown[] };
      account_data?: { events: unknown[] };
      to_device?: { events: unknown[] };
      device_lists?: { changed?: string[]; left?: string[] };
    }>("GET", "/_matrix/client/v3/sync", {
      query: {
        since: options.since,
        filter: options.filter ? JSON.stringify(options.filter) : undefined,
        timeout: options.timeout ?? 30000,
        full_state: options.fullState,
      },
      timeout: (options.timeout ?? 30000) + 10000, // Add buffer for HTTP overhead
    });

    return {
      nextBatch: response.next_batch,
      rooms: response.rooms
        ? {
            join: response.rooms.join
              ? Object.fromEntries(
                  Object.entries(response.rooms.join).map(([roomId, room]) => [
                    roomId,
                    {
                      summary: room.summary,
                      state: room.state as { events: MatrixEvent[] },
                      timeline: room.timeline as {
                        events: MatrixEvent[];
                        limited?: boolean;
                        prevBatch?: string;
                      },
                      ephemeral: room.ephemeral as { events: MatrixEvent[] },
                      accountData: room.account_data as { events: MatrixEvent[] },
                      unreadNotifications: room.unread_notifications
                        ? {
                            highlightCount: room.unread_notifications.highlight_count,
                            notificationCount: room.unread_notifications.notification_count,
                          }
                        : undefined,
                    },
                  ])
                )
              : undefined,
            invite: response.rooms.invite
              ? Object.fromEntries(
                  Object.entries(response.rooms.invite).map(([roomId, room]) => [
                    roomId,
                    {
                      inviteState: room.invite_state as { events: MatrixEvent[] },
                    },
                  ])
                )
              : undefined,
            leave: response.rooms.leave as Record<string, unknown>,
          }
        : undefined,
      presence: response.presence as { events: MatrixEvent[] },
      accountData: response.account_data as { events: MatrixEvent[] },
      toDevice: response.to_device as { events: MatrixEvent[] },
      deviceLists: response.device_lists,
    };
  }

  // ==========================================================================
  // Encryption (Megolm)
  // ==========================================================================

  /**
   * Enable encryption for the client
   */
  async enableEncryption(): Promise<void> {
    this.logger?.info("Enabling encryption");

    // Upload device keys
    await this.uploadDeviceKeys();

    this.isEncryptionEnabled = true;
  }

  /**
   * Upload device keys
   */
  private async uploadDeviceKeys(): Promise<void> {
    if (!this.userId || !this.deviceId) {
      throw new Error("Not logged in");
    }

    // Generate device keys (simplified - in production use proper crypto library)
    const ed25519Key = `ed25519:${this.deviceId}`;
    const curve25519Key = `curve25519:${this.deviceId}`;

    this.deviceKeys = {
      deviceId: this.deviceId,
      userId: this.userId,
      algorithms: ["m.olm.v1.curve25519-aes-sha2", "m.megolm.v1.aes-sha2"],
      keys: {
        [ed25519Key]: `placeholder_ed25519_key_${crypto.randomUUID()}`,
        [curve25519Key]: `placeholder_curve25519_key_${crypto.randomUUID()}`,
      },
      displayName: "PULL Client",
    };

    await this.request("POST", "/_matrix/client/v3/keys/upload", {
      body: {
        device_keys: {
          user_id: this.userId,
          device_id: this.deviceId,
          algorithms: this.deviceKeys.algorithms,
          keys: this.deviceKeys.keys,
        },
      },
    });

    this.logger?.info("Device keys uploaded");
  }

  /**
   * Enable encryption for a room
   */
  async enableRoomEncryption(roomId: string): Promise<void> {
    this.logger?.info(`Enabling encryption for room ${roomId}`);

    await this.request(
      "PUT",
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.encryption`,
      {
        body: {
          algorithm: "m.megolm.v1.aes-sha2",
          rotation_period_ms: 604800000, // 1 week
          rotation_period_msgs: 100,
        },
      }
    );
  }

  /**
   * Encrypt a message (simplified implementation)
   */
  private async encryptMessage(
    roomId: string,
    content: MessageContent
  ): Promise<EncryptedContent> {
    // Get or create megolm session for room
    let session = this.megolmSessions.get(roomId);

    if (!session) {
      session = await this.createMegolmSession(roomId);
    }

    // Simplified encryption (in production use proper megolm library)
    const ciphertext = Buffer.from(JSON.stringify(content)).toString("base64");

    return {
      algorithm: "m.megolm.v1.aes-sha2",
      senderKey: this.deviceKeys?.keys[`curve25519:${this.deviceId}`] ?? "",
      ciphertext,
      sessionId: session.sessionId,
      deviceId: this.deviceId,
    };
  }

  /**
   * Create a Megolm session for a room
   */
  private async createMegolmSession(roomId: string): Promise<MegolmSession> {
    const session: MegolmSession = {
      sessionId: crypto.randomUUID(),
      roomId,
      senderKey: this.deviceKeys?.keys[`curve25519:${this.deviceId}`] ?? "",
      forwardingCurve25519KeyChain: [],
      firstKnownIndex: 0,
      exported: false,
    };

    this.megolmSessions.set(roomId, session);

    // Share session with room members
    await this.shareRoomKey(roomId, session);

    return session;
  }

  /**
   * Share room key with members
   */
  private async shareRoomKey(roomId: string, session: MegolmSession): Promise<void> {
    this.logger?.debug(`Sharing room key for ${roomId}`);

    // Get room members
    const members = await this.getRoomMembers(roomId, { membership: "join" });

    // In production, this would encrypt the session key for each device
    // and send via to_device messages
    for (const member of members) {
      if (member.userId !== this.userId) {
        this.logger?.debug(`Would share key with ${member.userId}`);
      }
    }
  }

  /**
   * Decrypt a message (simplified implementation)
   */
  async decryptMessage(
    roomId: string,
    content: EncryptedContent
  ): Promise<MessageContent | null> {
    const session = this.megolmSessions.get(roomId);

    if (!session || session.sessionId !== content.sessionId) {
      this.logger?.warn(`No session found for room ${roomId}`);
      return null;
    }

    try {
      // Simplified decryption
      const decrypted = Buffer.from(content.ciphertext as string, "base64").toString();
      return JSON.parse(decrypted) as MessageContent;
    } catch (error) {
      this.logger?.error("Decryption failed:", error);
      return null;
    }
  }

  // ==========================================================================
  // User Profile
  // ==========================================================================

  /**
   * Get user profile
   */
  async getUserProfile(userId: string): Promise<{
    displayName?: string;
    avatarUrl?: string;
  }> {
    const response = await this.request<{
      displayname?: string;
      avatar_url?: string;
    }>("GET", `/_matrix/client/v3/profile/${encodeURIComponent(userId)}`);

    return {
      displayName: response.displayname,
      avatarUrl: response.avatar_url,
    };
  }

  /**
   * Set display name
   */
  async setDisplayName(displayName: string): Promise<void> {
    if (!this.userId) {
      throw new Error("Not logged in");
    }

    await this.request(
      "PUT",
      `/_matrix/client/v3/profile/${encodeURIComponent(this.userId)}/displayname`,
      {
        body: { displayname: displayName },
      }
    );
  }

  /**
   * Set avatar URL
   */
  async setAvatarUrl(avatarUrl: string): Promise<void> {
    if (!this.userId) {
      throw new Error("Not logged in");
    }

    await this.request(
      "PUT",
      `/_matrix/client/v3/profile/${encodeURIComponent(this.userId)}/avatar_url`,
      {
        body: { avatar_url: avatarUrl },
      }
    );
  }

  // ==========================================================================
  // Media
  // ==========================================================================

  /**
   * Upload media
   */
  async uploadMedia(
    content: Blob | ArrayBuffer,
    contentType: string,
    filename?: string
  ): Promise<{ contentUri: string }> {
    const url = new URL(`${this.baseUrl}/_matrix/media/v3/upload`);
    if (filename) {
      url.searchParams.set("filename", filename);
    }

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: content,
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as MatrixErrorResponse;
      throw new MatrixApiError(
        errorData.error ?? `HTTP ${response.status}`,
        errorData.errcode ?? "M_UNKNOWN",
        response.status
      );
    }

    const data = (await response.json()) as { content_uri: string };

    return { contentUri: data.content_uri };
  }

  /**
   * Get media download URL
   */
  getMediaUrl(mxcUrl: string): string {
    const match = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/);
    if (!match) {
      throw new Error("Invalid mxc URL");
    }

    const [, serverName, mediaId] = match;
    return `${this.baseUrl}/_matrix/media/v3/download/${serverName}/${mediaId}`;
  }

  /**
   * Get media thumbnail URL
   */
  getThumbnailUrl(
    mxcUrl: string,
    width: number,
    height: number,
    method: "crop" | "scale" = "scale"
  ): string {
    const match = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/);
    if (!match) {
      throw new Error("Invalid mxc URL");
    }

    const [, serverName, mediaId] = match;
    return `${this.baseUrl}/_matrix/media/v3/thumbnail/${serverName}/${mediaId}?width=${width}&height=${height}&method=${method}`;
  }

  // ==========================================================================
  // Getters
  // ==========================================================================

  get currentUserId(): string | undefined {
    return this.userId;
  }

  get currentDeviceId(): string | undefined {
    return this.deviceId;
  }

  get isLoggedIn(): boolean {
    return !!this.accessToken;
  }

  get encryptionEnabled(): boolean {
    return this.isEncryptionEnabled;
  }
}
