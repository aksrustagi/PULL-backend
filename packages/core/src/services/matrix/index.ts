/**
 * Matrix Services
 * Complete Matrix messaging integration for PULL
 */

// Client
export { MatrixClient, MatrixApiError } from "./client";

// Admin
export { MatrixAdminClient } from "./admin";

// Bridge
export {
  MatrixBridgeService,
  BridgeError,
  TelegramHandler,
  DiscordHandler,
  SlackHandler,
  type PlatformHandler,
  type BridgeServiceConfig,
} from "./bridge";

// Types
export type {
  // Configuration
  MatrixConfig,
  MatrixAdminConfig,
  Logger,

  // Authentication
  RegisterResponse,
  LoginResponse,
  WellKnown,

  // Rooms
  CreateRoomOptions,
  CreateRoomResponse,
  StateEvent,
  PowerLevelContent,
  RoomInfo,
  RoomSummary,
  JoinedRoomsResponse,

  // Members
  RoomMember,
  MemberEvent,

  // Messages
  MessageContent,
  TextMessageContent,
  NoticeMessageContent,
  EmoteMessageContent,
  ImageMessageContent,
  FileMessageContent,
  MediaInfo,
  FileInfo,
  ThumbnailInfo,
  RelatesTo,
  ReactionContent,
  SendMessageResponse,

  // Events
  MatrixEvent,
  RoomMessageEvent,
  MessagesResponse,

  // Sync
  SyncFilter,
  StateFilter,
  TimelineFilter,
  EphemeralFilter,
  AccountDataFilter,
  PresenceFilter,
  SyncResponse,
  JoinedRoom,
  InvitedRoom,
  LeftRoom,

  // Encryption
  DeviceInfo,
  OlmSession,
  MegolmSession,
  EncryptedContent,
  OlmCiphertext,
  RoomKeyEvent,

  // Admin
  AdminUserInfo,
  AdminRoomInfo,
  AdminListRoomsResponse,
  AdminRoomMembersResponse,
  AdminCreateUserRequest,

  // Bridge
  BridgePlatform,
  BridgeRoomMapping,
  BridgeSettings,
  ExternalMessage,
  ExternalAttachment,
  BridgeResult,

  // Errors
  MatrixErrorResponse,
  MatrixErrorCode,
} from "./types";
