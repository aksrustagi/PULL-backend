"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export interface PurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: {
    id: string;
    name: string;
    setName: string;
    year: number;
    imageUrl?: string;
    grade: number;
    gradingCompany: "PSA" | "BGS" | "CGC";
    certNumber: string;
    pricePerShare: number;
    totalShares: number;
    availableShares: number;
  };
  onPurchase?: (quantity: number) => void;
  userBalance?: number;
  className?: string;
}

export function PurchaseModal({
  isOpen,
  onClose,
  asset,
  onPurchase,
  userBalance = 0,
  className,
}: PurchaseModalProps) {
  const [quantity, setQuantity] = React.useState(1);
  const [isLoading, setIsLoading] = React.useState(false);

  const totalCost = quantity * asset.pricePerShare;
  const canAfford = userBalance >= totalCost;
  const maxQuantity = Math.min(
    asset.availableShares,
    Math.floor(userBalance / asset.pricePerShare)
  );

  const handleQuantityChange = (value: number) => {
    const clamped = Math.max(1, Math.min(value, asset.availableShares));
    setQuantity(clamped);
  };

  const handlePurchase = async () => {
    if (!canAfford || quantity < 1) return;

    setIsLoading(true);
    try {
      await onPurchase?.(quantity);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={cn(
          "relative z-10 w-full max-w-lg rounded-lg border bg-card shadow-lg",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">Purchase Shares</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted transition-colors"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {/* Asset preview */}
          <div className="flex items-start space-x-4">
            <div className="w-20 h-28 rounded-md overflow-hidden bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex-shrink-0">
              {asset.imageUrl ? (
                <img
                  src={asset.imageUrl}
                  alt={asset.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-3xl">🃏</span>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium">{asset.name}</h3>
              <p className="text-sm text-muted-foreground">
                {asset.setName} ({asset.year})
              </p>
              <div className="flex items-center space-x-2 mt-2">
                <span
                  className={cn(
                    "px-2 py-0.5 rounded text-xs font-medium border",
                    asset.gradingCompany === "PSA" &&
                      "border-red-500 text-red-500",
                    asset.gradingCompany === "BGS" &&
                      "border-blue-500 text-blue-500",
                    asset.gradingCompany === "CGC" &&
                      "border-green-500 text-green-500"
                  )}
                >
                  {asset.gradingCompany} {asset.grade}
                </span>
                <span className="text-xs text-muted-foreground">
                  #{asset.certNumber.slice(-6)}
                </span>
              </div>
            </div>
          </div>

          {/* Quantity selector */}
          <div>
            <label className="text-sm font-medium">Number of Shares</label>
            <div className="flex items-center space-x-3 mt-2">
              <button
                onClick={() => handleQuantityChange(quantity - 1)}
                disabled={quantity <= 1}
                className="h-10 w-10 rounded-md border flex items-center justify-center hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                -
              </button>
              <input
                type="number"
                value={quantity}
                onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
                min={1}
                max={asset.availableShares}
                className="h-10 w-24 rounded-md border bg-background text-center"
              />
              <button
                onClick={() => handleQuantityChange(quantity + 1)}
                disabled={quantity >= asset.availableShares}
                className="h-10 w-10 rounded-md border flex items-center justify-center hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                +
              </button>
              <button
                onClick={() => setQuantity(maxQuantity)}
                className="text-sm text-primary hover:underline"
              >
                Max ({maxQuantity})
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {asset.availableShares} shares available
            </p>
          </div>

          {/* Order summary */}
          <div className="rounded-lg bg-muted p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Price per share</span>
              <span>${asset.pricePerShare.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Quantity</span>
              <span>x {quantity}</span>
            </div>
            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between font-medium">
                <span>Total</span>
                <span>${totalCost.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Balance info */}
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Your balance</span>
            <span className={cn(!canAfford && "text-destructive")}>
              ${userBalance.toLocaleString()}
            </span>
          </div>

          {!canAfford && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-sm text-destructive">
                Insufficient balance. You need ${(totalCost - userBalance).toLocaleString()} more.
              </p>
              <button className="text-sm text-primary hover:underline mt-1">
                Add funds
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 border-t p-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-md hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handlePurchase}
            disabled={!canAfford || quantity < 1 || isLoading}
            className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? "Processing..." : `Buy ${quantity} Share${quantity > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
