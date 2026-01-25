/**
 * Email Service
 * High-level email service with queue integration, unsubscribe handling,
 * and comprehensive email management for the PULL platform.
 */

import { ResendClient, type ResendClientConfig, type Logger } from "./client";
import type { SendEmailParams, SendEmailResponse, BatchEmailResponse, EmailRecipient } from "./types";
import {
  emailTemplates,
  type WelcomeEmailData,
  type VerificationEmailData,
  type PasswordResetEmailData,
  type OrderConfirmationEmailData,
  type WinNotificationEmailData,
  type DepositConfirmationEmailData,
  type WithdrawalConfirmationEmailData,
  type WeeklyDigestEmailData,
} from "./templates";

// ============================================================================
// Types
// ============================================================================

export interface EmailServiceConfig extends ResendClientConfig {
  /** Redis client for queue operations (optional) */
  redis?: RedisAdapter;
  /** Database adapter for preferences (optional) */
  db?: DatabaseAdapter;
  /** Queue name for bulk emails */
  queueName?: string;
  /** Batch size for bulk operations */
  batchSize?: number;
  /** Enable email tracking */
  trackingEnabled?: boolean;
}

export interface RedisAdapter {
  lpush(key: string, value: string): Promise<number>;
  rpop(key: string): Promise<string | null>;
  llen(key: string): Promise<number>;
  set(key: string, value: string, options?: { ex?: number }): Promise<void>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<number>;
  sismember(key: string, member: string): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
}

export interface DatabaseAdapter {
  getUserEmailPreferences(userId: string): Promise<EmailPreferences | null>;
  updateUserEmailPreferences(userId: string, preferences: Partial<EmailPreferences>): Promise<void>;
  logEmailSent(log: EmailLog): Promise<void>;
  getEmailLogs(userId: string, limit?: number): Promise<EmailLog[]>;
}

export interface EmailPreferences {
  userId: string;
  email: string;
  marketing: boolean;
  transactional: boolean;
  weeklyDigest: boolean;
  orderUpdates: boolean;
  winNotifications: boolean;
  depositWithdrawal: boolean;
  unsubscribedAt?: Date;
}

export interface EmailLog {
  id?: string;
  userId: string;
  email: string;
  emailType: string;
  resendId: string;
  subject: string;
  sentAt: Date;
  status: "sent" | "delivered" | "bounced" | "failed";
  metadata?: Record<string, unknown>;
}

export interface QueuedEmail {
  id: string;
  to: string;
  templateType: string;
  templateData: Record<string, unknown>;
  options?: Partial<SendEmailParams>;
  priority: "high" | "normal" | "low";
  scheduledFor?: Date;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
}

export interface EmailResult {
  success: boolean;
  emailId?: string;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

export interface BulkEmailResult {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  results: EmailResult[];
}

// ============================================================================
// Email Service
// ============================================================================

export class EmailService {
  private readonly client: ResendClient;
  private readonly redis?: RedisAdapter;
  private readonly db?: DatabaseAdapter;
  private readonly queueName: string;
  private readonly batchSize: number;
  private readonly trackingEnabled: boolean;
  private readonly logger: Logger;

  constructor(config: EmailServiceConfig) {
    this.client = new ResendClient(config);
    this.redis = config.redis;
    this.db = config.db;
    this.queueName = config.queueName ?? "pull:email:queue";
    this.batchSize = config.batchSize ?? 50;
    this.trackingEnabled = config.trackingEnabled ?? true;
    this.logger = config.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[EmailService] ${msg}`, meta),
      info: (msg, meta) => console.info(`[EmailService] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[EmailService] ${msg}`, meta),
      error: (msg, meta) => console.error(`[EmailService] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // Unsubscribe Management
  // ==========================================================================

  /**
   * Check if an email address is unsubscribed
   */
  async isUnsubscribed(email: string, emailType?: string): Promise<boolean> {
    const normalizedEmail = email.toLowerCase().trim();

    // Check Redis cache first
    if (this.redis) {
      const isGloballyUnsubscribed = await this.redis.sismember(
        "pull:email:unsubscribed:global",
        normalizedEmail
      );
      if (isGloballyUnsubscribed) return true;

      if (emailType) {
        const isTypeUnsubscribed = await this.redis.sismember(
          `pull:email:unsubscribed:${emailType}`,
          normalizedEmail
        );
        if (isTypeUnsubscribed) return true;
      }
    }

    return false;
  }

  /**
   * Unsubscribe an email address
   */
  async unsubscribe(
    email: string,
    options: { global?: boolean; emailTypes?: string[] } = {}
  ): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    if (this.redis) {
      if (options.global) {
        await this.redis.sadd("pull:email:unsubscribed:global", normalizedEmail);
        this.logger.info("Email globally unsubscribed", { email: normalizedEmail });
      } else if (options.emailTypes?.length) {
        await Promise.all(
          options.emailTypes.map((type) =>
            this.redis!.sadd(`pull:email:unsubscribed:${type}`, normalizedEmail)
          )
        );
        this.logger.info("Email unsubscribed from types", {
          email: normalizedEmail,
          types: options.emailTypes,
        });
      }
    }
  }

