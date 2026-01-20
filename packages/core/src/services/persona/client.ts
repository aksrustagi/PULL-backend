/**
 * Persona KYC Client
 * Client for interacting with Persona identity verification API
 */

import * as crypto from "crypto";
import type {
  Inquiry,
  Verification,
  CreateInquiryParams,
  CreateInquiryResponse,
  GetInquiryResponse,
  GetVerificationsResponse,
  RedactInquiryResponse,
  WebhookPayload,
} from "./types";
import { PersonaApiError } from "./types";

// ============================================================================
// Configuration
// ============================================================================

export interface PersonaClientConfig {
  apiKey: string;
  webhookSecret?: string;
  baseUrl?: string;
  apiVersion?: string;
  timeout?: number;
  logger?: Logger;
}

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const DEFAULT_BASE_URL = "https://withpersona.com/api/v1";

// ============================================================================
// Persona Client
// ============================================================================

export class PersonaClient {
  private readonly apiKey: string;
  private readonly webhookSecret?: string;
  private readonly baseUrl: string;
  private readonly apiVersion: string;
  private readonly timeout: number;
  private readonly logger: Logger;

  constructor(config: PersonaClientConfig) {
    this.apiKey = config.apiKey;
    this.webhookSecret = config.webhookSecret;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.apiVersion = config.apiVersion ?? "2023-01-05";
    this.timeout = config.timeout ?? 30000;
    this.logger = config.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[Persona] ${msg}`, meta),
      info: (msg, meta) => console.info(`[Persona] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[Persona] ${msg}`, meta),
      error: (msg, meta) => console.error(`[Persona] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // HTTP Methods
  // ==========================================================================

  private async request<T>(
    method: string,
    path: string,
    data?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Persona-Version": this.apiVersion,
      "Key-Inflection": "snake",
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify({ data }) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const errors = errorBody.errors ?? [];
        const message = errors[0]?.detail ?? `HTTP ${response.status}`;
        throw new PersonaApiError(message, response.status, errors);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof PersonaApiError) {
        this.logger.error("Persona API error", {
          message: error.message,
          statusCode: error.statusCode,
          errors: error.errors,
        });
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new PersonaApiError("Request timeout", 408, []);
        }
        this.logger.error("Request failed", { message: error.message });
        throw new PersonaApiError(error.message, 500, []);
      }

