/**
 * MarketCard Component
 * Displays a prediction market with outcomes and odds
 */

import { View, Text, Pressable, StyleSheet, Animated } from "react-native";
import { useState, useRef } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, spacing, borderRadius, typography } from "../constants/theme";
import type { Market, MarketOutcome, MarketStatus, MarketType } from "../types";

// ============================================================================
// Types
// ============================================================================

interface MarketCardProps {
  market: Market;
  onPress?: () => void;
  onOutcomePress?: (outcome: MarketOutcome) => void;
  variant?: "default" | "compact" | "featured";
  showVolume?: boolean;
  showLiquidity?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const TYPE_ICONS: Record<MarketType, string> = {
  matchup: "people",
  league_winner: "trophy",
  player_prop: "person",
  weekly_high_score: "flash",
  over_under: "analytics",
  custom: "help-circle",
};

const STATUS_COLORS: Record<MarketStatus, string> = {
  open: colors.primary,
  locked: colors.warning,
  settled: colors.textSecondary,
  cancelled: colors.negative,
  voided: colors.negative,
};

// ============================================================================
// Component
// ============================================================================

export function MarketCard({
  market,
  onPress,
  onOutcomePress,
  variant = "default",
  showVolume = true,
  showLiquidity = false,
}: MarketCardProps) {
  const [pressedOutcome, setPressedOutcome] = useState<string | null>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const closesIn = market.closesAt - Date.now();
  const closesInMinutes = Math.floor(closesIn / (1000 * 60));
  const closesInHours = Math.floor(closesInMinutes / 60);
  const closesInDays = Math.floor(closesInHours / 24);

  const getTimeLabel = () => {
    if (closesIn <= 0) return "Closed";
    if (closesInDays > 0) return `${closesInDays}d`;
    if (closesInHours > 0) return `${closesInHours}h`;
    return `${closesInMinutes}m`;
  };

  const handlePress = () => {
    Haptics.selectionAsync();
    if (onPress) {
      onPress();
    } else {
      router.push(`/market/${market.id}`);
    }
  };

  const handleOutcomePress = (outcome: MarketOutcome) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onOutcomePress) {
      onOutcomePress(outcome);
    } else {
      router.push(`/trade/${market.id}?outcome=${outcome.id}`);
    }
  };

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  if (variant === "compact") {
    return (
      <Pressable onPress={handlePress} style={styles.compactContainer}>
        <View style={styles.compactLeft}>
          <Text style={styles.compactTitle} numberOfLines={1}>
            {market.title}
          </Text>
          <Text style={styles.compactMeta}>
            {getTimeLabel()} | ${market.totalVolume.toLocaleString()}
          </Text>
        </View>
        <View style={styles.compactRight}>
          {market.outcomes.slice(0, 2).map((outcome, index) => (
            <View key={outcome.id} style={styles.compactOutcome}>
              <Text style={styles.compactOutcomeLabel} numberOfLines={1}>
                {outcome.label}
              </Text>
              <Text style={styles.compactOutcomeOdds}>
                {(outcome.impliedProbability * 100).toFixed(0)}%
              </Text>
            </View>
          ))}
        </View>
      </Pressable>
    );
  }

  if (variant === "featured") {
    return (
      <Animated.View style={[styles.featuredContainer, { transform: [{ scale: scaleAnim }] }]}>
        <Pressable
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          {/* Featured Badge */}
          <View style={styles.featuredBadge}>
            <Ionicons name="star" size={12} color={colors.warning} />
            <Text style={styles.featuredBadgeText}>Featured</Text>
          </View>

          {/* Image/Header Area */}
          <View style={styles.featuredHeader}>
            <View style={styles.featuredIcon}>
              <Ionicons
                name={TYPE_ICONS[market.type] as any}
                size={32}
                color={colors.primary}
              />
            </View>
          </View>

          {/* Content */}
          <View style={styles.featuredContent}>
            <Text style={styles.featuredTitle} numberOfLines={2}>
              {market.title}
            </Text>
            <Text style={styles.featuredDescription} numberOfLines={2}>
              {market.description}
            </Text>
          </View>

          {/* Outcomes */}
          <View style={styles.featuredOutcomes}>
            {market.outcomes.slice(0, 2).map((outcome) => (
              <Pressable
                key={outcome.id}
                onPress={() => handleOutcomePress(outcome)}
                style={styles.featuredOutcomeButton}
              >
                <Text style={styles.featuredOutcomeLabel} numberOfLines={1}>
                  {outcome.label}
                </Text>
                <Text style={styles.featuredOutcomeOdds}>
                  {outcome.displayOdds || `${(outcome.impliedProbability * 100).toFixed(0)}%`}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Footer */}
          <View style={styles.featuredFooter}>
            <Text style={styles.featuredMeta}>
              Volume: ${market.totalVolume.toLocaleString()}
            </Text>
            <Text style={styles.featuredTime}>
              {getTimeLabel()}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  // Default variant
  return (
    <Pressable onPress={handlePress} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.typeBadge}>
            <Ionicons
              name={TYPE_ICONS[market.type] as any}
              size={12}
              color={colors.textSecondary}
            />
            <Text style={styles.typeText}>
              {market.type.replace("_", " ").toUpperCase()}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <View style={[
            styles.statusBadge,
            { backgroundColor: STATUS_COLORS[market.status] + "20" }
          ]}>
            <Text style={[styles.statusText, { color: STATUS_COLORS[market.status] }]}>
              {getTimeLabel()}
            </Text>
          </View>
        </View>
      </View>

      {/* Title */}
      <Text style={styles.title} numberOfLines={2}>
        {market.title}
      </Text>

      {/* Outcomes */}
      <View style={styles.outcomes}>
        {market.outcomes.slice(0, 2).map((outcome) => (
          <Pressable
            key={outcome.id}
            onPress={() => handleOutcomePress(outcome)}
            onPressIn={() => setPressedOutcome(outcome.id)}
            onPressOut={() => setPressedOutcome(null)}
            style={[
              styles.outcomeButton,
              pressedOutcome === outcome.id && styles.outcomeButtonPressed,
            ]}
          >
            <Text style={styles.outcomeLabel} numberOfLines={1}>
              {outcome.label}
            </Text>
            <Text style={styles.outcomeOdds}>
              {outcome.displayOdds || `${(outcome.impliedProbability * 100).toFixed(0)}%`}
            </Text>
            {/* Probability Bar */}
            <View style={styles.probabilityBar}>
              <View
                style={[
                  styles.probabilityFill,
                  { width: `${outcome.impliedProbability * 100}%` },
                ]}
              />
            </View>
          </Pressable>
        ))}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerStats}>
          {showVolume && (
            <Text style={styles.footerStat}>
              Vol: ${market.totalVolume.toLocaleString()}
            </Text>
          )}
          {showLiquidity && (
            <Text style={styles.footerStat}>
              Liq: ${market.totalLiquidity.toLocaleString()}
            </Text>
          )}
        </View>
        <View style={styles.footerAction}>
          <Text style={styles.footerActionText}>Trade</Text>
          <Ionicons name="arrow-forward" size={12} color={colors.accent} />
        </View>
      </View>
    </Pressable>
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
    padding: spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  headerLeft: {},
  headerRight: {},
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  typeText: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
    fontWeight: typography.fontWeight.medium,
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
  title: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
    lineHeight: 22,
  },
  outcomes: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  outcomeButton: {
    flex: 1,
    backgroundColor: colors.cardElevated,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: "center",
  },
  outcomeButtonPressed: {
    backgroundColor: colors.primary + "30",
  },
  outcomeLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  outcomeOdds: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary,
  },
  probabilityBar: {
    height: 3,
    width: "100%",
    backgroundColor: colors.card,
    borderRadius: 1.5,
    marginTop: spacing.sm,
    overflow: "hidden",
  },
  probabilityFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 1.5,
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
  footerStats: {
    flexDirection: "row",
    gap: spacing.md,
  },
  footerStat: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  footerAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  footerActionText: {
    fontSize: typography.fontSize.xs,
    color: colors.accent,
    fontWeight: typography.fontWeight.medium,
  },

  // Compact variant
  compactContainer: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
  },
  compactLeft: {
    flex: 1,
    marginRight: spacing.md,
  },
  compactTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text,
  },
  compactMeta: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  compactRight: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  compactOutcome: {
    alignItems: "center",
    minWidth: 50,
  },
  compactOutcomeLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  compactOutcomeOdds: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary,
  },

  // Featured variant
  featuredContainer: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    width: 280,
  },
  featuredBadge: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    backgroundColor: colors.warning + "20",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    zIndex: 1,
  },
  featuredBadgeText: {
    fontSize: typography.fontSize.xs,
    color: colors.warning,
    fontWeight: typography.fontWeight.medium,
    marginLeft: spacing.xs,
  },
  featuredHeader: {
    height: 100,
    backgroundColor: colors.cardElevated,
    justifyContent: "center",
    alignItems: "center",
  },
  featuredIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.card,
    justifyContent: "center",
    alignItems: "center",
  },
  featuredContent: {
    padding: spacing.lg,
  },
  featuredTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  featuredDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  featuredOutcomes: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  featuredOutcomeButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: "center",
  },
  featuredOutcomeLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textInverse,
    opacity: 0.8,
  },
  featuredOutcomeOdds: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.textInverse,
    marginTop: spacing.xs,
  },
  featuredFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.lg,
    paddingTop: spacing.md,
  },
  featuredMeta: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  featuredTime: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium,
  },
});

export default MarketCard;
