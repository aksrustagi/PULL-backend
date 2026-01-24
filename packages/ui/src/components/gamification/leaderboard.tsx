"use client";

import * as React from "react";
import { cn } from "../../lib/utils";
import { TierBadge } from "./points-display";

// ============================================================================
// Types
// ============================================================================

type TierName = "bronze" | "silver" | "gold" | "platinum" | "diamond";
type Period = "daily" | "weekly" | "monthly" | "alltime";
type LeaderboardType = "points" | "trading_volume" | "pnl" | "referrals" | "streak";

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarUrl?: string | null;
  score: number;
  tier: TierName;
  change?: number; // Rank change from previous period
}

export interface UserRank {
  rank: number;
  score: number;
  tier: TierName;
  percentile: number;
}

export interface LeaderboardProps {
  entries: LeaderboardEntry[];
  userRank?: UserRank;
  currentUserId?: string;
  period: Period;
  type: LeaderboardType;
  totalParticipants: number;
  onPeriodChange?: (period: Period) => void;
  onTypeChange?: (type: LeaderboardType) => void;
  onTierFilter?: (tier: TierName | null) => void;
  selectedTier?: TierName | null;
  isLoading?: boolean;
  className?: string;
}

// ============================================================================
// Period Tabs Component
// ============================================================================

interface PeriodTabsProps {
  selected: Period;
  onChange: (period: Period) => void;
  className?: string;
}

const PERIODS: { id: Period; label: string }[] = [
  { id: "daily", label: "Today" },
  { id: "weekly", label: "This Week" },
  { id: "monthly", label: "This Month" },
  { id: "alltime", label: "All Time" },
];

