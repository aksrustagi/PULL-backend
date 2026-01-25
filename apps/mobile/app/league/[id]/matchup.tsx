/**
 * Matchup Screen - Head to Head View
 */

import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import { useState, useCallback } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../../services/api";
import { colors, spacing, borderRadius, typography } from "../../../constants/theme";
import type { Matchup, Player } from "../../../types";

export default function MatchupScreen() {
  const { id, matchupId } = useLocalSearchParams<{ id: string; matchupId?: string }>();
  const [refreshing, setRefreshing] = useState(false);

  const { data: matchupData, refetch } = useQuery({
    queryKey: ["league", id, "matchup", matchupId || "current"],
    queryFn: () => matchupId
      ? api.getMatchup(id, matchupId)
      : api.getCurrentMatchup(id),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const matchup = matchupData?.data as Matchup | undefined;

  if (!matchup) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: colors.textSecondary }}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const homeWinning = matchup.homeScore > matchup.awayScore;
  const awayWinning = matchup.awayScore > matchup.homeScore;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      {/* Header */}
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        padding: spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: spacing.md }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={{
          fontSize: typography.fontSize.xl,
          fontWeight: typography.fontWeight.bold,
          color: colors.text,
          flex: 1,
        }}>
          Week {matchup.week} Matchup
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Scoreboard */}
        <View style={{
          backgroundColor: colors.card,
          margin: spacing.lg,
          borderRadius: borderRadius.lg,
          overflow: "hidden",
        }}>
          <View style={{ flexDirection: "row" }}>
            {/* Home Team */}
            <View style={{
              flex: 1,
              padding: spacing.lg,
              alignItems: "center",
              backgroundColor: homeWinning ? colors.primary + "10" : "transparent",
            }}>
              <View style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: colors.cardElevated,
                justifyContent: "center",
                alignItems: "center",
                marginBottom: spacing.sm,
              }}>
                <Text style={{ fontSize: 24 }}>{matchup.homeTeam?.name?.[0] || "H"}</Text>
              </View>
              <Text style={{
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text,
                textAlign: "center",
              }} numberOfLines={2}>
                {matchup.homeTeam?.name}
              </Text>
              <Text style={{
                fontSize: typography.fontSize.xs,
                color: colors.textSecondary,
                marginTop: spacing.xs,
              }}>
                {matchup.homeTeam?.wins}-{matchup.homeTeam?.losses}
              </Text>
              <Text style={{
                fontSize: typography.fontSize.xxxl,
                fontWeight: typography.fontWeight.bold,
                color: homeWinning ? colors.primary : colors.text,
                marginTop: spacing.md,
              }}>
                {matchup.homeScore.toFixed(1)}
              </Text>
              <Text style={{
                fontSize: typography.fontSize.xs,
                color: colors.textSecondary,
              }}>
                proj {matchup.homeProjected?.toFixed(1)}
              </Text>
            </View>

            {/* VS */}
            <View style={{
              width: 50,
              justifyContent: "center",
              alignItems: "center",
            }}>
              <Text style={{
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.bold,
                color: colors.textSecondary,
              }}>
                VS
              </Text>
            </View>

            {/* Away Team */}
            <View style={{
              flex: 1,
              padding: spacing.lg,
              alignItems: "center",
              backgroundColor: awayWinning ? colors.primary + "10" : "transparent",
            }}>
              <View style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: colors.cardElevated,
                justifyContent: "center",
                alignItems: "center",
                marginBottom: spacing.sm,
              }}>
                <Text style={{ fontSize: 24 }}>{matchup.awayTeam?.name?.[0] || "A"}</Text>
              </View>
              <Text style={{
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text,
                textAlign: "center",
              }} numberOfLines={2}>
                {matchup.awayTeam?.name}
              </Text>
              <Text style={{
                fontSize: typography.fontSize.xs,
                color: colors.textSecondary,
                marginTop: spacing.xs,
              }}>
                {matchup.awayTeam?.wins}-{matchup.awayTeam?.losses}
              </Text>
              <Text style={{
                fontSize: typography.fontSize.xxxl,
                fontWeight: typography.fontWeight.bold,
                color: awayWinning ? colors.primary : colors.text,
                marginTop: spacing.md,
              }}>
                {matchup.awayScore.toFixed(1)}
              </Text>
              <Text style={{
                fontSize: typography.fontSize.xs,
                color: colors.textSecondary,
              }}>
                proj {matchup.awayProjected?.toFixed(1)}
              </Text>
            </View>
          </View>

          {/* Win Probability */}
          <View style={{
            padding: spacing.md,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}>
            <View style={{ flexDirection: "row", marginBottom: spacing.xs }}>
              <Text style={{
                flex: 1,
                fontSize: typography.fontSize.xs,
                color: colors.textSecondary,
              }}>
                Win Prob {(matchup.homeWinProbability * 100).toFixed(0)}%
              </Text>
              <Text style={{
                flex: 1,
                fontSize: typography.fontSize.xs,
                color: colors.textSecondary,
                textAlign: "right",
              }}>
                {(matchup.awayWinProbability * 100).toFixed(0)}% Win Prob
              </Text>
            </View>
            <View style={{
              flexDirection: "row",
              height: 6,
              borderRadius: 3,
              overflow: "hidden",
              backgroundColor: colors.cardElevated,
            }}>
              <View style={{
                width: `${matchup.homeWinProbability * 100}%`,
                backgroundColor: colors.primary,
              }} />
              <View style={{
                width: `${matchup.awayWinProbability * 100}%`,
                backgroundColor: colors.accent,
              }} />
            </View>
          </View>
        </View>

        {/* Bet on This Matchup */}
        <Pressable
          onPress={() => router.push(`/market/${matchup.marketId}`)}
          style={{
            backgroundColor: colors.card,
            marginHorizontal: spacing.lg,
            marginBottom: spacing.lg,
            borderRadius: borderRadius.lg,
            padding: spacing.lg,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <Ionicons name="trending-up" size={24} color={colors.accent} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={{
              fontSize: typography.fontSize.md,
              fontWeight: typography.fontWeight.semibold,
              color: colors.text,
            }}>
              Bet on This Matchup
            </Text>
            <Text style={{ fontSize: typography.fontSize.sm, color: colors.textSecondary }}>
              Prediction market available
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>

        {/* Player Comparison */}
        <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
          <Text style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
          }}>
            Player Comparison
          </Text>
        </View>

        {/* Position-by-Position */}
        {["QB", "RB", "WR", "TE", "FLEX", "K", "DEF"].map((position) => {
          const homePlayer = matchup.homeLineup?.find(p => p.rosterSlot === position);
          const awayPlayer = matchup.awayLineup?.find(p => p.rosterSlot === position);

          return (
            <View
              key={position}
              style={{
                flexDirection: "row",
                backgroundColor: colors.card,
                marginHorizontal: spacing.lg,
                marginBottom: spacing.sm,
                borderRadius: borderRadius.md,
                overflow: "hidden",
              }}
            >
              {/* Home Player */}
              <View style={{
                flex: 1,
                padding: spacing.md,
                backgroundColor: homePlayer && homePlayer.points > (awayPlayer?.points || 0)
                  ? colors.primary + "10"
                  : "transparent",
              }}>
                {homePlayer ? (
                  <>
                    <Text style={{
                      fontSize: typography.fontSize.sm,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.text,
                    }} numberOfLines={1}>
                      {homePlayer.name}
                    </Text>
                    <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                      {homePlayer.team}
                    </Text>
                    <Text style={{
                      fontSize: typography.fontSize.lg,
                      fontWeight: typography.fontWeight.bold,
                      color: colors.text,
                      marginTop: spacing.xs,
                    }}>
                      {(homePlayer.points || 0).toFixed(1)}
                    </Text>
                  </>
                ) : (
                  <Text style={{ color: colors.textTertiary, fontStyle: "italic" }}>Empty</Text>
                )}
              </View>

              {/* Position */}
              <View style={{
                width: 50,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: colors.cardElevated,
              }}>
                <Text style={{
                  fontSize: typography.fontSize.xs,
                  fontWeight: typography.fontWeight.bold,
                  color: colors.textSecondary,
                }}>
                  {position}
                </Text>
              </View>

              {/* Away Player */}
              <View style={{
                flex: 1,
                padding: spacing.md,
                backgroundColor: awayPlayer && awayPlayer.points > (homePlayer?.points || 0)
                  ? colors.accent + "10"
                  : "transparent",
              }}>
                {awayPlayer ? (
                  <>
                    <Text style={{
                      fontSize: typography.fontSize.sm,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.text,
                      textAlign: "right",
                    }} numberOfLines={1}>
                      {awayPlayer.name}
                    </Text>
                    <Text style={{
                      fontSize: typography.fontSize.xs,
                      color: colors.textSecondary,
                      textAlign: "right",
                    }}>
                      {awayPlayer.team}
                    </Text>
                    <Text style={{
                      fontSize: typography.fontSize.lg,
                      fontWeight: typography.fontWeight.bold,
                      color: colors.text,
                      marginTop: spacing.xs,
                      textAlign: "right",
                    }}>
                      {(awayPlayer.points || 0).toFixed(1)}
                    </Text>
                  </>
                ) : (
                  <Text style={{
                    color: colors.textTertiary,
                    fontStyle: "italic",
                    textAlign: "right",
                  }}>
                    Empty
                  </Text>
                )}
              </View>
            </View>
          );
        })}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}
