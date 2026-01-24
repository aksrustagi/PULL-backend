import { v } from "convex/values";
import { action, mutation, internalQuery, internalMutation } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { getToolsForAgent } from "./tools";
import { Id } from "../_generated/dataModel";

/**
 * Email Agent for PULL
 * AI-powered email assistant for composition, replies, and triage
 */

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

const EMAIL_AGENT_SYSTEM_PROMPT = `You are PULL's AI Email Assistant, helping users manage their email communications effectively.

## Your Capabilities
- Compose professional emails
- Draft contextual reply suggestions
- Summarize email threads
- Extract action items from emails
- Triage and categorize emails by priority

## Guidelines
1. PROFESSIONAL: Maintain appropriate tone for business communications
2. CONCISE: Keep emails clear and to the point
3. CONTEXT-AWARE: Consider the conversation history and recipient
4. ACTIONABLE: Highlight clear next steps when relevant
5. PRIVACY: Never expose sensitive information inappropriately

## Email Composition Rules
- Match the tone to the relationship (formal for new contacts, warmer for established ones)
- Include clear subject lines
- Structure with greeting, body, and appropriate closing
- Keep paragraphs short and scannable

## Response Format
- Drafts should be ready to send with minimal editing
- Summaries should be bullet-pointed and scannable
- Action items should be specific and time-bound when possible`;

const COMPOSE_PROMPT = `Create a professional email draft based on the user's request.

Guidelines:
- Write a clear, compelling subject line
- Open with an appropriate greeting
- Keep the body concise and well-structured
- End with a clear call-to-action if needed
- Close professionally

Output the email in the following format:
Subject: [subject line]

[email body with proper formatting]`;

const REPLY_PROMPT = `Generate a thoughtful reply to this email conversation.

Guidelines:
- Match the tone of the original sender
- Address all points raised
- Be helpful and constructive
- Keep the response focused and relevant
- Include any necessary follow-up actions`;

const SUMMARIZE_PROMPT = `Summarize this email or email thread concisely.

Provide:
1. One-sentence overview
2. Key points (bullet list)
3. Sender's intent/request
4. Any deadlines or time-sensitive items
5. Suggested response approach`;

const ACTION_ITEMS_PROMPT = `Extract action items from this email or email thread.

For each action item:
- What needs to be done
- Who is responsible (if mentioned)
- Deadline (if specified or implied)
- Priority level (high/medium/low)
- Any dependencies or context`;

const TRIAGE_PROMPT = `Analyze this email for triage classification.

Determine:
1. Priority (urgent/high/normal/low)
2. Category (work/personal/newsletter/promotional/social/transactional)
3. Action required? (yes/no)
4. Brief summary (1-2 sentences)
5. Confidence score (0-1)

Output as JSON in this format:
{
  "priority": "string",
  "category": "string",
  "actionRequired": boolean,
  "summary": "string",
  "confidence": number
}`;

// ============================================================================
// INTERNAL QUERIES
// ============================================================================

/**
 * Get email context for the agent
 */
