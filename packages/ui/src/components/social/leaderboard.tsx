import * as React from "react";
import { cn } from "../../lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../card";
import { Badge } from "../badge";
import { Avatar } from "../avatar";

export interface LeaderboardEntry {
  rank: number;
  previousRank?: number;
  userId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  value: number;
  change?: number;
  changePercent?: number;
  tier?: string;
  isVerified: boolean;
}

export interface LeaderboardProps {
  title: string;
  description?: string;
  entries: LeaderboardEntry[];
  valueLabel: string;
  valueFormatter?: (value: number) => string;
  onEntryClick?: (entry: LeaderboardEntry) => void;
  highlightUserId?: string;
  className?: string;
}

const defaultValueFormatter = (value: number) => value.toFixed(2);

const tierColors: Record<string, string> = {
  bronze: "text-orange-700",
  silver: "text-gray-400",
  gold: "text-yellow-500",
  platinum: "text-blue-400",
  diamond: "text-cyan-400",
  legend: "text-purple-600",
};

export function Leaderboard({
  title,
  description,
  entries,
  valueLabel,
  valueFormatter = defaultValueFormatter,
  onEntryClick,
  highlightUserId,
  className,
}: LeaderboardProps) {
  const getRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-yellow-500 text-white font-bold">
          🥇
        </div>
      );
    }
    if (rank === 2) {
      return (
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-400 text-white font-bold">
          🥈
        </div>
      );
    }
    if (rank === 3) {
      return (
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-600 text-white font-bold">
          🥉
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-muted-foreground font-medium text-sm">
        {rank}
      </div>
    );
  };

  const getRankChange = (entry: LeaderboardEntry) => {
    if (!entry.previousRank) return null;
    
    const change = entry.previousRank - entry.rank;
    if (change === 0) {
      return (
        <div className="flex items-center text-xs text-muted-foreground">
          <span>━</span>
        </div>
      );
    }
    if (change > 0) {
      return (
        <div className="flex items-center text-xs text-green-600">
          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L6.707 7.707a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
          <span>{change}</span>
        </div>
      );
    }
    return (
      <div className="flex items-center text-xs text-red-600">
        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M14.707 12.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l2.293-2.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
        <span>{Math.abs(change)}</span>
      </div>
    );
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {entries.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No entries yet
            </div>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.userId}
                className={cn(
                  "flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors",
                  highlightUserId === entry.userId && "bg-primary/5",
                  onEntryClick && "cursor-pointer"
                )}
                onClick={() => onEntryClick?.(entry)}
              >
                {/* Rank */}
                <div className="flex items-center gap-2 w-16">
                  {getRankBadge(entry.rank)}
                  {getRankChange(entry)}
                </div>

                {/* Avatar */}
                <div className="relative">
                  <Avatar
                    src={entry.avatarUrl}
                    alt={entry.displayName || entry.username || "Trader"}
                    className="h-10 w-10"
                  />
                  {entry.isVerified && (
                    <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center">
                      <svg
                        className="h-2.5 w-2.5 text-white"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Trader Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">
                      {entry.displayName || entry.username || "Anonymous"}
                    </p>
                    {entry.tier && (
                      <span
                        className={cn(
                          "text-xs font-medium",
                          tierColors[entry.tier.toLowerCase()] || "text-muted-foreground"
                        )}
                      >
                        {entry.tier}
                      </span>
                    )}
                  </div>
                  {entry.username && entry.displayName && (
                    <p className="text-xs text-muted-foreground truncate">
                      @{entry.username}
                    </p>
                  )}
                </div>

                {/* Value */}
                <div className="text-right">
                  <p className="font-bold text-lg">
                    {valueFormatter(entry.value)}
                  </p>
                  {entry.change !== undefined && (
                    <p
                      className={cn(
                        "text-xs",
                        entry.change >= 0 ? "text-green-600" : "text-red-600"
                      )}
                    >
                      {entry.change >= 0 ? "+" : ""}
                      {valueFormatter(entry.change)}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
