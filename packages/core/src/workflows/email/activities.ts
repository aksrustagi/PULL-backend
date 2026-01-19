/**
 * Email Activities
 * All activities for email-related workflows
 */

import { Context } from "@temporalio/activity";

// ============================================================================
// Types
// ============================================================================

export interface NylasMessage {
  id: string;
  subject?: string;
  body?: string;
  from?: Array<{ email: string; name?: string }>;
  to?: Array<{ email: string; name?: string }>;
  date: number;
  threadId?: string;
}

export interface TriageData {
  priority: "urgent" | "important" | "normal" | "low";
  category: string;
  summary: string;
  suggestedAction: string;
  relatedTickers: string[];
  confidence: number;
  requiresResponse: boolean;
  estimatedResponseTime: number;
}

export interface ThreadContext {
  threadId: string;
  subject: string;
  messages: Array<{
    id: string;
    from: string;
    to: string[];
    body: string;
    date: string;
    subject?: string;
  }>;
  participants: string[];
}

export interface WritingStyle {
  preferredTone: "professional" | "friendly" | "casual";
  formalityLevel: number;
  averageReplyLength: number;
  commonPhrases: string[];
}

// ============================================================================
// Nylas Activities
// ============================================================================

/**
 * Fetch messages from Nylas
 */
export async function fetchNylasMessages(input: {
  grantId: string;
  cursor?: string;
  limit: number;
}): Promise<{ messages: NylasMessage[]; nextCursor?: string }> {
  console.log(`[Email Activity] Fetching messages from Nylas, grant: ${input.grantId}`);

  // TODO: Call Nylas API
  const response = await fetch(
    `https://api.nylas.com/v3/grants/${input.grantId}/messages?limit=${input.limit}${input.cursor ? `&page_token=${input.cursor}` : ""}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.NYLAS_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Nylas API error: ${response.statusText}`);
  }

  const data = await response.json();

  return {
    messages: data.data ?? [],
    nextCursor: data.next_cursor,
  };
}

/**
 * Check if email already processed
 */
export async function checkEmailProcessed(messageId: string): Promise<boolean> {
  console.log(`[Email Activity] Checking if processed: ${messageId}`);

  // TODO: Call Convex query
  return false;
}

/**
 * Update sync cursor
 */
export async function updateSyncCursor(
  userId: string,
  grantId: string,
  cursor: string
): Promise<void> {
  console.log(`[Email Activity] Updating sync cursor for ${userId}`);

  // TODO: Call Convex mutation
}

// ============================================================================
// Claude AI Activities
// ============================================================================

/**
 * Triage email with Claude
 */