export const _getEmailContext = internalQuery({
  args: {
    userId: v.id("users"),
    emailId: v.optional(v.id("emails")),
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get user info
    const user = await ctx.db.get(args.userId);

    // Get email if specified
    let email = null;
    if (args.emailId) {
      email = await ctx.db.get(args.emailId);
    }

    // Get thread if specified
    let thread: typeof email[] = [];
    if (args.threadId) {
      thread = await ctx.db
        .query("emails")
        .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
        .order("asc")
        .collect();
    } else if (email?.threadId) {
      thread = await ctx.db
        .query("emails")
        .withIndex("by_thread", (q) => q.eq("threadId", email.threadId))
        .order("asc")
        .collect();
    }

    // Get email stats
    const unreadEmails = await ctx.db
      .query("emails")
      .withIndex("by_status", (q) =>
        q.eq("userId", args.userId).eq("status", "unread")
      )
      .collect();

    const urgentCount = unreadEmails.filter(
      (e) => e.triagePriority === "urgent"
    ).length;
    const actionRequiredCount = unreadEmails.filter(
      (e) => e.triageActionRequired
    ).length;

    return {
      user: user
        ? {
            displayName: user.displayName,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
          }
        : null,
      email: email
        ? {
            id: email._id,
            subject: email.subject,
            from: email.fromName
              ? `${email.fromName} <${email.fromEmail}>`
              : email.fromEmail,
            fromEmail: email.fromEmail,
            to: email.toEmails,
            cc: email.ccEmails,
            body: email.bodyPlain,
            snippet: email.snippet,
            receivedAt: email.receivedAt,
            status: email.status,
            triagePriority: email.triagePriority,
            triageCategory: email.triageCategory,
            triageSummary: email.triageSummary,
          }
        : null,
      thread: thread.map((e) => ({
        id: e._id,
        subject: e.subject,
        from: e.fromName ? `${e.fromName} <${e.fromEmail}>` : e.fromEmail,
        snippet: e.snippet,
        body: e.bodyPlain,
        receivedAt: e.receivedAt,
      })),
      stats: {
        unreadCount: unreadEmails.length,
        urgentCount,
        actionRequiredCount,
      },
    };
  },
});

/**
 * Get recent emails for context
 */
export const _getRecentEmails = internalQuery({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
    fromEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let emails = await ctx.db
      .query("emails")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(args.limit ?? 20);

    if (args.fromEmail) {
      emails = emails.filter((e) =>
        e.fromEmail.toLowerCase().includes(args.fromEmail!.toLowerCase())
      );
    }

    return emails.map((e) => ({
      id: e._id,
      subject: e.subject,
      from: e.fromName ? `${e.fromName} <${e.fromEmail}>` : e.fromEmail,
      snippet: e.snippet,
      receivedAt: e.receivedAt,
      status: e.status,
      triagePriority: e.triagePriority,
    }));
  },
});

// ============================================================================
// MAIN EMAIL AGENT ACTION
// ============================================================================

/**
 * Main Email Agent chat action
 */
export const chat = action({
  args: {
    userId: v.id("users"),
    query: v.string(),
    emailId: v.optional(v.id("emails")),
    threadId: v.optional(v.string()),
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sessionId = args.sessionId ?? `email_session_${Date.now()}`;

    // Get email context
    const emailContext = await ctx.runQuery(
      internal.agents["email-agent"]._getEmailContext,
      {
        userId: args.userId,
        emailId: args.emailId,
        threadId: args.threadId,
      }
    );

    // Get memory context
    const memoryContext = await ctx.runAction(api.agents.memory.buildContext, {
      userId: args.userId,
      agentType: "email",
      query: args.query,
      maxTokens: 1000,
    });

    // Build context message
    const contextMessage = buildEmailContextMessage(emailContext, memoryContext.context, args.query);

    // Call Claude
    const response = await callClaude({
      system: EMAIL_AGENT_SYSTEM_PROMPT,
      messages: [{ role: "user" as const, content: contextMessage }],
      tools: getToolsForAgent("email"),
    });

    // Process tool calls
    const toolResults: Array<{ tool: string; result: unknown }> = [];
    let finalResponse = response.content;

    if (response.toolCalls && response.toolCalls.length > 0) {
      for (const toolCall of response.toolCalls) {
        const result = await ctx.runAction(api.agents.tools.executeTool, {
          userId: args.userId,
          toolName: toolCall.name,
          toolInput: toolCall.input,
        });
        toolResults.push({ tool: toolCall.name, result });
      }

      // Get follow-up response
      const followUp = await callClaudeWithToolResults({
        system: EMAIL_AGENT_SYSTEM_PROMPT,
        messages: [{ role: "user" as const, content: contextMessage }],
        toolCalls: response.toolCalls,
        toolResults,
      });

      finalResponse = followUp.content;
    }

    // Store interaction
    await ctx.runMutation(api.agents.memory.storeInteraction, {
      userId: args.userId,
      agentType: "email",
      sessionId,
      role: "user",
      content: args.query,
    });

    await ctx.runMutation(api.agents.memory.storeInteraction, {
      userId: args.userId,
      agentType: "email",
      sessionId,
      role: "assistant",
      content: finalResponse,
    });

    return {
      response: finalResponse,
      sessionId,
      toolsUsed: toolResults.map((t) => t.tool),
      emailContext: emailContext.email
        ? { subject: emailContext.email.subject, from: emailContext.email.from }
        : null,
    };
  },
});

