"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

// ============================================================================
// Types
// ============================================================================

export interface Streak {
  type: string;
  title: string;
  currentCount: number;
  longestCount: number;
  currentMultiplier: number;
  maxMultiplier: number;
  lastActionAt: number;
  nextMilestone: number;
  nextMilestoneReward: number;
  status: "active" | "broken" | "at_risk";
}

export interface StreakTrackerProps {
  streaks: Streak[];
  milestones?: number[];
  onClaimStreak?: (streakType: string) => Promise<void>;
  className?: string;
}

// ============================================================================
// Streak Calendar Component
// ============================================================================

interface StreakCalendarProps {
  streakCount: number;
  lastActionAt: number;
  className?: string;
}

function StreakCalendar({ streakCount, lastActionAt, className }: StreakCalendarProps) {
  // Generate last 7 days
  const days = React.useMemo(() => {
    const result = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const lastActionDate = new Date(lastActionAt);
      lastActionDate.setHours(0, 0, 0, 0);

      const daysSinceLastAction = Math.floor(
        (now.getTime() - lastActionDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Determine if this day was part of the streak
      const isActive = i <= Math.min(streakCount - 1, 6) && i >= daysSinceLastAction;
      const isToday = i === 0;

      result.push({
        date,
        dayName: date.toLocaleDateString("en-US", { weekday: "short" }),
        dayNumber: date.getDate(),
        isActive,
        isToday,
      });
    }

    return result;
  }, [streakCount, lastActionAt]);

  return (
    <div className={cn("flex justify-between gap-1", className)}>
      {days.map((day, index) => (
        <div key={index} className="flex flex-col items-center gap-1">
          <span className="text-xs text-muted-foreground">{day.dayName}</span>
          <div
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all",
              day.isActive
                ? "bg-orange-500 text-white"
                : day.isToday
                ? "bg-muted border-2 border-dashed border-orange-400"
                : "bg-muted text-muted-foreground"
            )}
          >
            {day.isActive ? "🔥" : day.dayNumber}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Multiplier Display Component
// ============================================================================

interface MultiplierDisplayProps {
  current: number;
  max: number;
  className?: string;
}

function MultiplierDisplay({ current, max, className }: MultiplierDisplayProps) {
  const percentage = ((current - 1) / (max - 1)) * 100;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Multiplier</span>
        <span className="font-bold text-orange-500">{current.toFixed(1)}x</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-orange-400 to-red-500 rounded-full transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>1.0x</span>
        <span>{max.toFixed(1)}x max</span>
      </div>
    </div>
  );
}

// ============================================================================
// Milestone Progress Component
// ============================================================================

interface MilestoneProgressProps {
  currentCount: number;
  milestones: number[];
  className?: string;
}

function MilestoneProgress({ currentCount, milestones, className }: MilestoneProgressProps) {
  // Find next milestone
  const nextMilestone = milestones.find((m) => m > currentCount) ?? milestones[milestones.length - 1]!;
  const prevMilestone = milestones.filter((m) => m <= currentCount).pop() ?? 0;

  const progress = nextMilestone > prevMilestone
    ? ((currentCount - prevMilestone) / (nextMilestone - prevMilestone)) * 100
    : 100;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Progress bar with milestone markers */}
      <div className="relative">
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-500 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Milestone markers */}
        {milestones.map((milestone) => {
          const position = ((milestone - prevMilestone) / (nextMilestone - prevMilestone)) * 100;
          const isReached = currentCount >= milestone;

          if (position < 0 || position > 100) return null;

          return (
            <div
              key={milestone}
              className="absolute top-0 transform -translate-x-1/2"
              style={{ left: `${position}%` }}
            >
              <div
                className={cn(
                  "w-3 h-3 rounded-full border-2",
                  isReached
                    ? "bg-orange-500 border-orange-600"
                    : "bg-muted border-muted-foreground/30"
                )}
              />
            </div>
          );
        })}
      </div>

      {/* Labels */}
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{prevMilestone} days</span>
        <span className="font-medium text-foreground">{currentCount} days</span>
        <span>{nextMilestone} days</span>
      </div>
    </div>
  );
}

// ============================================================================
// Streak Card Component
// ============================================================================

interface StreakCardProps {
  streak: Streak;
  milestones: number[];
}

