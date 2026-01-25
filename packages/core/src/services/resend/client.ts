/**
 * Resend Email Client
 * Client for sending transactional emails via Resend API
 * Features: Retry logic with exponential backoff, template rendering, batch sending
 */

import * as crypto from "crypto";
import type {
  SendEmailParams,
  SendEmailResponse,
  Email,
  BatchEmailParams,
  BatchEmailResponse,
  Domain,
  WebhookPayload,
} from "./types";
import { ResendApiError } from "./types";

// ============================================================================
// Configuration
// ============================================================================

export interface ResendClientConfig {
  apiKey: string;
  fromEmail?: string;
  fromName?: string;
  baseUrl?: string;
  webhookSecret?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  logger?: Logger;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export interface TemplateContext {
  [key: string]: unknown;
}

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}

const DEFAULT_BASE_URL = "https://api.resend.com";

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
};

// ============================================================================
// Resend Client
// ============================================================================

export class ResendClient {
  private readonly apiKey: string;
  private readonly fromEmail: string;
  private readonly fromName?: string;
  private readonly baseUrl: string;
  private readonly webhookSecret?: string;
  private readonly timeout: number;
  private readonly retryConfig: RetryConfig;
  private readonly logger: Logger;

  constructor(config: ResendClientConfig) {
    this.apiKey = config.apiKey;
    this.fromEmail = config.fromEmail ?? "noreply@pull.app";
    this.fromName = config.fromName;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.webhookSecret = config.webhookSecret;
    this.timeout = config.timeout ?? 30000;
    this.retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      maxRetries: config.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries,
      baseDelay: config.retryDelay ?? DEFAULT_RETRY_CONFIG.baseDelay,
    };
    this.logger = config.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[Resend] ${msg}`, meta),
      info: (msg, meta) => console.info(`[Resend] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[Resend] ${msg}`, meta),
      error: (msg, meta) => console.error(`[Resend] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // Retry Logic
  // ==========================================================================

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private calculateBackoff(attempt: number): number {
    const delay = Math.min(
      this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt),
      this.retryConfig.maxDelay
    );
    // Add jitter (0-25% random variation)
    return delay + Math.random() * delay * 0.25;
  }

  private isRetryableError(error: ResendApiError): boolean {
    // Retry on rate limits (429), server errors (5xx), and timeouts
    return (
      error.statusCode === 429 ||
      error.statusCode === 408 ||
      (error.statusCode >= 500 && error.statusCode < 600)
    );
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (error instanceof ResendApiError && this.isRetryableError(error)) {
          if (attempt < this.retryConfig.maxRetries) {
            const backoff = this.calculateBackoff(attempt);
            this.logger.warn(`${operationName} failed, retrying in ${Math.round(backoff)}ms`, {
              attempt: attempt + 1,
              maxRetries: this.retryConfig.maxRetries,
              statusCode: error.statusCode,
              message: error.message,
            });
            await this.sleep(backoff);
            continue;
          }
        }

        // Non-retryable error or max retries exceeded
        throw error;
      }
    }

    throw lastError ?? new ResendApiError("Max retries exceeded", 500);
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
        throw new ResendApiError(
          responseData.message ?? `HTTP ${response.status}`,
          response.status,
          responseData.name
        );
      }

      return responseData as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ResendApiError) {
        this.logger.error("Resend API error", {
          message: error.message,
          statusCode: error.statusCode,
        });
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new ResendApiError("Request timeout", 408);
        }
        this.logger.error("Request failed", { message: error.message });
        throw new ResendApiError(error.message, 500);
      }

      throw new ResendApiError("Unknown error", 500);
    }
  }

  private getFromAddress(): string {
    return this.fromName
      ? `${this.fromName} <${this.fromEmail}>`
      : this.fromEmail;
  }

  // ==========================================================================
  // Template Rendering
  // ==========================================================================

  /**
   * Render a template string with context variables
   * Supports {{variable}} syntax for simple replacements
   */
  renderTemplate(template: string, context: TemplateContext): string {
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
      const value = this.getNestedValue(context, path);
      if (value === undefined || value === null) {
        this.logger.warn(`Template variable not found: ${path}`);
        return match;
      }
      return String(value);
    });
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce((acc: unknown, part) => {
      if (acc && typeof acc === "object" && part in acc) {
        return (acc as Record<string, unknown>)[part];
      }
      return undefined;
    }, obj);
  }

  /**
   * Render a complete email template (subject, html, text)
   */
  renderEmailTemplate(
    template: { subject: string; html: string; text: string },
    context: TemplateContext
  ): RenderedTemplate {
    return {
      subject: this.renderTemplate(template.subject, context),
      html: this.renderTemplate(template.html, context),
      text: this.renderTemplate(template.text, context),
    };
  }

  // ==========================================================================
  // Email Methods
  // ==========================================================================

  /**
   * Send a single email with automatic retry on failure
   */
  async sendEmail(params: SendEmailParams): Promise<SendEmailResponse> {
    this.logger.info("Sending email", {
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
    });

    const response = await this.executeWithRetry(
      () =>
        this.request<SendEmailResponse>("POST", "/emails", {
          from: this.getFromAddress(),
          ...params,
        }),
      "sendEmail"
    );

    this.logger.info("Email sent", { emailId: response.id });
    return response;
  }

  /**
   * Send email using a pre-defined template with context
   */
  async sendTemplatedEmail(
    to: string | string[],
    template: { subject: string; html: string; text: string },
    context: TemplateContext,
    options: Partial<SendEmailParams> = {}
  ): Promise<SendEmailResponse> {
    const rendered = this.renderEmailTemplate(template, context);
    return this.sendEmail({
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      ...options,
    });
  }

  /**
   * Send multiple emails in a batch with automatic retry
   */
  async sendBatchEmails(params: BatchEmailParams): Promise<BatchEmailResponse> {
    this.logger.info("Sending batch emails", { count: params.emails.length });

    const emails = params.emails.map((email) => ({
      from: this.getFromAddress(),
      ...email,
    }));

    const response = await this.executeWithRetry(
      () =>
        this.request<BatchEmailResponse>("POST", "/emails/batch", { emails }),
      "sendBatchEmails"
    );

    this.logger.info("Batch emails sent", { count: response.data.length });
    return response;
  }

  /**
   * Send batch templated emails
   */
  async sendBatchTemplatedEmails(
    recipients: Array<{
      to: string | string[];
      context: TemplateContext;
      options?: Partial<SendEmailParams>;
    }>,
    template: { subject: string; html: string; text: string }
  ): Promise<BatchEmailResponse> {
    const emails = recipients.map(({ to, context, options }) => {
      const rendered = this.renderEmailTemplate(template, context);
      return {
        to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        ...options,
      };
    });

    return this.sendBatchEmails({ emails });
  }

  /**
   * Get email by ID
   */
  async getEmail(emailId: string): Promise<Email> {
    this.logger.debug("Getting email", { emailId });
    return this.request<Email>("GET", `/emails/${emailId}`);
  }

  /**
   * Cancel a scheduled email
   */
  async cancelEmail(emailId: string): Promise<{ id: string; canceled: boolean }> {
    this.logger.info("Canceling email", { emailId });

    const response = await this.request<{ id: string; canceled: boolean }>(
      "POST",
      `/emails/${emailId}/cancel`
    );

    this.logger.info("Email canceled", { emailId, canceled: response.canceled });
    return response;
  }

  // ==========================================================================
  // Domain Methods
  // ==========================================================================

  /**
   * List all domains
   */
  async listDomains(): Promise<Domain[]> {
    const response = await this.request<{ data: Domain[] }>("GET", "/domains");
    return response.data;
  }

  /**
   * Get domain by ID
   */
  async getDomain(domainId: string): Promise<Domain> {
    return this.request<Domain>("GET", `/domains/${domainId}`);
  }

  /**
   * Verify a domain
   */
  async verifyDomain(domainId: string): Promise<Domain> {
    this.logger.info("Verifying domain", { domainId });
    return this.request<Domain>("POST", `/domains/${domainId}/verify`);
  }

  // ==========================================================================
  // Template Email Methods
  // ==========================================================================

  /**
   * Send verification email for new accounts
   */
  async sendVerificationEmail(
    email: string,
    token: string,
    frontendUrl?: string
  ): Promise<SendEmailResponse> {
    const baseUrl = frontendUrl ?? process.env.FRONTEND_URL ?? "https://app.pull.com";
    const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;

    return this.sendEmail({
      to: email,
      subject: "Verify your PULL account",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h1 style="color: #1a1a1a; margin-bottom: 24px;">Welcome to PULL</h1>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
              Thanks for signing up! Please verify your email address by clicking the button below.
            </p>
            <div style="margin: 32px 0;">
              <a href="${verifyUrl}" style="display: inline-block; background-color: #0066ff; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">
                Verify Email Address
              </a>
            </div>
            <p style="color: #6a6a6a; font-size: 14px; line-height: 1.5;">
              If you didn't create an account with PULL, you can safely ignore this email.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;">
            <p style="color: #999; font-size: 12px;">
              This link will expire in 24 hours. If you need a new verification link, please sign in to request another one.
            </p>
          </div>
        </body>
        </html>
      `,
      text: `Welcome to PULL!\n\nPlease verify your email address by visiting: ${verifyUrl}\n\nIf you didn't create an account with PULL, you can safely ignore this email.\n\nThis link will expire in 24 hours.`,
      tags: [{ name: "type", value: "verification" }],
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    email: string,
    token: string,
    frontendUrl?: string
  ): Promise<SendEmailResponse> {
    const baseUrl = frontendUrl ?? process.env.FRONTEND_URL ?? "https://app.pull.com";
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

    return this.sendEmail({
      to: email,
      subject: "Reset your PULL password",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h1 style="color: #1a1a1a; margin-bottom: 24px;">Reset Your Password</h1>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
              We received a request to reset your password. Click the button below to create a new password.
            </p>
            <div style="margin: 32px 0;">
              <a href="${resetUrl}" style="display: inline-block; background-color: #0066ff; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">
                Reset Password
              </a>
            </div>
            <p style="color: #6a6a6a; font-size: 14px; line-height: 1.5;">
              If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;">
            <p style="color: #999; font-size: 12px;">
              This link will expire in 1 hour. If you need a new reset link, please visit our website to request another one.
            </p>
          </div>
        </body>
        </html>
      `,
      text: `Reset Your Password\n\nWe received a request to reset your password. Visit the following link to create a new password:\n\n${resetUrl}\n\nIf you didn't request a password reset, you can safely ignore this email.\n\nThis link will expire in 1 hour.`,
      tags: [{ name: "type", value: "password-reset" }],
    });
  }

  /**
   * Send order confirmation email
   */
  async sendOrderConfirmation(
    email: string,
    order: {
      id: string;
      symbol: string;
      side: "buy" | "sell";
      quantity: number;
      price?: number;
      status: string;
      filledAt?: string;
    }
  ): Promise<SendEmailResponse> {
    const actionText = order.side === "buy" ? "Bought" : "Sold";
    const priceText = order.price
      ? `at $${order.price.toFixed(2)}`
      : "at market price";

    return this.sendEmail({
      to: email,
      subject: `Order ${order.id} - ${order.status.charAt(0).toUpperCase() + order.status.slice(1)}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h1 style="color: #1a1a1a; margin-bottom: 24px;">Order Confirmation</h1>
            <div style="background: #f8f9fa; border-radius: 6px; padding: 24px; margin-bottom: 24px;">
              <p style="color: #4a4a4a; font-size: 18px; margin: 0 0 16px 0;">
                <strong>${actionText} ${order.quantity} ${order.symbol}</strong>
              </p>
              <p style="color: #6a6a6a; font-size: 14px; margin: 0;">
                ${priceText}
              </p>
            </div>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #6a6a6a;">Order ID</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #1a1a1a; text-align: right; font-family: monospace;">${order.id}</td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #6a6a6a;">Status</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #1a1a1a; text-align: right;">
                  <span style="background: ${order.status === "filled" ? "#d4edda" : "#fff3cd"}; color: ${order.status === "filled" ? "#155724" : "#856404"}; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">
                    ${order.status.toUpperCase()}
                  </span>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px 0; color: #6a6a6a;">Time</td>
                <td style="padding: 12px 0; color: #1a1a1a; text-align: right;">${order.filledAt ?? new Date().toISOString()}</td>
              </tr>
            </table>
            <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">
              View your full order history in the PULL app.
            </p>
          </div>
        </body>
        </html>
      `,
      text: `Order Confirmation\n\n${actionText} ${order.quantity} ${order.symbol} ${priceText}\n\nOrder ID: ${order.id}\nStatus: ${order.status}\nTime: ${order.filledAt ?? new Date().toISOString()}\n\nView your full order history in the PULL app.`,
      tags: [
        { name: "type", value: "order-confirmation" },
        { name: "order_id", value: order.id },
      ],
    });
  }

  /**
   * Send KYC status update email
   */
  async sendKYCStatusEmail(
    email: string,
    status: "approved" | "pending" | "rejected",
    reason?: string
  ): Promise<SendEmailResponse> {
    const statusConfig = {
      approved: {
        subject: "Your PULL account has been verified",
        title: "Account Verified!",
        message: "Your identity verification is complete. You now have full access to all PULL features.",
        color: "#28a745",
      },
      pending: {
        subject: "Your PULL verification is under review",
        title: "Verification In Progress",
        message: "We're reviewing your submitted documents. This usually takes 1-2 business days.",
        color: "#ffc107",
      },
      rejected: {
        subject: "Action required: Your PULL verification",
        title: "Verification Unsuccessful",
        message: reason ?? "We couldn't verify your identity with the documents provided. Please try again with clearer documents.",
        color: "#dc3545",
      },
    };

    const config = statusConfig[status];

    return this.sendEmail({
      to: email,
      subject: config.subject,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="width: 60px; height: 60px; background: ${config.color}; border-radius: 50%; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center;">
              <span style="color: white; font-size: 24px;">${status === "approved" ? "✓" : status === "pending" ? "⏳" : "!"}</span>
            </div>
            <h1 style="color: #1a1a1a; margin-bottom: 24px; text-align: center;">${config.title}</h1>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; text-align: center;">
              ${config.message}
            </p>
            ${status === "rejected" ? `
              <div style="margin: 32px 0; text-align: center;">
                <a href="${process.env.FRONTEND_URL ?? "https://app.pull.com"}/verify" style="display: inline-block; background-color: #0066ff; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">
                  Retry Verification
                </a>
              </div>
            ` : ""}
          </div>
        </body>
        </html>
      `,
      text: `${config.title}\n\n${config.message}`,
      tags: [
        { name: "type", value: "kyc-status" },
        { name: "kyc_status", value: status },
      ],
    });
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

      // Resend uses HMAC-SHA256 with svix
      const expectedSignature = crypto
        .createHmac("sha256", this.webhookSecret)
        .update(body)
        .digest("base64");

      const valid = signature === expectedSignature;

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
}

// ============================================================================
// Simple Client Factory (for environment-based configuration)
// ============================================================================

/**
 * Create a Resend client from environment variables
 */
export function createResendClient(): ResendClient {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY environment variable is required");
  }

  return new ResendClient({
    apiKey,
    fromEmail: process.env.RESEND_FROM_EMAIL ?? "noreply@pull.app",
    fromName: process.env.RESEND_FROM_NAME,
    webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
  });
}

/**
 * Simple functional client for quick usage
 */
export const resendClient = {
  async sendEmail(params: SendEmailParams): Promise<SendEmailResponse> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn("Resend API key not configured, skipping email");
      return { id: `mock-${Date.now()}` };
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@pull.app";

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        ...params,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Resend API error: ${response.status} ${JSON.stringify(error)}`);
    }

    return response.json();
  },

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const verifyUrl = `${process.env.FRONTEND_URL ?? "https://app.pull.com"}/verify-email?token=${token}`;
    await this.sendEmail({
      to: email,
      subject: "Verify your PULL account",
      html: `<h1>Welcome to PULL</h1><p>Click <a href="${verifyUrl}">here</a> to verify your email.</p>`,
    });
  },

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL ?? "https://app.pull.com"}/reset-password?token=${token}`;
    await this.sendEmail({
      to: email,
      subject: "Reset your PULL password",
      html: `<h1>Password Reset</h1><p>Click <a href="${resetUrl}">here</a> to reset your password.</p>`,
    });
  },

  async sendOrderConfirmation(
    email: string,
    order: { id: string; quantity: number; symbol: string; status: string }
  ): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: `Order ${order.id} Confirmed`,
      html: `<h1>Order Confirmed</h1><p>Your order for ${order.quantity} ${order.symbol} has been ${order.status}.</p>`,
    });
  },
};

export default ResendClient;
