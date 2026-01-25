/**
 * Resend Email Service
 * Complete transactional email integration with templates, queue support, and unsubscribe handling
 */

// Client exports
export {
  ResendClient,
  createResendClient,
  resendClient,
  type ResendClientConfig,
  type Logger,
  type RetryConfig,
  type TemplateContext,
  type RenderedTemplate,
} from "./client";

// Type exports
export * from "./types";

// Template exports
export {
  emailTemplates,
  welcomeEmail,
  verificationEmail,
  passwordResetEmail,
  orderConfirmationEmail,
  winNotificationEmail,
  depositConfirmationEmail,
  withdrawalConfirmationEmail,
  weeklyDigestEmail,
  type EmailTemplate,
  type WelcomeEmailData,
  type VerificationEmailData,
  type PasswordResetEmailData,
  type OrderConfirmationEmailData,
  type WinNotificationEmailData,
  type DepositConfirmationEmailData,
  type WithdrawalConfirmationEmailData,
  type WeeklyDigestEmailData,
  type EmailTemplateType,
} from "./templates";

// Service exports
export {
  EmailService,
  createEmailService,
  getEmailService,
  resetEmailService,
  type EmailServiceConfig,
  type RedisAdapter,
  type DatabaseAdapter,
  type EmailPreferences,
  type EmailLog,
  type QueuedEmail,
  type EmailResult,
  type BulkEmailResult,
} from "./service";
