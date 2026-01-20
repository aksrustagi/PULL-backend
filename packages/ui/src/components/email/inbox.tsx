"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export interface EmailMessage {
  id: string;
  from: {
    name: string;
    email: string;
    avatar?: string;
  };
  subject: string;
  snippet: string;
  receivedAt: Date;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  triagePriority?: "urgent" | "important" | "normal" | "low";
  triageCategory?: string;
}

export interface InboxProps {
  emails: EmailMessage[];
  selectedIds?: string[];
  onSelect?: (ids: string[]) => void;
  onEmailClick?: (email: EmailMessage) => void;
  onStarToggle?: (id: string) => void;
  onMarkRead?: (ids: string[]) => void;
  onArchive?: (ids: string[]) => void;
  onDelete?: (ids: string[]) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  isLoading?: boolean;
  className?: string;
}

const priorityColors = {
  urgent: "bg-red-500",
  important: "bg-orange-500",
  normal: "bg-blue-500",
  low: "bg-gray-400",
};

const formatDate = (date: Date) => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } else if (days === 1) {
    return "Yesterday";
  } else if (days < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  } else {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
};

export function Inbox({
  emails,
  selectedIds = [],
  onSelect,
  onEmailClick,
  onStarToggle,
  onMarkRead,
  onArchive,
  onDelete,
  searchQuery = "",
  onSearchChange,
  isLoading,
  className,
}: InboxProps) {
  const allSelected =
    emails.length > 0 && selectedIds.length === emails.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  const toggleSelectAll = () => {
    if (allSelected) {
      onSelect?.([]);
    } else {
      onSelect?.(emails.map((e) => e.id));
    }
  };

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelect?.(selectedIds.filter((i) => i !== id));
    } else {
      onSelect?.([...selectedIds, id]);
    }
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Search bar */}
      <div className="p-4 border-b">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search emails..."
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50">
        <div className="flex items-center space-x-2">
          <button
            onClick={toggleSelectAll}
            className="h-5 w-5 rounded border flex items-center justify-center hover:bg-muted"
          >
            {allSelected && (
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            {someSelected && <div className="h-2 w-2 bg-primary rounded-sm" />}
          </button>

          {selectedIds.length > 0 && (
            <>
              <span className="text-sm text-muted-foreground">
                {selectedIds.length} selected
              </span>
              <div className="h-4 w-px bg-border mx-2" />
              <button
                onClick={() => onMarkRead?.(selectedIds)}
                className="p-1 hover:bg-muted rounded"
                title="Mark as read"
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
                    d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76"
                  />
                </svg>
              </button>
              <button
                onClick={() => onArchive?.(selectedIds)}
                className="p-1 hover:bg-muted rounded"
                title="Archive"
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
                    d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                  />
                </svg>
              </button>
              <button
                onClick={() => onDelete?.(selectedIds)}
                className="p-1 hover:bg-muted rounded text-destructive"
                title="Delete"
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
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </>
          )}
        </div>

        <span className="text-sm text-muted-foreground">
          {emails.length} emails
        </span>
      </div>

      {/* Email list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg
              className="h-12 w-12 text-muted-foreground mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <p className="text-muted-foreground">No emails found</p>
          </div>
        ) : (
          emails.map((email) => (
            <div
              key={email.id}
              className={cn(
                "flex items-start p-4 border-b hover:bg-muted/50 cursor-pointer transition-colors",
                !email.isRead && "bg-primary/5",
                selectedIds.includes(email.id) && "bg-primary/10"
              )}
              onClick={() => onEmailClick?.(email)}
            >
              {/* Checkbox */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSelect(email.id);
                }}
                className="h-5 w-5 rounded border flex-shrink-0 flex items-center justify-center hover:bg-muted mr-3"
              >
                {selectedIds.includes(email.id) && (
                  <svg
                    className="h-3 w-3"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>

              {/* Star */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStarToggle?.(email.id);
                }}
                className="flex-shrink-0 mr-3"
              >
                <svg
                  className={cn(
                    "h-5 w-5",
                    email.isStarred
                      ? "text-yellow-500 fill-yellow-500"
                      : "text-muted-foreground hover:text-yellow-500"
                  )}
                  viewBox="0 0 20 20"
                  fill={email.isStarred ? "currentColor" : "none"}
                  stroke="currentColor"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </button>

              {/* Priority indicator */}
              {email.triagePriority && (
                <div
                  className={cn(
                    "w-1 h-10 rounded-full flex-shrink-0 mr-3",
                    priorityColors[email.triagePriority]
                  )}
                />
              )}

              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-primary/10 flex-shrink-0 flex items-center justify-center mr-3">
                {email.from.avatar ? (
                  <img
                    src={email.from.avatar}
                    alt={email.from.name}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-medium">
                    {email.from.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={cn(
                      "text-sm truncate",
                      !email.isRead && "font-semibold"
                    )}
                  >
                    {email.from.name}
                  </span>
                  <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                    {formatDate(email.receivedAt)}
                  </span>
                </div>
                <p
                  className={cn(
                    "text-sm truncate mb-1",
                    !email.isRead && "font-medium"
                  )}
                >
                  {email.subject}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {email.snippet}
                </p>

                {/* Tags */}
                <div className="flex items-center space-x-2 mt-2">
                  {email.triageCategory && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-muted">
                      {email.triageCategory}
                    </span>
                  )}
                  {email.hasAttachments && (
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
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
