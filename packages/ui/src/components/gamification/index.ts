/**
 * Gamification Components Index
 * Export all gamification UI components
 */

// Points Display
export {
  PointsDisplay,
  CompactPointsDisplay,
  TierBadge,
  StreakFlame,
} from "./points-display";
export type {
  PointsDisplayProps,
  CompactPointsDisplayProps,
  TierBadgeProps,
  StreakFlameProps,
} from "./points-display";

// Tier Progress
export {
  TierProgress,
  CompactTierProgress,
} from "./tier-progress";
export type {
  TierProgressProps,
  CompactTierProgressProps,
  TierBenefits,
} from "./tier-progress";

// Quest List
export { QuestList } from "./quest-list";
export type { Quest, QuestListProps } from "./quest-list";

// Achievement Grid
export {
  AchievementGrid,
  AchievementStats,
  CategoryFilter,
} from "./achievement-grid";
export type {
  Achievement,
  AchievementGridProps,
} from "./achievement-grid";

// Streak Tracker
export {
  StreakTracker,
  CompactStreak,
} from "./streak-tracker";
export type {
  Streak,
  StreakTrackerProps,
  CompactStreakProps,
} from "./streak-tracker";

// Leaderboard
export {
  Leaderboard,
  CompactLeaderboard,
} from "./leaderboard";
export type {
  LeaderboardEntry,
  UserRank,
  LeaderboardProps,
  CompactLeaderboardProps,
} from "./leaderboard";

// Rewards Shop
export { RewardsShop } from "./rewards-shop";
export type {
  RewardItem,
  RewardsShopProps,
} from "./rewards-shop";
