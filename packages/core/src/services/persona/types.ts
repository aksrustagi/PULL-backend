/**
 * Persona API Types
 * Type definitions for Persona KYC service
 */

// ============================================================================
// Inquiry Types
// ============================================================================

export type InquiryStatus =
  | "created"
  | "pending"
  | "completed"
  | "failed"
  | "expired"
  | "approved"
  | "declined"
  | "needs_review";

export type VerificationStatus =
  | "initiated"
  | "submitted"
  | "passed"
  | "failed"
  | "requires_retry"
  | "canceled"
  | "confirmed";

export interface Inquiry {
  id: string;
  type: "inquiry";
  attributes: {
    status: InquiryStatus;
    reference_id: string | null;
    note: string | null;
    behaviors: InquiryBehaviors;
    tags: string[];
    creator: string;
    reviewer_comment: string | null;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    failed_at: string | null;
    decisioned_at: string | null;
    expired_at: string | null;
    redacted_at: string | null;
    previous_step_name: string | null;
    current_step_name: string | null;
    next_step_name: string | null;
    name_first: string | null;
    name_middle: string | null;
    name_last: string | null;
    birthdate: string | null;
    address_street_1: string | null;
    address_street_2: string | null;
    address_city: string | null;
    address_subdivision: string | null;
    address_postal_code: string | null;
    address_country_code: string | null;
    email_address: string | null;
    phone_number: string | null;
    fields: Record<string, InquiryField>;
  };
  relationships: {
    account: { data: { type: "account"; id: string } | null };
    template: { data: { type: "template"; id: string } };
    inquiry_template: { data: { type: "inquiry-template"; id: string } };
    inquiry_template_version: { data: { type: "inquiry-template-version"; id: string } };
    reviewer: { data: { type: "workflow-run" | null; id: string | null } };
    reports: { data: Array<{ type: string; id: string }> };
    verifications: { data: Array<{ type: string; id: string }> };
    sessions: { data: Array<{ type: "inquiry-session"; id: string }> };
    documents: { data: Array<{ type: "document"; id: string }> };
    selfies: { data: Array<{ type: "selfie"; id: string }> };
  };
}

export interface InquiryBehaviors {
  request_spoof_attempts: number;
  user_agent_spoof_attempts: number;
  distraction_events: number;
  hesitation_baseline: number | null;
  hesitation_count: number;
  hesitation_time: number;
  shortcut_copies: number;
  shortcut_pastes: number;
  autofill_cancels: number;
  autofill_starts: number;
  devtools_open: boolean;
  completion_time: number | null;
  behavior_threat_level: "low" | "medium" | "high" | null;
}

export interface InquiryField {
  type: "string" | "date" | "boolean" | "number";
  value: string | boolean | number | null;
}

// ============================================================================
// Verification Types
// ============================================================================

export interface Verification {
  id: string;
  type: string;
  attributes: {
    status: VerificationStatus;
    created_at: string;
    created_at_ts: number;
    submitted_at: string | null;
    submitted_at_ts: number | null;
    completed_at: string | null;
    completed_at_ts: number | null;
    country_code: string | null;
    checks: VerificationCheck[];
  };
}

export interface VerificationCheck {
  name: string;
  status: "passed" | "failed" | "not_applicable" | "requires_retry";
  reasons: string[];
  requirement: "required" | "not_required";
  metadata: Record<string, unknown>;
}

export interface GovernmentIdVerification extends Verification {
  type: "verification/government-id";
  attributes: Verification["attributes"] & {
    id_class: "dl" | "id" | "pp" | "visa" | "prc" | "rp";
    capture_method: "upload" | "camera" | "video";
    name_first: string | null;
    name_middle: string | null;
    name_last: string | null;
    name_suffix: string | null;
    birthdate: string | null;
    address_street_1: string | null;
    address_street_2: string | null;
    address_city: string | null;
    address_subdivision: string | null;
    address_postal_code: string | null;
    issuing_authority: string | null;
    issuing_subdivision: string | null;
    nationality: string | null;
    document_number: string | null;
    visa_status: string | null;
    issue_date: string | null;
    expiration_date: string | null;
    designations: string[];
  };
}

export interface SelfieVerification extends Verification {
  type: "verification/selfie";
  attributes: Verification["attributes"] & {
    capture_method: "photo" | "video";
    center_photo_url: string | null;
    left_photo_url: string | null;
    right_photo_url: string | null;
    photo_urls: {
      page: string;
      url: string;
      normalized_url: string | null;
      byte_size: number;
    }[];
  };
}

export interface DatabaseVerification extends Verification {
  type: "verification/database";
  attributes: Verification["attributes"] & {
    name_first: string | null;
    name_last: string | null;
    birthdate: string | null;
    address_street_1: string | null;
    address_city: string | null;
    address_subdivision: string | null;
    address_postal_code: string | null;
    phone_number: string | null;
    email_address: string | null;
    identification_number: string | null;
  };
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface CreateInquiryParams {
  template_id: string;
  reference_id?: string;
  account_id?: string;
  fields?: Record<string, string | number | boolean>;
  redirect_uri?: string;
  note?: string;
  tags?: string[];
}

export interface CreateInquiryResponse {
  data: Inquiry;
  meta: {
    session_token: string;
  };
}

export interface GetInquiryResponse {
  data: Inquiry;
  included?: Array<Verification | Record<string, unknown>>;
}

export interface GetVerificationsResponse {
  data: Verification[];
}

export interface RedactInquiryResponse {
  data: Inquiry;
}

// ============================================================================
// Webhook Types
// ============================================================================

export type WebhookEventType =
  | "inquiry.created"
  | "inquiry.started"
  | "inquiry.completed"
  | "inquiry.failed"
  | "inquiry.expired"
  | "inquiry.approved"
  | "inquiry.declined"
  | "inquiry.transitioned"
  | "verification.created"
  | "verification.submitted"
  | "verification.passed"
  | "verification.failed"
  | "verification.requires-retry"
  | "verification.canceled";

export interface WebhookPayload {
  data: {
    type: WebhookEventType;
    attributes: {
      name: WebhookEventType;
      payload: {
        data: Inquiry | Verification;
        included?: Array<Verification | Record<string, unknown>>;
      };
      created_at: string;
    };
  };
}

// ============================================================================
// Error Types
// ============================================================================

export interface PersonaError {
  status: string;
  title: string;
  detail: string;
  code?: string;
}

export class PersonaApiError extends Error {
  public readonly statusCode: number;
  public readonly errors: PersonaError[];

  constructor(message: string, statusCode: number, errors: PersonaError[] = []) {
    super(message);
    this.name = "PersonaApiError";
    this.statusCode = statusCode;
    this.errors = errors;
  }
}