/**
 * Compose a new email
 */
export const composeEmail = action({
  args: {
    userId: v.id("users"),
    request: v.string(),
    to: v.optional(v.array(v.string())),
    context: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get user info for signature
    const emailContext = await ctx.runQuery(
      internal.agents["email-agent"]._getEmailContext,
      { userId: args.userId }
    );

    const contextMessage = `
## User Info
Name: ${emailContext.user?.displayName ?? "User"}
Email: ${emailContext.user?.email ?? ""}

${args.to ? `## Recipients\n${args.to.join(", ")}` : ""}

${args.context ? `## Additional Context\n${args.context}` : ""}

## Composition Request
${args.request}

Please compose a professional email based on this request.
`;

    const response = await callClaude({
      system: EMAIL_AGENT_SYSTEM_PROMPT + "\n\n" + COMPOSE_PROMPT,
      messages: [{ role: "user" as const, content: contextMessage }],
      tools: [],
    });

    // Parse subject from response
    const subjectMatch = response.content.match(/Subject:\s*(.+?)(?:\n|$)/i);
    const subject = subjectMatch ? subjectMatch[1].trim() : "No Subject";
    const body = response.content.replace(/Subject:\s*.+?\n/i, "").trim();

    return {
      draft: {
        to: args.to ?? [],
        subject,
        body,
      },
      rawResponse: response.content,
      requiresReview: true,
    };
  },
});

/**
 * Generate reply suggestions
 */
export const suggestReply = action({
  args: {
    userId: v.id("users"),
    emailId: v.id("emails"),
    tone: v.optional(
      v.union(
        v.literal("professional"),
        v.literal("friendly"),
        v.literal("brief"),
        v.literal("detailed")
      )
    ),
    intent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tone = args.tone ?? "professional";

    // Get email and thread context
    const emailContext = await ctx.runQuery(
      internal.agents["email-agent"]._getEmailContext,
      { userId: args.userId, emailId: args.emailId }
    );

    if (!emailContext.email) {
      return { error: "Email not found" };
    }

    // Get previous correspondence with this sender
    const previousEmails = await ctx.runQuery(
      internal.agents["email-agent"]._getRecentEmails,
      {
        userId: args.userId,
        fromEmail: emailContext.email.fromEmail,
        limit: 5,
      }
    );

    const contextMessage = `
## Original Email
From: ${emailContext.email.from}
Subject: ${emailContext.email.subject}
Date: ${new Date(emailContext.email.receivedAt).toLocaleString()}

${emailContext.email.body ?? emailContext.email.snippet}

${
  emailContext.thread.length > 1
    ? `## Thread History (${emailContext.thread.length} messages)\n` +
      emailContext.thread
        .slice(-3)
        .map((e) => `From: ${e.from}\n${e.snippet}`)
        .join("\n\n---\n\n")
    : ""
}

${
  previousEmails.length > 0
    ? `## Previous Correspondence\n${previousEmails.map((e) => `- ${e.subject} (${new Date(e.receivedAt).toLocaleDateString()})`).join("\n")}`
    : ""
}

## User Info
Name: ${emailContext.user?.displayName ?? "User"}

## Reply Parameters
Tone: ${tone}
${args.intent ? `Intent: ${args.intent}` : ""}

Please generate a ${tone} reply to this email.
`;

    const response = await callClaude({
      system: EMAIL_AGENT_SYSTEM_PROMPT + "\n\n" + REPLY_PROMPT,
      messages: [{ role: "user" as const, content: contextMessage }],
      tools: [],
    });

    return {
      suggestions: [
        {
          tone,
          draft: response.content,
          subject: `Re: ${emailContext.email.subject}`,
        },
      ],
      originalEmail: {
        from: emailContext.email.from,
        subject: emailContext.email.subject,
      },
      requiresReview: true,
    };
  },
});

/**
 * Summarize email or thread
 */
export const summarizeEmail = action({
  args: {
    userId: v.id("users"),
    emailId: v.optional(v.id("emails")),
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const emailContext = await ctx.runQuery(
      internal.agents["email-agent"]._getEmailContext,
      {
        userId: args.userId,
        emailId: args.emailId,
        threadId: args.threadId,
      }
    );

    if (!emailContext.email && emailContext.thread.length === 0) {
      return { error: "Email or thread not found" };
    }

    const isThread = emailContext.thread.length > 1;
    const content = isThread
      ? emailContext.thread
          .map(
            (e) =>
              `From: ${e.from}\nDate: ${new Date(e.receivedAt).toLocaleString()}\n\n${e.body ?? e.snippet}`
          )
          .join("\n\n---\n\n")
      : `From: ${emailContext.email!.from}\nSubject: ${emailContext.email!.subject}\n\n${emailContext.email!.body ?? emailContext.email!.snippet}`;

    const contextMessage = `
## ${isThread ? "Email Thread" : "Email"} to Summarize

${content}

Please provide a comprehensive summary.
`;

    const response = await callClaude({
      system: EMAIL_AGENT_SYSTEM_PROMPT + "\n\n" + SUMMARIZE_PROMPT,
      messages: [{ role: "user" as const, content: contextMessage }],
      tools: [],
    });

    return {
      summary: response.content,
      emailCount: emailContext.thread.length || 1,
      subject: emailContext.email?.subject ?? emailContext.thread[0]?.subject,
      participants: [
        ...new Set([
          emailContext.email?.from,
          ...emailContext.thread.map((e) => e.from),
        ]),
      ].filter(Boolean),
    };
  },
});

/**
 * Extract action items from email
 */
export const extractActionItems = action({
  args: {
    userId: v.id("users"),
    emailId: v.optional(v.id("emails")),
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const emailContext = await ctx.runQuery(
      internal.agents["email-agent"]._getEmailContext,
      {
        userId: args.userId,
        emailId: args.emailId,
        threadId: args.threadId,
      }
    );

    if (!emailContext.email && emailContext.thread.length === 0) {
      return { error: "Email or thread not found" };
    }

    const content =
      emailContext.thread.length > 1
        ? emailContext.thread
            .map((e) => `From: ${e.from}\n${e.body ?? e.snippet}`)
            .join("\n\n---\n\n")
        : emailContext.email!.body ?? emailContext.email!.snippet;

    const contextMessage = `
## Email Content

${content}

Please extract all action items.
`;

    const response = await callClaude({
      system: EMAIL_AGENT_SYSTEM_PROMPT + "\n\n" + ACTION_ITEMS_PROMPT,
      messages: [{ role: "user" as const, content: contextMessage }],
      tools: [],
    });

    // Parse action items from response
    const actionItems = parseActionItems(response.content);

    return {
      actionItems,
      rawAnalysis: response.content,
      source: {
        emailId: args.emailId,
        threadId: args.threadId,
        subject: emailContext.email?.subject,
      },
    };
  },
});

/**
 * Triage an email
 */
export const triageEmail = action({
  args: {
    userId: v.id("users"),
    emailId: v.id("emails"),
  },
  handler: async (ctx, args) => {
    const email = await ctx.runQuery(internal.agents["email-agent"]._getEmailContext, {
      userId: args.userId,
      emailId: args.emailId,
    });

    if (!email.email) {
      return { error: "Email not found" };
    }

    const contextMessage = `
## Email to Triage

From: ${email.email.from}
Subject: ${email.email.subject}
Snippet: ${email.email.snippet}

Body:
${email.email.body ?? email.email.snippet}

Please analyze and triage this email.
`;

    const response = await callClaude({
      system: EMAIL_AGENT_SYSTEM_PROMPT + "\n\n" + TRIAGE_PROMPT,
      messages: [{ role: "user" as const, content: contextMessage }],
      tools: [],
    });

    // Parse triage result
    const triageResult = parseTriageResult(response.content);

    // Update email with triage data
    if (triageResult) {
      await ctx.runMutation(internal.agents["email-agent"]._updateEmailTriage, {
        emailId: args.emailId,
        priority: triageResult.priority,
        category: triageResult.category,
        summary: triageResult.summary,
        actionRequired: triageResult.actionRequired,
        confidence: triageResult.confidence,
      });
    }

    return {
      triage: triageResult,
      emailId: args.emailId,
      subject: email.email.subject,
    };
  },
});

/**
 * Batch triage multiple emails
 */
export const batchTriage = action({
  args: {
    userId: v.id("users"),
    emailIds: v.array(v.id("emails")),
  },
  handler: async (ctx, args) => {
    const results: Array<{
      emailId: Id<"emails">;
      success: boolean;
      triage?: {
        priority: string;
        category: string;
        actionRequired: boolean;
        summary: string;
      };
      error?: string;
    }> = [];

    for (const emailId of args.emailIds) {
      try {
        const result = await ctx.runAction(api.agents["email-agent"].triageEmail, {
          userId: args.userId,
          emailId,
        });

        if (result.error) {
          results.push({ emailId, success: false, error: result.error });
        } else {
          results.push({ emailId, success: true, triage: result.triage });
        }
      } catch (error) {
        results.push({
          emailId,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return {
      processed: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  },
});

// ============================================================================
// INTERNAL MUTATIONS
// ============================================================================

/**
 * Update email triage data
 */
export const _updateEmailTriage = internalMutation({
  args: {
    emailId: v.id("emails"),
    priority: v.string(),
    category: v.string(),
    summary: v.string(),
    actionRequired: v.boolean(),
    confidence: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.emailId, {
      triagePriority: args.priority,
      triageCategory: args.category,
      triageSummary: args.summary,
      triageActionRequired: args.actionRequired,
      triageConfidence: args.confidence,
      updatedAt: Date.now(),
    });

    return args.emailId;
  },
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildEmailContextMessage(
  emailContext: Awaited<ReturnType<typeof _getEmailContext.handler>>,
  memoryContext: string,
  query: string
): string {
  return `
## User Context
${emailContext.user ? `Name: ${emailContext.user.displayName}\nEmail: ${emailContext.user.email}` : "User info not available"}

## Email Stats
- Unread: ${emailContext.stats.unreadCount}
- Urgent: ${emailContext.stats.urgentCount}
- Action Required: ${emailContext.stats.actionRequiredCount}

${
  emailContext.email
    ? `## Current Email
From: ${emailContext.email.from}
Subject: ${emailContext.email.subject}
Status: ${emailContext.email.status}
Priority: ${emailContext.email.triagePriority ?? "Not triaged"}

${emailContext.email.body ?? emailContext.email.snippet}`
    : ""
}

${
  emailContext.thread.length > 0
    ? `## Thread (${emailContext.thread.length} messages)
${emailContext.thread.slice(-3).map((e) => `- ${e.from}: ${e.snippet}`).join("\n")}`
    : ""
}

${memoryContext ? `## Previous Context\n${memoryContext}` : ""}

---

User Query: ${query}
`;
}

interface ClaudeResponse {
  content: string;
  toolCalls?: Array<{ name: string; input: Record<string, unknown> }>;
}

async function callClaude(params: {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  tools: Array<{ name: string; description: string; input_schema: unknown }>;
}): Promise<ClaudeResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      content:
        "I apologize, but the AI service is not configured. Please contact support.",
    };
  }

  try {
    const requestBody: Record<string, unknown> = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: params.system,
      messages: params.messages,
    };

    if (params.tools.length > 0) {
      requestBody.tools = params.tools;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      console.error("Claude API error:", await response.text());
      return {
        content: "I encountered an error. Please try again later.",
      };
    }

    const data = await response.json();

    let textContent = "";
    const toolCalls: Array<{ name: string; input: Record<string, unknown> }> = [];

    for (const block of data.content) {
      if (block.type === "text") {
        textContent += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({ name: block.name, input: block.input });
      }
    }

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  } catch (error) {
    console.error("Error calling Claude:", error);
    return { content: "I encountered an error. Please try again later." };
  }
}

async function callClaudeWithToolResults(params: {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
  toolResults: Array<{ tool: string; result: unknown }>;
}): Promise<ClaudeResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { content: "AI service not configured." };
  }

  try {
    const messages = [
      ...params.messages,
      {
        role: "assistant" as const,
        content: params.toolCalls.map((tc, i) => ({
          type: "tool_use",
          id: `tool_${i}`,
          name: tc.name,
          input: tc.input,
        })),
      },
      {
        role: "user" as const,
        content: params.toolResults.map((tr, i) => ({
          type: "tool_result",
          tool_use_id: `tool_${i}`,
          content: JSON.stringify(tr.result),
        })),
      },
    ];

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: params.system,
        messages,
      }),
    });

    if (!response.ok) {
      return { content: "Error processing tool results." };
    }

    const data = await response.json();
    const textContent = data.content
      .filter((block: { type: string }) => block.type === "text")
      .map((block: { text: string }) => block.text)
      .join("");

    return { content: textContent };
  } catch (error) {
    console.error("Error:", error);
    return { content: "Error processing request." };
  }
}

function parseTriageResult(content: string): {
  priority: string;
  category: string;
  actionRequired: boolean;
  summary: string;
  confidence: number;
} | null {
  try {
    // Try to extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        priority: parsed.priority ?? "normal",
        category: parsed.category ?? "other",
        actionRequired: parsed.actionRequired ?? false,
        summary: parsed.summary ?? "",
        confidence: parsed.confidence ?? 0.5,
      };
    }

    // Fallback parsing
    return {
      priority: content.toLowerCase().includes("urgent") ? "urgent" : "normal",
      category: "other",
      actionRequired: content.toLowerCase().includes("action required"),
      summary: content.slice(0, 200),
      confidence: 0.5,
    };
  } catch {
    return null;
  }
}

function parseActionItems(content: string): Array<{
  task: string;
  assignee?: string;
  deadline?: string;
  priority: string;
}> {
  const items: Array<{
    task: string;
    assignee?: string;
    deadline?: string;
    priority: string;
  }> = [];

  // Simple parsing - look for bullet points or numbered items
  const lines = content.split("\n");
  let currentItem: (typeof items)[0] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for new item (bullet or number)
    if (trimmed.match(/^[-*•]\s+/) || trimmed.match(/^\d+\.\s+/)) {
      if (currentItem) {
        items.push(currentItem);
      }
      currentItem = {
        task: trimmed.replace(/^[-*•\d.]+\s+/, ""),
        priority: "medium",
      };
    } else if (currentItem && trimmed) {
      // Check for metadata
      if (trimmed.toLowerCase().includes("deadline:")) {
        currentItem.deadline = trimmed.replace(/deadline:\s*/i, "");
      } else if (trimmed.toLowerCase().includes("assignee:")) {
        currentItem.assignee = trimmed.replace(/assignee:\s*/i, "");
      } else if (trimmed.toLowerCase().includes("priority:")) {
        const priority = trimmed.toLowerCase();
        currentItem.priority = priority.includes("high")
          ? "high"
          : priority.includes("low")
            ? "low"
            : "medium";
      }
    }
  }

  if (currentItem) {
    items.push(currentItem);
  }

  return items;
}
