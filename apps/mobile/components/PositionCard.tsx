/**
 * PositionCard Component
 * Displays a user's position in a prediction market
 */

import { View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { useState } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, spacing, borderRadius, typography } from "../constants/theme";

// ============================================================================
// Types
// ============================================================================

interface Position {
  id: string;
  marketId: string;
  marketTitle?: string;
  outcomeId: string;
  outcomeLabel: string;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  currentValue: number;
  costBasis: number;
  unrealizedPnL: number;
  realizedPnL?: number;
  status: "active" | "closed" | "pending";
  createdAt: number;
}

interface PositionCardProps {
  position: Position;
  onSell?: (position: Position) => void;
  onCashOut?: (position: Position) => void;
  variant?: "default" | "compact" | "detailed";
  showActions?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function PositionCard({
  position,
  onSell,
  onCashOut,
  variant = "default",
  showActions = true,
}: PositionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const pnlPercent = position.costBasis > 0
    ? (position.unrealizedPnL / position.costBasis) * 100
    : 0;
  const isPositive = position.unrealizedPnL >= 0;

  const handlePress = () => {
    Haptics.selectionAsync();
    if (variant === "detailed") {
      setIsExpanded(!isExpanded);
    } else {
      router.push(`/market/${position.marketId}`);
    }
  };

  const handleSell = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (onSell) {
      onSell(position);
    } else {
      router.push(`/trade/${position.marketId}?action=sell&position=${position.id}`);
    }
  };

