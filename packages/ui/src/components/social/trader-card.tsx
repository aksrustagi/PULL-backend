"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export interface TraderCardProps {
  userId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  isVerified?: boolean;
  allowCopyTrading?: boolean;
  stats?: {
    totalPnL?: number;
    totalPnLPercent?: number;
    winRate?: number;
    totalTrades?: number;
    sharpeRatio?: number;
  };
  reputation?: {
    tier?: string;
    overallScore?: number;
  };
  isFollowing?: boolean;
  onFollow?: () => void;
  onUnfollow?: () => void;
  onCopyTrade?: () => void;
  onViewProfile?: () => void;
  className?: string;
}

export function TraderCard({
  userId,
  username,
  displayName,
  avatarUrl,
  isVerified = false,
  allowCopyTrading = false,
  stats,
  reputation,
  isFollowing = false,
  onFollow,
  onUnfollow,
  onCopyTrade,
  onViewProfile,
  className,
}: TraderCardProps) {
  const pnlPercent = stats?.totalPnLPercent ?? 0;
  const isProfitable = pnlPercent >= 0;

  const tierColors = {
    bronze: "bg-amber-700/20 text-amber-700",
    silver: "bg-slate-400/20 text-slate-400",
    gold: "bg-yellow-500/20 text-yellow-500",
    platinum: "bg-purple-500/20 text-purple-500",
    diamond: "bg-blue-500/20 text-blue-500",
    legend: "bg-red-500/20 text-red-500",
  };

  const tier = reputation?.tier ?? "bronze";

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 hover:shadow-md transition-all cursor-pointer",
        className
      )}
      onClick={onViewProfile}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        {/* Avatar */}
        <div className="relative">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center overflow-hidden">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName || username || "Trader"}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-lg font-medium">
                {(displayName || username || "T").charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          {isVerified && (
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
              <svg
                className="w-3 h-3 text-white"
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
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">
            {displayName || username || "Anonymous"}
          </h3>
          {username && displayName && (
            <p className="text-xs text-muted-foreground truncate">@{username}</p>
          )}
          <span
            className={cn(
              "inline-block text-xs px-2 py-0.5 rounded-full mt-1",
              tierColors[tier as keyof typeof tierColors]
            )}
          >
            {tier.charAt(0).toUpperCase() + tier.slice(1)}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="text-center p-2 rounded bg-muted/50">
          <p
            className={cn(
              "text-lg font-bold",
              isProfitable ? "text-green-500" : "text-red-500"
            )}
          >
            {isProfitable ? "+" : ""}
            {pnlPercent.toFixed(1)}%
          </p>
          <p className="text-xs text-muted-foreground">Return</p>
        </div>
        <div className="text-center p-2 rounded bg-muted/50">
          <p className="text-lg font-bold">
            {((stats?.winRate ?? 0) * 100).toFixed(0)}%
          </p>
          <p className="text-xs text-muted-foreground">Win Rate</p>
        </div>
        <div className="text-center p-2 rounded bg-muted/50">
          <p className="text-lg font-bold">{stats?.totalTrades ?? 0}</p>
          <p className="text-xs text-muted-foreground">Trades</p>
        </div>
        <div className="text-center p-2 rounded bg-muted/50">
          <p className="text-lg font-bold">
            {(stats?.sharpeRatio ?? 0).toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground">Sharpe</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        {isFollowing ? (
          <button
            onClick={onUnfollow}
            className="flex-1 px-3 py-2 text-sm font-medium rounded-md border hover:bg-muted transition-colors"
          >
            Following
          </button>
        ) : (
          <button
            onClick={onFollow}
            className="flex-1 px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Follow
          </button>
        )}
        {allowCopyTrading && (
          <button
            onClick={onCopyTrade}
            className="flex-1 px-3 py-2 text-sm font-medium rounded-md border border-green-500 text-green-500 hover:bg-green-500/10 transition-colors"
          >
            Copy
          </button>
        )}
      </div>
    </div>
  );
}
