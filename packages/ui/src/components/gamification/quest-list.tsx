"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

// ============================================================================
// Types
// ============================================================================

export interface Quest {
  _id: string;
  questId: string;
  title: string;
  description: string;
  type: "daily" | "weekly" | "achievement" | "seasonal";
  requirements: {
    type: string;
    target?: number;
    [key: string]: unknown;
  };
  pointsReward: number;
  bonusReward?: {
    type: string;
    name: string;
    [key: string]: unknown;
  };
  progress: {
    current?: number;
    completed?: number;
    [key: string]: unknown;
  };
  completed: boolean;
  claimed: boolean;
  expiresAt?: number;
  completedAt?: number;
}

export interface QuestListProps {
  quests: Quest[];
  onClaim: (questId: string) => Promise<void>;
  isLoading?: boolean;
  className?: string;
}

// ============================================================================
// Quest Progress Bar
// ============================================================================

interface QuestProgressBarProps {
  current: number;
  target: number;
  completed: boolean;
  className?: string;
}

function QuestProgressBar({ current, target, completed, className }: QuestProgressBarProps) {
  const percentage = target > 0 ? Math.min((current / target) * 100, 100) : (completed ? 100 : 0);

  return (
    <div className={cn("space-y-1", className)}>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            completed ? "bg-green-500" : "bg-primary"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{current} / {target}</span>
        <span>{percentage.toFixed(0)}%</span>
      </div>
    </div>
  );
}

// ============================================================================
// Quest Card Component
// ============================================================================

interface QuestCardProps {
  quest: Quest;
  onClaim: (questId: string) => Promise<void>;
  isClaiming?: boolean;
}

