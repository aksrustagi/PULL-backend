/**
 * Markets Screen - Prediction Markets Hub
 */

import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import { useState, useCallback } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../services/api";
import { colors, spacing, borderRadius, typography } from "../../constants/theme";
import type { Market } from "../../types";

const CATEGORIES = [
  { id: "all", label: "All", icon: "grid" },
  { id: "matchup", label: "Matchups", icon: "people" },
  { id: "player_prop", label: "Player Props", icon: "person" },
  { id: "league_winner", label: "Futures", icon: "trophy" },
];

export default function MarketsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("all");

  const { data: markets, refetch: refetchMarkets } = useQuery({
    queryKey: ["markets", selectedCategory],
    queryFn: () =>
      api.getMarkets({
        type: selectedCategory === "all" ? undefined : selectedCategory,
        status: "open",
        limit: 50,
      }),
  });

  const { data: activeBets } = useQuery({
    queryKey: ["bets", "active"],
    queryFn: () => api.getActiveBets(),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchMarkets();
    setRefreshing(false);
  }, [refetchMarkets]);

  const positions = activeBets?.data?.positions || [];
  const totalValue = activeBets?.data?.totalValue || 0;
  const unrealizedPnL = activeBets?.data?.unrealizedPnL || 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        stickyHeaderIndices={[1]}
      >
        {/* Portfolio Summary */}
        {positions.length > 0 && (
          <View style={{
            backgroundColor: colors.card,
            margin: spacing.lg,
            marginBottom: spacing.md,
            padding: spacing.lg,
            borderRadius: borderRadius.lg,
          }}>
            <Text style={{
              fontSize: typography.fontSize.sm,
              color: colors.textSecondary,
              marginBottom: spacing.xs,
            }}>
              Your Positions
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
              <View>
                <Text style={{
                  fontSize: typography.fontSize.xxxl,
                  fontWeight: typography.fontWeight.bold,
                  color: colors.text,
                }}>
                  ${totalValue.toFixed(2)}
                </Text>
                <Text style={{
                  fontSize: typography.fontSize.md,
                  color: unrealizedPnL >= 0 ? colors.primary : colors.negative,
                }}>
                  {unrealizedPnL >= 0 ? "+" : ""}${unrealizedPnL.toFixed(2)}
                </Text>
              </View>
              <Pressable
                onPress={() => {}}
                style={{
                  backgroundColor: colors.cardElevated,
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.md,
                  borderRadius: borderRadius.md,
                }}
              >
                <Text style={{ color: colors.accent }}>View All</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Category Tabs */}
        <View style={{ backgroundColor: colors.background, paddingBottom: spacing.md }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
          >
            {CATEGORIES.map((cat) => (
              <Pressable
                key={cat.id}
                onPress={() => setSelectedCategory(cat.id)}
                style={{
                  backgroundColor: selectedCategory === cat.id ? colors.primary : colors.card,
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.md,
                  borderRadius: borderRadius.full,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.xs,
                }}
              >
                <Ionicons
                  name={cat.icon as any}
                  size={16}
                  color={selectedCategory === cat.id ? colors.textInverse : colors.textSecondary}
                />
                <Text style={{
                  color: selectedCategory === cat.id ? colors.textInverse : colors.text,
                  fontWeight: typography.fontWeight.medium,
                  fontSize: typography.fontSize.sm,
                }}>
                  {cat.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Markets List */}
        <View style={{ padding: spacing.lg, paddingTop: 0, gap: spacing.md }}>
          {markets?.data?.map((market: Market) => (
            <MarketCard key={market.id} market={market} />
          ))}

          {(!markets?.data || markets.data.length === 0) && (
            <View style={{
              backgroundColor: colors.card,
              borderRadius: borderRadius.lg,
              padding: spacing.xxl,
              alignItems: "center",
            }}>
              <Ionicons name="trending-up" size={48} color={colors.textSecondary} />
              <Text style={{
                fontSize: typography.fontSize.lg,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text,
                marginTop: spacing.md,
              }}>
                No Markets Available
              </Text>
              <Text style={{
                fontSize: typography.fontSize.sm,
                color: colors.textSecondary,
                textAlign: "center",
                marginTop: spacing.xs,
              }}>
                Check back later for new prediction markets.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MarketCard({ market }: { market: Market }) {
  const closesIn = market.closesAt - Date.now();
  const closesInHours = Math.floor(closesIn / (1000 * 60 * 60));
  const closesInDays = Math.floor(closesInHours / 24);

  return (
    <Pressable
      onPress={() => router.push(`/market/${market.id}`)}
      style={{
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.lg,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, marginRight: spacing.md }}>
          <Text style={{
            fontSize: typography.fontSize.xs,
            color: colors.textSecondary,
            textTransform: "uppercase",
            marginBottom: spacing.xs,
          }}>
            {market.type.replace("_", " ")}
          </Text>
          <Text style={{
            fontSize: typography.fontSize.md,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
          }}>
            {market.title}
          </Text>
        </View>
        <View style={{
          backgroundColor: colors.cardElevated,
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs,
          borderRadius: borderRadius.sm,
        }}>
          <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
            {closesInDays > 0 ? `${closesInDays}d` : `${closesInHours}h`}
          </Text>
        </View>
      </View>

      <View style={{
        flexDirection: "row",
        marginTop: spacing.md,
        gap: spacing.sm,
      }}>
        {market.outcomes.slice(0, 2).map((outcome) => (
          <Pressable
            key={outcome.id}
            style={{
              flex: 1,
              backgroundColor: colors.cardElevated,
              borderRadius: borderRadius.md,
              padding: spacing.md,
              alignItems: "center",
            }}
          >
            <Text style={{
              fontSize: typography.fontSize.sm,
              color: colors.textSecondary,
            }} numberOfLines={1}>
              {outcome.label}
            </Text>
            <Text style={{
              fontSize: typography.fontSize.xl,
              fontWeight: typography.fontWeight.bold,
              color: colors.primary,
              marginTop: spacing.xs,
            }}>
              {outcome.displayOdds || `${(outcome.impliedProbability * 100).toFixed(0)}%`}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: spacing.md,
        paddingTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}>
        <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
          Volume: ${market.totalVolume.toLocaleString()}
        </Text>
        <Text style={{ fontSize: typography.fontSize.xs, color: colors.accent }}>
          Place Bet →
        </Text>
      </View>
    </Pressable>
  );
}