export async function triageWithClaude(input: {
  subject: string;
  body: string;
  from: string;
}): Promise<TriageData> {
  console.log(`[Email Activity] Triaging email with Claude: ${input.subject.slice(0, 50)}...`);

  // TODO: Call Claude API
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Analyze this email and provide triage information:

Subject: ${input.subject}
From: ${input.from}
Body: ${input.body}

Respond in JSON format with:
- priority: "urgent" | "important" | "normal" | "low"
- category: string (e.g., "financial", "personal", "work", "newsletter", "promotion")
- summary: string (2-3 sentence summary)
- suggestedAction: string (what action to take)
- relatedTickers: string[] (any stock/crypto tickers mentioned)
- requiresResponse: boolean
- estimatedResponseTime: number (minutes needed to respond)`,
        },
      ],
    }),
  });

  if (!response.ok) {
    // Return default triage on error
    return {
      priority: "normal",
      category: "uncategorized",
      summary: input.subject,
      suggestedAction: "Review email",
      relatedTickers: [],
      confidence: 0.5,
      requiresResponse: false,
      estimatedResponseTime: 5,
    };
  }

  const data = await response.json();
  const content = data.content?.[0]?.text ?? "{}";

  try {
    const parsed = JSON.parse(content);
    return {
      priority: parsed.priority ?? "normal",
      category: parsed.category ?? "uncategorized",
      summary: parsed.summary ?? input.subject,
      suggestedAction: parsed.suggestedAction ?? "Review email",
      relatedTickers: parsed.relatedTickers ?? [],
      confidence: 0.8,
      requiresResponse: parsed.requiresResponse ?? false,
      estimatedResponseTime: parsed.estimatedResponseTime ?? 5,
    };
  } catch {
    return {
      priority: "normal",
      category: "uncategorized",
      summary: input.subject,
      suggestedAction: "Review email",
      relatedTickers: [],
      confidence: 0.5,
      requiresResponse: false,
      estimatedResponseTime: 5,
    };
  }
}

/**
 * Batch triage emails
 */
export async function triageEmailBatch(
  emails: Array<{
    emailId: string;
    messageId: string;
    subject: string;
    body: string;
    from: string;
    to: string[];
    receivedAt: string;
  }>
): Promise<
  Array<{
    emailId: string;
    messageId: string;
    subject: string;
    body: string;
    from: string;
    to: string[];
    receivedAt: string;
    triage: TriageData;
  }>
> {
  console.log(`[Email Activity] Batch triaging ${emails.length} emails`);

  Context.current().heartbeat(`Processing ${emails.length} emails`);

  const results = [];

  for (const email of emails) {
    const triage = await triageWithClaude({
      subject: email.subject,
      body: email.body,
      from: email.from,
    });

    results.push({
      ...email,
      triage,
    });
  }

  return results;
}

/**
 * Generate smart replies with Claude
 */
export async function generateRepliesWithClaude(input: {
  threadContext: {
    subject: string;
    messages: Array<{ from: string; body: string; date: string }>;
    participants: string[];
  };
  latestMessage: {
    from: string;
    subject: string;
    body: string;
  };
  writingStyle: {
    tone: string;
    formality: number;
    averageLength: number;
    commonPhrases: string[];
  };
  signature: string;
}): Promise<
  Array<{
    tone: "professional" | "friendly" | "concise";
    content: string;
    subject?: string;
    confidence: number;
  }>
> {
  console.log(`[Email Activity] Generating smart replies for thread`);

  Context.current().heartbeat("Generating replies...");

  // TODO: Call Claude API
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `Generate 3 reply options for this email:

Thread Subject: ${input.threadContext.subject}

Latest Message:
From: ${input.latestMessage.from}
${input.latestMessage.body}

User's Writing Style:
- Tone: ${input.writingStyle.tone}
- Formality: ${input.writingStyle.formality}/10
- Average Length: ${input.writingStyle.averageLength} words
- Common phrases: ${input.writingStyle.commonPhrases.join(", ")}

User's Signature:
${input.signature}

Generate 3 reply options:
1. Professional tone
2. Friendly tone
3. Concise/brief tone

Include the signature in each reply. Respond in JSON array format with objects containing: tone, content, confidence (0-1).`,
        },
      ],
    }),
  });

  if (!response.ok) {
    // Return default replies
    return [
      {
        tone: "professional",
        content: `Thank you for your email. I will review and get back to you shortly.\n\n${input.signature}`,
        confidence: 0.5,
      },
      {
        tone: "friendly",
        content: `Thanks for reaching out! I'll take a look and respond soon.\n\n${input.signature}`,
        confidence: 0.5,
      },
      {
        tone: "concise",
        content: `Received. Will follow up.\n\n${input.signature}`,
        confidence: 0.5,
      },
    ];
  }

  const data = await response.json();
  const content = data.content?.[0]?.text ?? "[]";

  try {
    return JSON.parse(content);
  } catch {
    return [
      {
        tone: "professional",
        content: `Thank you for your email.\n\n${input.signature}`,
        confidence: 0.5,
      },
    ];
  }
}

// ============================================================================
// Entity Extraction Activities
// ============================================================================

/**
 * Extract entities from email body
 */
export async function extractEntities(body: string): Promise<{
  people: string[];
  companies: string[];
  amounts: string[];
  dates: string[];
}> {
  console.log(`[Email Activity] Extracting entities`);

  // Simple regex-based extraction (would use NER in production)
  const amounts = body.match(/\$[\d,]+(?:\.\d{2})?|\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:USD|dollars?)/gi) ?? [];
  const dates = body.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,?\s+\d{4})?|\d{1,2}\/\d{1,2}\/\d{2,4}/gi) ?? [];

  return {
    people: [],
    companies: [],
    amounts,
    dates,
  };
}

/**
 * Detect sentiment
 */
