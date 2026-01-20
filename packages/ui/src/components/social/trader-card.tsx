"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export interface TraderCardProps {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  isVerified?: boolean;
  // Stats
  totalReturn: number;
  return30d: number;
  sharpeRatio: number;
  winRate: number;
  followerCount: number;
  copierCount: number;
  // Relationship
  isFollowing?: boolean;
  isCopying?: boolean;
  // Actions
  onFollow?: () => void;
  onCopy?: () => void;
  onViewProfile?: () => void;
  className?: string;
}

export function TraderCard({
  userId,
  username,
  displayName,
  avatarUrl,
  isVerified = false,
  totalReturn,
  return30d,
  sharpeRatio,
  winRate,
  followerCount,
  copierCount,
  isFollowing = false,
  isCopying = false,
  onFollow,
  onCopy,
  onViewProfile,
  className,
}: TraderCardProps) {
  const is30dPositive = return30d >= 0;

  // Generate mini equity chart data
  const chartData = React.useMemo(() => {
    const points = 20;
    let value = 100;
    return Array.from({ length: points }, (_, i) => {
      // Bias towards positive if return30d is positive
      const change = (Math.random() - (is30dPositive ? 0.4 : 0.6)) * 5;
      value = Math.max(50, Math.min(150, value + change));
      return value;
    });
  }, [is30dPositive]);

  const minValue = Math.min(...chartData);
  const maxValue = Math.max(...chartData);
  const range = maxValue - minValue || 1;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 hover:bg-muted/50 transition-colors",
        className
      )}
    >
      {/* Header with avatar and name */}
      <div
        className="flex items-center gap-3 mb-4 cursor-pointer"
        onClick={onViewProfile}
      >
        {/* Avatar */}
        <div className="relative">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <span className="text-lg font-semibold text-muted-foreground">
                {displayName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          {/* Verified badge */}
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

        {/* Name and username */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">{displayName}</h3>
          <p className="text-xs text-muted-foreground">@{username}</p>
        </div>

        {/* Following indicator */}
        {isFollowing && (
          <span className="text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-500">
            Following
          </span>
        )}
      </div>

      {/* Mini equity chart */}
      <div className="h-12 mb-4 flex items-end space-x-0.5">
        {chartData.map((value, i) => (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-sm transition-all",
              is30dPositive ? "bg-green-500/40" : "bg-red-500/40"
            )}
            style={{
              height: `${((value - minValue) / range) * 80 + 20}%`,
            }}
          />
        ))}
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        <div>
          <p
            className={cn(
              "text-lg font-bold",
              is30dPositive ? "text-green-500" : "text-red-500"
            )}
          >
            {is30dPositive ? "+" : ""}
            {return30d.toFixed(1)}%
          </p>
          <p className="text-xs text-muted-foreground">30d Return</p>
        </div>
        <div>
          <p className="text-lg font-bold">{sharpeRatio.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">Sharpe</p>
        </div>
        <div>
          <p className="text-lg font-bold">{winRate.toFixed(0)}%</p>
          <p className="text-xs text-muted-foreground">Win Rate</p>
        </div>
      </div>

      {/* Social stats */}
      <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
        <span>{followerCount.toLocaleString()} followers</span>
        <span>{copierCount.toLocaleString()} copiers</span>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          className={cn(
            "px-3 py-2 text-sm font-medium rounded-md transition-colors",
            isFollowing
              ? "bg-muted text-muted-foreground hover:bg-muted/80"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onFollow?.();
          }}
        >
          {isFollowing ? "Following" : "Follow"}
        </button>
        <button
          className={cn(
            "px-3 py-2 text-sm font-medium rounded-md transition-colors",
            isCopying
              ? "bg-green-500/10 text-green-500"
              : "bg-green-500 text-white hover:bg-green-600"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onCopy?.();
          }}
          disabled={!isFollowing && !isCopying}
          title={!isFollowing ? "Follow first to copy" : undefined}
        >
          {isCopying ? "Copying" : "Copy"}
        </button>
      </div>
    </div>
  );
}
