"use client";

import * as React from "react";
import { cn } from "../../lib/utils";
import { TierBadge } from "./points-display";

// ============================================================================
// Types
// ============================================================================

type TierName = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export interface TierBenefits {
  feeDiscount: number;
  aiCredits: number;
  copyTrading: boolean;
  prioritySupport: boolean;
  revenueShare: number;
  pointsMultiplier: number;
}

export interface TierProgressProps {
  currentTier: TierName;
  lifetimePoints: number;
  pointsToNextTier: number;
  nextTier: TierName | null;
  progress: number; // 0-100
  currentBenefits: TierBenefits;
  nextTierBenefits?: TierBenefits;
  daysUntilDecay?: number | null;
  decayPercent?: number | null;
  showBenefitsComparison?: boolean;
  className?: string;
}

// ============================================================================
// Tier Configuration
// ============================================================================

const TIER_CONFIG: Record<TierName, { threshold: number; color: string; icon: string }> = {
  bronze: { threshold: 0, color: "#CD7F32", icon: "🥉" },
  silver: { threshold: 1000, color: "#C0C0C0", icon: "🥈" },
  gold: { threshold: 10000, color: "#FFD700", icon: "🥇" },
  platinum: { threshold: 100000, color: "#E5E4E2", icon: "💎" },
  diamond: { threshold: 500000, color: "#B9F2FF", icon: "💠" },
};

const TIER_ORDER: TierName[] = ["bronze", "silver", "gold", "platinum", "diamond"];

// ============================================================================
// Progress Bar Component
// ============================================================================

interface ProgressBarProps {
  progress: number;
  currentTier: TierName;
  nextTier: TierName | null;
  className?: string;
}

