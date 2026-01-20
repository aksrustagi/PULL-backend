"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export interface MarketCardProps {
  ticker: string;
  title: string;
  category: string;
  lastPrice: number;
  volume: number;
  change: number;
  closesAt: string;
  onTrade?: () => void;
  className?: string;
}

export function MarketCard({
  ticker,
  title,
  category,
  lastPrice,
  volume,
  change,
  closesAt,
  onTrade,
  className,
}: MarketCardProps) {
  const isPositive = change >= 0;
  const pricePercent = (lastPrice * 100).toFixed(0);

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 hover:bg-muted/50 transition-colors cursor-pointer",
        className
      )}
      onClick={onTrade}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-medium px-2 py-1 rounded-full bg-muted">
          {category}
        </span>
        <span className="text-xs text-muted-foreground">{ticker}</span>
      </div>

      {/* Title */}
      <h3 className="font-medium text-sm mb-3 line-clamp-2 min-h-[40px]">
        {title}
      </h3>

      {/* Mini sparkline placeholder */}
      <div className="h-8 mb-3 flex items-end space-x-0.5">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-sm",
              isPositive ? "bg-green-500/30" : "bg-red-500/30"
            )}
            style={{
              height: `${Math.random() * 60 + 40}%`,
            }}
          />
        ))}
      </div>

      {/* Price and stats */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-2xl font-bold">{pricePercent}¢</p>
          <p
            className={cn("text-xs", isPositive ? "text-green-500" : "text-red-500")}
          >
            {isPositive ? "+" : ""}
            {change.toFixed(1)}%
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Volume</p>
          <p className="text-sm font-medium">
            ${volume >= 1000 ? `${(volume / 1000).toFixed(0)}k` : volume}
          </p>
        </div>
      </div>

      {/* Quick trade buttons */}
      <div className="grid grid-cols-2 gap-2 mt-4">
        <button
          className="px-3 py-2 text-sm font-medium rounded-md bg-green-500/10 text-green-500 hover:bg-green-500/20 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onTrade?.();
          }}
        >
          Yes {pricePercent}¢
        </button>
        <button
          className="px-3 py-2 text-sm font-medium rounded-md bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onTrade?.();
          }}
        >
          No {100 - parseInt(pricePercent)}¢
        </button>
      </div>
    </div>
  );
}
