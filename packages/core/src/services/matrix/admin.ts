/**
 * Matrix Admin API Service
 * Synapse Admin API client for server administration
 */

import type {
  MatrixAdminConfig,
  Logger,
  AdminUserInfo,
  AdminRoomInfo,
  AdminListRoomsResponse,
  AdminRoomMembersResponse,
  AdminCreateUserRequest,
  MatrixErrorResponse,
} from "./types";
import { MatrixApiError } from "./client";

// ============================================================================
// Matrix Admin Client
// ============================================================================

export class MatrixAdminClient {
  private readonly baseUrl: string;
  private readonly adminToken: string;
  private readonly timeout: number;
  private readonly logger: Logger | undefined;

  constructor(config: MatrixAdminConfig) {
    this.baseUrl = config.homeserverUrl.replace(/\/$/, "");
    this.adminToken = config.adminToken;
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
      timeout?: number;
    } = {}
  ): Promise<T> {
    const { body, query, timeout = this.timeout } = options;

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
      Authorization: `Bearer ${this.adminToken}`,
    };

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      this.logger?.debug(`Matrix Admin API: ${method} ${path}`);

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
  // User Management
  // ==========================================================================

  /**
   * Create a new user
   */
  async createUser(
    username: string,
    password: string,
    admin = false,
    options: {
      displayname?: string;
      avatarUrl?: string;
      threepids?: Array<{ medium: "email" | "msisdn"; address: string }>;
    } = {}
  ): Promise<AdminUserInfo> {
    this.logger?.info(`Creating user: ${username}`);

    const userId = `@${username}:${new URL(this.baseUrl).hostname}`;

    const requestBody: AdminCreateUserRequest = {
      password,
      admin,
      displayname: options.displayname,
      avatarUrl: options.avatarUrl,
      threepids: options.threepids,
    };

    await this.request<void>(
      "PUT",
      `/_synapse/admin/v2/users/${encodeURIComponent(userId)}`,
      {
        body: requestBody,
      }
    );

    return this.getUser(userId);
  }

  /**
   * Get user information
   */
  async getUser(userId: string): Promise<AdminUserInfo> {
    this.logger?.debug(`Getting user: ${userId}`);

    const response = await this.request<{
      name: string;
      displayname?: string;
      avatar_url?: string;
      admin: number;
      deactivated: number;
      shadow_banned: number;
      creation_ts: number;
      consent_server_notice_sent?: string;
      consent_ts?: number;
    }>("GET", `/_synapse/admin/v2/users/${encodeURIComponent(userId)}`);

    return {
      name: response.name,
      displayname: response.displayname,
      avatarUrl: response.avatar_url,
      admin: response.admin === 1,
      deactivated: response.deactivated === 1,
      shadowBanned: response.shadow_banned === 1,
      creationTs: response.creation_ts,
      consent_server_notice_sent: response.consent_server_notice_sent,
      consent_ts: response.consent_ts,
    };
  }

  /**
   * List all users
   */
  async listUsers(options: {
    from?: number;
    limit?: number;
    guests?: boolean;
    deactivated?: boolean;
    name?: string;
    userIds?: string[];
  } = {}): Promise<{
    users: AdminUserInfo[];
    total: number;
    nextToken?: string;
  }> {
    this.logger?.debug("Listing users");

    const response = await this.request<{
      users: Array<{
        name: string;
        displayname?: string;
        avatar_url?: string;
        admin: number;
        deactivated: number;
        shadow_banned: number;
        creation_ts: number;
      }>;
      total: number;
      next_token?: string;
    }>("GET", "/_synapse/admin/v2/users", {
      query: {
        from: options.from,
        limit: options.limit ?? 100,
        guests: options.guests,
        deactivated: options.deactivated,
        name: options.name,
        user_id: options.userIds?.join(","),
      },
    });

    return {
      users: response.users.map((u) => ({
        name: u.name,
        displayname: u.displayname,
        avatarUrl: u.avatar_url,
        admin: u.admin === 1,
        deactivated: u.deactivated === 1,
        shadowBanned: u.shadow_banned === 1,
        creationTs: u.creation_ts,
      })),
      total: response.total,
      nextToken: response.next_token,
    };
  }

  /**
   * Deactivate a user
   */
  async deactivateUser(
    userId: string,
    options: {
      erase?: boolean;
    } = {}
  ): Promise<void> {
    this.logger?.info(`Deactivating user: ${userId}`);

    await this.request(
      "POST",
      `/_synapse/admin/v1/deactivate/${encodeURIComponent(userId)}`,
      {
        body: {
          erase: options.erase ?? false,
        },
      }
    );
  }

  /**
   * Reactivate a user
   */
  async reactivateUser(userId: string, password: string): Promise<void> {
    this.logger?.info(`Reactivating user: ${userId}`);

    await this.request(
      "PUT",
      `/_synapse/admin/v2/users/${encodeURIComponent(userId)}`,
      {
        body: {
          deactivated: false,
          password,
        },
      }
    );
  }

  /**
   * Reset user password
   */
  async resetPassword(
    userId: string,
    newPassword: string,
    options: {
      logoutDevices?: boolean;
    } = {}
  ): Promise<void> {
    this.logger?.info(`Resetting password for user: ${userId}`);

    await this.request(
      "POST",
      `/_synapse/admin/v1/reset_password/${encodeURIComponent(userId)}`,
      {
        body: {
          new_password: newPassword,
          logout_devices: options.logoutDevices ?? true,
        },
      }
    );
  }

  /**
   * Set user as admin or remove admin
   */
  async setAdmin(userId: string, admin: boolean): Promise<void> {
    this.logger?.info(`Setting admin status for ${userId}: ${admin}`);

    await this.request(
      "PUT",
      `/_synapse/admin/v2/users/${encodeURIComponent(userId)}`,
      {
        body: { admin },
      }
    );
  }

  /**
   * Shadow ban a user
   */
  async shadowBanUser(userId: string): Promise<void> {
    this.logger?.info(`Shadow banning user: ${userId}`);

    await this.request(
      "POST",
      `/_synapse/admin/v1/users/${encodeURIComponent(userId)}/shadow_ban`
    );
  }

  /**
   * Remove shadow ban from user
   */
  async removeShadowBan(userId: string): Promise<void> {
    this.logger?.info(`Removing shadow ban from user: ${userId}`);

    await this.request(
      "DELETE",
      `/_synapse/admin/v1/users/${encodeURIComponent(userId)}/shadow_ban`
    );
  }

  /**
   * Get user's devices
   */
  async getUserDevices(userId: string): Promise<
    Array<{
      deviceId: string;
      displayName?: string;
      lastSeenIp?: string;
      lastSeenTs?: number;
    }>
  > {
    this.logger?.debug(`Getting devices for user: ${userId}`);

    const response = await this.request<{
      devices: Array<{
        device_id: string;
        display_name?: string;
        last_seen_ip?: string;
        last_seen_ts?: number;
      }>;
    }>("GET", `/_synapse/admin/v2/users/${encodeURIComponent(userId)}/devices`);

    return response.devices.map((d) => ({
      deviceId: d.device_id,
      displayName: d.display_name,
      lastSeenIp: d.last_seen_ip,
      lastSeenTs: d.last_seen_ts,
    }));
  }

  /**
   * Delete user device
   */
  async deleteUserDevice(userId: string, deviceId: string): Promise<void> {
    this.logger?.info(`Deleting device ${deviceId} for user ${userId}`);

    await this.request(
      "DELETE",
      `/_synapse/admin/v2/users/${encodeURIComponent(userId)}/devices/${encodeURIComponent(deviceId)}`
    );
  }

  /**
   * Get rooms a user is a member of
   */
  async getUserRooms(userId: string): Promise<{
    joinedRooms: string[];
    total: number;
  }> {
    this.logger?.debug(`Getting rooms for user: ${userId}`);

    const response = await this.request<{
      joined_rooms: string[];
      total: number;
    }>("GET", `/_synapse/admin/v1/users/${encodeURIComponent(userId)}/joined_rooms`);

    return {
      joinedRooms: response.joined_rooms,
      total: response.total,
    };
  }

  /**
   * Force user to join a room
   */
  async forceJoinRoom(userId: string, roomId: string): Promise<void> {
    this.logger?.info(`Forcing ${userId} to join room ${roomId}`);

    await this.request(
      "POST",
      `/_synapse/admin/v1/join/${encodeURIComponent(roomId)}`,
      {
        body: { user_id: userId },
      }
    );
  }

  // ==========================================================================
  // Room Management
  // ==========================================================================

  /**
   * List all rooms
   */
  async listRooms(options: {
    from?: number;
    limit?: number;
    orderBy?: "name" | "canonical_alias" | "joined_members" | "joined_local_members" | "version" | "creator" | "encryption" | "federatable" | "public" | "join_rules" | "guest_access" | "history_visibility" | "state_events";
    direction?: "f" | "b";
    searchTerm?: string;
  } = {}): Promise<AdminListRoomsResponse> {
    this.logger?.debug("Listing rooms");

    const response = await this.request<{
      rooms: Array<{
        room_id: string;
        name?: string;
        canonical_alias?: string;
        joined_members: number;
        joined_local_members: number;
        version: string;
        creator: string;
        encryption?: string;
        federatable: boolean;
        public: boolean;
        join_rules?: string;
        guest_access?: string;
        history_visibility?: string;
        state_events: number;
      }>;
      offset: number;
      total_rooms: number;
      next_batch?: string;
      prev_batch?: string;
    }>("GET", "/_synapse/admin/v1/rooms", {
      query: {
        from: options.from,
        limit: options.limit ?? 100,
        order_by: options.orderBy,
        dir: options.direction,
        search_term: options.searchTerm,
      },
    });

    return {
      rooms: response.rooms.map((r) => ({
        roomId: r.room_id,
        name: r.name,
        canonicalAlias: r.canonical_alias,
        joinedMembers: r.joined_members,
        joinedLocalMembers: r.joined_local_members,
        version: r.version,
        creator: r.creator,
        encryption: r.encryption,
        federatable: r.federatable,
        public: r.public,
        joinRules: r.join_rules,
        guestAccess: r.guest_access,
        historyVisibility: r.history_visibility,
        stateEvents: r.state_events,
      })),
      offset: response.offset,
      totalRooms: response.total_rooms,
      nextBatch: response.next_batch,
      prevBatch: response.prev_batch,
    };
  }

  /**
   * Get room details
   */
  async getRoom(roomId: string): Promise<AdminRoomInfo> {
    this.logger?.debug(`Getting room: ${roomId}`);

    const response = await this.request<{
      room_id: string;
      name?: string;
      canonical_alias?: string;
      joined_members: number;
      joined_local_members: number;
      version: string;
      creator: string;
      encryption?: string;
      federatable: boolean;
      public: boolean;
      join_rules?: string;
      guest_access?: string;
      history_visibility?: string;
      state_events: number;
    }>("GET", `/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}`);

    return {
      roomId: response.room_id,
      name: response.name,
      canonicalAlias: response.canonical_alias,
      joinedMembers: response.joined_members,
      joinedLocalMembers: response.joined_local_members,
      version: response.version,
      creator: response.creator,
      encryption: response.encryption,
      federatable: response.federatable,
      public: response.public,
      joinRules: response.join_rules,
      guestAccess: response.guest_access,
      historyVisibility: response.history_visibility,
      stateEvents: response.state_events,
    };
  }

  /**
   * Get room members
   */
  async getRoomMembers(roomId: string): Promise<AdminRoomMembersResponse> {
    this.logger?.debug(`Getting members of room: ${roomId}`);

    const response = await this.request<{
      members: string[];
      total: number;
    }>("GET", `/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/members`);

    return {
      members: response.members,
      total: response.total,
    };
  }

  /**
   * Get room state
   */
  async getRoomState(roomId: string): Promise<
    Array<{
      type: string;
      stateKey: string;
      content: Record<string, unknown>;
      sender: string;
      originServerTs: number;
    }>
  > {
    this.logger?.debug(`Getting state of room: ${roomId}`);

    const response = await this.request<{
      state: Array<{
        type: string;
        state_key: string;
        content: Record<string, unknown>;
        sender: string;
        origin_server_ts: number;
      }>;
    }>("GET", `/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/state`);

    return response.state.map((s) => ({
      type: s.type,
      stateKey: s.state_key,
      content: s.content,
      sender: s.sender,
      originServerTs: s.origin_server_ts,
    }));
  }

  /**
   * Delete a room
   */
  async deleteRoom(
    roomId: string,
    options: {
      newRoomUserId?: string;
      roomName?: string;
      message?: string;
      block?: boolean;
      purge?: boolean;
      forceUsers?: boolean;
    } = {}
  ): Promise<{
    kickedUsers: string[];
    failedToKickUsers: string[];
    localAliases: string[];
    newRoomId?: string;
  }> {
    this.logger?.info(`Deleting room: ${roomId}`);

    const response = await this.request<{
      kicked_users: string[];
      failed_to_kick_users: string[];
      local_aliases: string[];
      new_room_id?: string;
    }>("DELETE", `/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}`, {
      body: {
        new_room_user_id: options.newRoomUserId,
        room_name: options.roomName ?? "Content Violation",
        message: options.message ?? "This room has been deleted.",
        block: options.block ?? false,
        purge: options.purge ?? true,
        force_users: options.forceUsers ?? false,
      },
    });

    return {
      kickedUsers: response.kicked_users,
      failedToKickUsers: response.failed_to_kick_users,
      localAliases: response.local_aliases,
      newRoomId: response.new_room_id,
    };
  }

  /**
   * Block a room
   */
  async blockRoom(roomId: string): Promise<void> {
    this.logger?.info(`Blocking room: ${roomId}`);

    await this.request(
      "PUT",
      `/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/block`,
      {
        body: { block: true },
      }
    );
  }

  /**
   * Unblock a room
   */
  async unblockRoom(roomId: string): Promise<void> {
    this.logger?.info(`Unblocking room: ${roomId}`);

    await this.request(
      "PUT",
      `/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/block`,
      {
        body: { block: false },
      }
    );
  }

  /**
   * Make user a room admin
   */
  async makeRoomAdmin(roomId: string, userId: string): Promise<void> {
    this.logger?.info(`Making ${userId} admin of room ${roomId}`);

    await this.request(
      "POST",
      `/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/make_room_admin`,
      {
        body: { user_id: userId },
      }
    );
  }

  // ==========================================================================
  // Server Management
  // ==========================================================================

  /**
   * Get server version
   */
  async getServerVersion(): Promise<{
    serverVersion: string;
    pythonVersion: string;
  }> {
    this.logger?.debug("Getting server version");

    const response = await this.request<{
      server_version: string;
      python_version: string;
    }>("GET", "/_synapse/admin/v1/server_version");

    return {
      serverVersion: response.server_version,
      pythonVersion: response.python_version,
    };
  }

  /**
   * Purge room history
   */
  async purgeRoomHistory(
    roomId: string,
    options: {
      purgeUpToEventId?: string;
      purgeUpToTs?: number;
      deleteLocalEvents?: boolean;
    }
  ): Promise<{ purgeId: string }> {
    this.logger?.info(`Purging history for room: ${roomId}`);

    const response = await this.request<{ purge_id: string }>(
      "POST",
      `/_synapse/admin/v1/purge_history/${encodeURIComponent(roomId)}`,
      {
        body: {
          purge_up_to_event_id: options.purgeUpToEventId,
          purge_up_to_ts: options.purgeUpToTs,
          delete_local_events: options.deleteLocalEvents ?? false,
        },
      }
    );

    return { purgeId: response.purge_id };
  }

  /**
   * Get purge status
   */
  async getPurgeStatus(purgeId: string): Promise<{
    status: "active" | "complete" | "failed";
  }> {
    const response = await this.request<{ status: "active" | "complete" | "failed" }>(
      "GET",
      `/_synapse/admin/v1/purge_history_status/${encodeURIComponent(purgeId)}`
    );

    return { status: response.status };
  }

  /**
   * Get registration tokens
   */
  async getRegistrationTokens(): Promise<
    Array<{
      token: string;
      usesAllowed?: number;
      pending: number;
      completed: number;
      expiryTime?: number;
    }>
  > {
    this.logger?.debug("Getting registration tokens");

    const response = await this.request<{
      registration_tokens: Array<{
        token: string;
        uses_allowed?: number;
        pending: number;
        completed: number;
        expiry_time?: number;
      }>;
    }>("GET", "/_synapse/admin/v1/registration_tokens");

    return response.registration_tokens.map((t) => ({
      token: t.token,
      usesAllowed: t.uses_allowed,
      pending: t.pending,
      completed: t.completed,
      expiryTime: t.expiry_time,
    }));
  }

  /**
   * Create a registration token
   */
  async createRegistrationToken(options: {
    token?: string;
    usesAllowed?: number;
    expiryTime?: number;
    length?: number;
  } = {}): Promise<{
    token: string;
    usesAllowed?: number;
    pending: number;
    completed: number;
    expiryTime?: number;
  }> {
    this.logger?.info("Creating registration token");

    const response = await this.request<{
      token: string;
      uses_allowed?: number;
      pending: number;
      completed: number;
      expiry_time?: number;
    }>("POST", "/_synapse/admin/v1/registration_tokens/new", {
      body: {
        token: options.token,
        uses_allowed: options.usesAllowed,
        expiry_time: options.expiryTime,
        length: options.length ?? 16,
      },
    });

    return {
      token: response.token,
      usesAllowed: response.uses_allowed,
      pending: response.pending,
      completed: response.completed,
      expiryTime: response.expiry_time,
    };
  }

  /**
   * Delete a registration token
   */
  async deleteRegistrationToken(token: string): Promise<void> {
    this.logger?.info(`Deleting registration token: ${token}`);

    await this.request(
      "DELETE",
      `/_synapse/admin/v1/registration_tokens/${encodeURIComponent(token)}`
    );
  }

  // ==========================================================================
  // Media Management
  // ==========================================================================

  /**
   * Get media statistics
   */
  async getMediaStatistics(): Promise<{
    users: Record<
      string,
      {
        mediaCount: number;
        mediaLength: number;
      }
    >;
  }> {
    this.logger?.debug("Getting media statistics");

    const response = await this.request<{
      users: Record<
        string,
        {
          media_count: number;
          media_length: number;
        }
      >;
    }>("GET", "/_synapse/admin/v1/statistics/users/media");

    return {
      users: Object.fromEntries(
        Object.entries(response.users).map(([userId, stats]) => [
          userId,
          {
            mediaCount: stats.media_count,
            mediaLength: stats.media_length,
          },
        ])
      ),
    };
  }

  /**
   * Delete local media older than
   */
  async deleteOldMedia(options: {
    beforeTs?: number;
    sizeGt?: number;
    keepProfiles?: boolean;
  } = {}): Promise<{
    deletedMedia: number;
    total: number;
  }> {
    this.logger?.info("Deleting old media");

    const response = await this.request<{
      deleted_media: number;
      total: number;
    }>("POST", "/_synapse/admin/v1/media/delete", {
      query: {
        before_ts: options.beforeTs,
        size_gt: options.sizeGt,
        keep_profiles: options.keepProfiles,
      },
    });

    return {
      deletedMedia: response.deleted_media,
      total: response.total,
    };
  }

  /**
   * Quarantine media in a room
   */
  async quarantineRoomMedia(roomId: string): Promise<{
    numQuarantined: number;
  }> {
    this.logger?.info(`Quarantining media in room: ${roomId}`);

    const response = await this.request<{ num_quarantined: number }>(
      "POST",
      `/_synapse/admin/v1/room/${encodeURIComponent(roomId)}/media/quarantine`
    );

    return { numQuarantined: response.num_quarantined };
  }

  /**
   * Quarantine media by user
   */
  async quarantineUserMedia(userId: string): Promise<{
    numQuarantined: number;
  }> {
    this.logger?.info(`Quarantining media by user: ${userId}`);

    const response = await this.request<{ num_quarantined: number }>(
      "POST",
      `/_synapse/admin/v1/user/${encodeURIComponent(userId)}/media/quarantine`
    );

    return { numQuarantined: response.num_quarantined };
  }

  // ==========================================================================
  // Event Reports
  // ==========================================================================

  /**
   * Get event reports
   */
  async getEventReports(options: {
    from?: number;
    limit?: number;
    direction?: "f" | "b";
    userId?: string;
    roomId?: string;
  } = {}): Promise<{
    reports: Array<{
      id: number;
      receivedTs: number;
      roomId: string;
      eventId: string;
      userId: string;
      reason?: string;
      score?: number;
      sender: string;
      canonicalAlias?: string;
      name?: string;
    }>;
    nextToken?: number;
    total: number;
  }> {
    this.logger?.debug("Getting event reports");

    const response = await this.request<{
      event_reports: Array<{
        id: number;
        received_ts: number;
        room_id: string;
        event_id: string;
        user_id: string;
        reason?: string;
        score?: number;
        sender: string;
        canonical_alias?: string;
        name?: string;
      }>;
      next_token?: number;
      total: number;
    }>("GET", "/_synapse/admin/v1/event_reports", {
      query: {
        from: options.from,
        limit: options.limit ?? 100,
        dir: options.direction,
        user_id: options.userId,
        room_id: options.roomId,
      },
    });

    return {
      reports: response.event_reports.map((r) => ({
        id: r.id,
        receivedTs: r.received_ts,
        roomId: r.room_id,
        eventId: r.event_id,
        userId: r.user_id,
        reason: r.reason,
        score: r.score,
        sender: r.sender,
        canonicalAlias: r.canonical_alias,
        name: r.name,
      })),
      nextToken: response.next_token,
      total: response.total,
    };
  }

  /**
   * Delete an event report
   */
  async deleteEventReport(reportId: number): Promise<void> {
    this.logger?.info(`Deleting event report: ${reportId}`);

    await this.request(
      "DELETE",
      `/_synapse/admin/v1/event_reports/${reportId}`
    );
  }
}
