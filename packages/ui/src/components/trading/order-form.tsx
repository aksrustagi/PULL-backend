"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export interface OrderFormProps {
  ticker: string;
  yesPrice: number;
  noPrice: number;
  buyingPower: number;
  onSubmit: (order: {
    side: "yes" | "no";
    orderType: "market" | "limit";
    quantity: number;
    limitPrice?: number;
  }) => void;
  isLoading?: boolean;
  className?: string;
}

export function OrderForm({
  ticker,
  yesPrice,
  noPrice,
  buyingPower,
  onSubmit,
  isLoading = false,
  className,
}: OrderFormProps) {
  const [side, setSide] = React.useState<"yes" | "no">("yes");
  const [orderType, setOrderType] = React.useState<"market" | "limit">("market");
  const [quantity, setQuantity] = React.useState("");
  const [limitPrice, setLimitPrice] = React.useState("");

  const currentPrice = side === "yes" ? yesPrice : noPrice;
  const estimatedCost =
    orderType === "market"
      ? (parseFloat(quantity) || 0) * currentPrice
      : (parseFloat(quantity) || 0) * (parseFloat(limitPrice) / 100 || 0);
  const maxPayout = parseFloat(quantity) || 0;
  const maxQuantity = Math.floor(buyingPower / currentPrice);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      side,
      orderType,
      quantity: parseFloat(quantity),
      limitPrice: orderType === "limit" ? parseFloat(limitPrice) / 100 : undefined,
    });
  };

  const isValid =
    quantity &&
    parseFloat(quantity) > 0 &&
    estimatedCost <= buyingPower &&
    (orderType === "market" ||
      (limitPrice && parseFloat(limitPrice) > 0 && parseFloat(limitPrice) < 100));

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-4", className)}>
      {/* Side selection */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={cn(
            "px-4 py-3 text-sm font-medium rounded-lg transition-colors",
            side === "yes"
              ? "bg-green-600 text-white"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
          onClick={() => setSide("yes")}
        >
          Yes {(yesPrice * 100).toFixed(0)}¢
        </button>
        <button
          type="button"
          className={cn(
            "px-4 py-3 text-sm font-medium rounded-lg transition-colors",
            side === "no"
              ? "bg-red-600 text-white"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
          onClick={() => setSide("no")}
        >
          No {(noPrice * 100).toFixed(0)}¢
        </button>
      </div>

      {/* Order type */}
      <div>
        <label className="text-sm font-medium mb-2 block">Order Type</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={cn(
              "px-3 py-2 text-sm rounded-md transition-colors",
              orderType === "market"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
            onClick={() => setOrderType("market")}
          >
            Market
          </button>
          <button
            type="button"
            className={cn(
              "px-3 py-2 text-sm rounded-md transition-colors",
              orderType === "limit"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
            onClick={() => setOrderType("limit")}
          >
            Limit
          </button>
        </div>
      </div>

      {/* Quantity */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">Quantity (contracts)</label>
          <span className="text-xs text-muted-foreground">
            Max: {maxQuantity}
          </span>
        </div>
        <div className="relative">
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
            min="1"
            max={maxQuantity}
            className="w-full px-3 py-2 rounded-md border bg-background text-sm"
            disabled={isLoading}
          />
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-primary hover:underline"
            onClick={() => setQuantity(maxQuantity.toString())}
          >
            Max
          </button>
        </div>
        {/* Quick quantity buttons */}
        <div className="flex gap-1 mt-2">
          {[10, 25, 50, 100].map((q) => (
            <button
              key={q}
              type="button"
              className="flex-1 px-2 py-1 text-xs rounded border hover:bg-muted"
              onClick={() => setQuantity(Math.min(q, maxQuantity).toString())}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Limit price (if limit order) */}
      {orderType === "limit" && (
        <div>
          <label className="text-sm font-medium mb-2 block">
            Limit Price (¢)
          </label>
          <input
            type="number"
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            placeholder="50"
            min="1"
            max="99"
            step="1"
            className="w-full px-3 py-2 rounded-md border bg-background text-sm"
            disabled={isLoading}
          />
        </div>
      )}

      {/* Order summary */}
      <div className="border-t pt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Estimated Cost</span>
          <span className="font-medium">${estimatedCost.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Max Payout</span>
          <span className="font-medium">${maxPayout.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Potential Profit</span>
          <span className="font-medium text-green-500">
            ${(maxPayout - estimatedCost).toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Buying Power</span>
          <span>${buyingPower.toFixed(2)}</span>
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={!isValid || isLoading}
        className={cn(
          "w-full py-3 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
          side === "yes"
            ? "bg-green-600 hover:bg-green-700 text-white"
            : "bg-red-600 hover:bg-red-700 text-white"
        )}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Placing Order...
          </span>
        ) : (
          `Buy ${side.charAt(0).toUpperCase() + side.slice(1)}`
        )}
      </button>
    </form>
  );
}
