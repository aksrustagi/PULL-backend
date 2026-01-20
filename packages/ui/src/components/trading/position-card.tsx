"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export interface PositionCardProps {
  ticker: string;
  title: string;
  side: "yes" | "no";
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  onClose?: () => void;
  onTrade?: () => void;
  className?: string;
}

export function PositionCard({
  ticker,
  title,
  side,
  quantity,
  avgPrice,
  currentPrice,
  onClose,
  onTrade,
  className,
}: PositionCardProps) {
  const pnl = (currentPrice - avgPrice) * quantity;
  const pnlPercent = ((currentPrice - avgPrice) / avgPrice) * 100;
  const isProfit = pnl >= 0;
  const marketValue = currentPrice * quantity;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-muted-foreground">
              {ticker}
            </span>
            <span
              className={cn(
                "text-xs font-medium px-1.5 py-0.5 rounded",
                side === "yes"
                  ? "bg-green-500/10 text-green-500"
                  : "bg-red-500/10 text-red-500"
              )}
            >
              {side.toUpperCase()}
            </span>
          </div>
          <h4 className="font-medium text-sm truncate">{title}</h4>
        </div>
      </div>

      {/* Position details */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground text-xs">Quantity</p>
          <p className="font-medium">{quantity}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Avg Price</p>
          <p className="font-medium">{(avgPrice * 100).toFixed(0)}¢</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Current</p>
          <p className="font-medium">{(currentPrice * 100).toFixed(0)}¢</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Market Value</p>
          <p className="font-medium">${marketValue.toFixed(2)}</p>
        </div>
      </div>

      {/* P&L */}
      <div className="mt-4 p-3 rounded-md bg-muted">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Unrealized P&L</span>
          <div className="text-right">
            <p
              className={cn(
                "font-bold",
                isProfit ? "text-green-500" : "text-red-500"
              )}
            >
              {isProfit ? "+" : ""}${pnl.toFixed(2)}
            </p>
            <p
              className={cn(
                "text-xs",
                isProfit ? "text-green-500" : "text-red-500"
              )}
            >
              {isProfit ? "+" : ""}
              {pnlPercent.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-4">
        <button
          onClick={onTrade}
          className="flex-1 px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Trade
        </button>
        <button
          onClick={onClose}
          className="px-3 py-2 text-sm font-medium rounded-md border hover:bg-muted transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
