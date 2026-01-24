/**
 * Matrix Service Types
 * Types for Matrix client, admin, and bridge services
 */

// ============================================================================
// Configuration
// ============================================================================

/** Matrix client configuration */
export interface MatrixConfig {
  homeserverUrl: string;
  accessToken?: string;
  userId?: string;
  deviceId?: string;
  timeout?: number;
  logger?: Logger;
}

/** Matrix admin configuration */
export interface MatrixAdminConfig {
  homeserverUrl: string;
  adminToken: string;
  timeout?: number;
  logger?: Logger;
}

/** Logger interface */
export interface Logger {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
}

// ============================================================================
// Authentication
// ============================================================================

/** Registration response */
export interface RegisterResponse {
  userId: string;
  accessToken: string;
  deviceId: string;
  homeServer: string;
}

/** Login response */
export interface LoginResponse {
  userId: string;
  accessToken: string;
  deviceId: string;
  homeServer: string;
  wellKnown?: WellKnown;
}

/** Well-known discovery */
export interface WellKnown {
  "m.homeserver": {
    base_url: string;
  };
  "m.identity_server"?: {
    base_url: string;
  };
}

// ============================================================================
// Rooms
// ============================================================================

/** Room creation options */
export interface CreateRoomOptions {
  name?: string;
  topic?: string;
  roomAliasName?: string;
  visibility?: "public" | "private";
  preset?: "private_chat" | "public_chat" | "trusted_private_chat";
  isDirect?: boolean;
  invite?: string[];
  initialState?: StateEvent[];
  creationContent?: Record<string, unknown>;
  powerLevelContentOverride?: PowerLevelContent;
}

/** Create room response */
export interface CreateRoomResponse {
  roomId: string;
  roomAlias?: string;
}

/** Room state event */
export interface StateEvent {
  type: string;
  stateKey?: string;
  content: Record<string, unknown>;
}

/** Power level content */
export interface PowerLevelContent {
  users?: Record<string, number>;
  usersDefault?: number;
  events?: Record<string, number>;
  eventsDefault?: number;
  stateDefault?: number;
  ban?: number;
  kick?: number;
  redact?: number;
  invite?: number;
  notifications?: {
    room?: number;
  };
}

/** Room info */
export interface RoomInfo {
  roomId: string;
  name?: string;
  topic?: string;
  avatarUrl?: string;
  canonicalAlias?: string;
  joinedMemberCount?: number;
  invitedMemberCount?: number;
  joinRule?: "public" | "invite" | "knock" | "restricted";
  guestAccess?: "can_join" | "forbidden";
  historyVisibility?: "shared" | "invited" | "joined" | "world_readable";
  isEncrypted: boolean;
  creator?: string;
  creationTs?: number;
}

/** Room summary from sync */
export interface RoomSummary {
  roomId: string;
  name?: string;
  topic?: string;
  avatarUrl?: string;
  isDirect: boolean;
  isEncrypted: boolean;
  unreadCount: number;
  highlightCount: number;
  lastEvent?: MatrixEvent;
  membership: "join" | "invite" | "leave" | "ban";
}

/** Joined rooms response */
export interface JoinedRoomsResponse {
  joinedRooms: string[];
}

// ============================================================================
// Members
// ============================================================================

/** Room member */
export interface RoomMember {
  userId: string;
  displayName?: string;
  avatarUrl?: string;
  membership: "invite" | "join" | "leave" | "ban" | "knock";
  powerLevel: number;
}

/** Member event */
export interface MemberEvent {
  type: "m.room.member";
  stateKey: string;
  content: {
    membership: "invite" | "join" | "leave" | "ban" | "knock";
    displayname?: string;
    avatar_url?: string;
    reason?: string;
    is_direct?: boolean;
  };
  sender: string;
  originServerTs: number;
}

// ============================================================================
// Messages
// ============================================================================

/** Message content */
export interface MessageContent {
  msgtype: string;
  body: string;
  format?: string;
  formatted_body?: string;
  "m.relates_to"?: RelatesTo;
  "m.new_content"?: MessageContent;
}

/** Text message content */
export interface TextMessageContent extends MessageContent {
  msgtype: "m.text";
}

/** Notice message content */
export interface NoticeMessageContent extends MessageContent {
  msgtype: "m.notice";
}

/** Emote message content */
export interface EmoteMessageContent extends MessageContent {
  msgtype: "m.emote";
}

/** Image message content */
export interface ImageMessageContent extends MessageContent {
  msgtype: "m.image";
  url: string;
  info?: MediaInfo;
}

/** File message content */
export interface FileMessageContent extends MessageContent {
  msgtype: "m.file";
  url: string;
  filename: string;
  info?: FileInfo;
}

