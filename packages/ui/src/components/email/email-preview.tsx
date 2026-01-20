"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export interface EmailAttachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  url?: string;
}

export interface EmailThread {
  id: string;
  from: {
    name: string;
    email: string;
    avatar?: string;
  };
  to: { name: string; email: string }[];
  cc?: { name: string; email: string }[];
  subject: string;
  body: string;
  htmlBody?: string;
  receivedAt: Date;
  attachments?: EmailAttachment[];
}

export interface EmailPreviewProps {
  thread: EmailThread[];
  triagePriority?: "urgent" | "important" | "normal" | "low";
  triageCategory?: string;
  triageSummary?: string;
  onReply?: () => void;
  onReplyAll?: () => void;
  onForward?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onBack?: () => void;
  className?: string;
}

const priorityLabels = {
  urgent: { label: "Urgent", color: "bg-red-500 text-white" },
  important: { label: "Important", color: "bg-orange-500 text-white" },
  normal: { label: "Normal", color: "bg-blue-500 text-white" },
  low: { label: "Low Priority", color: "bg-gray-400 text-white" },
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (date: Date) => {
  return date.toLocaleDateString([], {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export function EmailPreview({
  thread,
  triagePriority,
  triageCategory,
  triageSummary,
  onReply,
  onReplyAll,
  onForward,
  onArchive,
  onDelete,
  onBack,
  className,
}: EmailPreviewProps) {
  const [expandedMessages, setExpandedMessages] = React.useState<Set<string>>(
    new Set([thread[thread.length - 1]?.id])
  );

  const latestMessage = thread[thread.length - 1];

  const toggleExpand = (id: string) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center space-x-4">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1 hover:bg-muted rounded-md transition-colors"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
          )}
          <h2 className="text-lg font-semibold truncate">
            {latestMessage?.subject}
          </h2>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onArchive}
            className="p-2 hover:bg-muted rounded-md transition-colors"
            title="Archive"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
              />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-2 hover:bg-muted rounded-md transition-colors text-destructive"
            title="Delete"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* AI Triage summary */}
      {(triagePriority || triageCategory || triageSummary) && (
        <div className="p-4 border-b bg-muted/30">
          <div className="flex items-center space-x-2 mb-2">
            <svg
              className="h-4 w-4 text-primary"
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
            <span className="text-sm font-medium">AI Triage</span>
          </div>
          <div className="flex items-center space-x-2 mb-2">
            {triagePriority && (
              <span
                className={cn(
                  "px-2 py-0.5 text-xs rounded-full",
                  priorityLabels[triagePriority].color
                )}
              >
                {priorityLabels[triagePriority].label}
              </span>
            )}
            {triageCategory && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-muted">
                {triageCategory}
              </span>
            )}
          </div>
          {triageSummary && (
            <p className="text-sm text-muted-foreground">{triageSummary}</p>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {thread.map((message, index) => {
          const isExpanded = expandedMessages.has(message.id);
          const isLatest = index === thread.length - 1;

          return (
            <div key={message.id} className="border-b">
              {/* Message header */}
              <button
                onClick={() => toggleExpand(message.id)}
                className="w-full p-4 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start space-x-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex-shrink-0 flex items-center justify-center">
                    {message.from.avatar ? (
                      <img
                        src={message.from.avatar}
                        alt={message.from.name}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-medium">
                        {message.from.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{message.from.name}</span>
                        <span className="text-sm text-muted-foreground">
                          &lt;{message.from.email}&gt;
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {formatDate(message.receivedAt)}
                      </span>
                    </div>

                    {!isExpanded && (
                      <p className="text-sm text-muted-foreground truncate mt-1">
                        {message.body.slice(0, 100)}...
                      </p>
                    )}

                    {isExpanded && (
                      <p className="text-sm text-muted-foreground">
                        to{" "}
                        {message.to.map((r) => r.name || r.email).join(", ")}
                        {message.cc && message.cc.length > 0 && (
                          <>, cc: {message.cc.map((r) => r.name || r.email).join(", ")}</>
                        )}
                      </p>
                    )}
                  </div>

                  <svg
                    className={cn(
                      "h-5 w-5 text-muted-foreground transition-transform",
                      isExpanded && "rotate-180"
                    )}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </button>

              {/* Message body */}
              {isExpanded && (
                <div className="px-4 pb-4 pl-16">
                  {message.htmlBody ? (
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: message.htmlBody }}
                    />
                  ) : (
                    <div className="whitespace-pre-wrap text-sm">
                      {message.body}
                    </div>
                  )}

                  {/* Attachments */}
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-sm font-medium mb-2">
                        {message.attachments.length} Attachment
                        {message.attachments.length > 1 ? "s" : ""}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {message.attachments.map((attachment) => (
                          <a
                            key={attachment.id}
                            href={attachment.url}
                            className="flex items-center space-x-2 px-3 py-2 rounded-md border hover:bg-muted transition-colors"
                          >
                            <svg
                              className="h-4 w-4 text-muted-foreground"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                              />
                            </svg>
                            <div>
                              <p className="text-sm font-medium">
                                {attachment.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatFileSize(attachment.size)}
                              </p>
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Reply actions */}
      <div className="flex items-center justify-center space-x-2 p-4 border-t">
        <button
          onClick={onReply}
          className="flex items-center space-x-2 px-4 py-2 rounded-md border hover:bg-muted transition-colors"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
            />
          </svg>
          <span className="text-sm font-medium">Reply</span>
        </button>
        <button
          onClick={onReplyAll}
          className="flex items-center space-x-2 px-4 py-2 rounded-md border hover:bg-muted transition-colors"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
            />
          </svg>
          <span className="text-sm font-medium">Reply All</span>
        </button>
        <button
          onClick={onForward}
          className="flex items-center space-x-2 px-4 py-2 rounded-md border hover:bg-muted transition-colors"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
          <span className="text-sm font-medium">Forward</span>
        </button>
      </div>
    </div>
  );
}
