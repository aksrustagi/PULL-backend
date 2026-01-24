/**
 * PULL AI Agent System
 *
 * This module provides AI-powered agents for:
 * - Trading: Portfolio analysis, market insights, trade execution
 * - Email: Composition, replies, summarization, triage
 * - Research: Market research, sentiment analysis, news aggregation
 *
 * Architecture:
 * - memory.ts: Persistent memory with vector search for context
 * - tools.ts: Tool definitions and execution for agent capabilities
 * - trading-agent.ts: Trading and portfolio management agent
 * - email-agent.ts: Email management and composition agent
 * - research-agent.ts: Market research and analysis agent
 */

// Re-export everything from submodules
export * from "./memory";
export * from "./tools";
export * from "./trading-agent";
export * from "./email-agent";
export * from "./research-agent";

// Agent types
export type AgentType = "trading" | "email" | "research" | "assistant";

// Safety guardrails
export const SAFETY_GUARDRAILS = {
  maxTokensPerRequest: 4096,
  maxToolCallsPerTurn: 5,
  requireConfirmationFor: ["placeOrder", "cancelOrder", "composeEmail"],
  sensitiveDataFields: ["passwordHash", "accessToken", "refreshToken"],
  rateLimits: {
    requestsPerMinute: 20,
    requestsPerHour: 200,
  },
};

// Prompt engineering best practices embedded in agents:
// 1. Clear system prompts with role definition
// 2. Structured output formats
// 3. Safety disclaimers for financial/trading advice
// 4. User confirmation required for actions
// 5. Context window management with memory
// 6. Tool use with proper error handling
