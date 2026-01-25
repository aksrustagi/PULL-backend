/**
 * My Bets Screen - Portfolio & Positions
 * Displays user's active bets, history, and P&L
 */

import { View, Text, ScrollView, Pressable, RefreshControl, Dimensions } from "react-native";
import { useState, useCallback, useMemo } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../../stores/auth";
import { api } from "../../services/api";
import { colors, spacing, borderRadius, typography } from "../../constants/theme";
import type { Bet, BetStatus } from "../../types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type FilterType = "all" | "active" | "won" | "lost" | "settled";

const FILTERS: { id: FilterType; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
  { id: "settled", label: "Settled" },
];

export default function BetsScreen() {
  const { user, isAuthenticated } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>("all");

  const { data: betsData, refetch: refetchBets } = useQuery({
    queryKey: ["bets", "mine"],
    queryFn: () => api.getMyBets({ limit: 100 }),
    enabled: isAuthenticated,
  });

  const { data: portfolioData, refetch: refetchPortfolio } = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => api.getActiveBets(),
    enabled: isAuthenticated,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchBets(), refetchPortfolio()]);
    setRefreshing(false);
  }, [refetchBets, refetchPortfolio]);

  const bets = betsData?.data || [];
  const portfolio = portfolioData?.data || { positions: [], totalValue: 0, unrealizedPnL: 0 };

  const filteredBets = useMemo(() => {
    if (selectedFilter === "all") return bets;
    if (selectedFilter === "active") return bets.filter((bet: Bet) => bet.status === "active");
    if (selectedFilter === "won") return bets.filter((bet: Bet) => bet.status === "won");
    if (selectedFilter === "lost") return bets.filter((bet: Bet) => bet.status === "lost");
    if (selectedFilter === "settled") {
      return bets.filter((bet: Bet) => ["won", "lost", "cashed_out", "voided", "refunded"].includes(bet.status));
    }
    return bets;
  }, [bets, selectedFilter]);

  const stats = useMemo(() => {
    const activeBets = bets.filter((bet: Bet) => bet.status === "active");
    const settledBets = bets.filter((bet: Bet) => ["won", "lost", "cashed_out"].includes(bet.status));
    const wonBets = bets.filter((bet: Bet) => bet.status === "won");

    const totalWagered = bets.reduce((sum: number, bet: Bet) => sum + bet.amount, 0);
    const totalReturns = settledBets.reduce((sum: number, bet: Bet) => sum + (bet.settledAmount || 0), 0);
    const totalPnL = totalReturns - settledBets.reduce((sum: number, bet: Bet) => sum + bet.amount, 0);
    const winRate = settledBets.length > 0 ? (wonBets.length / settledBets.length) * 100 : 0;

    return {
      activeBets: activeBets.length,
      totalWagered,
      totalPnL,
      winRate,
    };
  }, [bets]);

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xl }}>
          <Ionicons name="wallet-outline" size={80} color={colors.textSecondary} />
          <Text style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
            marginTop: spacing.lg,
          }}>
            Sign In to View Your Bets
          </Text>
          <Text style={{
            fontSize: typography.fontSize.sm,
            color: colors.textSecondary,
            textAlign: "center",
            marginTop: spacing.sm,
          }}>
            Track your positions, view history, and manage your portfolio.
          </Text>
          <Pressable
            onPress={() => router.push("/(auth)/login")}
            style={{
              backgroundColor: colors.primary,
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.xxl,
              borderRadius: borderRadius.lg,
              marginTop: spacing.xl,
            }}
          >
            <Text style={{
              fontSize: typography.fontSize.md,
              fontWeight: typography.fontWeight.semibold,
              color: colors.textInverse,
            }}>
              Sign In
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Portfolio Summary Card */}
        <View style={{
          backgroundColor: colors.card,
          margin: spacing.lg,
          borderRadius: borderRadius.lg,
          padding: spacing.lg,
        }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View>
              <Text style={{
                fontSize: typography.fontSize.sm,
                color: colors.textSecondary,
              }}>
                Portfolio Value
              </Text>
              <Text style={{
                fontSize: typography.fontSize.xxxl,
                fontWeight: typography.fontWeight.bold,
                color: colors.text,
              }}>
                ${portfolio.totalValue.toFixed(2)}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.xs }}>
                <Ionicons
                  name={portfolio.unrealizedPnL >= 0 ? "trending-up" : "trending-down"}
                  size={16}
                  color={portfolio.unrealizedPnL >= 0 ? colors.primary : colors.negative}
                />
                <Text style={{
                  fontSize: typography.fontSize.md,
                  fontWeight: typography.fontWeight.semibold,
                  color: portfolio.unrealizedPnL >= 0 ? colors.primary : colors.negative,
                  marginLeft: spacing.xs,
                }}>
                  {portfolio.unrealizedPnL >= 0 ? "+" : ""}${portfolio.unrealizedPnL.toFixed(2)}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => router.push("/markets")}
              style={{
                backgroundColor: colors.primary,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                borderRadius: borderRadius.md,
              }}
            >
              <Text style={{
                color: colors.textInverse,
                fontWeight: typography.fontWeight.semibold,
              }}>
                Place Bet
              </Text>
            </Pressable>
          </View>

          {/* Stats Row */}
          <View style={{
            flexDirection: "row",
            marginTop: spacing.lg,
            paddingTop: spacing.lg,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}>
            <StatItem label="Active" value={stats.activeBets.toString()} />
            <StatItem label="Wagered" value={`$${stats.totalWagered.toFixed(0)}`} />
            <StatItem
              label="Total P&L"
              value={`${stats.totalPnL >= 0 ? "+" : ""}$${stats.totalPnL.toFixed(0)}`}
              valueColor={stats.totalPnL >= 0 ? colors.primary : colors.negative}
            />
            <StatItem label="Win Rate" value={`${stats.winRate.toFixed(0)}%`} />
          </View>
        </View>

        {/* Active Positions */}
        {portfolio.positions?.length > 0 && (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <Text style={{
              fontSize: typography.fontSize.lg,
              fontWeight: typography.fontWeight.semibold,
              color: colors.text,
              marginBottom: spacing.md,
            }}>
              Active Positions
            </Text>
            <View style={{ gap: spacing.sm }}>
              {portfolio.positions.map((position: any) => (
                <PositionCard key={position.id} position={position} />
              ))}
            </View>
          </View>
        )}

        {/* Filter Tabs */}
        <View style={{ marginTop: spacing.xl, paddingHorizontal: spacing.lg }}>
          <Text style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
            marginBottom: spacing.md,
          }}>
            Bet History
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm }}
          >
            {FILTERS.map((filter) => (
              <Pressable
                key={filter.id}
                onPress={() => setSelectedFilter(filter.id)}
                style={{
                  backgroundColor: selectedFilter === filter.id ? colors.primary : colors.card,
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.md,
                  borderRadius: borderRadius.full,
                }}
              >
                <Text style={{
                  color: selectedFilter === filter.id ? colors.textInverse : colors.text,
                  fontWeight: typography.fontWeight.medium,
                  fontSize: typography.fontSize.sm,
                }}>
                  {filter.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Bets List */}
        <View style={{ padding: spacing.lg, gap: spacing.sm }}>
          {filteredBets.length === 0 ? (
            <View style={{
              backgroundColor: colors.card,
              borderRadius: borderRadius.lg,
              padding: spacing.xxl,
              alignItems: "center",
            }}>
              <Ionicons name="document-text-outline" size={48} color={colors.textSecondary} />
              <Text style={{
                fontSize: typography.fontSize.lg,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text,
                marginTop: spacing.md,
              }}>
                No Bets Found
              </Text>
              <Text style={{
                fontSize: typography.fontSize.sm,
                color: colors.textSecondary,
                textAlign: "center",
                marginTop: spacing.xs,
              }}>
                {selectedFilter === "all"
                  ? "Start by placing your first bet on a prediction market."
                  : `No ${selectedFilter} bets to display.`}
              </Text>
              {selectedFilter === "all" && (
                <Pressable
                  onPress={() => router.push("/markets")}
                  style={{
                    backgroundColor: colors.primary,
                    paddingVertical: spacing.md,
                    paddingHorizontal: spacing.xl,
                    borderRadius: borderRadius.lg,
                    marginTop: spacing.lg,
                  }}
                >
                  <Text style={{
                    color: colors.textInverse,
                    fontWeight: typography.fontWeight.semibold,
                  }}>
                    Browse Markets
                  </Text>
                </Pressable>
              )}
            </View>
          ) : (
            filteredBets.map((bet: Bet) => (
              <BetCard key={bet.id} bet={bet} />
            ))
          )}
        </View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
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
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={{
        fontSize: typography.fontSize.xs,
        color: colors.textSecondary,
        marginBottom: spacing.xs,
      }}>
        {label}
      </Text>
      <Text style={{
        fontSize: typography.fontSize.md,
        fontWeight: typography.fontWeight.bold,
        color: valueColor,
      }}>
        {value}
      </Text>
    </View>
  );
}

function PositionCard({ position }: { position: any }) {
  const pnlPercent = position.amount > 0
    ? ((position.currentValue - position.amount) / position.amount) * 100
    : 0;
  const isPositive = position.currentValue >= position.amount;

  return (
    <Pressable
      onPress={() => router.push(`/market/${position.marketId}`)}
      style={{
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <View style={{
        width: 4,
        height: 48,
        backgroundColor: isPositive ? colors.primary : colors.negative,
        borderRadius: 2,
        marginRight: spacing.md,
      }} />
      <View style={{ flex: 1 }}>
        <Text style={{
          fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.medium,
          color: colors.text,
        }} numberOfLines={1}>
          {position.outcomeLabel || position.marketTitle}
        </Text>
        <Text style={{
          fontSize: typography.fontSize.xs,
          color: colors.textSecondary,
          marginTop: spacing.xs,
        }}>
          ${position.amount.toFixed(2)} @ {(position.avgPrice * 100).toFixed(0)}%
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{
          fontSize: typography.fontSize.md,
          fontWeight: typography.fontWeight.bold,
          color: colors.text,
        }}>
          ${position.currentValue.toFixed(2)}
        </Text>
        <Text style={{
          fontSize: typography.fontSize.xs,
          fontWeight: typography.fontWeight.medium,
          color: isPositive ? colors.primary : colors.negative,
        }}>
          {isPositive ? "+" : ""}{pnlPercent.toFixed(1)}%
        </Text>
      </View>
    </Pressable>
  );
}

function BetCard({ bet }: { bet: Bet }) {
  const getStatusColor = (status: BetStatus) => {
    switch (status) {
      case "active":
        return colors.accent;
      case "won":
        return colors.primary;
      case "lost":
        return colors.negative;
      case "cashed_out":
        return colors.warning;
      case "voided":
      case "refunded":
        return colors.textSecondary;
      default:
        return colors.textSecondary;
    }
  };

  const getStatusLabel = (status: BetStatus) => {
    switch (status) {
      case "active":
        return "Active";
      case "won":
        return "Won";
      case "lost":
        return "Lost";
      case "cashed_out":
        return "Cashed Out";
      case "voided":
        return "Voided";
      case "refunded":
        return "Refunded";
      default:
        return status;
    }
  };

  const pnl = bet.settledAmount !== undefined
    ? bet.settledAmount - bet.amount
    : (bet.currentValue || bet.amount) - bet.amount;

  return (
    <Pressable
      onPress={() => router.push(`/market/${bet.marketId}`)}
      style={{
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, marginRight: spacing.md }}>
          <Text style={{
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.medium,
            color: colors.text,
          }} numberOfLines={1}>
            {bet.outcomeLabel}
          </Text>
          <Text style={{
            fontSize: typography.fontSize.xs,
            color: colors.textSecondary,
            marginTop: spacing.xs,
          }}>
            {new Date(bet.placedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </Text>
        </View>
        <View style={{
          backgroundColor: getStatusColor(bet.status) + "20",
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.sm,
          borderRadius: borderRadius.sm,
        }}>
          <Text style={{
            fontSize: typography.fontSize.xs,
            fontWeight: typography.fontWeight.medium,
            color: getStatusColor(bet.status),
          }}>
            {getStatusLabel(bet.status)}
          </Text>
        </View>
      </View>

      <View style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: spacing.md,
        paddingTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}>
        <View>
          <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
            Wagered
          </Text>
          <Text style={{
            fontSize: typography.fontSize.md,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
          }}>
            ${bet.amount.toFixed(2)}
          </Text>
        </View>
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
            Odds
          </Text>
          <Text style={{
            fontSize: typography.fontSize.md,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
          }}>
            {bet.displayOdds || `${(bet.impliedProbability * 100).toFixed(0)}%`}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
            {bet.status === "active" ? "Potential" : "Return"}
          </Text>
          <Text style={{
            fontSize: typography.fontSize.md,
            fontWeight: typography.fontWeight.bold,
            color: pnl >= 0 ? colors.primary : colors.negative,
          }}>
            {pnl >= 0 ? "+" : ""}${(bet.status === "active" ? bet.potentialPayout : pnl + bet.amount).toFixed(2)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
