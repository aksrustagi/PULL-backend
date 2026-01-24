"use client";

import * as React from "react";
import { cn } from "../../lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

// ============================================================================
// Types
// ============================================================================

type Rarity = "common" | "rare" | "epic" | "legendary";

export interface Achievement {
  _id: string;
  achievementId: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  requirement: {
    type: string;
    target?: number;
    [key: string]: unknown;
  };
  rarity: Rarity;
  pointsReward: number;
  unlocked: boolean;
  unlockedAt?: number;
  displayed?: boolean;
  progress?: {
    current: number;
    target: number;
    [key: string]: unknown;
  };
}

export interface AchievementGridProps {
  achievements: Achievement[];
  onToggleDisplay?: (achievementId: string, displayed: boolean) => Promise<void>;
  showCategory?: boolean;
  columns?: 2 | 3 | 4;
  className?: string;
}

// ============================================================================
// Rarity Styling
// ============================================================================

const rarityVariants = cva(
  "rounded-xl border-2 transition-all duration-300",
  {
    variants: {
      rarity: {
        common: "border-gray-400/30 bg-gradient-to-br from-gray-400/5 to-gray-500/10",
        rare: "border-blue-400/40 bg-gradient-to-br from-blue-400/10 to-blue-600/15",
        epic: "border-purple-400/50 bg-gradient-to-br from-purple-400/15 to-purple-600/20",
        legendary: "border-yellow-400/60 bg-gradient-to-br from-yellow-400/20 to-orange-500/25",
      },
      unlocked: {
        true: "",
        false: "opacity-50 grayscale",
      },
    },
    defaultVariants: {
      rarity: "common",
      unlocked: false,
    },
  }
);

const rarityGlow: Record<Rarity, string> = {
  common: "",
  rare: "shadow-blue-500/20",
  epic: "shadow-purple-500/30",
  legendary: "shadow-yellow-500/40 animate-pulse",
};

const rarityBadge: Record<Rarity, { bg: string; text: string }> = {
  common: { bg: "bg-gray-500/20", text: "text-gray-500" },
  rare: { bg: "bg-blue-500/20", text: "text-blue-500" },
  epic: { bg: "bg-purple-500/20", text: "text-purple-500" },
  legendary: { bg: "bg-yellow-500/20", text: "text-yellow-600" },
};

// ============================================================================
// Achievement Card Component
// ============================================================================

interface AchievementCardProps {
  achievement: Achievement;
  onToggleDisplay?: (achievementId: string, displayed: boolean) => Promise<void>;
  showCategory?: boolean;
}

