/**
 * Email Components
 * Components for email inbox and AI-powered email triage
 */

export { Inbox } from "./inbox";
export type { InboxProps, EmailMessage } from "./inbox";

export { EmailPreview } from "./email-preview";
export type { EmailPreviewProps, EmailThread, EmailAttachment } from "./email-preview";

export { TriageBadge, PriorityIndicator } from "./triage-badge";
export type { TriageBadgeProps, PriorityIndicatorProps } from "./triage-badge";

export { SmartReply, QuickReplyChips } from "./smart-reply";
export type { SmartReplyProps, SmartReply as SmartReplyType, QuickReplyChipsProps } from "./smart-reply";

export { ComposeModal } from "./compose-modal";
export type { ComposeModalProps, Recipient, DraftAttachment } from "./compose-modal";
