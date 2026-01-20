/**
 * Nylas API Types
 * Type definitions for Nylas email integration
 */

// ============================================================================
// Common Types
// ============================================================================

export type NylasGrantStatus = "valid" | "invalid" | "sync_failed";

export type MessageLabels =
  | "INBOX"
  | "SENT"
  | "DRAFTS"
  | "TRASH"
  | "SPAM"
  | "IMPORTANT"
  | "STARRED"
  | "UNREAD"
  | string; // Custom labels

// ============================================================================
// Grant Types
// ============================================================================

export interface Grant {
  id: string;
  provider: "google" | "microsoft" | "imap";
  email: string;
  status: NylasGrantStatus;
  scope: string[];
  created_at: number;
  updated_at: number;
  user_agent?: string;
  ip?: string;
  settings?: Record<string, unknown>;
}

export interface AuthUrl {
  url: string;
  state: string;
}

export interface TokenExchangeResponse {
  grant_id: string;
  email: string;
  provider: string;
  token_type: string;
  access_token?: string;
}

// ============================================================================
// Message Types
// ============================================================================

export interface Message {
  id: string;
  grant_id: string;
  thread_id: string;
  subject: string;
  from: EmailParticipant[];
  to: EmailParticipant[];
  cc?: EmailParticipant[];
  bcc?: EmailParticipant[];
  reply_to?: EmailParticipant[];
  date: number;
  unread: boolean;
  starred: boolean;
  snippet: string;
  body: string;
  folders: string[];
  attachments?: Attachment[];
  headers?: MessageHeader[];
  created_at: number;
  object: "message";
}

export interface EmailParticipant {
  name?: string;
  email: string;
}

export interface Attachment {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  content_id?: string;
  content_disposition?: string;
  is_inline?: boolean;
}

export interface MessageHeader {
  name: string;
  value: string;
}

export interface ListMessagesParams {
  limit?: number;
  page_token?: string;
  subject?: string;
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  in?: string; // folder
  unread?: boolean;
  starred?: boolean;
  thread_id?: string;
  received_before?: number;
  received_after?: number;
  has_attachment?: boolean;
  fields?: string[];
  search_query_native?: string;
}

export interface ListMessagesResponse {
  data: Message[];
  next_cursor?: string;
  request_id: string;
}

export interface SendMessageParams {
  subject: string;
  body: string;
  to: EmailParticipant[];
  cc?: EmailParticipant[];
  bcc?: EmailParticipant[];
  reply_to?: EmailParticipant[];
  reply_to_message_id?: string;
  tracking_options?: {
    opens?: boolean;
    links?: boolean;
    thread_replies?: boolean;
  };
  attachments?: Array<{
    filename: string;
    content_type: string;
    content: string; // Base64 encoded
  }>;
}

export interface UpdateMessageParams {
  unread?: boolean;
  starred?: boolean;
  folders?: string[];
}

// ============================================================================
// Thread Types
// ============================================================================

export interface Thread {
  id: string;
  grant_id: string;
  subject: string;
  participants: EmailParticipant[];
  message_ids: string[];
  snippet: string;
  first_message_timestamp: number;
  last_message_timestamp: number;
  last_message_received_timestamp: number;
  last_message_sent_timestamp?: number;
  unread: boolean;
  starred: boolean;
  has_attachments: boolean;
  has_drafts: boolean;
  folders: string[];
  object: "thread";
}

export interface ListThreadsParams {
  limit?: number;
  page_token?: string;
  subject?: string;
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  in?: string;
  unread?: boolean;
  starred?: boolean;
  latest_message_before?: number;
  latest_message_after?: number;
  has_attachment?: boolean;
  search_query_native?: string;
}

export interface ListThreadsResponse {
  data: Thread[];
  next_cursor?: string;
  request_id: string;
}

// ============================================================================
// Draft Types
// ============================================================================