  /**
   * Resubscribe an email address
   */
  async resubscribe(
    email: string,
    options: { global?: boolean; emailTypes?: string[] } = {}
  ): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    if (this.redis) {
      if (options.global) {
        await this.redis.srem("pull:email:unsubscribed:global", normalizedEmail);
        this.logger.info("Email resubscribed globally", { email: normalizedEmail });
      } else if (options.emailTypes?.length) {
        await Promise.all(
          options.emailTypes.map((type) =>
            this.redis!.srem(`pull:email:unsubscribed:${type}`, normalizedEmail)
          )
        );
        this.logger.info("Email resubscribed to types", {
          email: normalizedEmail,
          types: options.emailTypes,
        });
      }
    }
  }

  /**
   * Generate an unsubscribe token for a user
   */
  async generateUnsubscribeToken(email: string, userId?: string): Promise<string> {
    const token = this.generateToken();
    const data = JSON.stringify({ email, userId, createdAt: Date.now() });

    if (this.redis) {
      await this.redis.set(`pull:email:unsub:${token}`, data, { ex: 86400 * 30 }); // 30 days
    }

    return token;
  }

  /**
   * Verify and process an unsubscribe token
   */
  async processUnsubscribeToken(token: string): Promise<{ success: boolean; email?: string }> {
    if (!this.redis) {
      return { success: false };
    }

    const data = await this.redis.get(`pull:email:unsub:${token}`);
    if (!data) {
      return { success: false };
    }

    const { email } = JSON.parse(data);
    await this.unsubscribe(email, { global: true });
    await this.redis.del(`pull:email:unsub:${token}`);

    return { success: true, email };
  }

  private generateToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  // ==========================================================================
  // Email Preferences
  // ==========================================================================

  /**
   * Get user email preferences
   */
  async getPreferences(userId: string): Promise<EmailPreferences | null> {
    if (!this.db) {
      this.logger.warn("Database adapter not configured, cannot get preferences");
      return null;
    }
    return this.db.getUserEmailPreferences(userId);
  }

  /**
   * Update user email preferences
   */
  async updatePreferences(
    userId: string,
    preferences: Partial<EmailPreferences>
  ): Promise<void> {
    if (!this.db) {
      this.logger.warn("Database adapter not configured, cannot update preferences");
      return;
    }
    await this.db.updateUserEmailPreferences(userId, preferences);
    this.logger.info("Email preferences updated", { userId, preferences });
  }

  /**
   * Check if user can receive a specific email type
   */
  async canReceiveEmail(userId: string, emailType: string): Promise<boolean> {
    const prefs = await this.getPreferences(userId);
    if (!prefs) return true; // Default to allowing if no preferences found

    if (prefs.unsubscribedAt) return false;
    if (!prefs.transactional && ["verification", "passwordReset"].includes(emailType)) {
      return true; // Always send transactional emails
    }

    switch (emailType) {
      case "weeklyDigest":
        return prefs.weeklyDigest;
      case "orderConfirmation":
        return prefs.orderUpdates;
      case "winNotification":
        return prefs.winNotifications;
      case "depositConfirmation":
      case "withdrawalConfirmation":
        return prefs.depositWithdrawal;
      case "marketing":
        return prefs.marketing;
      default:
        return true;
    }
  }

  // ==========================================================================
  // Queue Management
  // ==========================================================================

  /**
   * Add an email to the queue for later sending
   */
  async queueEmail(
    to: string,
    templateType: string,
    templateData: Record<string, unknown>,
    options: {
      priority?: "high" | "normal" | "low";
      scheduledFor?: Date;
      maxAttempts?: number;
      sendOptions?: Partial<SendEmailParams>;
    } = {}
  ): Promise<string> {
    if (!this.redis) {
      throw new Error("Redis adapter required for queue operations");
    }

    const queuedEmail: QueuedEmail = {
      id: this.generateToken().slice(0, 16),
      to,
      templateType,
      templateData,
      options: options.sendOptions,
      priority: options.priority ?? "normal",
      scheduledFor: options.scheduledFor,
      attempts: 0,
      maxAttempts: options.maxAttempts ?? 3,
      createdAt: new Date(),
    };

    const queueKey = `${this.queueName}:${queuedEmail.priority}`;
    await this.redis.lpush(queueKey, JSON.stringify(queuedEmail));

    this.logger.info("Email queued", {
      id: queuedEmail.id,
      to,
      templateType,
      priority: queuedEmail.priority,
    });

    return queuedEmail.id;
  }

