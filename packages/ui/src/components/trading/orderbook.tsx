"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export interface OrderbookLevel {
  price: number;
  size: number;
}

export interface OrderbookProps {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  lastPrice?: number;
  spread?: number;
  onPriceClick?: (price: number, side: "bid" | "ask") => void;
  className?: string;
}

export function Orderbook({
  bids,
  asks,
  lastPrice,
  spread,
  onPriceClick,
  className,
}: OrderbookProps) {
  const maxSize = Math.max(
    ...bids.map((b) => b.size),
    ...asks.map((a) => a.size)
  );

  const formatPrice = (price: number) => (price * 100).toFixed(0);
  const formatSize = (size: number) =>
    size >= 1000 ? `${(size / 1000).toFixed(1)}k` : size.toString();

  return (
    <div className={cn("space-y-2", className)}>
      {/* Header */}
      <div className="flex justify-between text-xs font-medium text-muted-foreground px-2">
        <span>Price</span>
        <span>Size</span>
      </div>

      {/* Asks (sells) - displayed in reverse order */}
      <div className="space-y-0.5">
        {[...asks].reverse().map((ask, idx) => (
          <div
            key={`ask-${idx}`}
            className="relative flex justify-between items-center px-2 py-1 rounded cursor-pointer hover:bg-muted/50"
            onClick={() => onPriceClick?.(ask.price, "ask")}
          >
            {/* Background bar */}
            <div
              className="absolute inset-y-0 right-0 bg-red-500/10 rounded"
              style={{ width: `${(ask.size / maxSize) * 100}%` }}
            />
            <span className="relative text-sm text-red-500 font-medium">
              {formatPrice(ask.price)}¢
            </span>
            <span className="relative text-sm text-muted-foreground">
              {formatSize(ask.size)}
            </span>
          </div>
        ))}
      </div>

      {/* Spread indicator */}
      <div className="flex items-center justify-center py-2 border-y">
        <div className="flex items-center space-x-3 text-sm">
          {lastPrice && (
            <span className="font-bold">{formatPrice(lastPrice)}¢</span>
          )}
          {spread !== undefined && (
            <span className="text-muted-foreground">
              Spread: {(spread * 100).toFixed(1)}¢
            </span>
          )}
        </div>
      </div>

      {/* Bids (buys) */}
      <div className="space-y-0.5">
        {bids.map((bid, idx) => (
          <div
            key={`bid-${idx}`}
            className="relative flex justify-between items-center px-2 py-1 rounded cursor-pointer hover:bg-muted/50"
            onClick={() => onPriceClick?.(bid.price, "bid")}
          >
            {/* Background bar */}
            <div
              className="absolute inset-y-0 left-0 bg-green-500/10 rounded"
              style={{ width: `${(bid.size / maxSize) * 100}%` }}
            />
            <span className="relative text-sm text-green-500 font-medium">
              {formatPrice(bid.price)}¢
            </span>
            <span className="relative text-sm text-muted-foreground">
              {formatSize(bid.size)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
