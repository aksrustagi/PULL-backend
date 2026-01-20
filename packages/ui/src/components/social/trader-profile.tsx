"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export interface TraderBadge {
  id: string;
  name: string;
  earnedAt: string;
}

export interface PerformanceDataPoint {
  timestamp: string;
  equity: number;
  dailyPnL: number;
}

export interface TraderProfileProps {
  userId: string;
  user: {
    username: string;
    displayName: string;
    avatarUrl?: string | null;
    kycTier: string;
    memberSince: string;
  };
  returns: {
    total: number;
    return30d: number;
    return7d: number;
    return24h: number;
  };
  risk: {
    sharpeRatio: number;
    sortinoRatio: number;
    maxDrawdown: number;
    currentDrawdown: number;
  };
  performance: {
    winRate: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
  };
  activity: {
    totalTrades: number;
    profitableTrades: number;
    avgHoldingPeriod: number;
  };
  social: {
    followerCount: number;
    copierCount: number;
  };
  topMarkets: Array<{ symbol: string; volume: number }>;
  badges: TraderBadge[];
  performanceChart?: PerformanceDataPoint[];
  // Viewer relationship
  isFollowing: boolean;
  isCopying: boolean;
  // Actions
  onFollow: () => void;
  onCopy: () => void;
  className?: string;
}

type ChartTimeframe = "7d" | "30d" | "90d" | "1y" | "all";

