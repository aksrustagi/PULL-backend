/**
 * Live Rooms Types
 * Clubhouse-style audio rooms tied to live events
 */

import { z } from "zod";

// ============================================================================
// ENUMS & SCHEMAS
// ============================================================================

export const RoomTypeSchema = z.enum([
  "watch_party",      // Live game watch party
  "pregame_show",     // Pre-game analysis
  "halftime_show",    // Halftime discussion
  "postgame_show",    // Post-game recap
  "betting_talk",     // General betting discussion
  "expert_panel",     // Expert analysis panel
  "ama",              // Ask Me Anything
  "breaking_news",    // Breaking news discussion
  "community",        // General community hangout
  "private",          // Private room
]);

export type RoomType = z.infer<typeof RoomTypeSchema>;

export const RoomStatusSchema = z.enum([
  "scheduled",
  "starting",
  "live",
  "paused",
  "ended",
  "cancelled",
]);

export type RoomStatus = z.infer<typeof RoomStatusSchema>;

export const ParticipantRoleSchema = z.enum([
  "host",             // Room creator, full control
  "co_host",          // Can manage speakers
  "speaker",          // Can speak
  "listener",         // Can only listen
  "muted",            // Temporarily muted
  "banned",           // Removed from room
]);

export type ParticipantRole = z.infer<typeof ParticipantRoleSchema>;

export const AudioQualitySchema = z.enum([
  "low",              // 32kbps - low bandwidth
  "medium",           // 64kbps - balanced
  "high",             // 128kbps - high quality
  "studio",           // 256kbps - studio quality
]);

export type AudioQuality = z.infer<typeof AudioQualitySchema>;

// ============================================================================
// CORE TYPES
// ============================================================================

export interface LiveRoom {
  id: string;

  // Basic info
  title: string;
  description: string;
  type: RoomType;
  status: RoomStatus;

  // Host info
  hostId: string;
  hostUsername: string;
  hostAvatarUrl?: string;
  coHostIds: string[];

  // Event tie-in
  eventId?: string;
  eventName?: string;
  eventStartTime?: number;
  sport?: string;
  league?: string;

  // Room settings
  settings: RoomSettings;

  // Participants
  participants: RoomParticipant[];
  speakerIds: string[];
  listenerCount: number;
  peakListenerCount: number;

  // Audio
  audioConfig: AudioConfig;
  isRecording: boolean;
  recordingUrl?: string;

  // Monetization
  tipsEnabled: boolean;
  totalTips: number;
  tipCount: number;

  // Schedule
  scheduledStartTime?: number;
  actualStartTime?: number;
  endTime?: number;
  duration?: number; // In seconds

  // Discovery
  tags: string[];
  isPublic: boolean;
  isFeatured: boolean;

  // Engagement
  reactions: RoomReactions;
  chatEnabled: boolean;
  chatMessageCount: number;

  createdAt: number;
  updatedAt: number;
}

export interface RoomSettings {
  maxParticipants: number;
  maxSpeakers: number;
  allowRaiseHand: boolean;
  allowChat: boolean;
  allowReactions: boolean;
  allowTips: boolean;
  allowRecording: boolean;
  autoEndAfterMinutes?: number;
  requireApproval: boolean;
  minFollowersToSpeak?: number;
  minAccountAgeDays?: number;
  blockedWords: string[];
  slowModeSeconds?: number;
}

export interface RoomParticipant {
  id: string;

  // User info
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;

  // Role & status
  role: ParticipantRole;
  isSpeaking: boolean;
  isMuted: boolean;
  hasRaisedHand: boolean;
  raisedHandAt?: number;

  // Audio
  audioLevel: number; // 0-100
  isSelfMuted: boolean;

  // Engagement
  reactionCount: number;
  chatMessageCount: number;
  tipsGiven: number;
  tipsReceived: number;

  // Verification
  isVerified: boolean;
  isVIP: boolean;
  badges: string[];

  joinedAt: number;
  lastActiveAt: number;
}

export interface AudioConfig {
  quality: AudioQuality;
  sampleRate: number;
  bitrate: number;
  channels: number;
  codec: "opus" | "aac";
  noiseSuppressionEnabled: boolean;
  echoCancellationEnabled: boolean;
  autoGainControlEnabled: boolean;
}

export interface RoomReactions {
  fire: number;
  clap: number;
  love: number;
  laugh: number;
  wow: number;
  thinking: number;
  money: number;
  trophy: number;
}

// ============================================================================
// TIP TYPES
// ============================================================================

export interface RoomTip {
  id: string;
  roomId: string;

  // Sender
  senderId: string;
  senderUsername: string;
  senderAvatarUrl?: string;

  // Recipient
  recipientId: string;
  recipientUsername: string;

  // Amount
  amount: number;
  currency: "usd" | "tokens";
  message?: string;

  // Display
  animation?: "confetti" | "fireworks" | "money_rain" | "trophy";
  isHighlighted: boolean;

  createdAt: number;
}

