/**
 * Home Screen - Dashboard
 */

import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import { useState, useCallback } from "react";
import { Link, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../../stores/auth";
import { api } from "../../services/api";
import { colors, spacing, borderRadius, typography } from "../../constants/theme";

export default function HomeScreen() {
  const { user, isAuthenticated } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);

  const { data: leagues, refetch: refetchLeagues } = useQuery({
    queryKey: ["leagues"],
    queryFn: () => api.getLeagues(),
    enabled: isAuthenticated,
  });

  const { data: markets, refetch: refetchMarkets } = useQuery({
    queryKey: ["markets", "featured"],
    queryFn: () => api.getMarkets({ status: "open", limit: 5 }),
    enabled: isAuthenticated,
  });

  const { data: activeBets, refetch: refetchBets } = useQuery({
    queryKey: ["bets", "active"],
    queryFn: () => api.getActiveBets(),
    enabled: isAuthenticated,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchLeagues(), refetchMarkets(), refetchBets()]);
    setRefreshing(false);
  }, [refetchLeagues, refetchMarkets, refetchBets]);

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xl }}>
          <Ionicons name="american-football" size={80} color={colors.primary} />
          <Text style={{
            fontSize: typography.fontSize.xxl,
            fontWeight: typography.fontWeight.bold,
            color: colors.text,
            marginTop: spacing.xl,
            textAlign: "center",
          }}>
            Fantasy Markets
          </Text>
          <Text style={{
            fontSize: typography.fontSize.md,
            color: colors.textSecondary,
            marginTop: spacing.sm,
            textAlign: "center",
          }}>
            Fantasy football with prediction markets
          </Text>
          <Pressable
            onPress={() => router.push("/(auth)/login")}
            style={{
              backgroundColor: colors.primary,
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.xxl,
              borderRadius: borderRadius.lg,
              marginTop: spacing.xxl,
            }}
          >
            <Text style={{
              fontSize: typography.fontSize.lg,
              fontWeight: typography.fontWeight.semibold,
              color: colors.textInverse,
            }}>
              Get Started
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
        contentContainerStyle={{ padding: spacing.lg }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={{ marginBottom: spacing.xl }}>
          <Text style={{
            fontSize: typography.fontSize.lg,
            color: colors.textSecondary,
          }}>
            Welcome back,
          </Text>
          <Text style={{
            fontSize: typography.fontSize.xxl,
            fontWeight: typography.fontWeight.bold,
            color: colors.text,
          }}>
            {user?.displayName || "Fantasy Manager"}
          </Text>
        </View>

        {/* Quick Actions */}
        <View style={{
          flexDirection: "row",
          marginBottom: spacing.xl,
          gap: spacing.md,
        }}>
          <QuickAction
            icon="clipboard"
            label="Set Lineup"
            onPress={() => {}}
          />
          <QuickAction
            icon="swap-horizontal"
            label="Trades"
            onPress={() => {}}
          />
          <QuickAction
            icon="bar-chart"
            label="Stats"
            onPress={() => {}}
          />
        </View>

        {/* This Week's Matchup */}
        <SectionHeader title="This Week's Matchup" />
        <MatchupCard />

        {/* Active Bets */}
        {activeBets?.data?.positions?.length > 0 && (
          <>
            <SectionHeader title="Active Bets" actionLabel="View All" onAction={() => router.push("/markets")} />
            <View style={{ gap: spacing.sm }}>
              {activeBets.data.positions.slice(0, 3).map((bet: any) => (
                <BetCard key={bet.id} bet={bet} />
              ))}
            </View>
          </>
        )}

        {/* Featured Markets */}
        <SectionHeader title="Featured Markets" actionLabel="See All" onAction={() => router.push("/markets")} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.lg }}>
          <View style={{ flexDirection: "row", paddingHorizontal: spacing.lg, gap: spacing.md }}>
            {markets?.data?.slice(0, 5).map((market: any) => (
              <MarketCard key={market.id} market={market} />
            ))}
          </View>
        </ScrollView>

        {/* My Leagues */}
        <SectionHeader title="My Leagues" actionLabel="View All" onAction={() => router.push("/leagues")} />
        <View style={{ gap: spacing.sm }}>
          {leagues?.data?.slice(0, 3).map((league: any) => (
            <LeagueCard key={league.id} league={league} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Components

function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={{
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: spacing.xl,
      marginBottom: spacing.md,
    }}>
      <Text style={{
        fontSize: typography.fontSize.lg,
        fontWeight: typography.fontWeight.semibold,
        color: colors.text,
      }}>
        {title}
      </Text>
      {actionLabel && (
        <Pressable onPress={onAction}>
          <Text style={{
            fontSize: typography.fontSize.sm,
            color: colors.accent,
          }}>
            {actionLabel}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function QuickAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        alignItems: "center",
      }}
    >
      <Ionicons name={icon as any} size={24} color={colors.primary} />
      <Text style={{
        fontSize: typography.fontSize.sm,
        color: colors.text,
        marginTop: spacing.xs,
      }}>
        {label}
      </Text>
    </Pressable>
  );
}

function MatchupCard() {
  return (
    <Pressable
      style={{
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.lg,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flex: 1, alignItems: "center" }}>
          <View style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: colors.cardElevated,
            justifyContent: "center",
            alignItems: "center",
          }}>
            <Text style={{ fontSize: 20 }}>🏈</Text>
          </View>
          <Text style={{
            fontSize: typography.fontSize.md,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
            marginTop: spacing.sm,
          }}>
            My Team
          </Text>
          <Text style={{
            fontSize: typography.fontSize.xxl,
            fontWeight: typography.fontWeight.bold,
            color: colors.primary,
            marginTop: spacing.xs,
          }}>
            0.0
          </Text>
          <Text style={{
            fontSize: typography.fontSize.xs,
            color: colors.textSecondary,
          }}>
            Proj: 125.5
          </Text>
        </View>

        <View style={{ alignItems: "center", paddingHorizontal: spacing.md }}>
          <Text style={{
            fontSize: typography.fontSize.sm,
            color: colors.textSecondary,
          }}>
            Week 1
          </Text>
          <Text style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.bold,
            color: colors.text,
            marginVertical: spacing.xs,
          }}>
            VS
          </Text>
          <Text style={{
            fontSize: typography.fontSize.xs,
            color: colors.textSecondary,
          }}>
            Scheduled
          </Text>
        </View>

        <View style={{ flex: 1, alignItems: "center" }}>
          <View style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: colors.cardElevated,
            justifyContent: "center",
            alignItems: "center",
          }}>
            <Text style={{ fontSize: 20 }}>🏈</Text>
          </View>
          <Text style={{
            fontSize: typography.fontSize.md,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
            marginTop: spacing.sm,
          }}>
            Opponent
          </Text>
          <Text style={{
            fontSize: typography.fontSize.xxl,
            fontWeight: typography.fontWeight.bold,
            color: colors.text,
            marginTop: spacing.xs,
          }}>
            0.0
          </Text>
          <Text style={{
            fontSize: typography.fontSize.xs,
            color: colors.textSecondary,
          }}>
            Proj: 118.2
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function MarketCard({ market }: { market: any }) {
  return (
    <Pressable
      onPress={() => router.push(`/market/${market.id}`)}
      style={{
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        width: 200,
      }}
    >
      <Text style={{
        fontSize: typography.fontSize.sm,
        color: colors.textSecondary,
        textTransform: "uppercase",
      }}>
        {market.type}
      </Text>
      <Text style={{
        fontSize: typography.fontSize.md,
        fontWeight: typography.fontWeight.semibold,
        color: colors.text,
        marginTop: spacing.xs,
      }} numberOfLines={2}>
        {market.title}
      </Text>
      <View style={{ flexDirection: "row", marginTop: spacing.md, gap: spacing.sm }}>
        {market.outcomes?.slice(0, 2).map((outcome: any) => (
          <View key={outcome.id} style={{ flex: 1 }}>
            <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }} numberOfLines={1}>
              {outcome.label}
            </Text>
            <Text style={{
              fontSize: typography.fontSize.md,
              fontWeight: typography.fontWeight.bold,
              color: colors.primary,
            }}>
              {outcome.displayOdds || `${(outcome.impliedProbability * 100).toFixed(0)}%`}
            </Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

function BetCard({ bet }: { bet: any }) {
  const isWinning = (bet.currentValue || 0) > bet.amount;

  return (
    <Pressable
      style={{
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{
          fontSize: typography.fontSize.sm,
          color: colors.textSecondary,
        }}>
          {bet.outcomeLabel}
        </Text>
        <Text style={{
          fontSize: typography.fontSize.md,
          fontWeight: typography.fontWeight.semibold,
          color: colors.text,
        }}>
          ${bet.amount.toFixed(2)}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{
          fontSize: typography.fontSize.sm,
          color: isWinning ? colors.primary : colors.negative,
        }}>
          {isWinning ? "+" : ""}${((bet.currentValue || 0) - bet.amount).toFixed(2)}
        </Text>
        <Text style={{
          fontSize: typography.fontSize.xs,
          color: colors.textSecondary,
        }}>
          Value: ${(bet.currentValue || 0).toFixed(2)}
        </Text>
      </View>
    </Pressable>
  );
}

function LeagueCard({ league }: { league: any }) {
  return (
    <Pressable
      onPress={() => router.push(`/league/${league.id}`)}
      style={{
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <View style={{
        width: 48,
        height: 48,
        borderRadius: borderRadius.md,
        backgroundColor: colors.cardElevated,
        justifyContent: "center",
        alignItems: "center",
        marginRight: spacing.md,
      }}>
        <Ionicons name="trophy" size={24} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{
          fontSize: typography.fontSize.md,
          fontWeight: typography.fontWeight.semibold,
          color: colors.text,
        }}>
          {league.name}
        </Text>
        <Text style={{
          fontSize: typography.fontSize.sm,
          color: colors.textSecondary,
        }}>
          {league.currentTeams}/{league.maxTeams} teams · {league.scoringType.toUpperCase()}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </Pressable>
  );
}
