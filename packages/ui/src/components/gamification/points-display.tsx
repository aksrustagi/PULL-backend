"use client";

import * as React from "react";
import { cn } from "../../lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

// ============================================================================
// Types
// ============================================================================

export interface PointsDisplayProps {
  points: number;
  pendingPoints?: number;
  showPending?: boolean;
  animated?: boolean;
  size?: "sm" | "md" | "lg";
  showStreak?: boolean;
  streakCount?: number;
  tier?: "bronze" | "silver" | "gold" | "platinum" | "diamond";
  className?: string;
}

// ============================================================================
// Tier Badge Component
// ============================================================================

const tierVariants = cva(
  "inline-flex items-center justify-center rounded-full text-xs font-bold uppercase tracking-wide",
  {
    variants: {
      tier: {
        bronze: "bg-amber-700/20 text-amber-600 border border-amber-600/30",
        silver: "bg-gray-400/20 text-gray-500 border border-gray-400/30",
        gold: "bg-yellow-500/20 text-yellow-600 border border-yellow-500/30",
        platinum: "bg-slate-400/20 text-slate-500 border border-slate-400/30",
        diamond: "bg-cyan-400/20 text-cyan-500 border border-cyan-400/30",
      },
      size: {
        sm: "h-5 px-2 text-[10px]",
        md: "h-6 px-2.5 text-xs",
        lg: "h-7 px-3 text-sm",
      },
    },
    defaultVariants: {
      tier: "bronze",
      size: "md",
    },
  }
);

const tierIcons: Record<string, string> = {
  bronze: "🥉",
  silver: "🥈",
  gold: "🥇",
  platinum: "💎",
  diamond: "💠",
};

export interface TierBadgeProps extends VariantProps<typeof tierVariants> {
  showIcon?: boolean;
  className?: string;
}

export function TierBadge({ tier = "bronze", size, showIcon = true, className }: TierBadgeProps) {
  return (
    <span className={cn(tierVariants({ tier, size }), className)}>
      {showIcon && <span className="mr-1">{tierIcons[tier!]}</span>}
      {tier}
    </span>
  );
}

// ============================================================================
// Streak Flame Component
// ============================================================================

export interface StreakFlameProps {
  count: number;
  size?: "sm" | "md" | "lg";
  animated?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
};

export function StreakFlame({ count, size = "md", animated = true, className }: StreakFlameProps) {
  const flameIntensity = Math.min(Math.floor(count / 7), 3); // 0-3 intensity levels

  const flameColors = [
    "text-orange-400", // 0-6 days
    "text-orange-500", // 7-13 days
    "text-red-500",    // 14-20 days
    "text-red-600",    // 21+ days
  ];

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <span
        className={cn(
          sizeClasses[size],
          flameColors[flameIntensity],
          animated && "animate-pulse"
        )}
      >
        🔥
      </span>
      <span className={cn("font-bold", sizeClasses[size])}>
        {count}
      </span>
    </div>
  );
}

// ============================================================================
// Animated Points Counter
// ============================================================================

function useAnimatedNumber(value: number, duration: number = 500) {
  const [displayValue, setDisplayValue] = React.useState(value);
  const previousValue = React.useRef(value);

  React.useEffect(() => {
    const startValue = previousValue.current;
    const endValue = value;
    const startTime = Date.now();

    if (startValue === endValue) return;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out quad
      const eased = 1 - (1 - progress) * (1 - progress);

      const current = Math.round(startValue + (endValue - startValue) * eased);
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        previousValue.current = endValue;
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  return displayValue;
}

// ============================================================================
// Main Points Display Component
// ============================================================================

export function PointsDisplay({
  points,
  pendingPoints = 0,
  showPending = true,
  animated = true,
  size = "md",
  showStreak = false,
  streakCount = 0,
  tier,
  className,
}: PointsDisplayProps) {
  const displayPoints = animated ? useAnimatedNumber(points) : points;

  const sizeStyles = {
    sm: {
      container: "gap-2",
      points: "text-xl font-bold",
      label: "text-xs",
      pending: "text-xs",
    },
    md: {
      container: "gap-3",
      points: "text-3xl font-bold",
      label: "text-sm",
      pending: "text-sm",
    },
    lg: {
      container: "gap-4",
      points: "text-5xl font-bold",
      label: "text-base",
      pending: "text-base",
    },
  };

  const styles = sizeStyles[size];

  return (
    <div className={cn("flex flex-col", styles.container, className)}>
      {/* Main Points Display */}
      <div className="flex items-center gap-2">
        <span className={cn(styles.points, "tabular-nums text-foreground")}>
          {displayPoints.toLocaleString()}
        </span>
        <span className={cn(styles.label, "text-muted-foreground")}>
          PTS
        </span>
        {tier && <TierBadge tier={tier} size={size} />}
      </div>

      {/* Pending Points */}
      {showPending && pendingPoints > 0 && (
        <div className={cn("flex items-center gap-1", styles.pending, "text-muted-foreground")}>
          <span>+{pendingPoints.toLocaleString()} pending</span>
        </div>
      )}

      {/* Streak Display */}
      {showStreak && streakCount > 0 && (
        <div className="flex items-center gap-2 mt-1">
          <StreakFlame count={streakCount} size={size} />
          <span className={cn(styles.label, "text-muted-foreground")}>
            day streak
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Compact Points Display (for headers, etc.)
// ============================================================================

export interface CompactPointsDisplayProps {
  points: number;
  tier?: "bronze" | "silver" | "gold" | "platinum" | "diamond";
  streakCount?: number;
  className?: string;
}

export function CompactPointsDisplay({
  points,
  tier,
  streakCount,
  className,
}: CompactPointsDisplayProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* Points */}
      <div className="flex items-center gap-1.5">
        <span className="text-lg font-bold tabular-nums">
          {points.toLocaleString()}
        </span>
        <span className="text-xs text-muted-foreground">PTS</span>
      </div>

      {/* Streak */}
      {streakCount !== undefined && streakCount > 0 && (
        <StreakFlame count={streakCount} size="sm" />
      )}

      {/* Tier Badge */}
      {tier && <TierBadge tier={tier} size="sm" showIcon={false} />}
    </div>
  );
}
