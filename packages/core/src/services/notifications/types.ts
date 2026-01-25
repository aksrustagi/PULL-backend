/**
 * Push Notification Service Types
 * Types for Firebase FCM and OneSignal push notifications
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface NotificationClientConfig {
  provider: NotificationProvider;
  firebase?: FirebaseConfig;
  oneSignal?: OneSignalConfig;
  defaultOptions?: NotificationOptions;
  logger?: Logger;
}

export type NotificationProvider = "firebase" | "onesignal" | "both";

export interface FirebaseConfig {
  projectId: string;
  privateKey: string;
  clientEmail: string;
  databaseUrl?: string;
}

export interface OneSignalConfig {
  appId: string;
  apiKey: string;
  baseUrl?: string;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

// ============================================================================
// Notification Types
// ============================================================================

export interface Notification {
  title: string;
  body: string;
  imageUrl?: string;
  icon?: string;
  badge?: string;
  sound?: string;
  clickAction?: string;
  data?: Record<string, string>;
}

export interface NotificationOptions {
  priority?: "high" | "normal";
  ttl?: number; // Time to live in seconds
  collapseKey?: string;
  badge?: number; // iOS badge count
  channelId?: string; // Android notification channel
  category?: string; // iOS category for interactive notifications
  mutableContent?: boolean;
  contentAvailable?: boolean;
  dryRun?: boolean;
}

// ============================================================================
// Target Types
// ============================================================================

export interface NotificationTarget {
  type: TargetType;
  value: string | string[];
}

export type TargetType =
  | "token"
  | "tokens"
  | "topic"
  | "segment"
  | "user_id"
  | "user_ids"
  | "all";

export interface UserDevice {
  userId: string;
  deviceId: string;
  token: string;
  platform: Platform;
  appVersion?: string;
  deviceModel?: string;
  osVersion?: string;
  timezone?: string;
  language?: string;
  createdAt: Date;
  lastActiveAt: Date;
  enabled: boolean;
}

export type Platform = "ios" | "android" | "web";

// ============================================================================
// Send Types
// ============================================================================

export interface SendRequest {
  notification: Notification;
  target: NotificationTarget;
  options?: NotificationOptions;
  scheduledAt?: Date;
  externalId?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  recipients?: number;
  failures?: NotificationFailure[];
  scheduledFor?: Date;
}

export interface NotificationFailure {
  token?: string;
  userId?: string;
  error: string;
  errorCode?: string;
}

// ============================================================================
// Batch Send Types
// ============================================================================

export interface BatchSendRequest {
  notifications: Array<{
    notification: Notification;
    target: NotificationTarget;
    options?: NotificationOptions;
  }>;
}

export interface BatchSendResult {
  total: number;
  successful: number;
  failed: number;
  results: SendResult[];
}

// ============================================================================
// Topic Types
// ============================================================================

export interface Topic {
  topicId: string;
  name: string;
  description?: string;
  subscriberCount: number;
  createdAt: Date;
}

export interface TopicSubscription {
  userId: string;
  topicId: string;
  subscribedAt: Date;
}

// ============================================================================
// Segment Types
// ============================================================================

export interface Segment {
  segmentId: string;
  name: string;
  filters: SegmentFilter[];
  estimatedSize?: number;
}

export interface SegmentFilter {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

export type FilterOperator =
  | "equals"
  | "not_equals"
  | "greater_than"
  | "less_than"
  | "contains"
  | "exists"
  | "not_exists";

// ============================================================================
// Template Types
// ============================================================================

export interface NotificationTemplate {
  templateId: string;
  name: string;
  title: string;
  body: string;
  variables: string[]; // e.g., ["username", "amount"]
  imageUrl?: string;
  defaultOptions?: NotificationOptions;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateData {
  [key: string]: string | number | boolean;
}

// ============================================================================
// Scheduled Notification Types
// ============================================================================

export interface ScheduledNotification {
  scheduleId: string;
  notification: Notification;
  target: NotificationTarget;
  options?: NotificationOptions;
  scheduledAt: Date;
  status: ScheduleStatus;
  sentAt?: Date;
  result?: SendResult;
}

export type ScheduleStatus = "pending" | "sent" | "cancelled" | "failed";

// ============================================================================
// Analytics Types
// ============================================================================

export interface NotificationAnalytics {
  notificationId: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  converted: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  conversionRate: number;
}

export interface UserNotificationStats {
  userId: string;
  totalReceived: number;
  totalOpened: number;
  totalClicked: number;
  lastReceivedAt?: Date;
  lastOpenedAt?: Date;
  optedOut: boolean;
}

// ============================================================================
// Domain-Specific Notification Types
// ============================================================================

// Trading notifications
export interface TradeNotification {
  type: TradeNotificationType;
  userId: string;
  tradeId?: string;
  marketId?: string;
  marketTitle?: string;
  amount?: number;
  price?: number;
  outcome?: "win" | "loss";
}

export type TradeNotificationType =
  | "order_filled"
  | "order_cancelled"
  | "position_opened"
  | "position_closed"
  | "price_alert"
  | "market_resolved"
  | "winning_trade"
  | "losing_trade";

// Market notifications
export interface MarketNotification {
  type: MarketNotificationType;
  userId: string;
  marketId: string;
  marketTitle: string;
  priceChange?: number;
  volume?: number;
  closeDate?: Date;
}

export type MarketNotificationType =
  | "market_created"
  | "market_trending"
  | "market_closing_soon"
  | "market_resolved"
  | "price_movement"
  | "volume_spike";

// Reward notifications
export interface RewardNotification {
  type: RewardNotificationType;
  userId: string;
  points?: number;
  rewardName?: string;
  streakDays?: number;
}

export type RewardNotificationType =
  | "points_earned"
  | "level_up"
  | "reward_available"
  | "streak_milestone"
  | "badge_earned";

// Social notifications
export interface SocialNotification {
  type: SocialNotificationType;
  userId: string;
  fromUserId?: string;
  fromUsername?: string;
  content?: string;
}

export type SocialNotificationType =
  | "new_follower"
  | "mention"
  | "reply"
  | "like"
  | "leaderboard_position";

// ============================================================================
// User Preferences Types
// ============================================================================

export interface NotificationPreferences {
  userId: string;
  enabled: boolean;
  channels: ChannelPreferences;
  categories: CategoryPreferences;
  quietHours?: QuietHours;
  updatedAt: Date;
}

export interface ChannelPreferences {
  push: boolean;
  email: boolean;
  sms: boolean;
  inApp: boolean;
}

export interface CategoryPreferences {
  trading: boolean;
  markets: boolean;
  rewards: boolean;
  social: boolean;
  marketing: boolean;
  security: boolean;
}

export interface QuietHours {
  enabled: boolean;
  startHour: number; // 0-23
  endHour: number; // 0-23
  timezone: string;
}

// ============================================================================
// Error Types
// ============================================================================

export class NotificationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly provider?: string
  ) {
    super(message);
    this.name = "NotificationError";
  }
}