export async function detectSentiment(body: string): Promise<{
  sentiment: "positive" | "negative" | "neutral";
  confidence: number;
}> {
  console.log(`[Email Activity] Detecting sentiment`);

  // Simple keyword-based sentiment (would use ML model in production)
  const positiveWords = ["thank", "great", "excellent", "happy", "pleased", "appreciate"];
  const negativeWords = ["urgent", "problem", "issue", "complaint", "disappointed", "concerned"];

  const bodyLower = body.toLowerCase();
  const positiveCount = positiveWords.filter((w) => bodyLower.includes(w)).length;
  const negativeCount = negativeWords.filter((w) => bodyLower.includes(w)).length;

  if (positiveCount > negativeCount) {
    return { sentiment: "positive", confidence: 0.7 };
  } else if (negativeCount > positiveCount) {
    return { sentiment: "negative", confidence: 0.7 };
  }

  return { sentiment: "neutral", confidence: 0.6 };
}

/**
 * Classify category
 */
export async function classifyCategory(input: {
  subject: string;
  body: string;
  from: string;
}): Promise<{ category: string; confidence: number }> {
  console.log(`[Email Activity] Classifying category`);

  const combined = `${input.subject} ${input.body}`.toLowerCase();

  if (combined.includes("unsubscribe") || combined.includes("newsletter")) {
    return { category: "newsletter", confidence: 0.9 };
  }
  if (combined.includes("invoice") || combined.includes("payment") || combined.includes("receipt")) {
    return { category: "financial", confidence: 0.85 };
  }
  if (combined.includes("meeting") || combined.includes("calendar") || combined.includes("schedule")) {
    return { category: "scheduling", confidence: 0.8 };
  }
  if (combined.includes("order") || combined.includes("shipping") || combined.includes("delivery")) {
    return { category: "shopping", confidence: 0.8 };
  }

  return { category: "general", confidence: 0.5 };
}

/**
 * Detect urgency
 */
export async function detectUrgency(input: {
  subject: string;
  body: string;
  from: string;
  claudeSuggestion: string;
}): Promise<{ priority: "urgent" | "important" | "normal" | "low"; confidence: number }> {
  console.log(`[Email Activity] Detecting urgency`);

  const combined = `${input.subject} ${input.body}`.toLowerCase();

  // Check for urgent indicators
  if (
    combined.includes("urgent") ||
    combined.includes("asap") ||
    combined.includes("immediately") ||
    combined.includes("emergency")
  ) {
    return { priority: "urgent", confidence: 0.9 };
  }

  // Check for important indicators
  if (
    combined.includes("important") ||
    combined.includes("action required") ||
    combined.includes("deadline")
  ) {
    return { priority: "important", confidence: 0.8 };
  }

  // Use Claude's suggestion as fallback
  if (input.claudeSuggestion === "urgent" || input.claudeSuggestion === "important") {
    return { priority: input.claudeSuggestion as "urgent" | "important", confidence: 0.7 };
  }

  return { priority: "normal", confidence: 0.6 };
}

// ============================================================================
// Trading Signal Activities
// ============================================================================

/**
 * Detect trading signals in email
 */
export async function detectTradingSignals(
  userId: string,
  emailId: string,
  tickers: string[]
): Promise<{ detected: boolean; assets: string[] }> {
  console.log(`[Email Activity] Detecting trading signals for tickers: ${tickers.join(", ")}`);

  if (tickers.length === 0) {
    return { detected: false, assets: [] };
  }

  // TODO: Look up user's watched assets and positions
  return {
    detected: true,
    assets: tickers,
  };
}

/**
 * Find related assets from email content
 */
export async function findRelatedAssets(
  body: string,
  entities: { companies: string[] }
): Promise<{ tickers: string[] }> {
  console.log(`[Email Activity] Finding related assets`);

  // Simple ticker detection (uppercase 1-5 letter words that look like tickers)
  const potentialTickers = body.match(/\b[A-Z]{1,5}\b/g) ?? [];

  // Filter out common words
  const commonWords = ["I", "A", "THE", "AND", "OR", "FOR", "TO", "IN", "ON", "AT"];
  const tickers = potentialTickers.filter((t) => !commonWords.includes(t));

  return { tickers: [...new Set(tickers)] };
}

/**
 * Link email to assets
 */
export async function linkToAssets(emailId: string, assets: string[]): Promise<void> {
  console.log(`[Email Activity] Linking email ${emailId} to assets: ${assets.join(", ")}`);

  // TODO: Call Convex mutation
}

// ============================================================================
// Storage Activities
// ============================================================================

/**
 * Store email in Convex
 */
export async function storeEmailConvex(input: {
  userId: string;
  emailId: string;
  messageId: string;
  subject: string;
  body: string;
  from: string;
  to: string[];
  receivedAt: string;
  triage: TriageData;
}): Promise<void> {
  console.log(`[Email Activity] Storing email ${input.emailId} in Convex`);

  // TODO: Call Convex mutation
}

