"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export interface FeedPosition {
  id: string;
  traderId: string;
  trader: {
    username: string;
    displayName: string;
    avatarUrl?: string | null;
  };
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  currentPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  timestamp: string;
  isCopied?: boolean;
}

export interface PositionFeedProps {
  positions: FeedPosition[];
  isLoading?: boolean;
  hasMore?: boolean;
  // Filters
  selectedTraderId?: string | null;
  traderOptions: Array<{ id: string; displayName: string }>;
  // Actions
  onTraderFilterChange: (traderId: string | null) => void;
  onLoadMore: () => void;
  onCopyTrade: (position: FeedPosition) => void;
  onViewTrader: (traderId: string) => void;
  className?: string;
}

export function PositionFeed({
  positions,
  isLoading = false,
  hasMore = false,
  selectedTraderId = null,
  traderOptions,
  onTraderFilterChange,
  onLoadMore,
  onCopyTrade,
  onViewTrader,
  className,
}: PositionFeedProps) {
  const loadMoreRef = React.useRef<HTMLDivElement>(null);

  // Infinite scroll
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

  const formatTimeAgo = (timestamp: string) => {
    const now = Date.now();
    const time = new Date(timestamp).getTime();
    const diff = now - time;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Activity Feed</h2>

        {/* Trader filter */}
        <select
          value={selectedTraderId ?? ""}
          onChange={(e) => onTraderFilterChange(e.target.value || null)}
          className="bg-background border rounded-md px-3 py-1.5 text-sm"
        >
          <option value="">All Traders</option>
          {traderOptions.map((trader) => (
            <option key={trader.id} value={trader.id}>
              {trader.displayName}
            </option>
          ))}
        </select>
      </div>

      {/* Feed items */}
      <div className="space-y-3">
        {positions.map((position) => {
          const isBuy = position.side === "buy";
          const hasPnL = position.pnl !== undefined && position.pnlPercent !== undefined;
          const isPnLPositive = (position.pnl ?? 0) >= 0;

          return (
            <div
              key={position.id}
              className="p-4 bg-card rounded-lg border hover:bg-muted/50 transition-colors"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div
                  className="flex items-center gap-3 cursor-pointer"
                  onClick={() => onViewTrader(position.traderId)}
                >
                  {position.trader.avatarUrl ? (
                    <img
                      src={position.trader.avatarUrl}
                      alt={position.trader.displayName}
                      className="w-10 h-10 rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <span className="font-semibold text-muted-foreground">
                        {position.trader.displayName.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-sm hover:underline">
                      {position.trader.displayName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      @{position.trader.username} · {formatTimeAgo(position.timestamp)}
                    </p>
                  </div>
                </div>

                {/* Copy status or action */}
                {position.isCopied ? (
                  <span className="text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-500">
                    Copied
                  </span>
                ) : (
                  <button
                    className="text-xs px-3 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 font-medium"
                    onClick={() => onCopyTrade(position)}
                  >
                    Copy Trade
                  </button>
                )}
              </div>

              {/* Trade details */}
              <div className="flex items-center gap-4">
                {/* Side indicator */}
                <div
                  className={cn(
                    "px-3 py-1 rounded text-sm font-medium",
                    isBuy ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                  )}
                >
                  {isBuy ? "BUY" : "SELL"}
                </div>

                {/* Symbol and quantity */}
                <div className="flex-1">
                  <p className="font-semibold">{position.symbol}</p>
                  <p className="text-sm text-muted-foreground">
                    {position.quantity} contracts @ ${position.price.toFixed(2)}
                  </p>
                </div>

                {/* P&L if available */}
                {hasPnL && (
                  <div className="text-right">
                    <p
                      className={cn(
                        "font-semibold",
                        isPnLPositive ? "text-green-500" : "text-red-500"
                      )}
                    >
                      {isPnLPositive ? "+" : ""}${position.pnl!.toFixed(2)}
                    </p>
                    <p
                      className={cn(
                        "text-sm",
                        isPnLPositive ? "text-green-500" : "text-red-500"
                      )}
                    >
                      {isPnLPositive ? "+" : ""}
                      {position.pnlPercent!.toFixed(1)}%
                    </p>
                  </div>
                )}

                {/* Current price if different */}
                {position.currentPrice && position.currentPrice !== position.price && (
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Now</p>
                    <p className="font-medium">${position.currentPrice.toFixed(2)}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

      {/* Infinite scroll trigger */}
      {hasMore && !isLoading && <div ref={loadMoreRef} className="h-4" />}

      {/* Empty state */}
      {positions.length === 0 && !isLoading && (
        <div className="text-center py-12 text-muted-foreground">
          <svg
            className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
          <p className="font-medium">No activity yet</p>
          <p className="text-sm mt-1">
            {selectedTraderId
              ? "This trader hasn't made any trades recently"
              : "Follow traders to see their activity"}
          </p>
        </div>
      )}
    </div>
  );
}