function PeriodTabs({ selected, onChange, className }: PeriodTabsProps) {
  return (
    <div className={cn("flex gap-1 p-1 bg-muted rounded-lg", className)}>
      {PERIODS.map((period) => (
        <button
          key={period.id}
          onClick={() => onChange(period.id)}
          className={cn(
            "flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all",
            selected === period.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Type Selector Component
// ============================================================================

interface TypeSelectorProps {
  selected: LeaderboardType;
  onChange: (type: LeaderboardType) => void;
  className?: string;
}

const TYPES: { id: LeaderboardType; label: string; icon: string }[] = [
  { id: "points", label: "Points", icon: "🏆" },
  { id: "trading_volume", label: "Volume", icon: "📊" },
  { id: "pnl", label: "P&L", icon: "💰" },
  { id: "referrals", label: "Referrals", icon: "👥" },
  { id: "streak", label: "Streak", icon: "🔥" },
];

function TypeSelector({ selected, onChange, className }: TypeSelectorProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {TYPES.map((type) => (
        <button
          key={type.id}
          onClick={() => onChange(type.id)}
          className={cn(
            "px-3 py-1.5 rounded-full text-sm font-medium transition-all",
            "flex items-center gap-1.5",
            selected === type.id
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          <span>{type.icon}</span>
          <span>{type.label}</span>
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Tier Filter Component
// ============================================================================

interface TierFilterProps {
  selected: TierName | null;
  onChange: (tier: TierName | null) => void;
  className?: string;
}

const TIERS: TierName[] = ["bronze", "silver", "gold", "platinum", "diamond"];

function TierFilter({ selected, onChange, className }: TierFilterProps) {
  return (
    <div className={cn("flex gap-1.5", className)}>
      <button
        onClick={() => onChange(null)}
        className={cn(
          "px-2 py-1 rounded text-xs font-medium transition-all",
          selected === null
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:text-foreground"
        )}
      >
        All
      </button>
      {TIERS.map((tier) => (
        <button
          key={tier}
          onClick={() => onChange(tier)}
          className={cn(
            "px-2 py-1 rounded text-xs font-medium transition-all capitalize",
            selected === tier
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          {tier}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Leaderboard Entry Row Component
// ============================================================================

interface EntryRowProps {
  entry: LeaderboardEntry;
  isCurrentUser: boolean;
  type: LeaderboardType;
}

function EntryRow({ entry, isCurrentUser, type }: EntryRowProps) {
  const getRankDisplay = () => {
    if (entry.rank === 1) return { icon: "🥇", className: "text-yellow-500" };
    if (entry.rank === 2) return { icon: "🥈", className: "text-gray-400" };
    if (entry.rank === 3) return { icon: "🥉", className: "text-amber-600" };
    return { icon: `#${entry.rank}`, className: "text-muted-foreground" };
  };

  const formatScore = () => {
    switch (type) {
      case "trading_volume":
      case "pnl":
        return `$${entry.score.toLocaleString()}`;
      case "streak":
        return `${entry.score} days`;
      default:
        return entry.score.toLocaleString();
    }
  };

  const rankDisplay = getRankDisplay();

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg transition-all",
        isCurrentUser
          ? "bg-primary/10 border border-primary/30"
          : "hover:bg-muted/50"
      )}
    >
      {/* Rank */}
      <div className={cn("w-10 text-center font-bold", rankDisplay.className)}>
        {rankDisplay.icon}
      </div>

      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden">
        {entry.avatarUrl ? (
          <img
            src={entry.avatarUrl}
            alt={entry.username}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-lg">
            {entry.username.slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>

      {/* User Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("font-medium truncate", isCurrentUser && "text-primary")}>
            {entry.username}
          </span>
          {isCurrentUser && (
            <span className="text-xs text-primary">(You)</span>
          )}
        </div>
        <TierBadge tier={entry.tier} size="sm" showIcon={false} />
      </div>

      {/* Score */}
      <div className="text-right">
        <div className="font-bold">{formatScore()}</div>
        {entry.change !== undefined && entry.change !== 0 && (
          <div
            className={cn(
              "text-xs",
              entry.change > 0 ? "text-green-500" : "text-red-500"
            )}
          >
            {entry.change > 0 ? "↑" : "↓"} {Math.abs(entry.change)}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// User Rank Banner Component
// ============================================================================

interface UserRankBannerProps {
  userRank: UserRank;
  totalParticipants: number;
  type: LeaderboardType;
  className?: string;
}

function UserRankBanner({ userRank, totalParticipants, type, className }: UserRankBannerProps) {
  const formatScore = () => {
    switch (type) {
      case "trading_volume":
      case "pnl":
        return `$${userRank.score.toLocaleString()}`;
      case "streak":
        return `${userRank.score} days`;
      default:
        return userRank.score.toLocaleString();
    }
  };

  return (
    <div className={cn(
      "p-4 rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20",
      className
    )}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Your Rank</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl font-bold">#{userRank.rank}</span>
            <TierBadge tier={userRank.tier} size="md" />
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Your Score</p>
          <p className="text-xl font-bold mt-1">{formatScore()}</p>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-primary/20">
        <p className="text-sm text-muted-foreground">
          Top {userRank.percentile}% of {totalParticipants.toLocaleString()} participants
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Main Leaderboard Component
// ============================================================================

export function Leaderboard({
  entries,
  userRank,
  currentUserId,
  period,
  type,
  totalParticipants,
  onPeriodChange,
  onTypeChange,
  onTierFilter,
  selectedTier,
  isLoading,
  className,
}: LeaderboardProps) {
  // Loading state
  if (isLoading) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="h-10 bg-muted rounded-lg animate-pulse" />
        <div className="h-8 bg-muted rounded animate-pulse" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Period Tabs */}
      {onPeriodChange && (
        <PeriodTabs
          selected={period}
          onChange={onPeriodChange}
        />
      )}

      {/* Type Selector */}
      {onTypeChange && (
        <TypeSelector
          selected={type}
          onChange={onTypeChange}
        />
      )}

      {/* Tier Filter */}
      {onTierFilter && (
        <TierFilter
          selected={selectedTier ?? null}
          onChange={onTierFilter}
        />
      )}

      {/* User Rank Banner */}
      {userRank && (
        <UserRankBanner
          userRank={userRank}
          totalParticipants={totalParticipants}
          type={type}
        />
      )}

      {/* Leaderboard List */}
      <div className="space-y-2">
        {entries.length > 0 ? (
          entries.map((entry) => (
            <EntryRow
              key={entry.userId}
              entry={entry}
              isCurrentUser={entry.userId === currentUserId}
              type={type}
            />
          ))
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>No entries yet for this period</p>
          </div>
        )}
      </div>

      {/* Total Participants */}
      <div className="text-center text-sm text-muted-foreground pt-4 border-t">
        {totalParticipants.toLocaleString()} total participants
      </div>
    </div>
  );
}

// ============================================================================
// Compact Leaderboard (for sidebars/widgets)
// ============================================================================

export interface CompactLeaderboardProps {
  entries: LeaderboardEntry[];
  currentUserId?: string;
  type: LeaderboardType;
  limit?: number;
  className?: string;
}

export function CompactLeaderboard({
  entries,
  currentUserId,
  type,
  limit = 5,
  className,
}: CompactLeaderboardProps) {
  const displayEntries = entries.slice(0, limit);

  return (
    <div className={cn("space-y-2", className)}>
      {displayEntries.map((entry, index) => {
        const isCurrentUser = entry.userId === currentUserId;

        return (
          <div
            key={entry.userId}
            className={cn(
              "flex items-center gap-2 p-2 rounded-lg text-sm",
              isCurrentUser ? "bg-primary/10" : "bg-muted/30"
            )}
          >
            <span className="w-6 text-center font-bold text-muted-foreground">
              {entry.rank}
            </span>
            <span className={cn("flex-1 truncate", isCurrentUser && "font-medium text-primary")}>
              {entry.username}
            </span>
            <span className="font-medium tabular-nums">
              {type === "points"
                ? entry.score.toLocaleString()
                : type === "streak"
                ? `${entry.score}d`
                : `$${entry.score.toLocaleString()}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
