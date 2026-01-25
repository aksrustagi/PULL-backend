"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

// ============================================================================
// Types
// ============================================================================

type RewardType = "fee_discount" | "token_conversion" | "sweepstakes" | "item";
type TierName = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export interface RewardItem {
  id: string;
  name: string;
  description: string;
  pointsCost: number;
  type: RewardType;
  value?: number;
  stock?: number;
  available: boolean;
  minTier?: TierName;
  requiresShipping?: boolean;
  imageUrl?: string;
  // Type-specific fields
  rate?: number; // For token conversion
  minAmount?: number;
  entriesPerPurchase?: number; // For sweepstakes
  drawDate?: number;
  totalEntries?: number;
}

export interface RewardsShopProps {
  items: Record<string, RewardItem[]>;
  userPoints: number;
  userTier: TierName;
  conversionRate: {
    pointsToToken: number;
    pointsToUsd: number;
  };
  onPurchase: (item: RewardItem, quantity: number, options?: {
    walletAddress?: string;
    shippingAddress?: object;
  }) => Promise<void>;
  className?: string;
}

// ============================================================================
// Reward Card Component
// ============================================================================

interface RewardCardProps {
  item: RewardItem;
  userPoints: number;
  userTier: TierName;
  onPurchase: (item: RewardItem, quantity: number, options?: object) => Promise<void>;
}