function ProgressBar({ progress, currentTier, nextTier, className }: ProgressBarProps) {
  const currentColor = TIER_CONFIG[currentTier].color;
  const nextColor = nextTier ? TIER_CONFIG[nextTier].color : currentColor;

  return (
    <div className={cn("relative w-full", className)}>
      {/* Background */}
      <div className="h-3 bg-muted rounded-full overflow-hidden">
        {/* Progress Fill */}
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${Math.min(progress, 100)}%`,
            background: `linear-gradient(90deg, ${currentColor}, ${nextColor})`,
          }}
        />
      </div>

      {/* Tier Markers */}
      <div className="absolute top-0 left-0 right-0 h-3 flex items-center">
        {TIER_ORDER.map((tier, index) => {
          const position = index === 0 ? 0 : (index / (TIER_ORDER.length - 1)) * 100;
          const isReached = TIER_ORDER.indexOf(currentTier) >= index;

          return (
            <div
              key={tier}
              className="absolute transform -translate-x-1/2"
              style={{ left: `${position}%` }}
            >
              <div
                className={cn(
                  "w-2 h-2 rounded-full border-2",
                  isReached ? "bg-primary border-primary" : "bg-muted border-muted-foreground/30"
                )}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Benefits List Component
// ============================================================================

interface BenefitItemProps {
  label: string;
  current: string | boolean;
  next?: string | boolean;
  isUpgrade?: boolean;
}

function BenefitItem({ label, current, next, isUpgrade }: BenefitItemProps) {
  const formatValue = (value: string | boolean) => {
    if (typeof value === "boolean") {
      return value ? "✓" : "—";
    }
    return value;
  };

  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{formatValue(current)}</span>
        {next !== undefined && isUpgrade && (
          <>
            <span className="text-muted-foreground">→</span>
            <span className="text-sm font-medium text-green-500">{formatValue(next)}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Tier Progress Component
// ============================================================================

export function TierProgress({
  currentTier,
  lifetimePoints,
  pointsToNextTier,
  nextTier,
  progress,
  currentBenefits,
  nextTierBenefits,
  daysUntilDecay,
  decayPercent,
  showBenefitsComparison = true,
  className,
}: TierProgressProps) {
  const isMaxTier = nextTier === null;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Current Tier Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{TIER_CONFIG[currentTier].icon}</span>
          <div>
            <h3 className="text-lg font-semibold capitalize">{currentTier} Tier</h3>
            <p className="text-sm text-muted-foreground">
              {lifetimePoints.toLocaleString()} lifetime points
            </p>
          </div>
        </div>
        {nextTier && (
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Next tier</p>
            <TierBadge tier={nextTier} size="md" />
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {!isMaxTier && (
        <div className="space-y-2">
          <ProgressBar
            progress={progress}
            currentTier={currentTier}
            nextTier={nextTier}
          />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {progress.toFixed(1)}% complete
            </span>
            <span className="text-muted-foreground">
              {pointsToNextTier.toLocaleString()} pts to {nextTier}
            </span>
          </div>
        </div>
      )}

      {/* Max Tier Message */}
      {isMaxTier && (
        <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 rounded-lg p-4 border border-cyan-500/20">
          <p className="text-sm text-center text-cyan-600 font-medium">
            You've reached the highest tier! Enjoy all premium benefits.
          </p>
        </div>
      )}

      {/* Decay Warning */}
      {daysUntilDecay !== null && daysUntilDecay !== undefined && daysUntilDecay <= 30 && (
        <div className="bg-yellow-500/10 rounded-lg p-3 border border-yellow-500/20">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span className="text-sm text-yellow-600">
              {daysUntilDecay === 0
                ? `Your points will decay by ${decayPercent}% today due to inactivity.`
                : `Stay active! Points decay of ${decayPercent}% in ${daysUntilDecay} days.`}
            </span>
          </div>
        </div>
      )}

      {/* Benefits Comparison */}
      {showBenefitsComparison && (
        <div className="space-y-1">
          <h4 className="text-sm font-medium text-muted-foreground mb-2">
            {nextTierBenefits ? "Your Benefits" : "Current Benefits"}
          </h4>
          <div className="bg-muted/30 rounded-lg p-3">
            <BenefitItem
              label="Fee Discount"
              current={`${(currentBenefits.feeDiscount * 100).toFixed(0)}%`}
              next={nextTierBenefits ? `${(nextTierBenefits.feeDiscount * 100).toFixed(0)}%` : undefined}
              isUpgrade={!!nextTierBenefits && nextTierBenefits.feeDiscount > currentBenefits.feeDiscount}
            />
            <BenefitItem
              label="AI Credits/Month"
              current={currentBenefits.aiCredits === -1 ? "Unlimited" : currentBenefits.aiCredits.toString()}
              next={nextTierBenefits
                ? (nextTierBenefits.aiCredits === -1 ? "Unlimited" : nextTierBenefits.aiCredits.toString())
                : undefined}
              isUpgrade={!!nextTierBenefits && nextTierBenefits.aiCredits > currentBenefits.aiCredits}
            />
            <BenefitItem
              label="Points Multiplier"
              current={`${currentBenefits.pointsMultiplier}x`}
              next={nextTierBenefits ? `${nextTierBenefits.pointsMultiplier}x` : undefined}
              isUpgrade={!!nextTierBenefits && nextTierBenefits.pointsMultiplier > currentBenefits.pointsMultiplier}
            />
            <BenefitItem
              label="Copy Trading"
              current={currentBenefits.copyTrading}
              next={nextTierBenefits ? nextTierBenefits.copyTrading : undefined}
              isUpgrade={!!nextTierBenefits && nextTierBenefits.copyTrading && !currentBenefits.copyTrading}
            />
            <BenefitItem
              label="Priority Support"
              current={currentBenefits.prioritySupport}
              next={nextTierBenefits ? nextTierBenefits.prioritySupport : undefined}
              isUpgrade={!!nextTierBenefits && nextTierBenefits.prioritySupport && !currentBenefits.prioritySupport}
            />
            {(currentBenefits.revenueShare > 0 || (nextTierBenefits && nextTierBenefits.revenueShare > 0)) && (
              <BenefitItem
                label="Revenue Share"
                current={`${(currentBenefits.revenueShare * 100).toFixed(0)}%`}
                next={nextTierBenefits ? `${(nextTierBenefits.revenueShare * 100).toFixed(0)}%` : undefined}
                isUpgrade={!!nextTierBenefits && nextTierBenefits.revenueShare > currentBenefits.revenueShare}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Compact Tier Progress (for sidebars, etc.)
// ============================================================================

export interface CompactTierProgressProps {
  currentTier: TierName;
  progress: number;
  pointsToNextTier: number;
  nextTier: TierName | null;
  className?: string;
}

export function CompactTierProgress({
  currentTier,
  progress,
  pointsToNextTier,
  nextTier,
  className,
}: CompactTierProgressProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <TierBadge tier={currentTier} size="sm" />
        {nextTier && (
          <span className="text-xs text-muted-foreground">
            {pointsToNextTier.toLocaleString()} to {nextTier}
          </span>
        )}
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
    </div>
  );
}