/** Media info */
export interface MediaInfo {
  mimetype?: string;
  size?: number;
  w?: number;
  h?: number;
  duration?: number;
  thumbnail_url?: string;
  thumbnail_info?: ThumbnailInfo;
}

/** File info */
export interface FileInfo {
  mimetype?: string;
  size?: number;
}

/** Thumbnail info */
export interface ThumbnailInfo {
  mimetype?: string;
  size?: number;
  w?: number;
  h?: number;
}

/** Relates to field */
export interface RelatesTo {
  "m.in_reply_to"?: {
    event_id: string;
  };
  rel_type?: "m.annotation" | "m.replace" | "m.thread";
  event_id?: string;
  key?: string;
}

/** Reaction content */
export interface ReactionContent {
  "m.relates_to": {
    rel_type: "m.annotation";
    event_id: string;
    key: string;
  };
}

/** Send message response */
export interface SendMessageResponse {
  eventId: string;
}

// ============================================================================
// Events
// ============================================================================

/** Matrix event */
export interface MatrixEvent {
  eventId: string;
  type: string;
  content: Record<string, unknown>;
  sender: string;
  originServerTs: number;
  roomId?: string;
  stateKey?: string;
  unsigned?: {
    age?: number;
    redactedBecause?: MatrixEvent;
    transactionId?: string;
    prevContent?: Record<string, unknown>;
  };
}

/** Room message event */
export interface RoomMessageEvent extends MatrixEvent {
  type: "m.room.message";
  content: MessageContent;
}

/** Messages response */
export interface MessagesResponse {
  chunk: MatrixEvent[];
  start: string;
  end?: string;
  state?: MatrixEvent[];
}

// ============================================================================
// Sync
// ============================================================================

/** Sync filter */
export interface SyncFilter {
  room?: {
    state?: StateFilter;
    timeline?: TimelineFilter;
    ephemeral?: EphemeralFilter;
    accountData?: AccountDataFilter;
    includeLeave?: boolean;
  };
  presence?: PresenceFilter;
  accountData?: AccountDataFilter;
}

/** State filter */
export interface StateFilter {
  types?: string[];
  notTypes?: string[];
  limit?: number;
  lazyLoadMembers?: boolean;
}

/** Timeline filter */
export interface TimelineFilter {
  types?: string[];
  notTypes?: string[];
  limit?: number;
  lazyLoadMembers?: boolean;
}

/** Ephemeral filter */
export interface EphemeralFilter {
  types?: string[];
  notTypes?: string[];
}

/** Account data filter */
export interface AccountDataFilter {
  types?: string[];
  notTypes?: string[];
}

/** Presence filter */
export interface PresenceFilter {
  types?: string[];
  notTypes?: string[];
}

/** Sync response */
export interface SyncResponse {
  nextBatch: string;
  rooms?: {
    join?: Record<string, JoinedRoom>;
    invite?: Record<string, InvitedRoom>;
    leave?: Record<string, LeftRoom>;
  };
  presence?: {
    events: MatrixEvent[];
  };
  accountData?: {
    events: MatrixEvent[];
  };
  toDevice?: {
    events: MatrixEvent[];
  };
  deviceLists?: {
    changed?: string[];
    left?: string[];
  };
}

/** Joined room sync data */
export interface JoinedRoom {
  summary?: {
    "m.heroes"?: string[];
    "m.joined_member_count"?: number;
    "m.invited_member_count"?: number;
  };
  state?: {
    events: MatrixEvent[];
  };
  timeline?: {
    events: MatrixEvent[];
    limited?: boolean;
    prevBatch?: string;
  };
  ephemeral?: {
    events: MatrixEvent[];
  };
  accountData?: {
    events: MatrixEvent[];
  };
  unreadNotifications?: {
    highlightCount?: number;
    notificationCount?: number;
  };
}

/** Invited room sync data */
export interface InvitedRoom {
  inviteState?: {
    events: MatrixEvent[];
  };
}

/** Left room sync data */
export interface LeftRoom {
  state?: {
    events: MatrixEvent[];
  };
  timeline?: {
    events: MatrixEvent[];
    limited?: boolean;
    prevBatch?: string;
  };
  accountData?: {
    events: MatrixEvent[];
  };
}

// ============================================================================
// Encryption (Megolm)
// ============================================================================

/** Device info */
export interface DeviceInfo {
  deviceId: string;
  userId: string;
  algorithms: string[];
  keys: Record<string, string>;
  signatures?: Record<string, Record<string, string>>;
  displayName?: string;
}

/** Olm session */
export interface OlmSession {
  sessionId: string;
  senderKey: string;
  createdAt: number;
  lastUsedAt: number;
}

/** Megolm session */
export interface MegolmSession {
  sessionId: string;
  roomId: string;
  senderKey: string;
  forwardingCurve25519KeyChain: string[];
  firstKnownIndex: number;
  exported: boolean;
}

