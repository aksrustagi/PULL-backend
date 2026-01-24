/**
 * Email Workflows
 * Re-exports email workflows for Temporal worker registration
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
  continueAsNew,
  sleep,
} from "@temporalio/workflow";
import type * as activities from "../activities/email";

// Activity proxies
const {
  fetchNylasMessages,
  checkEmailProcessed,
  triageWithClaude,
  storeEmailConvex,
  detectTradingSignals,
  linkToAssets,
  updateSyncCursor,
  createUrgentAlert,
  extractEntities,
  detectSentiment,
  classifyCategory,
  detectUrgency,
  findRelatedAssets,
  updateEmailTriage,
  createTask,
  sendTriageNotification,
  getThreadContext,
  getUserWritingStyle,
  getUserSignature,
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

// Extended timeout for AI triage
const { triageEmailBatch, generateRepliesWithClaude } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  heartbeatTimeout: "30 seconds",
  retry: {
    initialInterval: "5 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// ============================================================================
// Email Sync Workflow
// ============================================================================

export interface EmailSyncInput {
  userId: string;
  grantId: string;
  syncCursor?: string;
  isInitialSync?: boolean;
}

export interface EmailSyncStatus {
  syncId: string;
  status: "syncing" | "processing" | "completed" | "failed";
  emailsFetched: number;
  emailsProcessed: number;
  emailsTriaged: number;
  urgentAlertsCreated: number;
  tradingSignalsDetected: number;
  lastSyncCursor?: string;
  lastProcessedAt?: string;
  errors: Array<{ emailId: string; error: string }>;
}

const BATCH_SIZE = 50;
const SYNC_INTERVAL_MINUTES = 5;

export const getSyncStatusQuery = defineQuery<EmailSyncStatus>("getSyncStatus");

export async function emailSyncWorkflow(
  input: EmailSyncInput
): Promise<EmailSyncStatus> {
  const { userId, grantId, syncCursor, isInitialSync } = input;

  const syncId = `sync_${Date.now()}`;

  const status: EmailSyncStatus = {
    syncId,
    status: "syncing",
    emailsFetched: 0,
    emailsProcessed: 0,
    emailsTriaged: 0,
    urgentAlertsCreated: 0,
    tradingSignalsDetected: 0,
    lastSyncCursor: syncCursor,
    errors: [],
  };

  setHandler(getSyncStatusQuery, () => status);

  try {
    await recordAuditLog({
      userId,
      action: "email_sync_started",
      resourceType: "email_sync",
      resourceId: syncId,
      metadata: { grantId, isInitialSync },
    });

    let currentCursor = syncCursor;
    let hasMore = true;

    while (hasMore) {
      const fetchResult = await fetchNylasMessages({
        grantId,
        cursor: currentCursor,
        limit: BATCH_SIZE,
      });

      status.emailsFetched += fetchResult.messages.length;

      if (fetchResult.messages.length === 0) {
        hasMore = false;
        continue;
      }

      status.status = "processing";

      const emailsToTriage: Array<{
        emailId: string;
        messageId: string;
        subject: string;
        body: string;
        from: string;
        to: string[];
        receivedAt: string;
      }> = [];

      for (const message of fetchResult.messages) {
        try {
          const processed = await checkEmailProcessed(message.id);
          if (processed) {
            status.emailsProcessed++;
            continue;
          }

          emailsToTriage.push({
            emailId: `email_${message.id}`,
            messageId: message.id,
            subject: message.subject ?? "",
            body: message.body ?? "",
            from: message.from?.[0]?.email ?? "",
            to: message.to?.map((t: { email: string }) => t.email) ?? [],
            receivedAt: new Date(message.date * 1000).toISOString(),
          });

          status.emailsProcessed++;
        } catch (error) {
          status.errors.push({
            emailId: message.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (emailsToTriage.length > 0) {
        const triageResults = await triageEmailBatch(emailsToTriage);

        for (const result of triageResults) {
          try {
            await storeEmailConvex({
              userId,
              emailId: result.emailId,
              messageId: result.messageId,
              subject: result.subject,
              body: result.body,
              from: result.from,
              to: result.to,
              receivedAt: result.receivedAt,
              triage: result.triage,
            });

            status.emailsTriaged++;

            if (result.triage.priority === "urgent") {
              await createUrgentAlert({
                userId,
                emailId: result.emailId,
                subject: result.subject,
                summary: result.triage.summary,
                suggestedAction: result.triage.suggestedAction,
              });
              status.urgentAlertsCreated++;
            }

            if (result.triage.relatedTickers?.length > 0) {
              const signals = await detectTradingSignals(
                userId,
                result.emailId,
                result.triage.relatedTickers
              );

              if (signals.detected) {
                status.tradingSignalsDetected++;
                await linkToAssets(result.emailId, signals.assets);
              }
            }
          } catch (error) {
            status.errors.push({
              emailId: result.emailId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      currentCursor = fetchResult.nextCursor;
      status.lastSyncCursor = currentCursor;
      hasMore = !!fetchResult.nextCursor && fetchResult.messages.length === BATCH_SIZE;

      await updateSyncCursor(userId, grantId, currentCursor);
    }

    status.status = "completed";
    status.lastProcessedAt = new Date().toISOString();

    await recordAuditLog({
      userId,
      action: "email_sync_completed",
      resourceType: "email_sync",
      resourceId: syncId,
      metadata: {
        emailsFetched: status.emailsFetched,
        emailsTriaged: status.emailsTriaged,
        urgentAlerts: status.urgentAlertsCreated,
        tradingSignals: status.tradingSignalsDetected,
        errors: status.errors.length,
      },
    });

    if (!isInitialSync) {
      await sleep(`${SYNC_INTERVAL_MINUTES} minutes`);

      await continueAsNew<typeof emailSyncWorkflow>({
        userId,
        grantId,
        syncCursor: status.lastSyncCursor,
        isInitialSync: false,
      });
    }

    return status;
  } catch (error) {
    status.status = "failed";

    await recordAuditLog({
      userId,
      action: "email_sync_failed",
      resourceType: "email_sync",
      resourceId: syncId,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}

// ============================================================================
// Email Triage Workflow
// ============================================================================

export interface EmailTriageInput {
  emailId: string;
  emailContent: {
    subject: string;
    body: string;
    from: string;
    to: string[];
    receivedAt: string;
  };
}

export interface TriageResult {
  emailId: string;
  priority: "urgent" | "important" | "normal" | "low";
  category: string;
  summary: string;
  suggestedAction: string;
  relatedTickers: string[];
  sentiment: "positive" | "negative" | "neutral";
  entities: {
    people: string[];
    companies: string[];
    amounts: string[];
    dates: string[];
  };
  requiresResponse: boolean;
  estimatedResponseTime: number;
}

export interface TriageStatus {
  emailId: string;
  status: "analyzing" | "extracting" | "classifying" | "completed" | "failed";
  result?: TriageResult;
  confidence: number;
}

export const getTriageStatusQuery = defineQuery<TriageStatus>("getTriageStatus");

export async function emailTriageWorkflow(
  input: EmailTriageInput
): Promise<TriageResult> {
  const { emailId, emailContent } = input;

  const status: TriageStatus = {
    emailId,
    status: "analyzing",
    confidence: 0,
  };

  setHandler(getTriageStatusQuery, () => status);

  try {
    const claudeAnalysis = await triageWithClaude({
      subject: emailContent.subject,
      body: emailContent.body,
      from: emailContent.from,
    });

    status.status = "extracting";

    const entities = await extractEntities(emailContent.body);
    const sentiment = await detectSentiment(emailContent.body);

    status.status = "classifying";

    const category = await classifyCategory({
      subject: emailContent.subject,
      body: emailContent.body,
      from: emailContent.from,
    });

    const urgency = await detectUrgency({
      subject: emailContent.subject,
      body: emailContent.body,
      from: emailContent.from,
      claudeSuggestion: claudeAnalysis.priority,
    });

    const relatedAssets = await findRelatedAssets(emailContent.body, entities);

    const result: TriageResult = {
      emailId,
      priority: urgency.priority,
      category: category.category,
      summary: claudeAnalysis.summary,
      suggestedAction: claudeAnalysis.suggestedAction,
      relatedTickers: relatedAssets.tickers,
      sentiment: sentiment.sentiment,
      entities: {
        people: entities.people,
        companies: entities.companies,
        amounts: entities.amounts,
        dates: entities.dates,
      },
      requiresResponse: claudeAnalysis.requiresResponse,
      estimatedResponseTime: claudeAnalysis.estimatedResponseTime,
    };

    status.result = result;
    status.confidence = claudeAnalysis.confidence;

    await updateEmailTriage(emailId, result);

    if (result.requiresResponse || result.priority === "urgent") {
      await createTask({
        type: "email_response",
        emailId,
        priority: result.priority,
        suggestedAction: result.suggestedAction,
        dueIn: result.estimatedResponseTime,
      });
    }

    if (result.priority === "urgent") {
      await sendTriageNotification({
        emailId,
        priority: result.priority,
        summary: result.summary,
        suggestedAction: result.suggestedAction,
      });
    }

    status.status = "completed";

    await recordAuditLog({
      userId: "system",
      action: "email_triaged",
      resourceType: "email",
      resourceId: emailId,
      metadata: {
        priority: result.priority,
        category: result.category,
        confidence: status.confidence,
      },
    });

    return result;
  } catch (error) {
    status.status = "failed";

    await recordAuditLog({
      userId: "system",
      action: "email_triage_failed",
      resourceType: "email",
      resourceId: emailId,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}

// ============================================================================
// Smart Reply Workflow
// ============================================================================

export interface SmartReplyInput {
  threadId: string;
  userId: string;
}

export interface ReplySuggestion {
  id: string;
  tone: "professional" | "friendly" | "concise";
  content: string;
  subject?: string;
  confidence: number;
}

export interface SmartReplyStatus {
  threadId: string;
  status: "loading_context" | "analyzing_style" | "generating" | "completed" | "failed";
  suggestions: ReplySuggestion[];
}

export const getSmartReplyStatusQuery = defineQuery<SmartReplyStatus>("getSmartReplyStatus");

export async function smartReplyWorkflow(
  input: SmartReplyInput
): Promise<ReplySuggestion[]> {
  const { threadId, userId } = input;

  const status: SmartReplyStatus = {
    threadId,
    status: "loading_context",
    suggestions: [],
  };

  setHandler(getSmartReplyStatusQuery, () => status);

  try {
    const threadContext = await getThreadContext(threadId);

    if (!threadContext.messages || threadContext.messages.length === 0) {
      throw new Error("No messages found in thread");
    }

    const latestMessage = threadContext.messages[threadContext.messages.length - 1];

    status.status = "analyzing_style";

    const [writingStyle, signature] = await Promise.all([
      getUserWritingStyle(userId),
      getUserSignature(userId),
    ]);

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

    const suggestions: ReplySuggestion[] = [];

    for (const reply of generatedReplies) {
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

    if (suggestions.length === 0) {
      suggestions.push({
        id: `reply_${crypto.randomUUID()}`,
        tone: "professional",
        content: `Thank you for your email. I've received your message and will get back to you shortly.\n\n${signature.text}`,
        confidence: 0.5,
      });
    }

    status.suggestions = suggestions;

    await storeReplySuggestions({
      threadId,
      userId,
      suggestions,
    });

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