export function TraderProfile({
  userId,
  user,
  returns,
  risk,
  performance,
  activity,
  social,
  topMarkets,
  badges,
  performanceChart = [],
  isFollowing,
  isCopying,
  onFollow,
  onCopy,
  className,
}: TraderProfileProps) {
  const [chartTimeframe, setChartTimeframe] = React.useState<ChartTimeframe>("30d");

  const is30dPositive = returns.return30d >= 0;

  // Generate chart SVG path
  const chartPath = React.useMemo(() => {
    if (performanceChart.length < 2) return null;

    const values = performanceChart.map((p) => p.equity);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const width = 100;
    const height = 60;

    const points = values.map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    });

    return `M ${points.join(" L ")}`;
  }, [performanceChart]);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-start gap-6 p-6 bg-card rounded-lg border">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.displayName}
              className="w-24 h-24 rounded-full object-cover"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center">
              <span className="text-3xl font-bold text-muted-foreground">
                {user.displayName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          {/* Verified badge */}
          {user.kycTier === "verified" && (
            <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center border-2 border-background">
              <svg
                className="w-4 h-4 text-white"
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

        {/* Info */}
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold">{user.displayName}</h1>
            {badges.slice(0, 3).map((badge) => (
              <span
                key={badge.id}
                className="text-xs px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-500"
                title={badge.name}
              >
                {badge.name}
              </span>
            ))}
          </div>
          <p className="text-muted-foreground mb-4">@{user.username}</p>

          <div className="flex items-center gap-6 text-sm">
            <span>
              <strong>{social.followerCount.toLocaleString()}</strong>{" "}
              <span className="text-muted-foreground">followers</span>
            </span>
            <span>
              <strong>{social.copierCount.toLocaleString()}</strong>{" "}
              <span className="text-muted-foreground">copiers</span>
            </span>
            <span className="text-muted-foreground">
              Member since {new Date(user.memberSince).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            className={cn(
              "px-6 py-2.5 text-sm font-medium rounded-md transition-colors",
              isFollowing
                ? "bg-muted text-foreground hover:bg-muted/80"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
            onClick={onFollow}
          >
            {isFollowing ? "Following" : "Follow"}
          </button>
          <button
            className={cn(
              "px-6 py-2.5 text-sm font-medium rounded-md transition-colors",
              isCopying
                ? "bg-green-500/10 text-green-500 border border-green-500"
                : "bg-green-500 text-white hover:bg-green-600"
            )}
            onClick={onCopy}
            disabled={!isFollowing && !isCopying}
          >
            {isCopying ? "Copying" : "Copy Trader"}
          </button>
        </div>
      </div>

      {/* Performance Chart */}
      <div className="p-6 bg-card rounded-lg border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Performance</h2>
          <div className="flex gap-1">
            {(["7d", "30d", "90d", "1y", "all"] as ChartTimeframe[]).map((tf) => (
              <button
                key={tf}
                className={cn(
                  "px-3 py-1 text-sm rounded transition-colors",
                  chartTimeframe === tf
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setChartTimeframe(tf)}
              >
                {tf.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div className="h-48 bg-muted/30 rounded-lg flex items-center justify-center">
          {chartPath ? (
            <svg viewBox="0 0 100 60" className="w-full h-full p-4">
              <path
                d={chartPath}
                fill="none"
                stroke={is30dPositive ? "#22c55e" : "#ef4444"}
                strokeWidth="0.5"
              />
            </svg>
          ) : (
            <span className="text-muted-foreground">Chart loading...</span>
          )}
        </div>

        {/* Return summary */}
        <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t">
          <div className="text-center">
            <p
              className={cn(
                "text-xl font-bold",
                returns.return24h >= 0 ? "text-green-500" : "text-red-500"
              )}
            >
              {returns.return24h >= 0 ? "+" : ""}
              {returns.return24h.toFixed(2)}%
            </p>
            <p className="text-xs text-muted-foreground">24h</p>
          </div>
          <div className="text-center">
            <p
              className={cn(
                "text-xl font-bold",
                returns.return7d >= 0 ? "text-green-500" : "text-red-500"
              )}
            >
              {returns.return7d >= 0 ? "+" : ""}
              {returns.return7d.toFixed(2)}%
            </p>
            <p className="text-xs text-muted-foreground">7d</p>
          </div>
          <div className="text-center">
            <p
              className={cn(
                "text-xl font-bold",
                returns.return30d >= 0 ? "text-green-500" : "text-red-500"
              )}
            >
              {returns.return30d >= 0 ? "+" : ""}
              {returns.return30d.toFixed(2)}%
            </p>
            <p className="text-xs text-muted-foreground">30d</p>
          </div>
          <div className="text-center">
            <p
              className={cn(
                "text-xl font-bold",
                returns.total >= 0 ? "text-green-500" : "text-red-500"
              )}
            >
              {returns.total >= 0 ? "+" : ""}
              {returns.total.toFixed(2)}%
            </p>
            <p className="text-xs text-muted-foreground">All Time</p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Risk Metrics */}
        <div className="p-6 bg-card rounded-lg border">
          <h3 className="font-semibold mb-4">Risk Metrics</h3>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Sharpe Ratio</dt>
              <dd
                className={cn(
                  "font-medium",
                  risk.sharpeRatio >= 2
                    ? "text-green-500"
                    : risk.sharpeRatio >= 1
                    ? "text-yellow-500"
                    : "text-red-500"
                )}
              >
                {risk.sharpeRatio.toFixed(2)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Sortino Ratio</dt>
              <dd className="font-medium">{risk.sortinoRatio.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Max Drawdown</dt>
              <dd className="font-medium text-red-500">
                -{risk.maxDrawdown.toFixed(1)}%
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Current Drawdown</dt>
              <dd className="font-medium text-orange-500">
                -{risk.currentDrawdown.toFixed(1)}%
              </dd>
            </div>
          </dl>
        </div>

        {/* Win/Loss Stats */}
        <div className="p-6 bg-card rounded-lg border">
          <h3 className="font-semibold mb-4">Win/Loss Stats</h3>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Win Rate</dt>
              <dd className="font-medium">{performance.winRate.toFixed(1)}%</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Avg Win</dt>
              <dd className="font-medium text-green-500">
                +${performance.avgWin.toFixed(2)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Avg Loss</dt>
              <dd className="font-medium text-red-500">
                -${performance.avgLoss.toFixed(2)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Profit Factor</dt>
              <dd
                className={cn(
                  "font-medium",
                  performance.profitFactor >= 1.5
                    ? "text-green-500"
                    : performance.profitFactor >= 1
                    ? "text-yellow-500"
                    : "text-red-500"
                )}
              >
                {performance.profitFactor.toFixed(2)}
              </dd>
            </div>
          </dl>
        </div>

        {/* Activity */}
        <div className="p-6 bg-card rounded-lg border">
          <h3 className="font-semibold mb-4">Activity</h3>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Total Trades</dt>
              <dd className="font-medium">
                {activity.totalTrades.toLocaleString()}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Profitable Trades</dt>
              <dd className="font-medium text-green-500">
                {activity.profitableTrades.toLocaleString()}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Avg Holding Period</dt>
              <dd className="font-medium">
                {activity.avgHoldingPeriod.toFixed(1)}h
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Top Markets */}
      <div className="p-6 bg-card rounded-lg border">
        <h3 className="font-semibold mb-4">Top Traded Markets</h3>
        <div className="space-y-3">
          {topMarkets.map((market, index) => {
            const maxVolume = topMarkets[0]?.volume || 1;
            const widthPercent = (market.volume / maxVolume) * 100;

            return (
              <div key={market.symbol} className="flex items-center gap-4">
                <span className="w-6 text-sm text-muted-foreground">
                  #{index + 1}
                </span>
                <span className="w-32 font-medium text-sm truncate">
                  {market.symbol}
                </span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${widthPercent}%` }}
                  />
                </div>
                <span className="w-24 text-sm text-right text-muted-foreground">
                  ${market.volume.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
