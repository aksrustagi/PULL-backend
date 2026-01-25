/**
 * BetCard Component
 * Displays a single bet with status, odds, and P&L
 */

import { View, Text, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, spacing, borderRadius, typography } from "../constants/theme";
import type { Bet, BetStatus } from "../types";

// ============================================================================
// Types
// ============================================================================

interface BetCardProps {
  bet: Bet;
  onPress?: () => void;
  showMarketInfo?: boolean;
  compact?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const STATUS_CONFIG: Record<BetStatus, { label: string; color: string; icon: string }> = {
  active: { label: "Active", color: colors.accent, icon: "time" },
  won: { label: "Won", color: colors.primary, icon: "checkmark-circle" },
  lost: { label: "Lost", color: colors.negative, icon: "close-circle" },
  cashed_out: { label: "Cashed Out", color: colors.warning, icon: "exit" },
  voided: { label: "Voided", color: colors.textSecondary, icon: "ban" },
  refunded: { label: "Refunded", color: colors.textSecondary, icon: "return-down-back" },
};

// ============================================================================
// Component
// ============================================================================

export function BetCard({ bet, onPress, showMarketInfo = true, compact = false }: BetCardProps) {
  const statusConfig = STATUS_CONFIG[bet.status] || STATUS_CONFIG.active;

  const pnl =
    bet.settledAmount !== undefined
      ? bet.settledAmount - bet.amount
      : (bet.currentValue || bet.amount) - bet.amount;

  const pnlPercent = bet.amount > 0 ? (pnl / bet.amount) * 100 : 0;

  const handlePress = () => {
    Haptics.selectionAsync();
    if (onPress) {
      onPress();
    } else {
      router.push(`/market/${bet.marketId}`);
    }
  };

  if (compact) {
    return (
      <Pressable onPress={handlePress} style={styles.compactContainer}>
        <View style={[styles.statusDot, { backgroundColor: statusConfig.color }]} />
        <View style={styles.compactContent}>
          <Text style={styles.compactLabel} numberOfLines={1}>
            {bet.outcomeLabel}
          </Text>
          <Text style={styles.compactAmount}>${bet.amount.toFixed(2)}</Text>
        </View>
        <Text style={[styles.compactPnl, { color: pnl >= 0 ? colors.primary : colors.negative }]}>
          {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={handlePress} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.outcomeInfo}>
          <Text style={styles.outcomeLabel} numberOfLines={1}>
            {bet.outcomeLabel}
          </Text>
          {showMarketInfo && bet.market && (
            <Text style={styles.marketTitle} numberOfLines={1}>
              {bet.market.title}
            </Text>
          )}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusConfig.color + "20" }]}>
          <Ionicons
            name={statusConfig.icon as any}
            size={12}
            color={statusConfig.color}
            style={{ marginRight: spacing.xs }}
          />
          <Text style={[styles.statusText, { color: statusConfig.color }]}>
            {statusConfig.label}
          </Text>
        </View>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Wagered</Text>
          <Text style={styles.statValue}>${bet.amount.toFixed(2)}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Odds</Text>
          <Text style={styles.statValue}>
            {bet.displayOdds || `${(bet.impliedProbability * 100).toFixed(0)}%`}
          </Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>
            {bet.status === "active" ? "Potential" : "Return"}
          </Text>
          <Text style={[styles.statValue, { color: pnl >= 0 ? colors.primary : colors.negative }]}>
            {bet.status === "active"
              ? `$${bet.potentialPayout.toFixed(2)}`
              : `${pnl >= 0 ? "+" : ""}$${(bet.settledAmount || 0).toFixed(2)}`}
          </Text>
        </View>
      </View>

      {/* Progress Bar (for active bets) */}
      {bet.status === "active" && bet.currentValue !== undefined && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(100, (bet.currentValue / bet.potentialPayout) * 100)}%`,
                  backgroundColor: pnl >= 0 ? colors.primary : colors.negative,
                },
              ]}
            />
          </View>
          <View style={styles.progressLabels}>
            <Text style={styles.progressLabel}>
              Current: ${bet.currentValue.toFixed(2)}
            </Text>
            <Text style={[styles.progressLabel, { color: pnl >= 0 ? colors.primary : colors.negative }]}>
              {pnl >= 0 ? "+" : ""}{pnlPercent.toFixed(1)}%
            </Text>
          </View>
        </View>
      )}

      {/* Timestamp */}
      <View style={styles.footer}>
        <Text style={styles.timestamp}>
          {new Date(bet.placedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      </View>
    </Pressable>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  compactContainer: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  compactContent: {
    flex: 1,
  },
  compactLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.text,
    fontWeight: typography.fontWeight.medium,
  },
  compactAmount: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  compactPnl: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  outcomeInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  outcomeLabel: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
  },
  marketTitle: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  statusText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  statsRow: {
    flexDirection: "row",
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  statValue: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
  },
  progressContainer: {
    marginTop: spacing.sm,
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.cardElevated,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  progressLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  timestamp: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
});

export default BetCard;
