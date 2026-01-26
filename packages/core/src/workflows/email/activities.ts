/**
 * Email Activities
 * All activities for email-related workflows
 */

import { Context } from "@temporalio/activity";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@pull/db/convex/_generated/api";
import { NylasClient } from "../../services/nylas/client";
import { ResendClient, createResendClient } from "../../services/resend/client";
import type { Message as NylasMessage } from "../../services/nylas/types";

// ============================================================================
// Client Initialization
// ============================================================================

// Lazy-initialized clients
let convexClient: ConvexHttpClient | null = null;
let nylasClient: NylasClient | null = null;
let resendClient: ResendClient | null = null;

function getConvexClient(): ConvexHttpClient {
  if (!convexClient) {
    const url = process.env.CONVEX_URL;
    if (!url) {
      throw new Error("CONVEX_URL environment variable is required");
    }
    convexClient = new ConvexHttpClient(url);
  }
  return convexClient;
}

function getNylasClient(): NylasClient {
  if (!nylasClient) {
    const apiKey = process.env.NYLAS_API_KEY;
    if (!apiKey) {
      throw new Error("NYLAS_API_KEY environment variable is required");
    }
    nylasClient = new NylasClient({
      apiKey,
      webhookSecret: process.env.NYLAS_WEBHOOK_SECRET,
    });
  }
  return nylasClient;
}

function getResendClient(): ResendClient {
  if (!resendClient) {
    resendClient = createResendClient();
  }
  return resendClient;
}

// ============================================================================
// Types
// ============================================================================

export interface NylasMessageCompat {
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
// Retry Utilities
// ============================================================================

interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
}

async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000 } = options;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      const isRetryable = isRetryableError(error);

      if (isRetryable && attempt < maxRetries) {
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        const jitter = delay * Math.random() * 0.25;
        console.warn(
          `[Email Activity] ${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay + jitter)}ms:`,
          (error as Error).message
        );
        await sleep(delay + jitter);
        continue;
      }

      throw error;
    }
  }

  throw lastError ?? new Error(`${operationName} failed after ${maxRetries} retries`);
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Retry on rate limits, timeouts, and server errors
    return (
      message.includes("rate limit") ||
      message.includes("timeout") ||
      message.includes("429") ||
      message.includes("503") ||
      message.includes("502") ||
      message.includes("500") ||
      message.includes("network") ||
      message.includes("econnreset")
    );
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
}): Promise<{ messages: NylasMessageCompat[]; nextCursor?: string }> {
  console.log(`[Email Activity] Fetching messages from Nylas, grant: ${input.grantId}`);

  return withRetry(
    async () => {
      const nylas = getNylasClient();
      const response = await nylas.listMessages(input.grantId, {
        limit: input.limit,
        page_token: input.cursor,
      });

      // Transform Nylas messages to our compat format
      const messages: NylasMessageCompat[] = response.data.map((msg: NylasMessage) => ({
        id: msg.id,
        subject: msg.subject,
        body: msg.body,
        from: msg.from?.map((p) => ({ email: p.email, name: p.name })),
        to: msg.to?.map((p) => ({ email: p.email, name: p.name })),
        date: msg.date,
        threadId: msg.thread_id,
      }));

      return {
        messages,
        nextCursor: response.next_cursor,
      };
    },
    "fetchNylasMessages",
    { maxRetries: 3 }
  );
}

/**
 * Check if email already processed
 */
