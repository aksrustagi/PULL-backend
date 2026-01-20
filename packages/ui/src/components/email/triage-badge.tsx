"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export interface TriageBadgeProps {
  priority: "urgent" | "important" | "normal" | "low";
  category?: string;
  confidence?: number; // 0-100
  showConfidence?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const priorityConfig = {
  urgent: {
    label: "Urgent",
    color: "bg-red-500 text-white",
    borderColor: "border-red-500",
    icon: (
      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  important: {
    label: "Important",
    color: "bg-orange-500 text-white",
    borderColor: "border-orange-500",
    icon: (
      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
        <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
      </svg>
    ),
  },
  normal: {
    label: "Normal",
    color: "bg-blue-500 text-white",
    borderColor: "border-blue-500",
    icon: (
      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  low: {
    label: "Low",
    color: "bg-gray-400 text-white",
    borderColor: "border-gray-400",
    icon: (
      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
};

const sizeConfig = {
  sm: {
    badge: "px-1.5 py-0.5 text-xs",
    icon: "h-3 w-3",
    category: "text-xs",
  },
  md: {
    badge: "px-2 py-1 text-sm",
    icon: "h-4 w-4",
    category: "text-sm",
  },
  lg: {
    badge: "px-3 py-1.5 text-base",
    icon: "h-5 w-5",
    category: "text-base",
  },
};

export function TriageBadge({
  priority,
  category,
  confidence,
  showConfidence = false,
  size = "md",
  className,
}: TriageBadgeProps) {
  const config = priorityConfig[priority];
  const sizes = sizeConfig[size];

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      {/* Priority badge */}
      <div
        className={cn(
          "flex items-center space-x-1 rounded-full font-medium",
          config.color,
          sizes.badge
        )}
      >
        {config.icon}
        <span>{config.label}</span>
      </div>

      {/* Category badge */}
      {category && (
        <div
          className={cn(
            "px-2 py-0.5 rounded-full bg-muted font-medium",
            sizes.category
          )}
        >
          {category}
        </div>
      )}

      {/* Confidence indicator */}
      {showConfidence && confidence !== undefined && (
        <div className="flex items-center space-x-1">
          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                confidence >= 80
                  ? "bg-green-500"
                  : confidence >= 60
                    ? "bg-yellow-500"
                    : "bg-red-500"
              )}
              style={{ width: `${confidence}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{confidence}%</span>
        </div>
      )}
    </div>
  );
}

// Standalone priority indicator (just the dot)
export interface PriorityIndicatorProps {
  priority: "urgent" | "important" | "normal" | "low";
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  className?: string;
}

const indicatorSizes = {
  sm: "h-2 w-2",
  md: "h-3 w-3",
  lg: "h-4 w-4",
};

export function PriorityIndicator({
  priority,
  size = "md",
  pulse = false,
  className,
}: PriorityIndicatorProps) {
  const colorMap = {
    urgent: "bg-red-500",
    important: "bg-orange-500",
    normal: "bg-blue-500",
    low: "bg-gray-400",
  };

  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      <div
        className={cn(
          "rounded-full",
          colorMap[priority],
          indicatorSizes[size],
          pulse && priority === "urgent" && "animate-pulse"
        )}
      />
      {pulse && priority === "urgent" && (
        <div
          className={cn(
            "absolute rounded-full bg-red-500/50 animate-ping",
            indicatorSizes[size]
          )}
        />
      )}
    </div>
  );
}
