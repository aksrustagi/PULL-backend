/**
 * Messaging Types for PULL Super App
 * Covers Matrix federated messaging and direct messages
 */

/** Matrix room types */
export type MatrixRoomType = "direct" | "group" | "public" | "space";

/** Matrix room membership */
export type MatrixMembership = "invite" | "join" | "leave" | "ban" | "knock";

/** Message content types */
export type MessageContentType =
  | "text"
  | "image"
  | "video"
  | "file"
  | "audio"
  | "location"
  | "reaction"
  | "reply"
  | "poll"
  | "trade_share"
  | "position_share";

/** Matrix room */
export interface MatrixRoom {
  id: string;
  matrixRoomId: string;
  type: MatrixRoomType;
  name?: string;
  topic?: string;
  avatarUrl?: string;
  isEncrypted: boolean;
  isDirect: boolean;
  memberCount: number;
  joinRule: "public" | "invite" | "knock" | "restricted";
  creatorId: string;
  lastMessageAt?: Date;
  lastMessagePreview?: string;
  unreadCount: number;
  highlightCount: number;
  notificationLevel: "all" | "mentions" | "none";
  isPinned: boolean;
  isMuted: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** Matrix message */
export interface MatrixMessage {
  id: string;
  matrixEventId: string;
  roomId: string;
  senderId: string;
  contentType: MessageContentType;
  content: MessageContent;
  replyToId?: string;
  threadRootId?: string;
  isEdited: boolean;
  editedAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  reactions: MessageReaction[];
  readBy: string[];
  mentions: string[];
  timestamp: Date;
}

/** Message content union type */
export type MessageContent =
  | TextContent
  | ImageContent
  | VideoContent
  | FileContent
  | AudioContent
  | LocationContent
  | PollContent
  | TradeShareContent
  | PositionShareContent;

/** Text message content */
export interface TextContent {
  type: "text";
  body: string;
  formattedBody?: string;
  format?: "markdown" | "html";
}

/** Image content */
export interface ImageContent {
  type: "image";
  url: string;
  thumbnailUrl?: string;
  mimeType: string;
  width?: number;
  height?: number;
  size: number;
  caption?: string;
  blurhash?: string;
}

/** Video content */
export interface VideoContent {
  type: "video";
  url: string;
  thumbnailUrl?: string;
  mimeType: string;
  width?: number;
  height?: number;
  duration: number;
  size: number;
  caption?: string;
}

/** File content */
export interface FileContent {
  type: "file";
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

/** Audio content */
export interface AudioContent {
  type: "audio";
  url: string;
  mimeType: string;
  duration: number;
  size: number;
  waveform?: number[];
  isVoiceMessage: boolean;
}

/** Location content */
export interface LocationContent {
  type: "location";
  latitude: number;
  longitude: number;
  accuracy?: number;
  description?: string;
}

/** Poll content */
export interface PollContent {
  type: "poll";
  question: string;
  options: PollOption[];
  multipleChoice: boolean;
  closesAt?: Date;
  isClosed: boolean;
}

/** Poll option */
export interface PollOption {
  id: string;
  text: string;
  votes: number;
  voters: string[];
}

/** Shared trade content */
export interface TradeShareContent {
  type: "trade_share";
  tradeId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  pnl?: number;
  pnlPercent?: number;
  message?: string;
}

/** Shared position content */
export interface PositionShareContent {
  type: "position_share";
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

/** Message reaction */
export interface MessageReaction {
  key: string;
  emoji?: string;
  shortcode?: string;
  count: number;
  userIds: string[];
  latestTimestamp: Date;
}

/** Matrix user profile */
export interface MatrixUser {
  id: string;
  matrixUserId: string;
  userId?: string;
  displayName?: string;
  avatarUrl?: string;
  presence: "online" | "offline" | "unavailable";
  lastActiveAt?: Date;
  statusMessage?: string;
  isVerified: boolean;
}

/** Room member */
export interface RoomMember {
  id: string;
  roomId: string;
  userId: string;
  matrixUserId: string;
  membership: MatrixMembership;
  displayName?: string;
  avatarUrl?: string;
  powerLevel: number;
  joinedAt?: Date;
  invitedBy?: string;
}

/** Chat room (simplified wrapper) */
export interface ChatRoom {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  members: ChatRoomMember[];
  lastMessage?: ChatMessage;
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
  createdAt: Date;
}

/** Chat room member (simplified) */
export interface ChatRoomMember {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  role: "owner" | "admin" | "moderator" | "member";
  isOnline: boolean;
}

/** Direct message (simplified) */
export interface DirectMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  contentType: MessageContentType;
  isRead: boolean;
  readAt?: Date;
  isDeleted: boolean;
  createdAt: Date;
}

/** Chat message (simplified) */
export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  contentType: MessageContentType;
  replyTo?: string;
  reactions: Record<string, string[]>;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: Date;
}

/** Typing indicator */
export interface TypingIndicator {
  roomId: string;
  userId: string;
  isTyping: boolean;
  timestamp: Date;
}

/** Read receipt */
export interface ReadReceipt {
  roomId: string;
  userId: string;
  eventId: string;
  timestamp: Date;
}