  /**
   * Process queued emails
   */
  async processQueue(limit: number = 100): Promise<BulkEmailResult> {
    if (!this.redis) {
      throw new Error("Redis adapter required for queue operations");
    }

    const results: EmailResult[] = [];
    let processed = 0;

    // Process by priority (high -> normal -> low)
    for (const priority of ["high", "normal", "low"]) {
      if (processed >= limit) break;

      const queueKey = `${this.queueName}:${priority}`;
      const remaining = limit - processed;

      for (let i = 0; i < remaining; i++) {
        const item = await this.redis.rpop(queueKey);
        if (!item) break;

        const queuedEmail: QueuedEmail = JSON.parse(item);

        // Check if scheduled for later
        if (queuedEmail.scheduledFor && new Date(queuedEmail.scheduledFor) > new Date()) {
          // Put it back in the queue
          await this.redis.lpush(queueKey, item);
          continue;
        }

        const result = await this.processQueuedEmail(queuedEmail);
        results.push(result);
        processed++;
      }
    }

    const sent = results.filter((r) => r.success && !r.skipped).length;
    const failed = results.filter((r) => !r.success && !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;

    this.logger.info("Queue processed", { total: processed, sent, failed, skipped });

    return { total: processed, sent, failed, skipped, results };
  }

  private async processQueuedEmail(queuedEmail: QueuedEmail): Promise<EmailResult> {
    try {
      // Check unsubscribe status
      const isUnsubscribed = await this.isUnsubscribed(
        queuedEmail.to,
        queuedEmail.templateType
      );

      if (isUnsubscribed) {
        return {
          success: true,
          skipped: true,
          reason: "unsubscribed",
        };
      }

      // Send the email using the appropriate template
      const result = await this.sendByTemplateType(
        queuedEmail.to,
        queuedEmail.templateType,
        queuedEmail.templateData,
        queuedEmail.options
      );

      return {
        success: true,
        emailId: result.id,
      };
    } catch (error) {
      queuedEmail.attempts++;

      // Retry if under max attempts
      if (queuedEmail.attempts < queuedEmail.maxAttempts && this.redis) {
        await this.redis.lpush(
          `${this.queueName}:${queuedEmail.priority}`,
          JSON.stringify(queuedEmail)
        );
        this.logger.warn("Email send failed, requeued", {
          id: queuedEmail.id,
          attempts: queuedEmail.attempts,
          error: (error as Error).message,
        });
      }

      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    high: number;
    normal: number;
    low: number;
    total: number;
  }> {
    if (!this.redis) {
      return { high: 0, normal: 0, low: 0, total: 0 };
    }

    const [high, normal, low] = await Promise.all([
      this.redis.llen(`${this.queueName}:high`),
      this.redis.llen(`${this.queueName}:normal`),
      this.redis.llen(`${this.queueName}:low`),
    ]);

    return { high, normal, low, total: high + normal + low };
  }

  // ==========================================================================
  // High-Level Email Functions
  // ==========================================================================

  /**
   * Send welcome email to a new user
   */
  async sendWelcomeEmail(
    data: WelcomeEmailData,
    options?: Partial<SendEmailParams>
  ): Promise<EmailResult> {
    return this.sendTemplatedEmail("welcome", data.email, data, options);
  }

  /**
   * Send email verification
   */
  async sendVerificationEmail(
    data: VerificationEmailData,
    options?: Partial<SendEmailParams>
  ): Promise<EmailResult> {
    // Verification emails should always be sent (transactional)
    const template = emailTemplates.verification(data);
    try {
      const result = await this.client.sendEmail({
        to: data.email,
        subject: template.subject,
        html: template.html,
        text: template.text,
        tags: [{ name: "type", value: "verification" }],
        ...options,
      });
      await this.logEmail(data.email, "verification", result.id, template.subject);
      return { success: true, emailId: result.id };
    } catch (error) {
      this.logger.error("Failed to send verification email", { error, email: data.email });
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    data: PasswordResetEmailData,
    options?: Partial<SendEmailParams>
  ): Promise<EmailResult> {
    // Password reset emails should always be sent (transactional)
    const template = emailTemplates.passwordReset(data);
    try {
      const result = await this.client.sendEmail({
        to: data.email,
        subject: template.subject,
        html: template.html,
        text: template.text,
        tags: [{ name: "type", value: "password-reset" }],
        ...options,
      });
      await this.logEmail(data.email, "passwordReset", result.id, template.subject);
      return { success: true, emailId: result.id };
    } catch (error) {
      this.logger.error("Failed to send password reset email", { error, email: data.email });
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Send order confirmation email
   */
  async sendOrderConfirmationEmail(
    data: OrderConfirmationEmailData,
    options?: Partial<SendEmailParams>
  ): Promise<EmailResult> {
    return this.sendTemplatedEmail("orderConfirmation", data.email, data, options);
  }

  /**
   * Send win notification email
   */
  async sendWinNotificationEmail(
    data: WinNotificationEmailData,
    options?: Partial<SendEmailParams>
  ): Promise<EmailResult> {
    return this.sendTemplatedEmail("winNotification", data.email, data, options);
  }

  /**
   * Send deposit confirmation email
   */
  async sendDepositConfirmationEmail(
    data: DepositConfirmationEmailData,
    options?: Partial<SendEmailParams>
  ): Promise<EmailResult> {
    return this.sendTemplatedEmail("depositConfirmation", data.email, data, options);
  }

  /**
   * Send withdrawal confirmation email
   */
  async sendWithdrawalConfirmationEmail(
    data: WithdrawalConfirmationEmailData,
    options?: Partial<SendEmailParams>
  ): Promise<EmailResult> {
    return this.sendTemplatedEmail("withdrawalConfirmation", data.email, data, options);
  }

  /**
   * Send weekly digest email
   */
  async sendWeeklyDigestEmail(
    data: WeeklyDigestEmailData,
    options?: Partial<SendEmailParams>
  ): Promise<EmailResult> {
    return this.sendTemplatedEmail("weeklyDigest", data.email, data, options);
  }

  // ==========================================================================
  // Bulk Email Operations
  // ==========================================================================

  /**
   * Send bulk emails to multiple recipients
   */
  async sendBulkEmails(
    recipients: Array<{
      email: string;
      templateType: keyof typeof emailTemplates;
      templateData: Record<string, unknown>;
      options?: Partial<SendEmailParams>;
    }>
  ): Promise<BulkEmailResult> {
    const results: EmailResult[] = [];
    const batches = this.chunkArray(recipients, this.batchSize);

    for (const batch of batches) {
      // Check unsubscribe status for all in batch
      const emailsToSend: typeof batch = [];

      for (const recipient of batch) {
        const isUnsubscribed = await this.isUnsubscribed(
          recipient.email,
          recipient.templateType
        );

        if (isUnsubscribed) {
          results.push({
            success: true,
            skipped: true,
            reason: "unsubscribed",
          });
        } else {
          emailsToSend.push(recipient);
        }
      }

      if (emailsToSend.length === 0) continue;

      // Prepare batch emails
      const batchEmails = emailsToSend.map((recipient) => {
        const templateFn = emailTemplates[recipient.templateType];
        const template = templateFn(recipient.templateData as never);
        return {
          to: recipient.email,
          subject: template.subject,
          html: template.html,
          text: template.text,
          tags: [{ name: "type", value: recipient.templateType }],
          ...recipient.options,
        };
      });

      try {
        const response = await this.client.sendBatchEmails({ emails: batchEmails });

        for (let i = 0; i < response.data.length; i++) {
          results.push({
            success: true,
            emailId: response.data[i].id,
          });

          await this.logEmail(
            emailsToSend[i].email,
            emailsToSend[i].templateType,
            response.data[i].id,
            batchEmails[i].subject
          );
        }
      } catch (error) {
        this.logger.error("Batch send failed", { error, batchSize: batchEmails.length });
        for (const _ of batchEmails) {
          results.push({
            success: false,
            error: (error as Error).message,
          });
        }
      }
    }

    const sent = results.filter((r) => r.success && !r.skipped).length;
    const failed = results.filter((r) => !r.success && !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;

    return { total: recipients.length, sent, failed, skipped, results };
  }

  /**
   * Queue bulk emails for later processing
   */
  async queueBulkEmails(
    recipients: Array<{
      email: string;
      templateType: string;
      templateData: Record<string, unknown>;
      options?: Partial<SendEmailParams>;
    }>,
    queueOptions: {
      priority?: "high" | "normal" | "low";
      scheduledFor?: Date;
    } = {}
  ): Promise<{ queued: number; ids: string[] }> {
    const ids: string[] = [];

    for (const recipient of recipients) {
      const id = await this.queueEmail(
        recipient.email,
        recipient.templateType,
        recipient.templateData,
        {
          priority: queueOptions.priority,
          scheduledFor: queueOptions.scheduledFor,
          sendOptions: recipient.options,
        }
      );
      ids.push(id);
    }

    return { queued: ids.length, ids };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private async sendTemplatedEmail<T extends { email: string }>(
    templateType: keyof typeof emailTemplates,
    email: string,
    data: T,
    options?: Partial<SendEmailParams>
  ): Promise<EmailResult> {
    try {
      // Check unsubscribe status
      const isUnsubscribed = await this.isUnsubscribed(email, templateType);
      if (isUnsubscribed) {
        return { success: true, skipped: true, reason: "unsubscribed" };
      }

      const templateFn = emailTemplates[templateType];
      const template = templateFn(data as never);

      const result = await this.client.sendEmail({
        to: email,
        subject: template.subject,
        html: template.html,
        text: template.text,
        tags: [{ name: "type", value: templateType }],
        ...options,
      });

      await this.logEmail(email, templateType, result.id, template.subject);

      return { success: true, emailId: result.id };
    } catch (error) {
      this.logger.error(`Failed to send ${templateType} email`, { error, email });
      return { success: false, error: (error as Error).message };
    }
  }

  private async sendByTemplateType(
    to: string,
    templateType: string,
    templateData: Record<string, unknown>,
    options?: Partial<SendEmailParams>
  ): Promise<SendEmailResponse> {
    const templateFn = emailTemplates[templateType as keyof typeof emailTemplates];
    if (!templateFn) {
      throw new Error(`Unknown template type: ${templateType}`);
    }

    const template = templateFn(templateData as never);

    return this.client.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      tags: [{ name: "type", value: templateType }],
      ...options,
    });
  }

  private async logEmail(
    email: string,
    emailType: string,
    resendId: string,
    subject: string,
    userId?: string
  ): Promise<void> {
    if (!this.trackingEnabled) return;

    if (this.db) {
      try {
        await this.db.logEmailSent({
          userId: userId ?? "unknown",
          email,
          emailType,
          resendId,
          subject,
          sentAt: new Date(),
          status: "sent",
        });
      } catch (error) {
        this.logger.warn("Failed to log email", { error, email, emailType });
      }
    }
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private extractEmail(
    to: string | string[] | EmailRecipient | EmailRecipient[]
  ): string {
    if (typeof to === "string") {
      return to;
    }
    if (Array.isArray(to)) {
      const first = to[0];
      if (typeof first === "string") {
        return first;
      }
      return (first as EmailRecipient).email;
    }
    return (to as EmailRecipient).email;
  }

  // ==========================================================================
  // Direct Client Access
  // ==========================================================================

  /**
   * Get the underlying Resend client for direct API access
   */
  getClient(): ResendClient {
    return this.client;
  }

  /**
   * Send a raw email without using templates
   */
  async sendRawEmail(params: SendEmailParams): Promise<EmailResult> {
    try {
      const toEmail = this.extractEmail(params.to);
      const isUnsubscribed = await this.isUnsubscribed(toEmail);
      if (isUnsubscribed) {
        return { success: true, skipped: true, reason: "unsubscribed" };
      }

      const result = await this.client.sendEmail(params);
      return { success: true, emailId: result.id };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an email service from environment variables
 */
export function createEmailService(options: {
  redis?: RedisAdapter;
  db?: DatabaseAdapter;
} = {}): EmailService {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY environment variable is required");
  }

  return new EmailService({
    apiKey,
    fromEmail: process.env.RESEND_FROM_EMAIL ?? "noreply@pull.app",
    fromName: process.env.RESEND_FROM_NAME ?? "PULL",
    webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
    redis: options.redis,
    db: options.db,
  });
}

// ============================================================================
// Singleton Instance
// ============================================================================

let emailServiceInstance: EmailService | null = null;

/**
 * Get the singleton email service instance
 */
export function getEmailService(options?: {
  redis?: RedisAdapter;
  db?: DatabaseAdapter;
}): EmailService {
  if (!emailServiceInstance) {
    emailServiceInstance = createEmailService(options);
  }
  return emailServiceInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetEmailService(): void {
  emailServiceInstance = null;
}

export default EmailService;