/** Encrypted content */
export interface EncryptedContent {
  algorithm: "m.megolm.v1.aes-sha2" | "m.olm.v1.curve25519-aes-sha2";
  senderKey: string;
  ciphertext: string | Record<string, OlmCiphertext>;
  sessionId?: string;
  deviceId?: string;
}

/** Olm ciphertext */
export interface OlmCiphertext {
  type: number;
  body: string;
}

/** Room key event */
export interface RoomKeyEvent {
  algorithm: string;
  roomId: string;
  sessionId: string;
  sessionKey: string;
}

// ============================================================================
// Admin API
// ============================================================================

/** Admin user info */
export interface AdminUserInfo {
  name: string;
  displayname?: string;
  avatarUrl?: string;
  admin: boolean;
  deactivated: boolean;
  shadowBanned: boolean;
  creationTs: number;
  consent_server_notice_sent?: boolean;
  consent_ts?: number;
}

/** Admin room info */
export interface AdminRoomInfo {
  roomId: string;
  name?: string;
  canonicalAlias?: string;
  joinedMembers: number;
  joinedLocalMembers: number;
  version: string;
  creator: string;
  encryption?: string;
  federatable: boolean;
  public: boolean;
  joinRules?: string;
  guestAccess?: string;
  historyVisibility?: string;
  stateEvents: number;
}

/** Admin list rooms response */
export interface AdminListRoomsResponse {
  rooms: AdminRoomInfo[];
  offset: number;
  totalRooms: number;
  nextBatch?: string;
  prevBatch?: string;
}

/** Admin room members response */
export interface AdminRoomMembersResponse {
  members: string[];
  total: number;
}

/** Admin create user request */
export interface AdminCreateUserRequest {
  password: string;
  displayname?: string;
  avatarUrl?: string;
  admin?: boolean;
  deactivated?: boolean;
  threepids?: Array<{
    medium: "email" | "msisdn";
    address: string;
  }>;
}

// ============================================================================
// Bridge
// ============================================================================

/** Bridge platform */
export type BridgePlatform = "telegram" | "discord" | "slack" | "whatsapp" | "signal";

/** Bridge room mapping */
export interface BridgeRoomMapping {
  id: string;
  matrixRoomId: string;
  externalId: string;
  platform: BridgePlatform;
  settings: BridgeSettings;
  status: "active" | "paused" | "error";
  createdAt: Date;
  updatedAt: Date;
}

/** Bridge settings */
export interface BridgeSettings {
  syncHistory: boolean;
  maxHistoryMessages: number;
  bidirectional: boolean;
  relayBots: boolean;
  formatMarkdown: boolean;
  bridgeEdits: boolean;
  bridgeDeletes: boolean;
  bridgeReactions: boolean;
  bridgeFiles: boolean;
  mentionMapping: Record<string, string>;
}

/** External message */
export interface ExternalMessage {
  id: string;
  platform: BridgePlatform;
  roomId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  contentType: "text" | "image" | "file" | "video" | "audio";
  replyToId?: string;
  attachments?: ExternalAttachment[];
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/** External attachment */
export interface ExternalAttachment {
  id: string;
  type: "image" | "video" | "audio" | "file";
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

/** Bridge result */
export interface BridgeResult {
  success: boolean;
  matrixEventId?: string;
  externalMessageId?: string;
  error?: string;
}

// ============================================================================
// Errors
// ============================================================================

/** Matrix error response */
export interface MatrixErrorResponse {
  errcode: string;
  error: string;
  retry_after_ms?: number;
}

/** Standard Matrix error codes */
export type MatrixErrorCode =
  | "M_FORBIDDEN"
  | "M_UNKNOWN_TOKEN"
  | "M_MISSING_TOKEN"
  | "M_BAD_JSON"
  | "M_NOT_JSON"
  | "M_NOT_FOUND"
  | "M_LIMIT_EXCEEDED"
  | "M_USER_IN_USE"
  | "M_ROOM_IN_USE"
  | "M_BAD_PAGINATION"
  | "M_INVALID_ROOM_STATE"
  | "M_THREEPID_IN_USE"
  | "M_THREEPID_NOT_FOUND"
  | "M_THREEPID_AUTH_FAILED"
  | "M_THREEPID_DENIED"
  | "M_SERVER_NOT_TRUSTED"
  | "M_UNSUPPORTED_ROOM_VERSION"
  | "M_INCOMPATIBLE_ROOM_VERSION"
  | "M_BAD_STATE"
  | "M_GUEST_ACCESS_FORBIDDEN"
  | "M_CAPTCHA_NEEDED"
  | "M_CAPTCHA_INVALID"
  | "M_MISSING_PARAM"
  | "M_INVALID_PARAM"
  | "M_TOO_LARGE"
  | "M_EXCLUSIVE"
  | "M_UNKNOWN";