function AchievementCard({ achievement, onToggleDisplay, showCategory }: AchievementCardProps) {
  const [isHovered, setIsHovered] = React.useState(false);
  const [isToggling, setIsToggling] = React.useState(false);

  const handleToggleDisplay = async () => {
    if (!onToggleDisplay || !achievement.unlocked) return;
    setIsToggling(true);
    try {
      await onToggleDisplay(achievement._id, !achievement.displayed);
    } finally {
      setIsToggling(false);
    }
  };

  const progressPercent = achievement.progress
    ? (achievement.progress.current / achievement.progress.target) * 100
    : 0;

  return (
    <div
      className={cn(
        rarityVariants({
          rarity: achievement.rarity,
          unlocked: achievement.unlocked,
        }),
        achievement.unlocked && `shadow-lg ${rarityGlow[achievement.rarity]}`,
        "p-4 relative overflow-hidden group"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Legendary Shimmer Effect */}
      {achievement.rarity === "legendary" && achievement.unlocked && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-shimmer" />
      )}

      {/* Icon */}
      <div className="text-center mb-3">
        <span
          className={cn(
            "text-4xl inline-block transition-transform",
            achievement.unlocked && "group-hover:scale-110"
          )}
        >
          {achievement.icon}
        </span>
      </div>

      {/* Title */}
      <h4 className="font-semibold text-center truncate">{achievement.title}</h4>

      {/* Description (on hover or always for unlocked) */}
      <p className={cn(
        "text-xs text-muted-foreground text-center mt-1 line-clamp-2 transition-opacity",
        !achievement.unlocked && !isHovered && "opacity-0"
      )}>
        {achievement.description}
      </p>

      {/* Progress Bar (for locked achievements) */}
      {!achievement.unlocked && achievement.progress && (
        <div className="mt-3 space-y-1">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary/50 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-center text-muted-foreground">
            {achievement.progress.current} / {achievement.progress.target}
          </p>
        </div>
      )}

      {/* Points Reward */}
      {achievement.unlocked && (
        <div className="mt-2 text-center">
          <span className="text-sm font-medium text-primary">
            +{achievement.pointsReward} PTS
          </span>
        </div>
      )}

      {/* Unlocked Date */}
      {achievement.unlocked && achievement.unlockedAt && (
        <p className="text-xs text-muted-foreground text-center mt-1">
          Unlocked {new Date(achievement.unlockedAt).toLocaleDateString()}
        </p>
      )}

      {/* Rarity Badge */}
      <div className="absolute top-2 right-2">
        <span className={cn(
          "text-xs font-medium px-2 py-0.5 rounded-full capitalize",
          rarityBadge[achievement.rarity].bg,
          rarityBadge[achievement.rarity].text
        )}>
          {achievement.rarity}
        </span>
      </div>

      {/* Category Badge */}
      {showCategory && (
        <div className="absolute top-2 left-2">
          <span className="text-xs text-muted-foreground capitalize">
            {achievement.category}
          </span>
        </div>
      )}

      {/* Display Toggle (for unlocked achievements) */}
      {achievement.unlocked && onToggleDisplay && (
        <button
          onClick={handleToggleDisplay}
          disabled={isToggling}
          className={cn(
            "absolute bottom-2 right-2 p-1.5 rounded-md transition-all",
            "hover:bg-muted/50",
            achievement.displayed ? "text-primary" : "text-muted-foreground",
            isToggling && "opacity-50"
          )}
          title={achievement.displayed ? "Hide from profile" : "Show on profile"}
        >
          {achievement.displayed ? "⭐" : "☆"}
        </button>
      )}

      {/* Locked Overlay */}
      {!achievement.unlocked && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-2xl">🔒</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Achievement Stats
// ============================================================================

interface AchievementStatsProps {
  stats: {
    total: number;
    unlocked: number;
    common: number;
    rare: number;
    epic: number;
    legendary: number;
  };
  className?: string;
}

export function AchievementStats({ stats, className }: AchievementStatsProps) {
  const completionPercent = stats.total > 0 ? (stats.unlocked / stats.total) * 100 : 0;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Overall Progress */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {stats.unlocked} / {stats.total} Unlocked
        </span>
        <span className="text-sm font-medium">
          {completionPercent.toFixed(0)}%
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${completionPercent}%` }}
        />
      </div>

      {/* By Rarity */}
      <div className="flex justify-center gap-4 pt-2">
        {(["common", "rare", "epic", "legendary"] as const).map((rarity) => (
          <div key={rarity} className="text-center">
            <span className={cn(
              "text-xs font-medium capitalize",
              rarityBadge[rarity].text
            )}>
              {rarity}
            </span>
            <p className="text-sm font-bold">{stats[rarity]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Category Filter
// ============================================================================

interface CategoryFilterProps {
  categories: string[];
  selected: string | null;
  onSelect: (category: string | null) => void;
  className?: string;
}

export function CategoryFilter({ categories, selected, onSelect, className }: CategoryFilterProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "px-3 py-1.5 rounded-md text-sm font-medium transition-all",
          selected === null
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:text-foreground"
        )}
      >
        All
      </button>
      {categories.map((category) => (
        <button
          key={category}
          onClick={() => onSelect(category)}
          className={cn(
            "px-3 py-1.5 rounded-md text-sm font-medium transition-all capitalize",
            selected === category
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          {category}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Main Achievement Grid Component
// ============================================================================

export function AchievementGrid({
  achievements,
  onToggleDisplay,
  showCategory = false,
  columns = 3,
  className,
}: AchievementGridProps) {
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);
  const [showLocked, setShowLocked] = React.useState(true);

  // Get unique categories
  const categories = React.useMemo(() => {
    const cats = new Set(achievements.map((a) => a.category));
    return Array.from(cats).sort();
  }, [achievements]);

  // Filter achievements
  const filteredAchievements = React.useMemo(() => {
    let filtered = achievements;

    if (selectedCategory) {
      filtered = filtered.filter((a) => a.category === selectedCategory);
    }

    if (!showLocked) {
      filtered = filtered.filter((a) => a.unlocked);
    }

    // Sort: unlocked first, then by rarity (legendary first)
    const rarityOrder: Record<Rarity, number> = {
      legendary: 4,
      epic: 3,
      rare: 2,
      common: 1,
    };

    return filtered.sort((a, b) => {
      if (a.unlocked !== b.unlocked) {
        return a.unlocked ? -1 : 1;
      }
      return rarityOrder[b.rarity] - rarityOrder[a.rarity];
    });
  }, [achievements, selectedCategory, showLocked]);

  // Calculate stats
  const stats = React.useMemo(() => ({
    total: achievements.length,
    unlocked: achievements.filter((a) => a.unlocked).length,
    common: achievements.filter((a) => a.rarity === "common" && a.unlocked).length,
    rare: achievements.filter((a) => a.rarity === "rare" && a.unlocked).length,
    epic: achievements.filter((a) => a.rarity === "epic" && a.unlocked).length,
    legendary: achievements.filter((a) => a.rarity === "legendary" && a.unlocked).length,
  }), [achievements]);

  const gridCols = {
    2: "grid-cols-2",
    3: "grid-cols-2 md:grid-cols-3",
    4: "grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Stats */}
      <AchievementStats stats={stats} />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <CategoryFilter
          categories={categories}
          selected={selectedCategory}
          onSelect={setSelectedCategory}
        />

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showLocked}
            onChange={(e) => setShowLocked(e.target.checked)}
            className="rounded border-muted-foreground"
          />
          <span className="text-muted-foreground">Show locked</span>
        </label>
      </div>

      {/* Grid */}
      {filteredAchievements.length > 0 ? (
        <div className={cn("grid gap-4", gridCols[columns])}>
          {filteredAchievements.map((achievement) => (
            <AchievementCard
              key={achievement._id}
              achievement={achievement}
              onToggleDisplay={onToggleDisplay}
              showCategory={showCategory && !selectedCategory}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <p>No achievements found</p>
        </div>
      )}
    </div>
  );
}

// Add shimmer animation to tailwind config
// @keyframes shimmer {
//   100% { transform: translateX(100%); }
// }
