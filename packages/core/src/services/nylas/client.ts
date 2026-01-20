/**
 * Nylas Email Client
 * Client for Nylas email API integration
 */

import * as crypto from "crypto";
import type {
  Grant,
  AuthUrl,
  TokenExchangeResponse,
  Message,
  ListMessagesParams,
  ListMessagesResponse,
  SendMessageParams,
  UpdateMessageParams,
  Thread,
  ListThreadsParams,
  ListThreadsResponse,
  Draft,
  CreateDraftParams,
  UpdateDraftParams,
  Contact,
  ListContactsParams,
  ListContactsResponse,
  Folder,
  WebhookPayload,
} from "./types";
import { NylasApiError } from "./types";

// ============================================================================
// Configuration
// ============================================================================

export interface NylasClientConfig {
  apiKey: string;
  apiUri?: string;
  webhookSecret?: string;
  timeout?: number;
  logger?: Logger;
}

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const DEFAULT_API_URI = "https://api.us.nylas.com";

// ============================================================================
// Nylas Client
// ============================================================================

export class NylasClient {
  private readonly apiKey: string;
  private readonly apiUri: string;
  private readonly webhookSecret?: string;
  private readonly timeout: number;
  private readonly logger: Logger;

  constructor(config: NylasClientConfig) {
    this.apiKey = config.apiKey;
    this.apiUri = config.apiUri ?? DEFAULT_API_URI;
    this.webhookSecret = config.webhookSecret;
    this.timeout = config.timeout ?? 30000;
    this.logger = config.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[Nylas] ${msg}`, meta),
      info: (msg, meta) => console.info(`[Nylas] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[Nylas] ${msg}`, meta),
      error: (msg, meta) => console.error(`[Nylas] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // HTTP Methods
  // ==========================================================================

  private async request<T>(
    method: string,
    path: string,
    data?: Record<string, unknown>,
    grantId?: string
  ): Promise<T> {
    const url = grantId
      ? `${this.apiUri}/v3/grants/${grantId}${path}`
      : `${this.apiUri}/v3${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseData = await response.json();

      if (!response.ok) {
        throw new NylasApiError(responseData, response.status);
      }

      return responseData as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof NylasApiError) {
        this.logger.error("Nylas API error", {
          type: error.type,
          message: error.message,
          statusCode: error.statusCode,
        });
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new NylasApiError(
            {
              type: "timeout",
              message: "Request timeout",
              request_id: "",
            },
            408
          );
        }
        throw new NylasApiError(
          {
            type: "internal_error",
            message: error.message,
            request_id: "",
          },
          500
        );
      }

      throw error;
    }
  }

  private buildQueryString(params?: Record<string, unknown>): string {
    if (!params) return "";

    const entries = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);

    return entries.length > 0 ? `?${entries.join("&")}` : "";
  }

  // ==========================================================================
  // Authentication
  // ==========================================================================

  /**
   * Get OAuth URL for user authentication
   */
  async getAuthUrl(
    userId: string,
    redirectUri: string,
    scopes: string[],
    provider?: "google" | "microsoft" | "imap",
    state?: string
  ): Promise<AuthUrl> {
    const generatedState = state ?? crypto.randomBytes(16).toString("hex");

    const params = new URLSearchParams({
      client_id: this.apiKey,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      scope: scopes.join(" "),
      state: generatedState,
      login_hint: userId,
    });

    if (provider) {
      params.set("provider", provider);
    }

    return {
      url: `${this.apiUri}/v3/connect/auth?${params.toString()}`,
      state: generatedState,
    };
  }

  /**
   * Exchange authorization code for grant
   */
  async exchangeCode(
    code: string,
    redirectUri: string
  ): Promise<TokenExchangeResponse> {
    this.logger.info("Exchanging authorization code");

    const response = await this.request<{
      data: TokenExchangeResponse;
    }>("POST", "/connect/token", {
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    this.logger.info("Grant created", { grantId: response.data.grant_id });
    return response.data;
  }

  /**
   * Get grant details
   */
  async getGrant(grantId: string): Promise<Grant> {
    const response = await this.request<{ data: Grant }>(
      "GET",
      `/grants/${grantId}`
    );
    return response.data;
  }

  /**
   * Revoke a grant
   */
  async revokeGrant(grantId: string): Promise<void> {
    this.logger.info("Revoking grant", { grantId });

    await this.request<void>("DELETE", `/grants/${grantId}`);

    this.logger.info("Grant revoked", { grantId });
  }

  // ==========================================================================
  // Messages
  // ==========================================================================

  /**
   * List messages
   */
  async listMessages(
    grantId: string,
    params?: ListMessagesParams
  ): Promise<ListMessagesResponse> {
    this.logger.debug("Listing messages", { grantId, params });

    const queryString = this.buildQueryString(params);
    return this.request<ListMessagesResponse>(
      "GET",
      `/messages${queryString}`,
      undefined,
      grantId
    );
  }

  /**
   * Get a single message
   */
  async getMessage(grantId: string, messageId: string): Promise<Message> {
    this.logger.debug("Getting message", { grantId, messageId });

    const response = await this.request<{ data: Message }>(
      "GET",
      `/messages/${messageId}`,
      undefined,
      grantId
    );
    return response.data;
  }

  /**
   * Send a message
   */
  async sendMessage(grantId: string, message: SendMessageParams): Promise<Message> {
    this.logger.info("Sending message", {
      grantId,
      to: message.to.map((r) => r.email),
      subject: message.subject,
    });

    const response = await this.request<{ data: Message }>(
      "POST",
      "/messages/send",
      message as unknown as Record<string, unknown>,
      grantId
    );

    this.logger.info("Message sent", { messageId: response.data.id });
    return response.data;
  }

  /**
   * Update message (mark read/unread, star, move)
   */
  async updateMessage(
    grantId: string,
    messageId: string,
    updates: UpdateMessageParams
  ): Promise<Message> {
    this.logger.debug("Updating message", { grantId, messageId, updates });

    const response = await this.request<{ data: Message }>(
      "PUT",
      `/messages/${messageId}`,
      updates,
      grantId
    );
    return response.data;
  }

  /**
   * Delete a message
   */
  async deleteMessage(grantId: string, messageId: string): Promise<void> {
    this.logger.info("Deleting message", { grantId, messageId });

    await this.request<void>("DELETE", `/messages/${messageId}`, undefined, grantId);
  }

  // ==========================================================================
  // Threads
  // ==========================================================================

  /**
   * List threads
   */
  async listThreads(
    grantId: string,
    params?: ListThreadsParams
  ): Promise<ListThreadsResponse> {
    this.logger.debug("Listing threads", { grantId, params });

    const queryString = this.buildQueryString(params);
    return this.request<ListThreadsResponse>(
      "GET",
      `/threads${queryString}`,
      undefined,
      grantId
    );
  }

  /**
   * Get a single thread
   */
  async getThread(grantId: string, threadId: string): Promise<Thread> {
    this.logger.debug("Getting thread", { grantId, threadId });

    const response = await this.request<{ data: Thread }>(
      "GET",
      `/threads/${threadId}`,
      undefined,
      grantId
    );
    return response.data;
  }

  /**
   * Get messages in a thread
   */
  async getThreadMessages(grantId: string, threadId: string): Promise<Message[]> {
    const response = await this.listMessages(grantId, { thread_id: threadId });
    return response.data;
  }

  // ==========================================================================
  // Drafts
  // ==========================================================================

  /**
   * Create a draft
   */
  async createDraft(grantId: string, draft: CreateDraftParams): Promise<Draft> {
    this.logger.info("Creating draft", { grantId, subject: draft.subject });

    const response = await this.request<{ data: Draft }>(
      "POST",
      "/drafts",
      draft as unknown as Record<string, unknown>,
      grantId
    );

    this.logger.info("Draft created", { draftId: response.data.id });
    return response.data;
  }

  /**
   * Update a draft
   */
  async updateDraft(
    grantId: string,
    draftId: string,
    updates: UpdateDraftParams
  ): Promise<Draft> {
    this.logger.debug("Updating draft", { grantId, draftId });

    const response = await this.request<{ data: Draft }>(
      "PUT",
      `/drafts/${draftId}`,
      updates,
      grantId
    );
    return response.data;
  }

  /**
   * Delete a draft
   */
  async deleteDraft(grantId: string, draftId: string): Promise<void> {
    this.logger.info("Deleting draft", { grantId, draftId });

    await this.request<void>("DELETE", `/drafts/${draftId}`, undefined, grantId);
  }

  /**
   * Send a draft
   */
  async sendDraft(grantId: string, draftId: string): Promise<Message> {
    this.logger.info("Sending draft", { grantId, draftId });

    const response = await this.request<{ data: Message }>(
      "POST",
      `/drafts/${draftId}`,
      undefined,
      grantId
    );

    this.logger.info("Draft sent", { messageId: response.data.id });
    return response.data;
  }

  /**
   * List drafts
   */
  async listDrafts(
    grantId: string,
    params?: { limit?: number; page_token?: string }
  ): Promise<{ data: Draft[]; next_cursor?: string }> {
    const queryString = this.buildQueryString(params);
    return this.request<{ data: Draft[]; next_cursor?: string }>(
      "GET",
      `/drafts${queryString}`,
      undefined,
      grantId
    );
  }

  // ==========================================================================
  // Contacts
  // ==========================================================================

  /**
   * List contacts
   */
  async listContacts(
    grantId: string,
    params?: ListContactsParams
  ): Promise<ListContactsResponse> {
    this.logger.debug("Listing contacts", { grantId, params });

    const queryString = this.buildQueryString(params);
    return this.request<ListContactsResponse>(
      "GET",
      `/contacts${queryString}`,
      undefined,
      grantId
    );
  }

  /**
   * Search contacts
   */
  async searchContacts(
    grantId: string,
    query: string,
    limit: number = 10
  ): Promise<Contact[]> {
    this.logger.debug("Searching contacts", { grantId, query });

    // Search by email
    const byEmail = await this.listContacts(grantId, {
      email: query,
      limit,
    });

    return byEmail.data;
  }

  /**
   * Get a single contact
   */
  async getContact(grantId: string, contactId: string): Promise<Contact> {
    const response = await this.request<{ data: Contact }>(
      "GET",
      `/contacts/${contactId}`,
      undefined,
      grantId
    );
    return response.data;
  }

  // ==========================================================================
  // Folders
  // ==========================================================================

  /**
   * List folders
   */
  async listFolders(grantId: string): Promise<Folder[]> {
    const response = await this.request<{ data: Folder[] }>(
      "GET",
      "/folders",
      undefined,
      grantId
    );
    return response.data;
  }

  /**
   * Get folder by ID
   */
  async getFolder(grantId: string, folderId: string): Promise<Folder> {
    const response = await this.request<{ data: Folder }>(
      "GET",
      `/folders/${folderId}`,
      undefined,
      grantId
    );
    return response.data;
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
      const body = typeof payload === "string" ? payload : payload.toString("utf8");

      // Nylas uses HMAC-SHA256
      const expectedSignature = crypto
        .createHmac("sha256", this.webhookSecret)
        .update(body)
        .digest("hex");

      const valid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature, "hex"),
        Buffer.from(signature, "hex")
      );

      if (valid) {
        const parsedPayload = JSON.parse(body) as WebhookPayload;
        this.logger.debug("Webhook verified", { type: parsedPayload.type });
        return { valid: true, payload: parsedPayload };
      }

      this.logger.warn("Webhook signature mismatch");
      return { valid: false };
    } catch (error) {
      this.logger.error("Webhook verification failed", { error });
      return { valid: false };
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Paginate through all messages
   */
  async *paginateMessages(
    grantId: string,
    params?: Omit<ListMessagesParams, "page_token">
  ): AsyncGenerator<Message> {
    let pageToken: string | undefined;

    do {
      const response = await this.listMessages(grantId, {
        ...params,
        page_token: pageToken,
      });

      for (const message of response.data) {
        yield message;
      }

      pageToken = response.next_cursor;
    } while (pageToken);
  }

  /**
   * Paginate through all threads
   */
  async *paginateThreads(
    grantId: string,
    params?: Omit<ListThreadsParams, "page_token">
  ): AsyncGenerator<Thread> {
    let pageToken: string | undefined;

    do {
      const response = await this.listThreads(grantId, {
        ...params,
        page_token: pageToken,
      });

      for (const thread of response.data) {
        yield thread;
      }

      pageToken = response.next_cursor;
    } while (pageToken);
  }

  /**
   * Mark multiple messages as read/unread
   */
  async markMessagesAsRead(
    grantId: string,
    messageIds: string[],
    read: boolean = true
  ): Promise<void> {
    await Promise.all(
      messageIds.map((id) =>
        this.updateMessage(grantId, id, { unread: !read })
      )
    );
  }
}

export default NylasClient;