  const handleCashOut = () => {
    Alert.alert(
      "Cash Out Position",
      `Are you sure you want to cash out for $${position.currentValue.toFixed(2)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Cash Out",
          style: "default",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onCashOut?.(position);
          },
        },
      ]
    );
  };

  if (variant === "compact") {
    return (
      <Pressable onPress={handlePress} style={styles.compactContainer}>
        <View style={[styles.indicator, { backgroundColor: isPositive ? colors.primary : colors.negative }]} />
        <View style={styles.compactContent}>
          <Text style={styles.compactLabel} numberOfLines={1}>
            {position.outcomeLabel}
          </Text>
          <Text style={styles.compactMeta}>
            {position.shares.toFixed(2)} shares @ {(position.avgPrice * 100).toFixed(0)}%
          </Text>
        </View>
        <View style={styles.compactValues}>
          <Text style={styles.compactValue}>${position.currentValue.toFixed(2)}</Text>
          <Text style={[styles.compactPnl, { color: isPositive ? colors.primary : colors.negative }]}>
            {isPositive ? "+" : ""}{pnlPercent.toFixed(1)}%
          </Text>
        </View>
      </Pressable>
    );
  }

  if (variant === "detailed") {
    return (
      <Pressable onPress={handlePress} style={styles.detailedContainer}>
        {/* Header */}
        <View style={styles.detailedHeader}>
          <View style={styles.detailedHeaderLeft}>
            <View style={[styles.statusBadge, {
              backgroundColor: position.status === "active" ? colors.primary + "20" : colors.textSecondary + "20"
            }]}>
              <Text style={[styles.statusText, {
                color: position.status === "active" ? colors.primary : colors.textSecondary
              }]}>
                {position.status.charAt(0).toUpperCase() + position.status.slice(1)}
              </Text>
            </View>
            {position.marketTitle && (
              <Text style={styles.marketTitle} numberOfLines={1}>
                {position.marketTitle}
              </Text>
            )}
          </View>
          <Ionicons
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={20}
            color={colors.textSecondary}
          />
        </View>

        {/* Main Content */}
        <View style={styles.detailedContent}>
          <Text style={styles.outcomeLabel}>{position.outcomeLabel}</Text>

          <View style={styles.detailedValueRow}>
            <View>
              <Text style={styles.detailedValueLabel}>Current Value</Text>
              <Text style={styles.detailedValue}>${position.currentValue.toFixed(2)}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.detailedValueLabel}>P&L</Text>
              <Text style={[styles.detailedPnl, { color: isPositive ? colors.primary : colors.negative }]}>
                {isPositive ? "+" : ""}${position.unrealizedPnL.toFixed(2)}
                <Text style={styles.pnlPercent}> ({isPositive ? "+" : ""}{pnlPercent.toFixed(1)}%)</Text>
              </Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(100, position.currentPrice * 100)}%`,
                    backgroundColor: isPositive ? colors.primary : colors.negative,
                  },
                ]}
              />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.progressLabel}>0%</Text>
              <Text style={styles.progressLabel}>Current: {(position.currentPrice * 100).toFixed(1)}%</Text>
              <Text style={styles.progressLabel}>100%</Text>
            </View>
          </View>
        </View>

        {/* Expanded Details */}
        {isExpanded && (
          <View style={styles.expandedContent}>
            <View style={styles.statsGrid}>
              <StatItem label="Shares" value={position.shares.toFixed(2)} />
              <StatItem label="Avg. Price" value={`${(position.avgPrice * 100).toFixed(1)}%`} />
              <StatItem label="Current Price" value={`${(position.currentPrice * 100).toFixed(1)}%`} />
              <StatItem label="Cost Basis" value={`$${position.costBasis.toFixed(2)}`} />
              {position.realizedPnL !== undefined && (
                <StatItem
                  label="Realized P&L"
                  value={`$${position.realizedPnL.toFixed(2)}`}
                  valueColor={position.realizedPnL >= 0 ? colors.primary : colors.negative}
                />
              )}
              <StatItem
                label="Opened"
                value={new Date(position.createdAt).toLocaleDateString()}
              />
            </View>

            {/* Actions */}
            {showActions && position.status === "active" && (
              <View style={styles.actionsRow}>
                <Pressable onPress={handleSell} style={styles.actionButton}>
                  <Ionicons name="remove-circle-outline" size={20} color={colors.negative} />
                  <Text style={[styles.actionText, { color: colors.negative }]}>Sell</Text>
                </Pressable>
                {onCashOut && (
                  <Pressable onPress={handleCashOut} style={styles.actionButton}>
                    <Ionicons name="cash-outline" size={20} color={colors.warning} />
                    <Text style={[styles.actionText, { color: colors.warning }]}>Cash Out</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => router.push(`/trade/${position.marketId}`)}
                  style={styles.actionButton}
                >
                  <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                  <Text style={[styles.actionText, { color: colors.primary }]}>Buy More</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </Pressable>
    );
  }

  // Default variant
  return (
    <Pressable onPress={handlePress} style={styles.container}>
      <View style={[styles.indicator, { backgroundColor: isPositive ? colors.primary : colors.negative }]} />

      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.outcomeLabel} numberOfLines={1}>
            {position.outcomeLabel}
          </Text>
          <Text style={[styles.pnlBadge, {
            color: isPositive ? colors.primary : colors.negative,
            backgroundColor: isPositive ? colors.primary + "20" : colors.negative + "20"
          }]}>
            {isPositive ? "+" : ""}{pnlPercent.toFixed(1)}%
          </Text>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Shares</Text>
            <Text style={styles.statValue}>{position.shares.toFixed(2)}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Avg</Text>
            <Text style={styles.statValue}>{(position.avgPrice * 100).toFixed(0)}%</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Current</Text>
            <Text style={styles.statValue}>{(position.currentPrice * 100).toFixed(0)}%</Text>
          </View>
        </View>

        {/* Value Row */}
        <View style={styles.valueRow}>
          <View>
            <Text style={styles.valueLabel}>Value</Text>
            <Text style={styles.value}>${position.currentValue.toFixed(2)}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.valueLabel}>P&L</Text>
            <Text style={[styles.pnl, { color: isPositive ? colors.primary : colors.negative }]}>
              {isPositive ? "+" : ""}${position.unrealizedPnL.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Actions */}
        {showActions && position.status === "active" && (
          <View style={styles.actions}>
            <Pressable onPress={handleSell} style={styles.sellButton}>
              <Text style={styles.sellButtonText}>Sell</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push(`/market/${position.marketId}`)}
              style={styles.viewButton}
            >
              <Text style={styles.viewButtonText}>View Market</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.accent} />
            </Pressable>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function StatItem({
  label,
  value,
  valueColor = colors.text,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.gridItem}>
      <Text style={styles.gridLabel}>{label}</Text>
      <Text style={[styles.gridValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  // Default variant
  container: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    flexDirection: "row",
    overflow: "hidden",
  },
  indicator: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  outcomeLabel: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
    flex: 1,
  },
  pnlBadge: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    marginLeft: spacing.sm,
  },
  statsRow: {
    flexDirection: "row",
    marginBottom: spacing.md,
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  statValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text,
    marginTop: spacing.xs,
  },
  valueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  valueLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  value: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    marginTop: spacing.xs,
  },
  pnl: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: "row",
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  sellButton: {
    backgroundColor: colors.negative,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  sellButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textInverse,
  },
  viewButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.cardElevated,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  viewButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.accent,
    marginRight: spacing.xs,
  },

  // Compact variant
  compactContainer: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
  },
  compactContent: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  compactLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text,
  },
  compactMeta: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  compactValues: {
    alignItems: "flex-end",
  },
  compactValue: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
  },
  compactPnl: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    marginTop: spacing.xs,
  },

  // Detailed variant
  detailedContainer: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    overflow: "hidden",
  },
  detailedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailedHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  statusBadge: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  statusText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  marketTitle: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
    flex: 1,
  },
  detailedContent: {
    padding: spacing.lg,
  },
  detailedValueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  detailedValueLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  detailedValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    marginTop: spacing.xs,
  },
  detailedPnl: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginTop: spacing.xs,
  },
  pnlPercent: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  progressContainer: {
    marginTop: spacing.lg,
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.cardElevated,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
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
  expandedContent: {
    padding: spacing.lg,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: spacing.md,
  },
  gridItem: {
    width: "33.33%",
    paddingVertical: spacing.sm,
  },
  gridLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  gridValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
    marginTop: spacing.xs,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  actionText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
});

export default PositionCard;
