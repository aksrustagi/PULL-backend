/**
 * Resend Email Service Types
 */

// ============================================================================
// Email Types
// ============================================================================

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface EmailTag {
  name: string;
  value: string;
}

export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

export interface SendEmailParams {
  to: string | string[] | EmailRecipient | EmailRecipient[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  tags?: EmailTag[];
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
  scheduledAt?: string;
}

export interface SendEmailResponse {
  id: string;
}

export interface Email {
  id: string;
  object: "email";
  to: string[];
  from: string;
  created_at: string;
  subject: string;
  html: string | null;
  text: string | null;
  bcc: string[] | null;
  cc: string[] | null;
  reply_to: string[] | null;
  last_event: EmailEvent;
}

export type EmailEvent =
  | "sent"
  | "delivered"
  | "delivery_delayed"
  | "complained"
  | "bounced"
  | "opened"
  | "clicked";

// ============================================================================
// Batch Types
// ============================================================================

export interface BatchEmailParams {
  emails: SendEmailParams[];
}

export interface BatchEmailResponse {
  data: SendEmailResponse[];
}

// ============================================================================
// Domain Types
// ============================================================================

export interface Domain {
  id: string;
  name: string;
  created_at: string;
  status: "not_started" | "pending" | "verified" | "failed";
  records: DomainRecord[];
  region: "us-east-1" | "eu-west-1" | "sa-east-1";
}

export interface DomainRecord {
  record: string;
  name: string;
  type: string;
  ttl: string;
  status: "not_started" | "pending" | "verified" | "failed";
  value: string;
  priority?: number;
}

// ============================================================================
// API Key Types
// ============================================================================

export interface ApiKey {
  id: string;
  name: string;
  created_at: string;
  permission: "full_access" | "sending_access";
}

// ============================================================================
// Webhook Types
// ============================================================================

export interface WebhookPayload {
  type: EmailEvent;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    created_at: string;
  };
}

// ============================================================================
// Error Types
// ============================================================================

export class ResendApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly name: string = "validation_error"
  ) {
    super(message);
    this.name = "ResendApiError";
  }
}