function StreakCard({ streak, milestones }: StreakCardProps) {
  const getStatusColor = () => {
    switch (streak.status) {
      case "active":
        return "border-green-500/30 bg-green-500/5";
      case "at_risk":
        return "border-yellow-500/30 bg-yellow-500/5";
      case "broken":
        return "border-red-500/30 bg-red-500/5";
      default:
        return "border-border";
    }
  };

  const getStatusBadge = () => {
    switch (streak.status) {
      case "active":
        return { text: "Active", className: "bg-green-500/20 text-green-600" };
      case "at_risk":
        return { text: "At Risk!", className: "bg-yellow-500/20 text-yellow-600 animate-pulse" };
      case "broken":
        return { text: "Broken", className: "bg-red-500/20 text-red-600" };
      default:
        return null;
    }
  };

  const statusBadge = getStatusBadge();

  // Calculate time since last action
  const timeSinceLastAction = Date.now() - streak.lastActionAt;
  const hoursSinceLastAction = Math.floor(timeSinceLastAction / (1000 * 60 * 60));

  return (
    <div className={cn("p-4 rounded-xl border-2", getStatusColor())}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="text-3xl">🔥</div>
          <div>
            <h4 className="font-semibold">{streak.title}</h4>
            <p className="text-sm text-muted-foreground">
              {streak.currentCount > 0
                ? `${streak.currentCount} day streak`
                : "Start your streak!"}
            </p>
          </div>
        </div>
        {statusBadge && (
          <span className={cn(
            "text-xs font-medium px-2 py-1 rounded-full",
            statusBadge.className
          )}>
            {statusBadge.text}
          </span>
        )}
      </div>

      {/* Calendar */}
      <StreakCalendar
        streakCount={streak.currentCount}
        lastActionAt={streak.lastActionAt}
        className="mb-4"
      />

      {/* Multiplier */}
      <MultiplierDisplay
        current={streak.currentMultiplier}
        max={streak.maxMultiplier}
        className="mb-4"
      />

      {/* Milestone Progress */}
      <MilestoneProgress
        currentCount={streak.currentCount}
        milestones={milestones}
        className="mb-4"
      />

      {/* Next Milestone Info */}
      {streak.nextMilestone > streak.currentCount && (
        <div className="flex items-center justify-between text-sm p-3 bg-muted/50 rounded-lg">
          <span className="text-muted-foreground">
            {streak.nextMilestone - streak.currentCount} more days to next milestone
          </span>
          <span className="font-medium text-orange-500">
            +{streak.nextMilestoneReward} PTS
          </span>
        </div>
      )}

      {/* Reminder */}
      {streak.status === "at_risk" && (
        <div className="mt-3 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
          <p className="text-sm text-yellow-600 flex items-center gap-2">
            <span>⚠️</span>
            Don't break your streak! Complete an action today.
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="flex justify-between mt-4 pt-4 border-t border-border/50 text-sm">
        <div>
          <span className="text-muted-foreground">Longest: </span>
          <span className="font-medium">{streak.longestCount} days</span>
        </div>
        <div>
          <span className="text-muted-foreground">Last active: </span>
          <span className="font-medium">
            {hoursSinceLastAction < 1
              ? "Just now"
              : hoursSinceLastAction < 24
              ? `${hoursSinceLastAction}h ago`
              : `${Math.floor(hoursSinceLastAction / 24)}d ago`}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Streak Tracker Component
// ============================================================================

const DEFAULT_MILESTONES = [3, 7, 14, 30, 60, 90, 100, 365];

export function StreakTracker({
  streaks,
  milestones = DEFAULT_MILESTONES,
  onClaimStreak,
  className,
}: StreakTrackerProps) {
  if (streaks.length === 0) {
    return (
      <div className={cn("text-center py-8 text-muted-foreground", className)}>
        <p>No active streaks yet. Start trading to build your first streak!</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {streaks.map((streak) => (
        <StreakCard
          key={streak.type}
          streak={streak}
          milestones={milestones}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Compact Streak Display (for dashboards)
// ============================================================================

export interface CompactStreakProps {
  type: string;
  count: number;
  multiplier: number;
  status: "active" | "broken" | "at_risk";
  className?: string;
}

export function CompactStreak({ type, count, multiplier, status, className }: CompactStreakProps) {
  const statusColors = {
    active: "text-green-500",
    at_risk: "text-yellow-500 animate-pulse",
    broken: "text-red-500",
  };

  return (
    <div className={cn("flex items-center gap-3 p-2 rounded-lg bg-muted/30", className)}>
      <span className="text-xl">🔥</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate capitalize">{type}</p>
        <p className={cn("text-xs", statusColors[status])}>
          {count} days • {multiplier.toFixed(1)}x
        </p>
      </div>
      {status === "at_risk" && (
        <span className="text-yellow-500" title="Don't break your streak!">⚠️</span>
      )}
    </div>
  );
}
