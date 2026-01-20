"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export interface SmartReply {
  id: string;
  content: string;
  tone: "professional" | "friendly" | "brief" | "detailed";
  confidence?: number;
}

export interface SmartReplyProps {
  replies: SmartReply[];
  onSelect?: (reply: SmartReply) => void;
  onEdit?: (reply: SmartReply) => void;
  onSend?: (reply: SmartReply) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
  className?: string;
}

const toneIcons = {
  professional: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  ),
  friendly: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  brief: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 10V3L4 14h7v7l9-11h-7z"
      />
    </svg>
  ),
  detailed: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  ),
};

const toneLabels = {
  professional: "Professional",
  friendly: "Friendly",
  brief: "Brief",
  detailed: "Detailed",
};

export function SmartReply({
  replies,
  onSelect,
  onEdit,
  onSend,
  onRefresh,
  isLoading,
  className,
}: SmartReplyProps) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [isSending, setIsSending] = React.useState(false);

  const handleSelect = (reply: SmartReply) => {
    setSelectedId(reply.id);
    onSelect?.(reply);
  };

  const handleSend = async (reply: SmartReply) => {
    setIsSending(true);
    try {
      await onSend?.(reply);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <svg
            className="h-5 w-5 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          <span className="font-medium">AI Smart Replies</span>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-1 hover:bg-muted rounded-md transition-colors disabled:opacity-50"
            title="Generate new replies"
          >
            <svg
              className={cn("h-4 w-4", isLoading && "animate-spin")}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-4 rounded-lg border bg-muted/50 animate-pulse"
            >
              <div className="h-4 bg-muted rounded w-1/4 mb-2" />
              <div className="h-3 bg-muted rounded w-full mb-1" />
              <div className="h-3 bg-muted rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : replies.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <svg
            className="h-8 w-8 mx-auto mb-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <p>No smart replies available</p>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="text-primary hover:underline text-sm mt-2"
            >
              Generate replies
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {replies.map((reply) => {
            const isSelected = selectedId === reply.id;

            return (
              <div
                key={reply.id}
                className={cn(
                  "p-4 rounded-lg border cursor-pointer transition-all",
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "hover:border-primary/50 hover:bg-muted/50"
                )}
                onClick={() => handleSelect(reply)}
              >
                {/* Tone indicator */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2 text-muted-foreground">
                    {toneIcons[reply.tone]}
                    <span className="text-xs">{toneLabels[reply.tone]}</span>
                  </div>
                  {reply.confidence !== undefined && (
                    <span className="text-xs text-muted-foreground">
                      {reply.confidence}% confident
                    </span>
                  )}
                </div>

                {/* Reply content */}
                <p className="text-sm whitespace-pre-wrap">{reply.content}</p>

                {/* Actions (shown when selected) */}
                {isSelected && (
                  <div className="flex items-center justify-end space-x-2 mt-4 pt-4 border-t">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit?.(reply);
                      }}
                      className="px-3 py-1.5 text-sm font-medium rounded-md border hover:bg-muted transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSend(reply);
                      }}
                      disabled={isSending}
                      className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      {isSending ? "Sending..." : "Send"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Quick reply chips for inline use
export interface QuickReplyChipsProps {
  replies: { id: string; label: string; content: string }[];
  onSelect?: (content: string) => void;
  className?: string;
}

export function QuickReplyChips({
  replies,
  onSelect,
  className,
}: QuickReplyChipsProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {replies.map((reply) => (
        <button
          key={reply.id}
          onClick={() => onSelect?.(reply.content)}
          className="px-3 py-1 text-sm rounded-full border hover:bg-muted transition-colors"
        >
          {reply.label}
        </button>
      ))}
    </div>
  );
}
