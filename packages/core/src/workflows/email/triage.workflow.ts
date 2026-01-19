/**
 * Email Triage Workflow
 * AI-powered email analysis and categorization
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies
const {
  triageWithClaude,
  extractEntities,
  detectSentiment,
  classifyCategory,
  detectUrgency,
  findRelatedAssets,
  updateEmailTriage,
  createTask,
  sendTriageNotification,
  recordAuditLog,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 seconds",
  retry: {
    initialInterval: "2 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// Workflow input type
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

// Triage result type
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

// Triage status type
export interface TriageStatus {
  emailId: string;
  status: "analyzing" | "extracting" | "classifying" | "completed" | "failed";
  result?: TriageResult;
  confidence: number;
}

// Queries
export const getTriageStatusQuery = defineQuery<TriageStatus>("getTriageStatus");

/**
 * Email Triage Workflow
 */
export async function emailTriageWorkflow(
  input: EmailTriageInput
): Promise<TriageResult> {
  const { emailId, emailContent } = input;

  // Initialize status
  const status: TriageStatus = {
    emailId,
    status: "analyzing",
    confidence: 0,
  };

  // Set up query handler
  setHandler(getTriageStatusQuery, () => status);

  try {
    // =========================================================================
    // Step 1: Run Claude analysis
    // =========================================================================
    const claudeAnalysis = await triageWithClaude({
      subject: emailContent.subject,
      body: emailContent.body,
      from: emailContent.from,
    });

    status.status = "extracting";

    // =========================================================================
    // Step 2: Extract entities
    // =========================================================================
    const entities = await extractEntities(emailContent.body);

    // =========================================================================
    // Step 3: Detect sentiment
    // =========================================================================
    const sentiment = await detectSentiment(emailContent.body);

    status.status = "classifying";

    // =========================================================================
    // Step 4: Classify category
    // =========================================================================
    const category = await classifyCategory({
      subject: emailContent.subject,
      body: emailContent.body,
      from: emailContent.from,
    });

    // =========================================================================
    // Step 5: Detect urgency
    // =========================================================================
    const urgency = await detectUrgency({
      subject: emailContent.subject,
      body: emailContent.body,
      from: emailContent.from,
      claudeSuggestion: claudeAnalysis.priority,
    });

    // =========================================================================
    // Step 6: Find related assets
    // =========================================================================
    const relatedAssets = await findRelatedAssets(emailContent.body, entities);

    // =========================================================================
    // Step 7: Build final result
    // =========================================================================
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

    // =========================================================================
    // Step 8: Update email record
    // =========================================================================
    await updateEmailTriage(emailId, result);

    // =========================================================================
    // Step 9: Create task if action required
    // =========================================================================
    if (result.requiresResponse || result.priority === "urgent") {
      await createTask({
        type: "email_response",
        emailId,
        priority: result.priority,
        suggestedAction: result.suggestedAction,
        dueIn: result.estimatedResponseTime,
      });
    }

    // =========================================================================
    // Step 10: Send notification for urgent emails
    // =========================================================================
    if (result.priority === "urgent") {
      await sendTriageNotification({
        emailId,
        priority: result.priority,
        summary: result.summary,
        suggestedAction: result.suggestedAction,
      });
    }

    // =========================================================================
    // Step 11: Finalize
    // =========================================================================
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
