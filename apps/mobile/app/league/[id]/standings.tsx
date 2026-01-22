/**
 * League Standings Screen
 */

import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import { useState, useCallback } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../../services/api";
import { colors, spacing, borderRadius, typography } from "../../../constants/theme";
import type { Team } from "../../../types";

type SortKey = "rank" | "record" | "pointsFor" | "pointsAgainst" | "streak";

export default function StandingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("rank");

  const { data, refetch } = useQuery({
    queryKey: ["league", id, "standings"],
    queryFn: () => api.getLeagueStandings(id),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const teams = (data?.data || []) as Team[];

  const sortedTeams = [...teams].sort((a, b) => {
    switch (sortBy) {
      case "record":
        const aWinPct = a.wins / (a.wins + a.losses) || 0;
        const bWinPct = b.wins / (b.wins + b.losses) || 0;
        return bWinPct - aWinPct;
      case "pointsFor":
        return b.pointsFor - a.pointsFor;
      case "pointsAgainst":
        return a.pointsAgainst - b.pointsAgainst;
      default:
        return a.rank - b.rank;
    }
  });

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
          Standings
        </Text>
      </View>

      {/* Sort Options */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
      >
        {[
          { key: "rank" as SortKey, label: "Overall" },
          { key: "record" as SortKey, label: "Record" },
          { key: "pointsFor" as SortKey, label: "Points For" },
          { key: "pointsAgainst" as SortKey, label: "Points Against" },
        ].map((option) => (
          <Pressable
            key={option.key}
            onPress={() => setSortBy(option.key)}
            style={{
              backgroundColor: sortBy === option.key ? colors.primary : colors.card,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              borderRadius: borderRadius.full,
            }}
          >
            <Text style={{
              color: sortBy === option.key ? colors.textInverse : colors.text,
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
            }}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Standings Table */}
      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Table Header */}
        <View style={{
          flexDirection: "row",
          padding: spacing.md,
          paddingHorizontal: spacing.lg,
          backgroundColor: colors.cardElevated,
        }}>
          <Text style={{ width: 30, fontSize: typography.fontSize.xs, color: colors.textSecondary }}>#</Text>
          <Text style={{ flex: 1, fontSize: typography.fontSize.xs, color: colors.textSecondary }}>Team</Text>
          <Text style={{ width: 50, fontSize: typography.fontSize.xs, color: colors.textSecondary, textAlign: "center" }}>W-L</Text>
          <Text style={{ width: 60, fontSize: typography.fontSize.xs, color: colors.textSecondary, textAlign: "right" }}>PF</Text>
          <Text style={{ width: 60, fontSize: typography.fontSize.xs, color: colors.textSecondary, textAlign: "right" }}>PA</Text>
          <Text style={{ width: 50, fontSize: typography.fontSize.xs, color: colors.textSecondary, textAlign: "center" }}>Strk</Text>
        </View>

        {/* Team Rows */}
        {sortedTeams.map((team, index) => (
          <Pressable
            key={team.id}
            onPress={() => router.push(`/league/${id}/team/${team.id}`)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              padding: spacing.md,
              paddingHorizontal: spacing.lg,
              backgroundColor: index % 2 === 0 ? colors.background : colors.card,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            {/* Rank */}
            <View style={{
              width: 30,
              justifyContent: "center",
            }}>
              {index < 3 ? (
                <View style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: index === 0 ? "#FFD700" : index === 1 ? "#C0C0C0" : "#CD7F32",
                  justifyContent: "center",
                  alignItems: "center",
                }}>
                  <Text style={{
                    fontSize: typography.fontSize.xs,
                    fontWeight: typography.fontWeight.bold,
                    color: colors.background,
                  }}>
                    {index + 1}
                  </Text>
                </View>
              ) : (
                <Text style={{
                  fontSize: typography.fontSize.sm,
                  color: colors.textSecondary,
                }}>
                  {index + 1}
                </Text>
              )}
            </View>

            {/* Team Name */}
            <View style={{ flex: 1 }}>
              <Text style={{
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.medium,
                color: colors.text,
              }} numberOfLines={1}>
                {team.name}
              </Text>
              <Text style={{
                fontSize: typography.fontSize.xs,
                color: colors.textTertiary,
              }}>
                {team.ownerName}
              </Text>
            </View>

            {/* Record */}
            <Text style={{
              width: 50,
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.semibold,
              color: colors.text,
              textAlign: "center",
            }}>
              {team.wins}-{team.losses}
            </Text>

            {/* Points For */}
            <Text style={{
              width: 60,
              fontSize: typography.fontSize.sm,
              color: colors.text,
              textAlign: "right",
            }}>
              {team.pointsFor.toFixed(1)}
            </Text>

            {/* Points Against */}
            <Text style={{
              width: 60,
              fontSize: typography.fontSize.sm,
              color: colors.textSecondary,
              textAlign: "right",
            }}>
              {team.pointsAgainst.toFixed(1)}
            </Text>

            {/* Streak */}
            <View style={{
              width: 50,
              alignItems: "center",
            }}>
              {team.streak && (
                <View style={{
                  backgroundColor: team.streak.startsWith("W") ? colors.primary + "20" : colors.negative + "20",
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 2,
                  borderRadius: borderRadius.sm,
                }}>
                  <Text style={{
                    fontSize: typography.fontSize.xs,
                    fontWeight: typography.fontWeight.medium,
                    color: team.streak.startsWith("W") ? colors.primary : colors.negative,
                  }}>
                    {team.streak}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
        ))}

        {/* Legend */}
        <View style={{
          padding: spacing.lg,
          backgroundColor: colors.card,
          marginTop: spacing.md,
          marginHorizontal: spacing.lg,
          borderRadius: borderRadius.lg,
          marginBottom: spacing.xxl,
        }}>
          <Text style={{
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
            marginBottom: spacing.sm,
          }}>
            Legend
          </Text>
          <View style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: "#FFD700",
                marginRight: spacing.sm,
              }} />
              <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                Playoff Bye
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: "#C0C0C0",
                marginRight: spacing.sm,
              }} />
              <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                Playoff Bound
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: "#CD7F32",
                marginRight: spacing.sm,
              }} />
              <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                Playoff Contender
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