export interface TipLeaderboard {
  roomId: string;
  topTippers: Array<{
    userId: string;
    username: string;
    avatarUrl?: string;
    totalTipped: number;
    tipCount: number;
  }>;
  topRecipients: Array<{
    userId: string;
    username: string;
    avatarUrl?: string;
    totalReceived: number;
    tipCount: number;
  }>;
  updatedAt: number;
}

// ============================================================================
// RECORDING TYPES
// ============================================================================

export interface RoomRecording {
  id: string;
  roomId: string;

  // Content
  title: string;
  description: string;
  duration: number; // Seconds

  // Files
  audioUrl: string;
  thumbnailUrl?: string;
  transcriptUrl?: string;

  // Processing
  status: "processing" | "ready" | "failed";
  processedAt?: number;

  // Stats
  playCount: number;
  likeCount: number;
  shareCount: number;

  // Chapters
  chapters: RecordingChapter[];

  // Highlights
  highlights: RecordingHighlight[];

  createdAt: number;
}

export interface RecordingChapter {
  id: string;
  title: string;
  startTime: number; // Seconds
  endTime: number;
}

export interface RecordingHighlight {
  id: string;
  title: string;
  startTime: number;
  duration: number;
  clipUrl?: string;
  reason: "high_engagement" | "key_moment" | "popular_clip" | "manual";
}

// ============================================================================
// SCHEDULE TYPES
// ============================================================================

export interface ScheduledRoom {
  id: string;

  // Basic info
  title: string;
  description: string;
  type: RoomType;

  // Host
  hostId: string;
  coHostIds: string[];
  invitedSpeakerIds: string[];

  // Schedule
  scheduledStartTime: number;
  estimatedDuration: number; // Minutes
  timezone: string;

  // Event tie-in
  eventId?: string;
  sport?: string;

  // Settings
  settings: RoomSettings;

  // Notifications
  remindersSent: boolean;
  interestedCount: number;
  interestedUserIds: string[];

  // Discovery
  isPublic: boolean;
  tags: string[];

  createdAt: number;
}

// ============================================================================
// CHAT TYPES
// ============================================================================

export interface RoomChatMessage {
  id: string;
  roomId: string;

  // Sender
  senderId: string;
  senderUsername: string;
  senderAvatarUrl?: string;
  senderRole: ParticipantRole;

  // Content
  type: "text" | "tip_notification" | "system" | "poll" | "bet_share";
  content: string;

  // Attachments
  betShareData?: {
    betId: string;
    eventName: string;
    selection: string;
    odds: string;
    amount?: number;
  };

  pollData?: {
    question: string;
    options: Array<{ id: string; text: string; votes: number }>;
    endsAt?: number;
  };

  // Interactions
  reactions: Record<string, number>;
  isPinned: boolean;
  isHighlighted: boolean;

  // Moderation
  isDeleted: boolean;
  deletedBy?: string;

  createdAt: number;
}

// ============================================================================
// MODERATION TYPES
// ============================================================================

export interface RoomModerationAction {
  id: string;
  roomId: string;

  // Action
  type: "mute" | "unmute" | "promote_speaker" | "demote_listener" | "kick" | "ban" | "warn" | "delete_message";

  // Target
  targetUserId: string;
  targetUsername: string;

  // Moderator
  moderatorId: string;
  moderatorUsername: string;

  // Details
  reason?: string;
  duration?: number; // For temporary actions
  messageId?: string; // For delete_message

  createdAt: number;
}

// ============================================================================
// EVENT TYPES
// ============================================================================

export interface RoomEvent {
  type: RoomEventType;
  roomId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export type RoomEventType =
  | "room_created"
  | "room_started"
  | "room_ended"
  | "room_paused"
  | "participant_joined"
  | "participant_left"
  | "speaker_added"
  | "speaker_removed"
  | "hand_raised"
  | "hand_lowered"
  | "tip_received"
  | "reaction_sent"
  | "chat_message"
  | "recording_started"
  | "recording_stopped";

// ============================================================================
// API TYPES
// ============================================================================

export interface CreateRoomRequest {
  title: string;
  description?: string;
  type: RoomType;
  eventId?: string;
  settings?: Partial<RoomSettings>;
  scheduledStartTime?: number;
  isPublic?: boolean;
  tags?: string[];
}

export interface JoinRoomRequest {
  roomId: string;
  requestSpeaker?: boolean;
}

export interface UpdateRoomRequest {
  title?: string;
  description?: string;
  settings?: Partial<RoomSettings>;
  tags?: string[];
}

export interface SendTipRequest {
  roomId: string;
  recipientId: string;
  amount: number;
  currency: "usd" | "tokens";
  message?: string;
  animation?: RoomTip["animation"];
}

export interface RoomSearchFilters {
  type?: RoomType;
  status?: RoomStatus;
  sport?: string;
  eventId?: string;
  hostId?: string;
  isPublic?: boolean;
  isFeatured?: boolean;
  tags?: string[];
  minListeners?: number;
}

export interface RoomListResponse {
  rooms: LiveRoom[];
  total: number;
  hasMore: boolean;
  cursor?: string;
}
