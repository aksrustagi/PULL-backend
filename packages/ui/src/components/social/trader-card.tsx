import * as React from "react";
import { cn } from "../../lib/utils";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../card";
import { Badge } from "../badge";
import { Avatar } from "../avatar";
import { Button } from "../button";

export interface TraderCardProps {
  trader: {
    id: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string;
    isVerified?: boolean;
    tier?: "bronze" | "silver" | "gold" | "platinum" | "diamond" | "legend";
  };
  stats?: {
    totalPnLPercent?: number;
    winRate?: number;
    sharpeRatio?: number;
    totalTrades?: number;
  };
  social?: {
    followersCount?: number;
    copiersCount?: number;
  };
  isFollowing?: boolean;
  onFollow?: () => void;
  onUnfollow?: () => void;
  onViewProfile?: () => void;
  className?: string;
}

const tierColors = {
  bronze: "bg-orange-700 text-white",
  silver: "bg-gray-400 text-gray-900",
  gold: "bg-yellow-500 text-gray-900",
  platinum: "bg-blue-400 text-white",
  diamond: "bg-cyan-400 text-gray-900",
  legend: "bg-purple-600 text-white",
};

const tierLabels = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
  diamond: "Diamond",
  legend: "Legend",
};

export function TraderCard({
  trader,
  stats,
  social,
  isFollowing,
  onFollow,
  onUnfollow,
  onViewProfile,
  className,
}: TraderCardProps) {
  const pnlPercent = stats?.totalPnLPercent ?? 0;
  const isPositive = pnlPercent >= 0;

  return (
    <Card className={cn("hover:shadow-lg transition-shadow", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar
                src={trader.avatarUrl}
                alt={trader.displayName || trader.username || "Trader"}
                className="h-12 w-12"
              />
              {trader.isVerified && (
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
            <div>
              <CardTitle className="text-lg">
                {trader.displayName || trader.username || "Anonymous"}
              </CardTitle>
              {trader.username && trader.displayName && (
                <CardDescription className="text-xs">
                  @{trader.username}
                </CardDescription>
              )}
            </div>
          </div>
          {trader.tier && (
            <Badge className={tierColors[trader.tier]}>
              {tierLabels[trader.tier]}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Performance Stats */}
        {stats && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Total Return</p>
              <p
                className={cn(
                  "text-lg font-bold",
                  isPositive ? "text-green-600" : "text-red-600"
                )}
              >
                {isPositive ? "+" : ""}
                {pnlPercent.toFixed(2)}%
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Win Rate</p>
              <p className="text-lg font-bold">
                {((stats.winRate ?? 0) * 100).toFixed(1)}%
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Sharpe Ratio</p>
              <p className="text-lg font-bold">
                {(stats.sharpeRatio ?? 0).toFixed(2)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Total Trades</p>
              <p className="text-lg font-bold">{stats.totalTrades ?? 0}</p>
            </div>
          </div>
        )}

        {/* Social Stats */}
        {social && (
          <div className="flex gap-4 pt-2 border-t">
            <div className="flex items-center gap-1">
              <svg
                className="h-4 w-4 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
              <span className="text-sm font-medium">
                {social.followersCount ?? 0}
              </span>
              <span className="text-xs text-muted-foreground">followers</span>
            </div>
            <div className="flex items-center gap-1">
              <svg
                className="h-4 w-4 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
                />
              </svg>
              <span className="text-sm font-medium">
                {social.copiersCount ?? 0}
              </span>
              <span className="text-xs text-muted-foreground">copiers</span>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onViewProfile}
        >
          View Profile
        </Button>
        {isFollowing ? (
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={onUnfollow}
          >
            Following
          </Button>
        ) : (
          <Button
            variant="default"
            size="sm"
            className="flex-1"
            onClick={onFollow}
          >
            Follow
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
