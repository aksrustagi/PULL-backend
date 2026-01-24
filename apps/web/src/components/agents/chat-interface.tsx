"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useAction, useQuery } from "convex/react";
import { api } from "@pull/db/convex/_generated/api";
import { Id } from "@pull/db/convex/_generated/dataModel";

// ============================================================================
// TYPES
// ============================================================================

type AgentType = "trading" | "email" | "research";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  toolsUsed?: string[];
  suggestedActions?: SuggestedAction[];
  isLoading?: boolean;
}

interface SuggestedAction {
  type: string;
  label: string;
  data?: unknown;
}

interface ChatInterfaceProps {
  userId: Id<"users">;
  agentType?: AgentType;
  initialContext?: {
    emailId?: Id<"emails">;
    threadId?: string;
    marketTicker?: string;
    positionId?: Id<"positions">;
  };
  onActionExecute?: (action: SuggestedAction) => void;
  className?: string;
}

// ============================================================================
// AGENT CONFIGURATIONS
// ============================================================================

const AGENT_CONFIG: Record<
  AgentType,
  {
    name: string;
    description: string;
    placeholder: string;
    icon: string;
    color: string;
    quickActions: Array<{ label: string; prompt: string }>;
  }
> = {
  trading: {
    name: "Trading Assistant",
    description: "AI-powered trading insights and portfolio management",
    placeholder: "Ask about markets, positions, or trading strategies...",
    icon: "chart-line",
    color: "emerald",
    quickActions: [
      { label: "Portfolio Review", prompt: "Review my portfolio and suggest improvements" },
      { label: "Market Analysis", prompt: "What are the top prediction markets right now?" },
      { label: "Rebalancing", prompt: "Should I rebalance my portfolio?" },
      { label: "Position Help", prompt: "Explain my current positions" },
    ],
  },
  email: {
    name: "Email Assistant",
    description: "Smart email management and composition",
    placeholder: "Draft an email, summarize threads, or manage inbox...",
    icon: "envelope",
    color: "blue",
    quickActions: [
      { label: "Inbox Summary", prompt: "Summarize my unread emails" },
      { label: "Draft Email", prompt: "Help me compose a professional email" },
      { label: "Action Items", prompt: "What action items do I have in my emails?" },
      { label: "Urgent Emails", prompt: "Show me urgent emails that need attention" },
    ],
  },
  research: {
    name: "Research Analyst",
    description: "Deep market research and analysis",
    placeholder: "Research markets, analyze trends, or get insights...",
    icon: "magnifying-glass",
    color: "purple",
    quickActions: [
      { label: "Market Overview", prompt: "Give me an overview of active prediction markets" },
      { label: "Sentiment Analysis", prompt: "What's the current market sentiment?" },
      { label: "Closing Soon", prompt: "Which markets are closing soon?" },
      { label: "Deep Research", prompt: "Conduct deep research on a specific market" },
    ],
  },
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AgentChatInterface({
  userId,
  agentType = "trading",
  initialContext,
  onActionExecute,
  className = "",
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<AgentType>(agentType);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Convex actions for each agent
  const tradingChat = useAction(api.agents["trading-agent"].chat);
  const emailChat = useAction(api.agents["email-agent"].chat);
  const researchChat = useAction(api.agents["research-agent"].chat);

  const config = AGENT_CONFIG[activeAgent];

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle agent switch
  const handleAgentSwitch = useCallback((newAgent: AgentType) => {
    setActiveAgent(newAgent);
    setMessages([]);
    setSessionId(null);
  }, []);

  // Send message to agent
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      const userMessage: Message = {
        id: `user_${Date.now()}`,
        role: "user",
        content: content.trim(),
        timestamp: Date.now(),
      };

      const loadingMessage: Message = {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        isLoading: true,
      };

      setMessages((prev) => [...prev, userMessage, loadingMessage]);
      setInput("");
      setIsLoading(true);

      try {
        let response: {
          response: string;
          sessionId: string;
          toolsUsed?: string[];
          suggestedActions?: SuggestedAction[];
        };

        switch (activeAgent) {
          case "trading":
            response = await tradingChat({
              userId,
              query: content.trim(),
              sessionId: sessionId ?? undefined,
            });
            break;
          case "email":
            response = await emailChat({
              userId,
              query: content.trim(),
              emailId: initialContext?.emailId,
              threadId: initialContext?.threadId,
              sessionId: sessionId ?? undefined,
            });
            break;
          case "research":
            response = await researchChat({
              userId,
              query: content.trim(),
              marketTicker: initialContext?.marketTicker,
              sessionId: sessionId ?? undefined,
            });
            break;
        }

        if (!sessionId) {
          setSessionId(response.sessionId);
        }

        const assistantMessage: Message = {
          id: `assistant_${Date.now()}`,
          role: "assistant",
          content: response.response,
          timestamp: Date.now(),
          toolsUsed: response.toolsUsed,
          suggestedActions: response.suggestedActions,
        };

        setMessages((prev) =>
          prev.map((m) => (m.isLoading ? assistantMessage : m))
        );
      } catch (error) {
        console.error("Error sending message:", error);
        const errorMessage: Message = {
          id: `error_${Date.now()}`,
          role: "assistant",
          content:
            "I encountered an error processing your request. Please try again.",
          timestamp: Date.now(),
        };
        setMessages((prev) => prev.map((m) => (m.isLoading ? errorMessage : m)));
      } finally {
        setIsLoading(false);
      }
    },
    [
      activeAgent,
      userId,
      sessionId,
      isLoading,
      tradingChat,
      emailChat,
      researchChat,
      initialContext,
    ]
  );

  // Handle form submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // Handle key press (Enter to send, Shift+Enter for newline)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // Handle quick action click
  const handleQuickAction = (prompt: string) => {
    sendMessage(prompt);
  };

  // Handle suggested action click
  const handleSuggestedAction = (action: SuggestedAction) => {
    if (onActionExecute) {
      onActionExecute(action);
    } else {
      // Default handling
      switch (action.type) {
        case "confirm_order":
          sendMessage("Yes, please confirm and execute the order");
          break;
        case "suggestion":
          sendMessage(action.label);
          break;
        default:
          console.log("Action:", action);
      }
    }
  };

  return (
    <div
      className={`flex flex-col h-full bg-gray-900 rounded-lg border border-gray-800 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <AgentIcon type={activeAgent} />
          <div>
            <h2 className="text-lg font-semibold text-white">{config.name}</h2>
            <p className="text-sm text-gray-400">{config.description}</p>
          </div>
        </div>

        {/* Agent Switcher */}
        <div className="flex gap-2">
          {(Object.keys(AGENT_CONFIG) as AgentType[]).map((type) => (
            <button
              key={type}
              onClick={() => handleAgentSwitch(type)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                activeAgent === type
                  ? `bg-${AGENT_CONFIG[type].color}-500/20 text-${AGENT_CONFIG[type].color}-400 border border-${AGENT_CONFIG[type].color}-500/50`
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700 border border-transparent"
              }`}
            >
              {AGENT_CONFIG[type].name.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <WelcomeScreen
            config={config}
            onQuickAction={handleQuickAction}
          />
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              agentType={activeAgent}
              onSuggestedAction={handleSuggestedAction}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-800">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={config.placeholder}
              rows={1}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              disabled={isLoading}
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <LoadingSpinner />
            ) : (
              <SendIcon />
            )}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500 text-center">
          AI responses are for informational purposes only. Always verify important information.
        </p>
      </form>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function WelcomeScreen({
  config,
  onQuickAction,
}: {
  config: typeof AGENT_CONFIG[AgentType];
  onQuickAction: (prompt: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className={`w-16 h-16 rounded-full bg-${config.color}-500/20 flex items-center justify-center mb-4`}>
        <span className="text-3xl">
          {config.icon === "chart-line" && "📈"}
          {config.icon === "envelope" && "📧"}
          {config.icon === "magnifying-glass" && "🔍"}
        </span>
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">
        {config.name}
      </h3>
      <p className="text-gray-400 mb-6 max-w-md">
        {config.description}. Ask me anything or try one of the quick actions below.
      </p>
      <div className="grid grid-cols-2 gap-2 w-full max-w-md">
        {config.quickActions.map((action, index) => (
          <button
            key={index}
            onClick={() => onQuickAction(action.prompt)}
            className="px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 hover:text-white transition-colors text-left"
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  agentType,
  onSuggestedAction,
}: {
  message: Message;
  agentType: AgentType;
  onSuggestedAction: (action: SuggestedAction) => void;
}) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] ${
          isUser
            ? "bg-blue-600 text-white rounded-l-lg rounded-tr-lg"
            : "bg-gray-800 text-gray-100 rounded-r-lg rounded-tl-lg"
        } px-4 py-3`}
      >
        {message.isLoading ? (
          <div className="flex items-center gap-2">
            <LoadingDots />
            <span className="text-gray-400">Thinking...</span>
          </div>
        ) : (
          <>
            <div className="whitespace-pre-wrap">{message.content}</div>

            {/* Tools Used Badge */}
            {message.toolsUsed && message.toolsUsed.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-700">
                <div className="flex flex-wrap gap-1">
                  {message.toolsUsed.map((tool, index) => (
                    <span
                      key={index}
                      className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded"
                    >
                      {formatToolName(tool)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Suggested Actions */}
            {message.suggestedActions && message.suggestedActions.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-700">
                <p className="text-xs text-gray-400 mb-2">Suggested Actions:</p>
                <div className="flex flex-wrap gap-2">
                  {message.suggestedActions.map((action, index) => (
                    <button
                      key={index}
                      onClick={() => onSuggestedAction(action)}
                      className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                        action.type === "confirm_order"
                          ? "bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/50"
                          : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      }`}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Timestamp */}
        <div className="mt-1 text-xs opacity-50">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

function AgentIcon({ type }: { type: AgentType }) {
  const icons: Record<AgentType, string> = {
    trading: "📈",
    email: "📧",
    research: "🔍",
  };

  const colors: Record<AgentType, string> = {
    trading: "bg-emerald-500/20",
    email: "bg-blue-500/20",
    research: "bg-purple-500/20",
  };

  return (
    <div className={`w-10 h-10 rounded-full ${colors[type]} flex items-center justify-center text-xl`}>
      {icons[type]}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className="animate-spin h-5 w-5"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function LoadingDots() {
  return (
    <div className="flex space-x-1">
      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
    </div>
  );
}

function SendIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
      />
    </svg>
  );
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatToolName(tool: string): string {
  return tool
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default AgentChatInterface;

// Export specialized agent chat components
export function TradingAgentChat({
  userId,
  ...props
}: Omit<ChatInterfaceProps, "agentType">) {
  return <AgentChatInterface userId={userId} agentType="trading" {...props} />;
}

export function EmailAgentChat({
  userId,
  emailId,
  threadId,
  ...props
}: Omit<ChatInterfaceProps, "agentType"> & {
  emailId?: Id<"emails">;
  threadId?: string;
}) {
  return (
    <AgentChatInterface
      userId={userId}
      agentType="email"
      initialContext={{ emailId, threadId }}
      {...props}
    />
  );
}

export function ResearchAgentChat({
  userId,
  marketTicker,
  ...props
}: Omit<ChatInterfaceProps, "agentType"> & {
  marketTicker?: string;
}) {
  return (
    <AgentChatInterface
      userId={userId}
      agentType="research"
      initialContext={{ marketTicker }}
      {...props}
    />
  );
}

// ============================================================================
// TOOL USE VISUALIZATION COMPONENT
// ============================================================================

interface ToolUseVisualizationProps {
  tools: Array<{
    name: string;
    input: Record<string, unknown>;
    result?: unknown;
    status: "pending" | "running" | "complete" | "error";
  }>;
}

export function ToolUseVisualization({ tools }: ToolUseVisualizationProps) {
  if (tools.length === 0) return null;

  return (
    <div className="space-y-2 p-3 bg-gray-800/50 rounded-lg">
      <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
        Tools Used
      </h4>
      <div className="space-y-2">
        {tools.map((tool, index) => (
          <div
            key={index}
            className="flex items-center gap-2 text-sm"
          >
            <ToolStatusIcon status={tool.status} />
            <span className="text-gray-300">{formatToolName(tool.name)}</span>
            {tool.status === "complete" && (
              <span className="text-green-400 text-xs">Done</span>
            )}
            {tool.status === "error" && (
              <span className="text-red-400 text-xs">Error</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "pending":
      return <span className="text-gray-500">○</span>;
    case "running":
      return <span className="text-yellow-400 animate-pulse">●</span>;
    case "complete":
      return <span className="text-green-400">✓</span>;
    case "error":
      return <span className="text-red-400">✗</span>;
    default:
      return null;
  }
}

// ============================================================================
// EXECUTE RECOMMENDATIONS COMPONENT
// ============================================================================

interface ExecuteRecommendationsProps {
  recommendations: Array<{
    type: "buy" | "sell" | "hold";
    symbol: string;
    quantity?: number;
    price?: number;
    reason: string;
    confidence: number;
  }>;
  onExecute: (recommendation: ExecuteRecommendationsProps["recommendations"][0]) => void;
  onDismiss: (index: number) => void;
}

export function ExecuteRecommendations({
  recommendations,
  onExecute,
  onDismiss,
}: ExecuteRecommendationsProps) {
  if (recommendations.length === 0) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-gray-300">Recommendations</h4>
      {recommendations.map((rec, index) => (
        <div
          key={index}
          className="p-4 bg-gray-800 rounded-lg border border-gray-700"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 text-xs font-medium rounded ${
                  rec.type === "buy"
                    ? "bg-green-500/20 text-green-400"
                    : rec.type === "sell"
                      ? "bg-red-500/20 text-red-400"
                      : "bg-gray-500/20 text-gray-400"
                }`}
              >
                {rec.type.toUpperCase()}
              </span>
              <span className="font-medium text-white">{rec.symbol}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-400">Confidence:</span>
              <span
                className={`text-xs font-medium ${
                  rec.confidence > 0.7
                    ? "text-green-400"
                    : rec.confidence > 0.4
                      ? "text-yellow-400"
                      : "text-gray-400"
                }`}
              >
                {Math.round(rec.confidence * 100)}%
              </span>
            </div>
          </div>

          <p className="text-sm text-gray-400 mb-3">{rec.reason}</p>

          {rec.quantity && (
            <p className="text-sm text-gray-300 mb-3">
              Qty: {rec.quantity} {rec.price && `@ $${rec.price.toFixed(2)}`}
            </p>
          )}

          <div className="flex gap-2">
            {rec.type !== "hold" && (
              <button
                onClick={() => onExecute(rec)}
                className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
                  rec.type === "buy"
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : "bg-red-600 hover:bg-red-700 text-white"
                }`}
              >
                Execute {rec.type.charAt(0).toUpperCase() + rec.type.slice(1)}
              </button>
            )}
            <button
              onClick={() => onDismiss(index)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-300"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}

      <p className="text-xs text-gray-500 text-center">
        Review carefully before executing. This is not financial advice.
      </p>
    </div>
  );
}