/**
 * Update email triage data
 */
export async function updateEmailTriage(
  emailId: string,
  triage: {
    priority: string;
    category: string;
    summary: string;
    suggestedAction: string;
    relatedTickers: string[];
    sentiment: string;
    entities: Record<string, string[]>;
    requiresResponse: boolean;
    estimatedResponseTime: number;
  }
): Promise<void> {
  console.log(`[Email Activity] Updating triage for ${emailId}`);

  // TODO: Call Convex mutation
}

/**
 * Store reply suggestions
 */
export async function storeReplySuggestions(input: {
  threadId: string;
  userId: string;
  suggestions: Array<{
    id: string;
    tone: string;
    content: string;
    confidence: number;
  }>;
}): Promise<void> {
  console.log(`[Email Activity] Storing ${input.suggestions.length} reply suggestions`);

  // TODO: Call Convex mutation
}

// ============================================================================
// Thread & Style Activities
// ============================================================================

/**
 * Get thread context
 */
export async function getThreadContext(threadId: string): Promise<ThreadContext> {
  console.log(`[Email Activity] Getting thread context: ${threadId}`);

  // TODO: Call Convex query or Nylas API
  return {
    threadId,
    subject: "Sample Thread",
    messages: [
      {
        id: "msg_1",
        from: "sender@example.com",
        to: ["recipient@example.com"],
        body: "This is a sample message",
        date: new Date().toISOString(),
      },
    ],
    participants: ["sender@example.com", "recipient@example.com"],
  };
}

/**
 * Get user writing style
 */
export async function getUserWritingStyle(userId: string): Promise<WritingStyle> {
  console.log(`[Email Activity] Getting writing style for ${userId}`);

  // TODO: Analyze user's sent emails to determine style
  return {
    preferredTone: "professional",
    formalityLevel: 7,
    averageReplyLength: 150,
    commonPhrases: ["Best regards", "Thank you", "Please let me know"],
  };
}

/**
 * Get user signature
 */
export async function getUserSignature(userId: string): Promise<{ text: string }> {
  console.log(`[Email Activity] Getting signature for ${userId}`);

  // TODO: Call Convex query
  return {
    text: "Best regards,\nUser",
  };
}

/**
 * Validate reply content
 */
export async function validateReplyContent(
  content: string
): Promise<{ valid: boolean; reason?: string }> {
  console.log(`[Email Activity] Validating reply content`);

  if (content.length < 10) {
    return { valid: false, reason: "Reply too short" };
  }

  if (content.length > 10000) {
    return { valid: false, reason: "Reply too long" };
  }

  return { valid: true };
}

// ============================================================================
// Alert & Task Activities
// ============================================================================

/**
 * Create urgent alert
 */
export async function createUrgentAlert(input: {
  userId: string;
  emailId: string;
  subject: string;
  summary: string;
  suggestedAction: string;
}): Promise<void> {
  console.log(`[Email Activity] Creating urgent alert for ${input.emailId}`);

  // TODO: Call Convex mutation and send push notification
}

/**
 * Create task from email
 */
export async function createTask(input: {
  type: string;
  emailId: string;
  priority: string;
  suggestedAction: string;
  dueIn: number;
}): Promise<void> {
  console.log(`[Email Activity] Creating task for email ${input.emailId}`);

  // TODO: Call Convex mutation
}

/**
 * Send triage notification
 */
export async function sendTriageNotification(input: {
  emailId: string;
  priority: string;
  summary: string;
  suggestedAction: string;
}): Promise<void> {
  console.log(`[Email Activity] Sending triage notification for ${input.emailId}`);

  // TODO: Send push notification
}

/**
 * Send email via Nylas
 */
export async function sendEmail(input: {
  grantId: string;
  to: string[];
  subject: string;
  body: string;
  replyToMessageId?: string;
}): Promise<{ messageId: string }> {
  console.log(`[Email Activity] Sending email to ${input.to.join(", ")}`);

  // TODO: Call Nylas API
  return { messageId: `msg_${crypto.randomUUID()}` };
}

// ============================================================================
// Audit Activities
// ============================================================================

/**
 * Record audit log
 */
export async function recordAuditLog(event: {
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  console.log(`[Email Activity] Audit log: ${event.action} on ${event.resourceType}/${event.resourceId}`);

  // TODO: Call Convex mutation
}