function RewardCard({ item, userPoints, userTier, onPurchase }: RewardCardProps) {
  const [isPurchasing, setIsPurchasing] = React.useState(false);
  const [quantity, setQuantity] = React.useState(1);
  const [showModal, setShowModal] = React.useState(false);
  const [walletAddress, setWalletAddress] = React.useState("");

  const tierOrder: TierName[] = ["bronze", "silver", "gold", "platinum", "diamond"];
  const canAfford = userPoints >= item.pointsCost * quantity;
  const meetsTierRequirement = !item.minTier || tierOrder.indexOf(userTier) >= tierOrder.indexOf(item.minTier);
  const isAvailable = item.available && (!item.stock || item.stock > 0);
  const canPurchase = canAfford && meetsTierRequirement && isAvailable;

  const handlePurchase = async () => {
    if (!canPurchase) return;

    if (item.type === "token_conversion") {
      setShowModal(true);
      return;
    }

    setIsPurchasing(true);
    try {
      await onPurchase(item, quantity);
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleTokenConversion = async () => {
    if (!walletAddress || !walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return;
    }

    setIsPurchasing(true);
    try {
      await onPurchase(item, quantity * item.pointsCost, { walletAddress });
      setShowModal(false);
      setWalletAddress("");
    } finally {
      setIsPurchasing(false);
    }
  };

  const getTypeIcon = () => {
    switch (item.type) {
      case "fee_discount":
        return "💸";
      case "token_conversion":
        return "🪙";
      case "sweepstakes":
        return "🎰";
      case "item":
        return "🎁";
      default:
        return "📦";
    }
  };

  return (
    <>
      <div
        className={cn(
          "relative p-4 rounded-xl border transition-all",
          canPurchase
            ? "border-border bg-card hover:border-primary/50 hover:shadow-md"
            : "border-border/50 bg-muted/30 opacity-70"
        )}
      >
        {/* Badge */}
        {item.type === "sweepstakes" && item.drawDate && (
          <div className="absolute -top-2 -right-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-600 border border-purple-500/30">
              🎰 Sweepstakes
            </span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className="text-3xl shrink-0">{getTypeIcon()}</div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold truncate">{item.name}</h4>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {item.description}
            </p>
          </div>
        </div>

        {/* Type-specific info */}
        {item.type === "sweepstakes" && item.drawDate && (
          <div className="mb-3 p-2 bg-muted/50 rounded-lg text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Draw date:</span>
              <span>{new Date(item.drawDate).toLocaleDateString()}</span>
            </div>
            {item.totalEntries !== undefined && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total entries:</span>
                <span>{item.totalEntries.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}

        {item.type === "token_conversion" && item.rate && (
          <div className="mb-3 p-2 bg-muted/50 rounded-lg text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Rate:</span>
              <span>{item.rate.toLocaleString()} PTS = 1 $PULL</span>
            </div>
          </div>
        )}

        {/* Price & Stock */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-2xl font-bold text-primary">
              {item.pointsCost.toLocaleString()}
            </span>
            <span className="text-sm text-muted-foreground ml-1">PTS</span>
          </div>
          {item.stock !== undefined && (
            <span className="text-sm text-muted-foreground">
              {item.stock} left
            </span>
          )}
        </div>

        {/* Tier Requirement */}
        {item.minTier && (
          <div className={cn(
            "text-xs mb-3 p-2 rounded-lg",
            meetsTierRequirement
              ? "bg-green-500/10 text-green-600"
              : "bg-red-500/10 text-red-600"
          )}>
            {meetsTierRequirement
              ? `✓ ${item.minTier} tier required`
              : `🔒 Requires ${item.minTier} tier`}
          </div>
        )}

        {/* Quantity Selector (for items) */}
        {item.type === "item" && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm text-muted-foreground">Qty:</span>
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-8 h-8 rounded border flex items-center justify-center hover:bg-muted"
              disabled={quantity <= 1}
            >
              -
            </button>
            <span className="w-8 text-center font-medium">{quantity}</span>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="w-8 h-8 rounded border flex items-center justify-center hover:bg-muted"
              disabled={item.stock !== undefined && quantity >= item.stock}
            >
              +
            </button>
          </div>
        )}

        {/* Purchase Button */}
        <button
          onClick={handlePurchase}
          disabled={!canPurchase || isPurchasing}
          className={cn(
            "w-full py-2 px-4 rounded-lg font-medium transition-all",
            canPurchase
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed",
            isPurchasing && "animate-pulse"
          )}
        >
          {isPurchasing
            ? "Processing..."
            : !isAvailable
            ? "Out of Stock"
            : !meetsTierRequirement
            ? `Requires ${item.minTier}`
            : !canAfford
            ? `Need ${(item.pointsCost * quantity - userPoints).toLocaleString()} more PTS`
            : item.type === "sweepstakes"
            ? "Enter Sweepstakes"
            : item.type === "token_conversion"
            ? "Convert Points"
            : "Redeem"}
        </button>
      </div>

      {/* Token Conversion Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">Convert Points to $PULL</h3>

            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">You'll spend:</span>
                  <span className="font-medium">{(quantity * item.pointsCost).toLocaleString()} PTS</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">You'll receive:</span>
                  <span className="font-medium">{quantity} $PULL</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Wallet Address
                </label>
                <input
                  type="text"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  placeholder="0x..."
                  className="w-full px-3 py-2 rounded-lg border bg-background text-foreground"
                />
                {walletAddress && !walletAddress.match(/^0x[a-fA-F0-9]{40}$/) && (
                  <p className="text-xs text-red-500 mt-1">Invalid Ethereum address</p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2 rounded-lg border hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={handleTokenConversion}
                  disabled={isPurchasing || !walletAddress.match(/^0x[a-fA-F0-9]{40}$/)}
                  className={cn(
                    "flex-1 py-2 rounded-lg font-medium",
                    "bg-primary text-primary-foreground hover:bg-primary/90",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {isPurchasing ? "Processing..." : "Convert"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================================
// Category Section Component
// ============================================================================

interface CategorySectionProps {
  title: string;
  icon: string;
  items: RewardItem[];
  userPoints: number;
  userTier: TierName;
  onPurchase: (item: RewardItem, quantity: number, options?: object) => Promise<void>;
}

function CategorySection({
  title,
  icon,
  items,
  userPoints,
  userTier,
  onPurchase,
}: CategorySectionProps) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <span>{icon}</span>
        <span>{title}</span>
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => (
          <RewardCard
            key={item.id}
            item={item}
            userPoints={userPoints}
            userTier={userTier}
            onPurchase={onPurchase}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Rewards Shop Component
// ============================================================================

const CATEGORY_CONFIG: Record<string, { title: string; icon: string }> = {
  fee_discounts: { title: "Fee Discounts", icon: "💸" },
  token_conversion: { title: "Token Conversion", icon: "🪙" },
  sweepstakes: { title: "Sweepstakes", icon: "🎰" },
  merchandise: { title: "Merchandise", icon: "🎁" },
};

export function RewardsShop({
  items,
  userPoints,
  userTier,
  conversionRate,
  onPurchase,
  className,
}: RewardsShopProps) {
  return (
    <div className={cn("space-y-8", className)}>
      {/* Points Balance Header */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Available Points</p>
            <p className="text-3xl font-bold">{userPoints.toLocaleString()} PTS</p>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <p>≈ {(userPoints / conversionRate.pointsToToken).toFixed(2)} $PULL</p>
            <p>≈ ${(userPoints / conversionRate.pointsToUsd).toFixed(2)} value</p>
          </div>
        </div>
      </div>

      {/* Categories */}
      {Object.entries(items).map(([category, categoryItems]) => {
        const config = CATEGORY_CONFIG[category] ?? {
          title: category.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
          icon: "📦",
        };

        return (
          <CategorySection
            key={category}
            title={config.title}
            icon={config.icon}
            items={categoryItems}
            userPoints={userPoints}
            userTier={userTier}
            onPurchase={onPurchase}
          />
        );
      })}

      {/* Empty State */}
      {Object.values(items).every((arr) => arr.length === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-4xl mb-4">🛒</p>
          <p>No rewards available at the moment.</p>
          <p className="text-sm mt-1">Check back soon!</p>
        </div>
      )}
    </div>
  );
}
