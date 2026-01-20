/**
 * Email Types for PULL Super App
 * Covers email intelligence, triage, and smart features
 */

/** Email priority levels */
export type EmailPriority = "urgent" | "high" | "normal" | "low" | "newsletter";

/** Email category for AI triage */
export type EmailCategory =
  | "trading"
  | "account"
  | "newsletter"
  | "notification"
  | "personal"
  | "promotional"
  | "social"
  | "updates"
  | "forums"
  | "spam"
  | "other";

/** Email status */
export type EmailStatus = "unread" | "read" | "archived" | "deleted" | "snoozed";

/** Email sync status */
export type EmailSyncStatus = "syncing" | "synced" | "error" | "disabled";

/** Email account connection */
export interface EmailAccount {
  id: string;
  userId: string;
  provider: EmailProvider;
  email: string;
  name?: string;
  grantId: string;
  accessToken?: string;
  refreshToken?: string;
  syncStatus: EmailSyncStatus;
  lastSyncAt?: Date;
  lastSyncError?: string;
  syncCursor?: string;
  folderSyncState: Record<string, string>;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Supported email providers */
export type EmailProvider = "gmail" | "outlook" | "yahoo" | "icloud" | "other";

/** Email message */
export interface Email {
  id: string;
  accountId: string;
  userId: string;
  externalId: string;
  threadId: string;
  folderId: string;
  folderName: string;
  from: EmailParticipant;
  to: EmailParticipant[];
  cc: EmailParticipant[];
  bcc: EmailParticipant[];
  replyTo?: EmailParticipant;
  subject: string;
  snippet: string;
  body: string;
  bodyHtml?: string;
  bodyPlain?: string;
  hasAttachments: boolean;
  attachments: EmailAttachment[];
  status: EmailStatus;
  isStarred: boolean;
  isImportant: boolean;
  labels: string[];
  triage?: EmailTriage;
  smartReplies?: SmartReply[];
  summary?: string;
  extractedData?: EmailExtractedData;
  headers: Record<string, string>;
  receivedAt: Date;
  sentAt?: Date;
  snoozedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** Email participant */
export interface EmailParticipant {
  name?: string;
  email: string;
}

/** Email attachment */
export interface EmailAttachment {
  id: string;
  emailId: string;
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
  isInline: boolean;
  downloadUrl?: string;
}

/** AI-powered email triage */
export interface EmailTriage {
  priority: EmailPriority;
  category: EmailCategory;
  confidence: number;
  sentiment: EmailSentiment;
  actionRequired: boolean;
  suggestedAction?: TriageAction;
  reasoning?: string;
  keywords: string[];
  entities: TriageEntity[];
  processedAt: Date;
}

/** Email sentiment */
export type EmailSentiment = "positive" | "neutral" | "negative" | "mixed";

/** Triage suggested actions */
export type TriageAction =
  | "reply_urgent"
  | "reply_soon"
  | "review"
  | "delegate"
  | "archive"
  | "unsubscribe"
  | "schedule_meeting"
  | "add_to_calendar"
  | "create_task"
  | "none";

/** Extracted entity from email */
export interface TriageEntity {
  type: "person" | "company" | "date" | "money" | "ticker" | "url" | "phone" | "address";
  value: string;
  confidence: number;
  context?: string;
}

/** Smart reply suggestion */
export interface SmartReply {
  id: string;
  text: string;
  tone: "formal" | "casual" | "friendly" | "direct";
  length: "short" | "medium" | "long";
  confidence: number;
}

/** Extracted data from email */
export interface EmailExtractedData {
  orderConfirmations?: OrderConfirmation[];
  meetingRequests?: MeetingRequest[];
  flightInfo?: FlightInfo[];
  trackingNumbers?: TrackingInfo[];
  invoices?: InvoiceInfo[];
  subscriptions?: SubscriptionInfo[];
}

/** Extracted order confirmation */
export interface OrderConfirmation {
  orderId: string;
  merchant: string;
  items: string[];
  total: number;
  currency: string;
  orderDate: Date;
  deliveryDate?: Date;
  trackingUrl?: string;
}

/** Extracted meeting request */
export interface MeetingRequest {
  title: string;
  organizer: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  meetingUrl?: string;
  description?: string;
}

/** Extracted flight info */
export interface FlightInfo {
  airline: string;
  flightNumber: string;
  departure: FlightLocation;
  arrival: FlightLocation;
  confirmationCode?: string;
}

/** Flight location */
export interface FlightLocation {
  airport: string;
  city: string;
  time: Date;
  terminal?: string;
  gate?: string;
}

/** Extracted tracking info */
export interface TrackingInfo {
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string;
  status?: string;
  estimatedDelivery?: Date;
}

/** Extracted invoice info */
export interface InvoiceInfo {
  invoiceId: string;
  vendor: string;
  amount: number;
  currency: string;
  dueDate?: Date;
  paymentUrl?: string;
}

/** Extracted subscription info */
export interface SubscriptionInfo {
  service: string;
  status: "active" | "cancelled" | "trial" | "expired";
  renewalDate?: Date;
  amount?: number;
  frequency?: "monthly" | "yearly" | "weekly";
  unsubscribeUrl?: string;
}

/** Email thread (conversation) */
export interface EmailThread {
  id: string;
  accountId: string;
  userId: string;
  subject: string;
  participants: EmailParticipant[];
  messageCount: number;
  unreadCount: number;
  latestMessageAt: Date;
  snippet: string;
  isStarred: boolean;
  labels: string[];
  triage?: EmailTriage;
  createdAt: Date;
  updatedAt: Date;
}

/** Email folder */
export interface EmailFolder {
  id: string;
  accountId: string;
  externalId: string;
  name: string;
  displayName: string;
  type: "inbox" | "sent" | "drafts" | "trash" | "spam" | "archive" | "custom";
  parentId?: string;
  messageCount: number;
  unreadCount: number;
  syncEnabled: boolean;
}

/** Email search query */
export interface EmailSearchQuery {
  query?: string;
  from?: string;
  to?: string;
  subject?: string;
  hasAttachment?: boolean;
  isUnread?: boolean;
  isStarred?: boolean;
  category?: EmailCategory;
  priority?: EmailPriority;
  folder?: string;
  labels?: string[];
  after?: Date;
  before?: Date;
}

/** Email send request */
export interface EmailSendRequest {
  accountId: string;
  to: EmailParticipant[];
  cc?: EmailParticipant[];
  bcc?: EmailParticipant[];
  subject: string;
  body: string;
  bodyHtml?: string;
  replyToMessageId?: string;
  attachments?: EmailAttachmentUpload[];
  scheduledFor?: Date;
  trackOpens?: boolean;
  trackClicks?: boolean;
}

/** Email attachment upload */
export interface EmailAttachmentUpload {
  filename: string;
  contentType: string;
  content: string;
  isInline?: boolean;
  contentId?: string;
}