function QuestCard({ quest, onClaim, isClaiming }: QuestCardProps) {
  const [claiming, setClaiming] = React.useState(false);

  const handleClaim = async () => {
    setClaiming(true);
    try {
      await onClaim(quest._id);
    } finally {
      setClaiming(false);
    }
  };

  const getProgressValues = () => {
    const target = quest.requirements.target ?? 1;
    const current = quest.progress.current ?? quest.progress.completed ?? 0;
    return { current, target };
  };

  const { current, target } = getProgressValues();
  const isClaimable = quest.completed && !quest.claimed;

  // Calculate time remaining
  const getTimeRemaining = () => {
    if (!quest.expiresAt) return null;
    const remaining = quest.expiresAt - Date.now();
    if (remaining <= 0) return "Expired";

    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d left`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m left`;
    }
    return `${minutes}m left`;
  };

  const timeRemaining = getTimeRemaining();

  return (
    <div
      className={cn(
        "relative p-4 rounded-lg border transition-all",
        quest.claimed
          ? "bg-muted/50 border-border/50 opacity-60"
          : isClaimable
          ? "bg-green-500/5 border-green-500/30 shadow-sm"
          : "bg-card border-border hover:border-border/80"
      )}
    >
      {/* Quest Info */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium truncate">{quest.title}</h4>
            {quest.claimed && (
              <span className="text-xs text-muted-foreground">Claimed</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
            {quest.description}
          </p>
        </div>

        {/* Reward */}
        <div className="flex flex-col items-end shrink-0">
          <span className="text-lg font-bold text-primary">
            +{quest.pointsReward}
          </span>
          <span className="text-xs text-muted-foreground">PTS</span>
        </div>
      </div>

      {/* Progress */}
      {!quest.claimed && (
        <div className="mt-3">
          <QuestProgressBar
            current={current}
            target={target}
            completed={quest.completed}
          />
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3">
        {/* Time Remaining */}
        {timeRemaining && !quest.claimed && (
          <span className="text-xs text-muted-foreground">
            {timeRemaining}
          </span>
        )}
        {quest.claimed && (
          <span className="text-xs text-green-500">Completed</span>
        )}
        {!timeRemaining && !quest.claimed && <div />}

        {/* Claim Button */}
        {isClaimable && (
          <button
            onClick={handleClaim}
            disabled={claiming || isClaiming}
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
              "bg-green-500 text-white hover:bg-green-600",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              claiming && "animate-pulse"
            )}
          >
            {claiming ? "Claiming..." : "Claim"}
          </button>
        )}
      </div>

      {/* Bonus Reward Badge */}
      {quest.bonusReward && !quest.claimed && (
        <div className="absolute -top-2 -right-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-600 border border-yellow-500/30">
            +Bonus
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Quest List Tabs
// ============================================================================

type QuestTab = "daily" | "weekly" | "all";

interface QuestTabsProps {
  activeTab: QuestTab;
  onTabChange: (tab: QuestTab) => void;
  dailyCount: number;
  weeklyCount: number;
  className?: string;
}

function QuestTabs({ activeTab, onTabChange, dailyCount, weeklyCount, className }: QuestTabsProps) {
  return (
    <div className={cn("flex gap-1 p-1 bg-muted rounded-lg", className)}>
      {([
        { id: "daily", label: "Daily", count: dailyCount },
        { id: "weekly", label: "Weekly", count: weeklyCount },
        { id: "all", label: "All", count: dailyCount + weeklyCount },
      ] as const).map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            "flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all",
            activeTab === tab.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
          {tab.count > 0 && (
            <span className={cn(
              "ml-1.5 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-xs",
              activeTab === tab.id ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20"
            )}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Main Quest List Component
// ============================================================================

export function QuestList({ quests, onClaim, isLoading, className }: QuestListProps) {
  const [activeTab, setActiveTab] = React.useState<QuestTab>("daily");
  const [claimingQuestId, setClaimingQuestId] = React.useState<string | null>(null);

  const dailyQuests = quests.filter((q) => q.type === "daily");
  const weeklyQuests = quests.filter((q) => q.type === "weekly");

  const filteredQuests = React.useMemo(() => {
    switch (activeTab) {
      case "daily":
        return dailyQuests;
      case "weekly":
        return weeklyQuests;
      default:
        return quests;
    }
  }, [activeTab, quests, dailyQuests, weeklyQuests]);

  // Sort: claimable first, then incomplete, then completed
  const sortedQuests = React.useMemo(() => {
    return [...filteredQuests].sort((a, b) => {
      // Claimable (completed but not claimed) first
      const aClaimable = a.completed && !a.claimed;
      const bClaimable = b.completed && !b.claimed;
      if (aClaimable && !bClaimable) return -1;
      if (!aClaimable && bClaimable) return 1;

      // Then incomplete
      if (!a.completed && b.completed) return -1;
      if (a.completed && !b.completed) return 1;

      // Then by progress percentage
      const aProgress = (a.progress.current ?? 0) / (a.requirements.target ?? 1);
      const bProgress = (b.progress.current ?? 0) / (b.requirements.target ?? 1);
      return bProgress - aProgress;
    });
  }, [filteredQuests]);

  const handleClaim = async (questId: string) => {
    setClaimingQuestId(questId);
    try {
      await onClaim(questId);
    } finally {
      setClaimingQuestId(null);
    }
  };

  // Count unclaimed completed quests
  const unclaimedDaily = dailyQuests.filter((q) => q.completed && !q.claimed).length;
  const unclaimedWeekly = weeklyQuests.filter((q) => q.completed && !q.claimed).length;

  if (isLoading) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="h-10 bg-muted rounded-lg animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Tabs */}
      <QuestTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        dailyCount={unclaimedDaily}
        weeklyCount={unclaimedWeekly}
      />

      {/* Quest List */}
      {sortedQuests.length > 0 ? (
        <div className="space-y-3">
          {sortedQuests.map((quest) => (
            <QuestCard
              key={quest._id}
              quest={quest}
              onClaim={handleClaim}
              isClaiming={claimingQuestId === quest._id}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <p>No {activeTab === "all" ? "" : activeTab} quests available</p>
        </div>
      )}
    </div>
  );
}
