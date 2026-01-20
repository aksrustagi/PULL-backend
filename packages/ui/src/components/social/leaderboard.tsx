"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export type SortOption = "return30d" | "sharpeRatio" | "followers" | "winRate";
export type TimeframeOption = "24h" | "7d" | "30d" | "all";

export interface LeaderboardTrader {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  timeframeReturn: number;
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  followerCount: number;
  copierCount: number;
}

export interface LeaderboardProps {
  traders: LeaderboardTrader[];
  total: number;
  hasMore: boolean;
  isLoading?: boolean;
  // Filters
  sortBy: SortOption;
  timeframe: TimeframeOption;
  minTrades: number;
  // Actions
  onSortChange: (sort: SortOption) => void;
  onTimeframeChange: (timeframe: TimeframeOption) => void;
  onMinTradesChange: (minTrades: number) => void;
  onLoadMore: () => void;
  onTraderClick: (userId: string) => void;
  className?: string;
}

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "return30d", label: "Return" },
  { value: "sharpeRatio", label: "Sharpe Ratio" },
  { value: "followers", label: "Followers" },
  { value: "winRate", label: "Win Rate" },
];

const timeframeOptions: { value: TimeframeOption; label: string }[] = [
  { value: "24h", label: "24H" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "all", label: "All Time" },
];

export function Leaderboard({
  traders,
  total,
  hasMore,
  isLoading = false,
  sortBy,
  timeframe,
  minTrades,
  onSortChange,
  onTimeframeChange,
  onMinTradesChange,
  onLoadMore,
  onTraderClick,
  className,
}: LeaderboardProps) {
  // Infinite scroll observer
  const loadMoreRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!hasMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isLoading, onLoadMore]);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 p-4 bg-muted/50 rounded-lg">
        {/* Timeframe tabs */}
        <div className="flex items-center gap-1 bg-background rounded-md p-1">
          {timeframeOptions.map((option) => (
            <button
              key={option.value}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded transition-colors",
                timeframe === option.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => onTimeframeChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
            className="bg-background border rounded-md px-3 py-1.5 text-sm"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Min trades filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Min trades:</span>
          <input
            type="number"
            value={minTrades}
            onChange={(e) => onMinTradesChange(parseInt(e.target.value) || 0)}
            min={0}
            className="w-20 bg-background border rounded-md px-3 py-1.5 text-sm"
          />
        </div>

        {/* Total count */}
        <span className="ml-auto text-sm text-muted-foreground">
          {total.toLocaleString()} traders
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-sm text-muted-foreground border-b">
              <th className="py-3 px-4 font-medium">Rank</th>
              <th className="py-3 px-4 font-medium">Trader</th>
              <th className="py-3 px-4 font-medium text-right">
                {timeframe === "all" ? "Total" : timeframe} Return
              </th>
              <th className="py-3 px-4 font-medium text-right">Sharpe</th>
              <th className="py-3 px-4 font-medium text-right">Win Rate</th>
              <th className="py-3 px-4 font-medium text-right">Max DD</th>
              <th className="py-3 px-4 font-medium text-right">Trades</th>
              <th className="py-3 px-4 font-medium text-right">Followers</th>
            </tr>
          </thead>
          <tbody>
            {traders.map((trader) => {
              const isPositive = trader.timeframeReturn >= 0;

              return (
                <tr
                  key={trader.userId}
                  className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => onTraderClick(trader.userId)}
                >
                  {/* Rank */}
                  <td className="py-4 px-4">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm",
                        trader.rank === 1 && "bg-yellow-500/20 text-yellow-500",
                        trader.rank === 2 && "bg-gray-400/20 text-gray-400",
                        trader.rank === 3 && "bg-orange-500/20 text-orange-500",
                        trader.rank > 3 && "bg-muted text-muted-foreground"
                      )}
                    >
                      {trader.rank}
                    </div>
                  </td>

                  {/* Trader info */}
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      {trader.avatarUrl ? (
                        <img
                          src={trader.avatarUrl}
                          alt={trader.displayName}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                          <span className="text-sm font-semibold text-muted-foreground">
                            {trader.displayName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-sm">{trader.displayName}</p>
                        <p className="text-xs text-muted-foreground">
                          @{trader.username}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Return */}
                  <td className="py-4 px-4 text-right">
                    <span
                      className={cn(
                        "font-semibold",
                        isPositive ? "text-green-500" : "text-red-500"
                      )}
                    >
                      {isPositive ? "+" : ""}
                      {trader.timeframeReturn.toFixed(1)}%
                    </span>
                  </td>

                  {/* Sharpe */}
                  <td className="py-4 px-4 text-right">
                    <span
                      className={cn(
                        "font-medium",
                        trader.sharpeRatio >= 2
                          ? "text-green-500"
                          : trader.sharpeRatio >= 1
                          ? "text-yellow-500"
                          : "text-red-500"
                      )}
                    >
                      {trader.sharpeRatio.toFixed(2)}
                    </span>
                  </td>

                  {/* Win Rate */}
                  <td className="py-4 px-4 text-right">
                    <span className="font-medium">
                      {trader.winRate.toFixed(0)}%
                    </span>
                  </td>

                  {/* Max Drawdown */}
                  <td className="py-4 px-4 text-right">
                    <span className="text-red-500">
                      -{trader.maxDrawdown.toFixed(1)}%
                    </span>
                  </td>

                  {/* Total Trades */}
                  <td className="py-4 px-4 text-right text-muted-foreground">
                    {trader.totalTrades.toLocaleString()}
                  </td>

                  {/* Followers */}
                  <td className="py-4 px-4 text-right text-muted-foreground">
                    {trader.followerCount >= 1000
                      ? `${(trader.followerCount / 1000).toFixed(1)}k`
                      : trader.followerCount.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

      {/* Infinite scroll trigger */}
      {hasMore && !isLoading && (
        <div ref={loadMoreRef} className="h-4" />
      )}

      {/* Empty state */}
      {traders.length === 0 && !isLoading && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No traders found matching your criteria</p>
          <p className="text-sm mt-1">Try adjusting the filters</p>
        </div>
      )}
    </div>
  );
}
