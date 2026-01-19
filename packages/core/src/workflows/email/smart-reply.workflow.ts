/**
 * Smart Reply Workflow
 * Generates AI-powered reply suggestions for email threads
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies
const {
  getThreadContext,
  getUserWritingStyle,
  getUserSignature,
  generateSmartReplies,
  validateReplyContent,
  storeReplySuggestions,
  recordAuditLog,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// Extended timeout for Claude generation
const { generateRepliesWithClaude } = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 seconds",
  heartbeatTimeout: "20 seconds",
  retry: {
    initialInterval: "5 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 2,
    maximumInterval: "30 seconds",
  },
});

// Workflow input type
export interface SmartReplyInput {
  threadId: string;
  userId: string;
}

// Reply suggestion type
export interface ReplySuggestion {
  id: string;
  tone: "professional" | "friendly" | "concise";
  content: string;
  subject?: string;
  confidence: number;
}

// Smart reply status type
export interface SmartReplyStatus {
  threadId: string;
  status: "loading_context" | "analyzing_style" | "generating" | "completed" | "failed";
  suggestions: ReplySuggestion[];
}

// Queries
export const getSmartReplyStatusQuery = defineQuery<SmartReplyStatus>("getSmartReplyStatus");

/**
 * Smart Reply Workflow
 */
export async function smartReplyWorkflow(
  input: SmartReplyInput
): Promise<ReplySuggestion[]> {
  const { threadId, userId } = input;

  // Initialize status
  const status: SmartReplyStatus = {
    threadId,
    status: "loading_context",
    suggestions: [],
  };

  // Set up query handler
  setHandler(getSmartReplyStatusQuery, () => status);

  try {
    // =========================================================================
    // Step 1: Get thread context
    // =========================================================================
    const threadContext = await getThreadContext(threadId);

    if (!threadContext.messages || threadContext.messages.length === 0) {
      throw new Error("No messages found in thread");
    }

    // Get the latest message to reply to
    const latestMessage = threadContext.messages[threadContext.messages.length - 1];

    // =========================================================================
    // Step 2: Get user writing style
    // =========================================================================
    status.status = "analyzing_style";

    const [writingStyle, signature] = await Promise.all([
      getUserWritingStyle(userId),
      getUserSignature(userId),
    ]);

    // =========================================================================
    // Step 3: Generate replies with Claude
    // =========================================================================
    status.status = "generating";

    const generatedReplies = await generateRepliesWithClaude({
      threadContext: {
        subject: threadContext.subject,
        messages: threadContext.messages.map((m: { from: string; body: string; date: string }) => ({
          from: m.from,
          body: m.body,
          date: m.date,
        })),
        participants: threadContext.participants,
      },
      latestMessage: {
        from: latestMessage.from,
        subject: latestMessage.subject,
        body: latestMessage.body,
      },
      writingStyle: {
        tone: writingStyle.preferredTone,
        formality: writingStyle.formalityLevel,
        averageLength: writingStyle.averageReplyLength,
        commonPhrases: writingStyle.commonPhrases,
      },
      signature: signature.text,
    });

    // =========================================================================
    // Step 4: Validate and format replies
    // =========================================================================
    const suggestions: ReplySuggestion[] = [];

    for (const reply of generatedReplies) {
      // Validate content (no inappropriate content, proper formatting)
      const validation = await validateReplyContent(reply.content);

      if (validation.valid) {
        suggestions.push({
          id: `reply_${crypto.randomUUID()}`,
          tone: reply.tone,
          content: reply.content,
          subject: reply.subject,
          confidence: reply.confidence,
        });
      }
    }

    // Ensure we have at least one suggestion
    if (suggestions.length === 0) {
      // Generate a simple acknowledgment reply
      suggestions.push({
        id: `reply_${crypto.randomUUID()}`,
        tone: "professional",
        content: `Thank you for your email. I've received your message and will get back to you shortly.\n\n${signature.text}`,
        confidence: 0.5,
      });
    }

    status.suggestions = suggestions;

    // =========================================================================
    // Step 5: Store suggestions
    // =========================================================================
    await storeReplySuggestions({
      threadId,
      userId,
      suggestions,
    });

    // =========================================================================
    // Step 6: Finalize
    // =========================================================================
    status.status = "completed";

    await recordAuditLog({
      userId,
      action: "smart_replies_generated",
      resourceType: "email_thread",
      resourceId: threadId,
      metadata: {
        suggestionsCount: suggestions.length,
        tones: suggestions.map((s) => s.tone),
      },
    });

    return suggestions;
  } catch (error) {
    status.status = "failed";

    await recordAuditLog({
      userId,
      action: "smart_reply_failed",
      resourceType: "email_thread",
      resourceId: threadId,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}