export async function checkEmailProcessed(messageId: string): Promise<boolean> {
  console.log(`[Email Activity] Checking if processed: ${messageId}`);

  return withRetry(
    async () => {
      const convex = getConvexClient();
      const email = await convex.query(api.emails.getByMessageId, {
        messageId,
      });
      return email !== null;
    },
    "checkEmailProcessed",
    { maxRetries: 2 }
  );
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

  return withRetry(
    async () => {
      const convex = getConvexClient();
      await convex.mutation(api.emailSync.updateCursor, {
        userId: userId as any,
        grantId,
        cursor,
        lastSyncAt: Date.now(),
      });
    },
    "updateSyncCursor",
    { maxRetries: 2 }
  );
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

  const defaultTriage: TriageData = {
    priority: "normal",
    category: "uncategorized",
    summary: input.subject,
    suggestedAction: "Review email",
    relatedTickers: [],
    confidence: 0.5,
    requiresResponse: false,
    estimatedResponseTime: 5,
  };

  return withRetry(
    async () => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.warn("[Email Activity] ANTHROPIC_API_KEY not set, using default triage");
        return defaultTriage;
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: `Analyze this email and provide triage information.

Subject: ${input.subject}
From: ${input.from}
Body: ${input.body.slice(0, 3000)}

Respond ONLY with a valid JSON object (no markdown, no explanation) with these exact fields:
{
  "priority": "urgent" | "important" | "normal" | "low",
  "category": string (e.g., "financial", "personal", "work", "newsletter", "promotion", "support", "legal"),
  "summary": string (2-3 sentence summary),
  "suggestedAction": string (what action to take),
  "relatedTickers": string[] (any stock/crypto tickers mentioned like AAPL, BTC, etc.),
  "requiresResponse": boolean,
  "estimatedResponseTime": number (minutes needed to respond, 0 if no response needed)
}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Email Activity] Claude API error: ${response.status}`, errorText);
        return defaultTriage;
      }

      const data = await response.json();
      const content = data.content?.[0]?.text ?? "{}";

      try {
        // Try to extract JSON from the response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.warn("[Email Activity] No JSON found in Claude response");
          return defaultTriage;
        }

        const parsed = JSON.parse(jsonMatch[0]);
        return {
          priority: parsed.priority ?? "normal",
          category: parsed.category ?? "uncategorized",
          summary: parsed.summary ?? input.subject,
          suggestedAction: parsed.suggestedAction ?? "Review email",
          relatedTickers: Array.isArray(parsed.relatedTickers) ? parsed.relatedTickers : [],
          confidence: 0.8,
          requiresResponse: parsed.requiresResponse ?? false,
          estimatedResponseTime: parsed.estimatedResponseTime ?? 5,
        };
      } catch (parseError) {
        console.warn("[Email Activity] Failed to parse Claude response:", parseError);
        return defaultTriage;
      }
    },
    "triageWithClaude",
    { maxRetries: 2 }
  );
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

  const results = [];
  const batchSize = 5; // Process in smaller batches to avoid rate limits

  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);

    // Send heartbeat to keep activity alive
    Context.current().heartbeat(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(emails.length / batchSize)}`);

    // Process batch in parallel
    const batchResults = await Promise.all(
      batch.map(async (email) => {
        const triage = await triageWithClaude({
          subject: email.subject,
          body: email.body,
          from: email.from,
        });

        return {
          ...email,
          triage,
        };
      })
    );

    results.push(...batchResults);

    // Small delay between batches to avoid rate limits
    if (i + batchSize < emails.length) {
      await sleep(500);
    }
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

  const defaultReplies = [
    {
      tone: "professional" as const,
      content: `Thank you for your email. I will review and get back to you shortly.\n\n${input.signature}`,
      confidence: 0.5,
    },
    {
      tone: "friendly" as const,
      content: `Thanks for reaching out! I'll take a look and respond soon.\n\n${input.signature}`,
      confidence: 0.5,
    },
    {
      tone: "concise" as const,
      content: `Received. Will follow up.\n\n${input.signature}`,
      confidence: 0.5,
    },
  ];

  return withRetry(
    async () => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.warn("[Email Activity] ANTHROPIC_API_KEY not set, using default replies");
        return defaultReplies;
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 2048,
          messages: [
            {
              role: "user",
              content: `Generate 3 reply options for this email.

Thread Subject: ${input.threadContext.subject}

Latest Message:
From: ${input.latestMessage.from}
${input.latestMessage.body.slice(0, 2000)}

User's Writing Style:
- Tone: ${input.writingStyle.tone}
- Formality: ${input.writingStyle.formality}/10
- Average Length: ${input.writingStyle.averageLength} words
- Common phrases: ${input.writingStyle.commonPhrases.slice(0, 5).join(", ")}

User's Signature:
${input.signature}

Generate 3 reply options with different tones. Include the signature in each reply.
Respond ONLY with a valid JSON array (no markdown, no explanation) in this format:
[
  {"tone": "professional", "content": "reply text with signature", "confidence": 0.85},
  {"tone": "friendly", "content": "reply text with signature", "confidence": 0.80},
  {"tone": "concise", "content": "reply text with signature", "confidence": 0.75}
]`,
            },
          ],
        }),
      });

      if (!response.ok) {
        console.error(`[Email Activity] Claude API error: ${response.status}`);
        return defaultReplies;
      }

      const data = await response.json();
      const content = data.content?.[0]?.text ?? "[]";

      try {
        // Extract JSON array from response
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          console.warn("[Email Activity] No JSON array found in Claude response");
          return defaultReplies;
        }

        const parsed = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          return defaultReplies;
        }

        return parsed.map((reply: { tone?: string; content?: string; confidence?: number }) => ({
          tone: (reply.tone as "professional" | "friendly" | "concise") ?? "professional",
          content: reply.content ?? defaultReplies[0].content,
          confidence: typeof reply.confidence === "number" ? reply.confidence : 0.5,
        }));
      } catch (parseError) {
        console.warn("[Email Activity] Failed to parse Claude response:", parseError);
        return defaultReplies;
      }
    },
    "generateRepliesWithClaude",
    { maxRetries: 2 }
  );
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

  // Extract monetary amounts
  const amounts =
    body.match(/\$[\d,]+(?:\.\d{2})?|\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:USD|dollars?)/gi) ?? [];

  // Extract dates
  const dates =
    body.match(
      /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,?\s+\d{4})?|\d{1,2}\/\d{1,2}\/\d{2,4}/gi
    ) ?? [];

  // Extract email addresses (potential people references)
  const emails = body.match(/[\w.-]+@[\w.-]+\.\w+/gi) ?? [];
  const people = [...new Set(emails)];

  // Extract potential company names (words followed by Inc, Corp, LLC, etc.)
  const companyMatches =
    body.match(/\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+(?:Inc|Corp|LLC|Ltd|Company|Co)\b/gi) ??
    [];
  const companies = [...new Set(companyMatches)];

  return {
    people,
    companies,
    amounts: [...new Set(amounts)],
    dates: [...new Set(dates)],
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

  const positiveWords = [
    "thank",
    "thanks",
    "great",
    "excellent",
    "happy",
    "pleased",
    "appreciate",
    "good",
    "wonderful",
    "fantastic",
    "amazing",
    "love",
    "perfect",
    "awesome",
    "congratulations",
    "excited",
    "delighted",
  ];
  const negativeWords = [
    "urgent",
    "problem",
    "issue",
    "complaint",
    "disappointed",
    "concerned",
    "worried",
    "angry",
    "frustrated",
    "terrible",
    "awful",
    "horrible",
    "unacceptable",
    "failed",
    "error",
    "mistake",
    "wrong",
  ];

  const bodyLower = body.toLowerCase();
  const positiveCount = positiveWords.filter((w) => bodyLower.includes(w)).length;
  const negativeCount = negativeWords.filter((w) => bodyLower.includes(w)).length;
  const totalMatches = positiveCount + negativeCount;

  if (totalMatches === 0) {
    return { sentiment: "neutral", confidence: 0.5 };
  }

  if (positiveCount > negativeCount) {
    const confidence = Math.min(0.5 + (positiveCount - negativeCount) * 0.1, 0.95);
    return { sentiment: "positive", confidence };
  } else if (negativeCount > positiveCount) {
    const confidence = Math.min(0.5 + (negativeCount - positiveCount) * 0.1, 0.95);
    return { sentiment: "negative", confidence };
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
  const fromLower = input.from.toLowerCase();

  // Newsletter detection
  if (
    combined.includes("unsubscribe") ||
    combined.includes("newsletter") ||
    fromLower.includes("news") ||
    fromLower.includes("digest")
  ) {
    return { category: "newsletter", confidence: 0.9 };
  }

  // Financial detection
  if (
    combined.includes("invoice") ||
    combined.includes("payment") ||
    combined.includes("receipt") ||
    combined.includes("transaction") ||
    combined.includes("bank") ||
    combined.includes("statement")
  ) {
    return { category: "financial", confidence: 0.85 };
  }

  // Scheduling detection
  if (
    combined.includes("meeting") ||
    combined.includes("calendar") ||
    combined.includes("schedule") ||
    combined.includes("appointment") ||
    combined.includes("zoom") ||
    combined.includes("call")
  ) {
    return { category: "scheduling", confidence: 0.8 };
  }

  // Shopping/E-commerce detection
  if (
    combined.includes("order") ||
    combined.includes("shipping") ||
    combined.includes("delivery") ||
    combined.includes("tracking") ||
    combined.includes("package")
  ) {
    return { category: "shopping", confidence: 0.8 };
  }

  // Security detection
  if (
    combined.includes("password") ||
    combined.includes("security") ||
    combined.includes("verify") ||
    combined.includes("login") ||
    combined.includes("authentication")
  ) {
    return { category: "security", confidence: 0.85 };
  }

  // Support detection
  if (
    combined.includes("support") ||
    combined.includes("help") ||
    combined.includes("ticket") ||
    combined.includes("case number")
  ) {
    return { category: "support", confidence: 0.75 };
  }

  // Promotion detection
  if (
    combined.includes("sale") ||
    combined.includes("discount") ||
    combined.includes("offer") ||
    combined.includes("promo") ||
    combined.includes("% off")
  ) {
    return { category: "promotion", confidence: 0.85 };
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

  // Urgent indicators
  const urgentPatterns = [
    "urgent",
    "asap",
    "immediately",
    "emergency",
    "critical",
    "time sensitive",
    "expires today",
    "action required now",
    "respond immediately",
  ];

  if (urgentPatterns.some((p) => combined.includes(p))) {
    return { priority: "urgent", confidence: 0.9 };
  }

  // Important indicators
  const importantPatterns = [
    "important",
    "action required",
    "deadline",
    "due date",
    "reminder",
    "follow up",
    "please respond",
    "awaiting your",
    "need your",
  ];

  if (importantPatterns.some((p) => combined.includes(p))) {
    return { priority: "important", confidence: 0.8 };
  }

  // Low priority indicators
  const lowPatterns = [
    "fyi",
    "no action needed",
    "for your information",
    "just wanted to share",
    "no rush",
    "when you have time",
  ];

  if (lowPatterns.some((p) => combined.includes(p))) {
    return { priority: "low", confidence: 0.75 };
  }

  // Use Claude's suggestion as fallback
  if (input.claudeSuggestion === "urgent") {
    return { priority: "urgent", confidence: 0.7 };
  }
  if (input.claudeSuggestion === "important") {
    return { priority: "important", confidence: 0.7 };
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

  return withRetry(
    async () => {
      const convex = getConvexClient();

      // Look up user's watched assets
      const watchlist = await convex.query(api.watchlists.getByUserId, {
        userId: userId as any,
      });

      // Filter to tickers that are in the user's watchlist
      const watchedTickers = new Set(
        (watchlist?.assets ?? []).map((a: { symbol: string }) => a.symbol.toUpperCase())
      );
      const matchingAssets = tickers.filter((t) => watchedTickers.has(t.toUpperCase()));

      if (matchingAssets.length > 0) {
        console.log(`[Email Activity] Found ${matchingAssets.length} watched assets in email`);
        return {
          detected: true,
          assets: matchingAssets,
        };
      }

      // Even if not in watchlist, return the tickers for potential alerts
      return {
        detected: tickers.length > 0,
        assets: tickers,
      };
    },
    "detectTradingSignals",
    { maxRetries: 2 }
  );
}

/**
 * Find related assets from email content
 */
export async function findRelatedAssets(
  body: string,
  entities: { companies: string[] }
): Promise<{ tickers: string[] }> {
  console.log(`[Email Activity] Finding related assets`);

  // Common words to exclude that look like tickers
  const commonWords = new Set([
    "I",
    "A",
    "THE",
    "AND",
    "OR",
    "FOR",
    "TO",
    "IN",
    "ON",
    "AT",
    "IS",
    "IT",
    "BE",
    "AS",
    "BY",
    "AN",
    "IF",
    "NO",
    "SO",
    "UP",
    "DO",
    "MY",
    "WE",
    "PM",
    "AM",
    "RE",
    "FW",
    "CC",
    "BCC",
    "USD",
    "CEO",
    "CFO",
    "CTO",
    "COO",
    "VP",
    "SVP",
    "EVP",
    "HR",
    "IT",
    "PR",
    "FAQ",
    "TBD",
    "ETA",
    "FYI",
    "ASAP",
    "PDF",
    "URL",
    "USA",
    "UK",
    "EU",
    "NY",
    "CA",
    "TX",
  ]);

  // Known ticker patterns - uppercase 1-5 letter words
  const potentialTickers = body.match(/\b[A-Z]{1,5}\b/g) ?? [];

  // Filter out common words and duplicates
  const tickers = [...new Set(potentialTickers.filter((t) => !commonWords.has(t)))];

  // Also check for explicit ticker mentions like $AAPL
  const cashTags = body.match(/\$[A-Z]{1,5}\b/g) ?? [];
  const cashTagTickers = cashTags.map((t) => t.slice(1)); // Remove $

  // Combine and dedupe
  const allTickers = [...new Set([...tickers, ...cashTagTickers])];

  return { tickers: allTickers.slice(0, 20) }; // Limit to 20 tickers
}

/**
 * Link email to assets
 */
export async function linkToAssets(emailId: string, assets: string[]): Promise<void> {
  console.log(`[Email Activity] Linking email ${emailId} to assets: ${assets.join(", ")}`);

  if (assets.length === 0) {
    return;
  }

  return withRetry(
    async () => {
      const convex = getConvexClient();
      await convex.mutation(api.emails.linkToAssets, {
        emailId: emailId as any,
        assets,
        linkedAt: Date.now(),
      });
    },
    "linkToAssets",
    { maxRetries: 2 }
  );
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

  return withRetry(
    async () => {
      const convex = getConvexClient();
      await convex.mutation(api.emails.create, {
        userId: input.userId as any,
        emailId: input.emailId,
        messageId: input.messageId,
        subject: input.subject,
        body: input.body,
        from: input.from,
        to: input.to,
        receivedAt: new Date(input.receivedAt).getTime(),
        priority: input.triage.priority,
        category: input.triage.category,
        summary: input.triage.summary,
        suggestedAction: input.triage.suggestedAction,
        relatedTickers: input.triage.relatedTickers,
        confidence: input.triage.confidence,
        requiresResponse: input.triage.requiresResponse,
        estimatedResponseTime: input.triage.estimatedResponseTime,
        processedAt: Date.now(),
      });
    },
    "storeEmailConvex",
    { maxRetries: 3 }
  );
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

  return withRetry(
    async () => {
      const convex = getConvexClient();
      await convex.mutation(api.emails.updateTriage, {
        emailId: emailId as any,
        priority: triage.priority,
        category: triage.category,
        summary: triage.summary,
        suggestedAction: triage.suggestedAction,
        relatedTickers: triage.relatedTickers,
        sentiment: triage.sentiment,
        entities: triage.entities,
        requiresResponse: triage.requiresResponse,
        estimatedResponseTime: triage.estimatedResponseTime,
        updatedAt: Date.now(),
      });
    },
    "updateEmailTriage",
    { maxRetries: 2 }
  );
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

  return withRetry(
    async () => {
      const convex = getConvexClient();
      await convex.mutation(api.emailReplies.storeSuggestions, {
        threadId: input.threadId,
        userId: input.userId as any,
        suggestions: input.suggestions.map((s) => ({
          ...s,
          createdAt: Date.now(),
          used: false,
        })),
      });
    },
    "storeReplySuggestions",
    { maxRetries: 2 }
  );
}

// ============================================================================
// Thread & Style Activities
// ============================================================================

/**
 * Get thread context
 */
export async function getThreadContext(threadId: string): Promise<ThreadContext> {
  console.log(`[Email Activity] Getting thread context: ${threadId}`);

  return withRetry(
    async () => {
      // First try to get from Convex (cached/stored threads)
      const convex = getConvexClient();
      const cachedThread = await convex.query(api.emailThreads.getById, {
        threadId: threadId as any,
      });

      if (cachedThread) {
        return {
          threadId: cachedThread._id,
          subject: cachedThread.subject,
          messages: cachedThread.messages ?? [],
          participants: cachedThread.participants ?? [],
        };
      }

      // If not in Convex, try Nylas API
      // Note: This requires knowing the grantId, which should be passed or looked up
      console.warn(`[Email Activity] Thread ${threadId} not found in cache`);

      return {
        threadId,
        subject: "Thread not found",
        messages: [],
        participants: [],
      };
    },
    "getThreadContext",
    { maxRetries: 2 }
  );
}

/**
 * Get thread context from Nylas
 */
export async function getThreadContextFromNylas(
  grantId: string,
  threadId: string
): Promise<ThreadContext> {
  console.log(`[Email Activity] Getting thread context from Nylas: ${threadId}`);

  return withRetry(
    async () => {
      const nylas = getNylasClient();
      const thread = await nylas.getThread(grantId, threadId);
      const messages = await nylas.getThreadMessages(grantId, threadId);

      return {
        threadId: thread.id,
        subject: thread.subject,
        messages: messages.map((msg) => ({
          id: msg.id,
          from: msg.from?.[0]?.email ?? "unknown",
          to: msg.to?.map((t) => t.email) ?? [],
          body: msg.body,
          date: new Date(msg.date * 1000).toISOString(),
          subject: msg.subject,
        })),
        participants: thread.participants.map((p) => p.email),
      };
    },
    "getThreadContextFromNylas",
    { maxRetries: 2 }
  );
}

/**
 * Get user writing style
 */
export async function getUserWritingStyle(userId: string): Promise<WritingStyle> {
  console.log(`[Email Activity] Getting writing style for ${userId}`);

  const defaultStyle: WritingStyle = {
    preferredTone: "professional",
    formalityLevel: 7,
    averageReplyLength: 150,
    commonPhrases: ["Best regards", "Thank you", "Please let me know"],
  };

  return withRetry(
    async () => {
      const convex = getConvexClient();
      const profile = await convex.query(api.userProfiles.getWritingStyle, {
        userId: userId as any,
      });

      if (!profile) {
        return defaultStyle;
      }

      return {
        preferredTone: profile.preferredTone ?? "professional",
        formalityLevel: profile.formalityLevel ?? 7,
        averageReplyLength: profile.averageReplyLength ?? 150,
        commonPhrases: profile.commonPhrases ?? defaultStyle.commonPhrases,
      };
    },
    "getUserWritingStyle",
    { maxRetries: 2 }
  );
}

/**
 * Get user signature
 */
export async function getUserSignature(userId: string): Promise<{ text: string }> {
  console.log(`[Email Activity] Getting signature for ${userId}`);

  return withRetry(
    async () => {
      const convex = getConvexClient();
      const profile = await convex.query(api.userProfiles.getEmailSignature, {
        userId: userId as any,
      });

      if (!profile?.signature) {
        return { text: "Best regards" };
      }

      return { text: profile.signature };
    },
    "getUserSignature",
    { maxRetries: 2 }
  );
}

/**
 * Validate reply content
 */
export async function validateReplyContent(
  content: string
): Promise<{ valid: boolean; reason?: string }> {
  console.log(`[Email Activity] Validating reply content`);

  if (!content || content.trim().length === 0) {
    return { valid: false, reason: "Reply content cannot be empty" };
  }

  if (content.length < 10) {
    return { valid: false, reason: "Reply too short (minimum 10 characters)" };
  }

  if (content.length > 50000) {
    return { valid: false, reason: "Reply too long (maximum 50,000 characters)" };
  }

  // Check for placeholder text that might have been left in
  const placeholders = ["[INSERT", "[YOUR", "[NAME]", "[PLACEHOLDER", "{{", "}}"];
  for (const placeholder of placeholders) {
    if (content.includes(placeholder)) {
      return { valid: false, reason: `Reply contains placeholder text: ${placeholder}` };
    }
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

  return withRetry(
    async () => {
      const convex = getConvexClient();

      // Create alert in Convex
      await convex.mutation(api.alerts.create, {
        userId: input.userId as any,
        type: "urgent_email",
        title: `Urgent: ${input.subject}`,
        message: input.summary,
        action: input.suggestedAction,
        resourceType: "email",
        resourceId: input.emailId,
        priority: "urgent",
        read: false,
        createdAt: Date.now(),
      });

      // Send push notification
      await convex.mutation(api.notifications.sendPush, {
        userId: input.userId as any,
        title: "Urgent Email",
        body: input.subject,
        data: {
          type: "urgent_email",
          emailId: input.emailId,
        },
      });
    },
    "createUrgentAlert",
    { maxRetries: 3 }
  );
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

  return withRetry(
    async () => {
      const convex = getConvexClient();

      // Get email details
      const email = await convex.query(api.emails.getById, {
        emailId: input.emailId as any,
      });

      if (!email) {
        console.warn(`[Email Activity] Email ${input.emailId} not found for task creation`);
        return;
      }

      await convex.mutation(api.tasks.create, {
        userId: email.userId,
        title: input.suggestedAction,
        description: `Task created from email: ${email.subject}`,
        type: input.type,
        priority: input.priority,
        status: "pending",
        dueAt: Date.now() + input.dueIn * 60 * 1000, // dueIn is in minutes
        sourceType: "email",
        sourceId: input.emailId,
        createdAt: Date.now(),
      });
    },
    "createTask",
    { maxRetries: 2 }
  );
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

  return withRetry(
    async () => {
      const convex = getConvexClient();

      // Get email to find user
      const email = await convex.query(api.emails.getById, {
        emailId: input.emailId as any,
      });

      if (!email) {
        console.warn(`[Email Activity] Email ${input.emailId} not found for notification`);
        return;
      }

      // Only send notifications for important/urgent emails
      if (input.priority !== "urgent" && input.priority !== "important") {
        return;
      }

      await convex.mutation(api.notifications.sendPush, {
        userId: email.userId,
        title:
          input.priority === "urgent"
            ? "Urgent Email Received"
            : "Important Email",
        body: input.summary.slice(0, 100),
        data: {
          type: "email_triage",
          emailId: input.emailId,
          priority: input.priority,
          action: input.suggestedAction,
        },
      });
    },
    "sendTriageNotification",
    { maxRetries: 2 }
  );
}

// ============================================================================
// Email Sending Activities
// ============================================================================

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

  return withRetry(
    async () => {
      const nylas = getNylasClient();

      const message = await nylas.sendMessage(input.grantId, {
        subject: input.subject,
        body: input.body,
        to: input.to.map((email) => ({ email })),
        reply_to_message_id: input.replyToMessageId,
      });

      return { messageId: message.id };
    },
    "sendEmail",
    { maxRetries: 3 }
  );
}

/**
 * Send transactional email via Resend
 */
export async function sendTransactionalEmail(input: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  tags?: Array<{ name: string; value: string }>;
}): Promise<{ emailId: string }> {
  console.log(`[Email Activity] Sending transactional email via Resend`);

  return withRetry(
    async () => {
      const resend = getResendClient();

      const response = await resend.sendEmail({
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        tags: input.tags,
      });

      return { emailId: response.id };
    },
    "sendTransactionalEmail",
    { maxRetries: 3 }
  );
}

/**
 * Send email digest
 */
export async function sendEmailDigest(input: {
  userId: string;
  email: string;
  summary: {
    urgentCount: number;
    importantCount: number;
    totalCount: number;
    topEmails: Array<{
      subject: string;
      from: string;
      priority: string;
      summary: string;
    }>;
  };
  period: "daily" | "weekly";
}): Promise<void> {
  console.log(`[Email Activity] Sending ${input.period} email digest to ${input.email}`);

  const resend = getResendClient();

  const topEmailsHtml = input.summary.topEmails
    .map(
      (e) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">
          <strong>${e.subject}</strong><br>
          <span style="color: #666; font-size: 14px;">From: ${e.from}</span><br>
          <span style="color: #888; font-size: 13px;">${e.summary}</span>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">
          <span style="
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            background: ${e.priority === "urgent" ? "#fee2e2" : e.priority === "important" ? "#fef3c7" : "#e0f2fe"};
            color: ${e.priority === "urgent" ? "#dc2626" : e.priority === "important" ? "#d97706" : "#0284c7"};
          ">${e.priority}</span>
        </td>
      </tr>
    `
    )
    .join("");

  await resend.sendEmail({
    to: input.email,
    subject: `Your ${input.period} email digest - ${input.summary.urgentCount} urgent, ${input.summary.importantCount} important`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h1 style="color: #1a1a1a; margin-bottom: 8px;">Your ${input.period === "daily" ? "Daily" : "Weekly"} Email Digest</h1>
          <p style="color: #666; margin-bottom: 24px;">Here's a summary of your inbox activity.</p>

          <div style="display: flex; gap: 16px; margin-bottom: 32px;">
            <div style="flex: 1; padding: 16px; background: #fee2e2; border-radius: 8px; text-align: center;">
              <div style="font-size: 32px; font-weight: bold; color: #dc2626;">${input.summary.urgentCount}</div>
              <div style="color: #dc2626; font-size: 14px;">Urgent</div>
            </div>
            <div style="flex: 1; padding: 16px; background: #fef3c7; border-radius: 8px; text-align: center;">
              <div style="font-size: 32px; font-weight: bold; color: #d97706;">${input.summary.importantCount}</div>
              <div style="color: #d97706; font-size: 14px;">Important</div>
            </div>
            <div style="flex: 1; padding: 16px; background: #e0f2fe; border-radius: 8px; text-align: center;">
              <div style="font-size: 32px; font-weight: bold; color: #0284c7;">${input.summary.totalCount}</div>
              <div style="color: #0284c7; font-size: 14px;">Total</div>
            </div>
          </div>

          ${input.summary.topEmails.length > 0 ? `
            <h2 style="color: #1a1a1a; font-size: 18px; margin-bottom: 16px;">Top Emails</h2>
            <table style="width: 100%; border-collapse: collapse;">
              ${topEmailsHtml}
            </table>
          ` : ""}

          <div style="margin-top: 32px; text-align: center;">
            <a href="${process.env.FRONTEND_URL ?? "https://app.pull.com"}/email"
               style="display: inline-block; background: #0066ff; color: white; padding: 12px 24px;
                      text-decoration: none; border-radius: 6px; font-weight: 500;">
              Open Inbox
            </a>
          </div>
        </div>
      </body>
      </html>
    `,
    tags: [
      { name: "type", value: "email-digest" },
      { name: "period", value: input.period },
    ],
  });
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
  console.log(
    `[Email Activity] Audit log: ${event.action} on ${event.resourceType}/${event.resourceId}`
  );

  return withRetry(
    async () => {
      const convex = getConvexClient();
      await convex.mutation(api.auditLogs.create, {
        userId: event.userId as any,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        metadata: event.metadata ?? {},
        timestamp: Date.now(),
        ipAddress: undefined, // Would be set from request context
        userAgent: undefined,
      });
    },
    "recordAuditLog",
    { maxRetries: 2 }
  );
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Sync all messages for a grant
 */
export async function syncAllMessages(input: {
  userId: string;
  grantId: string;
  maxMessages?: number;
}): Promise<{ synced: number; cursor?: string }> {
  console.log(`[Email Activity] Starting full sync for grant ${input.grantId}`);

  const maxMessages = input.maxMessages ?? 500;
  let synced = 0;
  let cursor: string | undefined;

  while (synced < maxMessages) {
    Context.current().heartbeat(`Synced ${synced} messages`);

    const { messages, nextCursor } = await fetchNylasMessages({
      grantId: input.grantId,
      cursor,
      limit: Math.min(50, maxMessages - synced),
    });

    if (messages.length === 0) {
      break;
    }

    // Process messages in parallel (with limit)
    const processPromises = messages.map(async (msg) => {
      const isProcessed = await checkEmailProcessed(msg.id);
      if (!isProcessed) {
        const triage = await triageWithClaude({
          subject: msg.subject ?? "",
          body: msg.body ?? "",
          from: msg.from?.[0]?.email ?? "unknown",
        });

        await storeEmailConvex({
          userId: input.userId,
          emailId: `email_${msg.id}`,
          messageId: msg.id,
          subject: msg.subject ?? "",
          body: msg.body ?? "",
          from: msg.from?.[0]?.email ?? "unknown",
          to: msg.to?.map((t) => t.email) ?? [],
          receivedAt: new Date(msg.date * 1000).toISOString(),
          triage,
        });

        return true;
      }
      return false;
    });

    const results = await Promise.all(processPromises);
    synced += results.filter(Boolean).length;

    if (!nextCursor) {
      break;
    }

    cursor = nextCursor;

    // Update cursor periodically
    await updateSyncCursor(input.userId, input.grantId, cursor);
  }

  console.log(`[Email Activity] Sync complete. Synced ${synced} messages`);

  return { synced, cursor };
}

/**
 * Process incoming webhook message
 */
export async function processWebhookMessage(input: {
  grantId: string;
  messageId: string;
  userId: string;
}): Promise<void> {
  console.log(`[Email Activity] Processing webhook for message ${input.messageId}`);

  // Check if already processed
  const isProcessed = await checkEmailProcessed(input.messageId);
  if (isProcessed) {
    console.log(`[Email Activity] Message ${input.messageId} already processed`);
    return;
  }

  // Fetch the message from Nylas
  const nylas = getNylasClient();
  const message = await nylas.getMessage(input.grantId, input.messageId);

  // Triage the message
  const triage = await triageWithClaude({
    subject: message.subject,
    body: message.body,
    from: message.from?.[0]?.email ?? "unknown",
  });

  // Store the message
  await storeEmailConvex({
    userId: input.userId,
    emailId: `email_${message.id}`,
    messageId: message.id,
    subject: message.subject,
    body: message.body,
    from: message.from?.[0]?.email ?? "unknown",
    to: message.to?.map((t) => t.email) ?? [],
    receivedAt: new Date(message.date * 1000).toISOString(),
    triage,
  });

  // Send notifications for urgent/important emails
  if (triage.priority === "urgent") {
    await createUrgentAlert({
      userId: input.userId,
      emailId: `email_${message.id}`,
      subject: message.subject,
      summary: triage.summary,
      suggestedAction: triage.suggestedAction,
    });
  } else if (triage.priority === "important") {
    await sendTriageNotification({
      emailId: `email_${message.id}`,
      priority: triage.priority,
      summary: triage.summary,
      suggestedAction: triage.suggestedAction,
    });
  }

  // Extract and link trading signals
  if (triage.relatedTickers.length > 0) {
    await detectTradingSignals(input.userId, `email_${message.id}`, triage.relatedTickers);
    await linkToAssets(`email_${message.id}`, triage.relatedTickers);
  }

  // Record audit log
  await recordAuditLog({
    userId: input.userId,
    action: "email.received",
    resourceType: "email",
    resourceId: `email_${message.id}`,
    metadata: {
      from: message.from?.[0]?.email,
      subject: message.subject,
      priority: triage.priority,
      category: triage.category,
    },
  });
}