      throw new PersonaApiError("Unknown error", 500, []);
    }
  }

  // ==========================================================================
  // Inquiry Methods
  // ==========================================================================

  /**
   * Create a new KYC inquiry
   * @returns Inquiry data with session token for embedding
   */
  async createInquiry(params: CreateInquiryParams): Promise<{
    inquiry: Inquiry;
    sessionToken: string;
  }> {
    this.logger.info("Creating inquiry", {
      templateId: params.template_id,
      referenceId: params.reference_id,
    });

    const response = await this.request<CreateInquiryResponse>(
      "POST",
      "/inquiries",
      {
        type: "inquiry",
        attributes: {
          inquiry_template_id: params.template_id,
          reference_id: params.reference_id,
          account_id: params.account_id,
          fields: params.fields,
          redirect_uri: params.redirect_uri,
          note: params.note,
          tags: params.tags,
        },
      }
    );

    this.logger.info("Inquiry created", { inquiryId: response.data.id });

    return {
      inquiry: response.data,
      sessionToken: response.meta.session_token,
    };
  }

  /**
   * Get inquiry by ID
   */
  async getInquiry(inquiryId: string): Promise<Inquiry> {
    this.logger.debug("Getting inquiry", { inquiryId });

    const response = await this.request<GetInquiryResponse>(
      "GET",
      `/inquiries/${inquiryId}`
    );

    return response.data;
  }

  /**
   * Get inquiry with included verifications
   */
  async getInquiryWithVerifications(inquiryId: string): Promise<{
    inquiry: Inquiry;
    verifications: Verification[];
  }> {
    this.logger.debug("Getting inquiry with verifications", { inquiryId });

    const response = await this.request<GetInquiryResponse>(
      "GET",
      `/inquiries/${inquiryId}?include=verifications`
    );

    const verifications = (response.included ?? []).filter(
      (item): item is Verification => item.type?.startsWith("verification/")
    );

    return {
      inquiry: response.data,
      verifications,
    };
  }

  /**
   * Get all verifications for an inquiry
   */
  async getVerifications(inquiryId: string): Promise<Verification[]> {
    this.logger.debug("Getting verifications", { inquiryId });

    const response = await this.request<GetVerificationsResponse>(
      "GET",
      `/inquiries/${inquiryId}/verifications`
    );

    return response.data;
  }

  /**
   * Resume an existing inquiry
   */
  async resumeInquiry(inquiryId: string): Promise<{
    inquiry: Inquiry;
    sessionToken: string;
  }> {
    this.logger.info("Resuming inquiry", { inquiryId });

    const response = await this.request<CreateInquiryResponse>(
      "POST",
      `/inquiries/${inquiryId}/resume`
    );

    return {
      inquiry: response.data,
      sessionToken: response.meta.session_token,
    };
  }

  /**
   * Approve an inquiry (manual review)
   */
  async approveInquiry(inquiryId: string, comment?: string): Promise<Inquiry> {
    this.logger.info("Approving inquiry", { inquiryId, comment });

    const response = await this.request<GetInquiryResponse>(
      "POST",
      `/inquiries/${inquiryId}/approve`,
      comment ? { attributes: { comment } } : undefined
    );

    return response.data;
  }

  /**
   * Decline an inquiry (manual review)
   */
  async declineInquiry(inquiryId: string, comment?: string): Promise<Inquiry> {
    this.logger.info("Declining inquiry", { inquiryId, comment });

    const response = await this.request<GetInquiryResponse>(
      "POST",
      `/inquiries/${inquiryId}/decline`,
      comment ? { attributes: { comment } } : undefined
    );

    return response.data;
  }

  /**
   * Redact inquiry data (GDPR deletion)
   */
  async redactInquiry(inquiryId: string): Promise<Inquiry> {
    this.logger.info("Redacting inquiry", { inquiryId });

    const response = await this.request<RedactInquiryResponse>(
      "DELETE",
      `/inquiries/${inquiryId}`
    );

    this.logger.info("Inquiry redacted", { inquiryId });
    return response.data;
  }

  /**
   * Add tags to an inquiry
   */
  async addInquiryTags(inquiryId: string, tags: string[]): Promise<Inquiry> {
    this.logger.debug("Adding tags to inquiry", { inquiryId, tags });

    const response = await this.request<GetInquiryResponse>(
      "POST",
      `/inquiries/${inquiryId}/add-tag`,
      { attributes: { tag_name: tags } }
    );

    return response.data;
  }

  /**
   * Remove tags from an inquiry
   */
  async removeInquiryTags(inquiryId: string, tags: string[]): Promise<Inquiry> {
    this.logger.debug("Removing tags from inquiry", { inquiryId, tags });

    const response = await this.request<GetInquiryResponse>(
      "POST",
      `/inquiries/${inquiryId}/remove-tag`,
      { attributes: { tag_name: tags } }
    );

    return response.data;
  }

  // ==========================================================================
  // Account Methods
  // ==========================================================================

  /**
   * Create or update a Persona account
   */
  async upsertAccount(
    referenceId: string,
    attributes: Record<string, unknown>
  ): Promise<{ id: string; referenceId: string }> {
    this.logger.info("Upserting account", { referenceId });

    const response = await this.request<{
      data: { id: string; attributes: { reference_id: string } };
    }>("POST", "/accounts", {
      type: "account",
      attributes: {
        reference_id: referenceId,
        ...attributes,
      },
    });

    return {
      id: response.data.id,
      referenceId: response.data.attributes.reference_id,
    };
  }

  /**
   * Get account by reference ID
   */
  async getAccountByReferenceId(referenceId: string): Promise<{
    id: string;
    referenceId: string;
  } | null> {
    try {
      const response = await this.request<{
        data: Array<{ id: string; attributes: { reference_id: string } }>;
      }>("GET", `/accounts?filter[reference-id]=${encodeURIComponent(referenceId)}`);

      if (response.data.length === 0) {
        return null;
      }

      return {
        id: response.data[0].id,
        referenceId: response.data[0].attributes.reference_id,
      };
    } catch (error) {
      if (error instanceof PersonaApiError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  // ==========================================================================
  // Webhook Verification
  // ==========================================================================

  /**
   * Verify webhook signature
   */
  verifyWebhook(
    payload: string | Buffer,
    signature: string
  ): { valid: boolean; payload?: WebhookPayload } {
    if (!this.webhookSecret) {
      this.logger.warn("Webhook secret not configured");
      return { valid: false };
    }

    try {
      // Persona uses HMAC-SHA256 for webhook signatures
      const expectedSignature = crypto
        .createHmac("sha256", this.webhookSecret)
        .update(typeof payload === "string" ? payload : payload.toString("utf8"))
        .digest("hex");

      // Signature may come with "sha256=" prefix
      const providedSignature = signature.replace(/^sha256=/, "");

      const valid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature, "hex"),
        Buffer.from(providedSignature, "hex")
      );

      if (valid) {
        const parsedPayload = JSON.parse(
          typeof payload === "string" ? payload : payload.toString("utf8")
        ) as WebhookPayload;

        this.logger.debug("Webhook verified", {
          eventType: parsedPayload.data.type,
        });

        return { valid: true, payload: parsedPayload };
      }

      this.logger.warn("Webhook signature mismatch");
      return { valid: false };
    } catch (error) {
      this.logger.error("Webhook verification failed", { error });
      return { valid: false };
    }
  }

  /**
   * Parse webhook event
   */
  parseWebhookEvent(payload: WebhookPayload): {
    eventType: string;
    resourceType: "inquiry" | "verification";
    resourceId: string;
    resource: Inquiry | Verification;
  } {
    const eventType = payload.data.type;
    const resource = payload.data.attributes.payload.data;
    const resourceType = resource.type === "inquiry" ? "inquiry" : "verification";

    return {
      eventType,
      resourceType,
      resourceId: resource.id,
      resource: resource as Inquiry | Verification,
    };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Check if inquiry is in a terminal state
   */
  isInquiryComplete(inquiry: Inquiry): boolean {
    const terminalStatuses = ["completed", "failed", "expired", "approved", "declined"];
    return terminalStatuses.includes(inquiry.attributes.status);
  }

  /**
   * Check if inquiry passed all verifications
   */
  isInquiryApproved(inquiry: Inquiry): boolean {
    return inquiry.attributes.status === "approved";
  }

  /**
   * Extract personal info from inquiry
   */
  extractPersonalInfo(inquiry: Inquiry): {
    firstName: string | null;
    lastName: string | null;
    middleName: string | null;
    birthdate: string | null;
    email: string | null;
    phone: string | null;
    address: {
      street1: string | null;
      street2: string | null;
      city: string | null;
      subdivision: string | null;
      postalCode: string | null;
      countryCode: string | null;
    };
  } {
    const attrs = inquiry.attributes;
    return {
      firstName: attrs.name_first,
      lastName: attrs.name_last,
      middleName: attrs.name_middle,
      birthdate: attrs.birthdate,
      email: attrs.email_address,
      phone: attrs.phone_number,
      address: {
        street1: attrs.address_street_1,
        street2: attrs.address_street_2,
        city: attrs.address_city,
        subdivision: attrs.address_subdivision,
        postalCode: attrs.address_postal_code,
        countryCode: attrs.address_country_code,
      },
    };
  }
}

export default PersonaClient;