export interface Draft {
  id: string;
  grant_id: string;
  thread_id?: string;
  subject: string;
  from: EmailParticipant[];
  to: EmailParticipant[];
  cc?: EmailParticipant[];
  bcc?: EmailParticipant[];
  reply_to?: EmailParticipant[];
  body: string;
  attachments?: Attachment[];
  created_at: number;
  updated_at: number;
  object: "draft";
}

export interface CreateDraftParams {
  subject: string;
  body: string;
  to?: EmailParticipant[];
  cc?: EmailParticipant[];
  bcc?: EmailParticipant[];
  reply_to?: EmailParticipant[];
  reply_to_message_id?: string;
  attachments?: Array<{
    filename: string;
    content_type: string;
    content: string;
  }>;
}

export interface UpdateDraftParams {
  subject?: string;
  body?: string;
  to?: EmailParticipant[];
  cc?: EmailParticipant[];
  bcc?: EmailParticipant[];
  reply_to?: EmailParticipant[];
}

// ============================================================================
// Contact Types
// ============================================================================

export interface Contact {
  id: string;
  grant_id: string;
  given_name?: string;
  middle_name?: string;
  surname?: string;
  suffix?: string;
  nickname?: string;
  birthday?: string;
  company_name?: string;
  job_title?: string;
  notes?: string;
  emails?: ContactEmail[];
  phone_numbers?: ContactPhone[];
  physical_addresses?: ContactAddress[];
  web_pages?: ContactWebPage[];
  groups?: ContactGroup[];
  picture_url?: string;
  source?: string;
  object: "contact";
}

export interface ContactEmail {
  email: string;
  type?: "home" | "work" | "other";
}

export interface ContactPhone {
  number: string;
  type?: "home" | "work" | "mobile" | "other";
}

export interface ContactAddress {
  format?: string;
  street_address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  type?: "home" | "work" | "other";
}

export interface ContactWebPage {
  url: string;
  type?: "profile" | "blog" | "home_page" | "work" | "other";
}

export interface ContactGroup {
  id: string;
  name: string;
}

export interface ListContactsParams {
  limit?: number;
  page_token?: string;
  email?: string;
  phone_number?: string;
  source?: string;
  group?: string;
  recurse?: boolean;
}

export interface ListContactsResponse {
  data: Contact[];
  next_cursor?: string;
  request_id: string;
}

// ============================================================================
// Folder Types
// ============================================================================

export interface Folder {
  id: string;
  grant_id: string;
  name: string;
  system_folder?: string;
  child_count?: number;
  unread_count?: number;
  total_count?: number;
  parent_id?: string;
  background_color?: string;
  text_color?: string;
  object: "folder";
}

// ============================================================================
// Webhook Types
// ============================================================================

export type WebhookTrigger =
  | "message.created"
  | "message.opened"
  | "message.link_clicked"
  | "message.updated"
  | "thread.replied"
  | "grant.created"
  | "grant.updated"
  | "grant.deleted"
  | "grant.expired";

export interface Webhook {
  id: string;
  description?: string;
  trigger_types: WebhookTrigger[];
  webhook_url: string;
  status: "active" | "failing" | "failed" | "paused";
  notification_email_addresses?: string[];
  created_at: number;
  updated_at: number;
}

export interface WebhookPayload {
  specversion: string;
  type: WebhookTrigger;
  source: string;
  id: string;
  time: string;
  webhook_delivery_attempt: number;
  data: {
    application_id: string;
    grant_id: string;
    object: Message | Thread | Grant;
  };
}

// ============================================================================
// Error Types
// ============================================================================

export interface NylasError {
  type: string;
  message: string;
  provider_error?: {
    error: string;
    error_description?: string;
  };
  request_id: string;
}

export class NylasApiError extends Error {
  public readonly type: string;
  public readonly statusCode: number;
  public readonly requestId: string;
  public readonly providerError?: { error: string; error_description?: string };

  constructor(error: NylasError, statusCode: number) {
    super(error.message);
    this.name = "NylasApiError";
    this.type = error.type;
    this.statusCode = statusCode;
    this.requestId = error.request_id;
    this.providerError = error.provider_error;
  }
}
