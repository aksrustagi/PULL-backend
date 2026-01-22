/**
 * Player Detail Screen
 */

import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import { useState, useCallback } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../services/api";
import { colors, spacing, borderRadius, typography } from "../../constants/theme";
import type { Player, PlayerStats } from "../../types";

export default function PlayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"stats" | "news" | "schedule">("stats");

  const { data: playerData, refetch } = useQuery({
    queryKey: ["player", id],
    queryFn: () => api.getPlayer(id),
  });

  const { data: statsData } = useQuery({
    queryKey: ["player", id, "stats"],
    queryFn: () => api.getPlayerStats(id),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const player = playerData?.data as Player | undefined;
  const seasonStats = statsData?.data as PlayerStats | undefined;

  if (!player) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: colors.textSecondary }}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusColor = {
    active: colors.primary,
    questionable: colors.warning,
    doubtful: colors.warning,
    out: colors.negative,
    injured: colors.negative,
    suspended: colors.negative,
    bye: colors.textSecondary,
  }[player.status || "active"];

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
          fontSize: typography.fontSize.lg,
          fontWeight: typography.fontWeight.bold,
          color: colors.text,
          flex: 1,
        }}>
          Player Info
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Player Header Card */}
        <View style={{
          backgroundColor: colors.card,
          margin: spacing.lg,
          borderRadius: borderRadius.lg,
          padding: spacing.lg,
        }}>
          <View style={{ flexDirection: "row" }}>
            {/* Player Photo */}
            <View style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: colors.cardElevated,
              justifyContent: "center",
              alignItems: "center",
              marginRight: spacing.lg,
            }}>
              <Text style={{ fontSize: 32 }}>
                {player.name.split(" ").map(n => n[0]).join("")}
              </Text>
            </View>

            {/* Player Info */}
            <View style={{ flex: 1 }}>
              <Text style={{
                fontSize: typography.fontSize.xxl,
                fontWeight: typography.fontWeight.bold,
                color: colors.text,
              }}>
                {player.name}
              </Text>
              <Text style={{
                fontSize: typography.fontSize.md,
                color: colors.textSecondary,
                marginTop: spacing.xs,
              }}>
                {player.team} • #{player.jerseyNumber} • {player.position}
              </Text>

              {/* Status Badge */}
              {player.status && player.status !== "active" && (
                <View style={{
                  backgroundColor: statusColor + "20",
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.xs,
                  borderRadius: borderRadius.sm,
                  alignSelf: "flex-start",
                  marginTop: spacing.sm,
                }}>
                  <Text style={{
                    fontSize: typography.fontSize.xs,
                    fontWeight: typography.fontWeight.bold,
                    color: statusColor,
                    textTransform: "uppercase",
                  }}>
                    {player.status}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Season Stats Summary */}
          <View style={{
            flexDirection: "row",
            marginTop: spacing.lg,
            paddingTop: spacing.lg,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{
                fontSize: typography.fontSize.xxl,
                fontWeight: typography.fontWeight.bold,
                color: colors.primary,
              }}>
                {player.seasonPoints?.toFixed(1) || "0.0"}
              </Text>
              <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                Total Pts
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{
                fontSize: typography.fontSize.xxl,
                fontWeight: typography.fontWeight.bold,
                color: colors.text,
              }}>
                {player.avgPoints?.toFixed(1) || "0.0"}
              </Text>
              <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                Avg Pts
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{
                fontSize: typography.fontSize.xxl,
                fontWeight: typography.fontWeight.bold,
                color: colors.text,
              }}>
                {player.projectedPoints?.toFixed(1) || "0.0"}
              </Text>
              <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                Proj Pts
              </Text>
            </View>
          </View>

          {/* Ownership & ADP */}
          <View style={{
            flexDirection: "row",
            marginTop: spacing.md,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                % Owned
              </Text>
              <Text style={{
                fontSize: typography.fontSize.md,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text,
              }}>
                {player.ownership?.toFixed(1) || 0}%
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                ADP
              </Text>
              <Text style={{
                fontSize: typography.fontSize.md,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text,
              }}>
                {player.adp?.toFixed(1) || "N/A"}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                Bye Week
              </Text>
              <Text style={{
                fontSize: typography.fontSize.md,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text,
              }}>
                {player.byeWeek || "N/A"}
              </Text>
            </View>
          </View>
        </View>

        {/* Tabs */}
        <View style={{ flexDirection: "row", paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
          {(["stats", "news", "schedule"] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={{
                flex: 1,
                paddingVertical: spacing.sm,
                alignItems: "center",
                borderBottomWidth: 2,
                borderBottomColor: activeTab === tab ? colors.primary : "transparent",
              }}
            >
              <Text style={{
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.semibold,
                color: activeTab === tab ? colors.primary : colors.textSecondary,
                textTransform: "capitalize",
              }}>
                {tab}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Tab Content */}
        {activeTab === "stats" && (
          <View style={{ paddingHorizontal: spacing.lg }}>
            {/* This Week Matchup */}
            <View style={{
              backgroundColor: colors.card,
              borderRadius: borderRadius.lg,
              padding: spacing.lg,
              marginBottom: spacing.md,
            }}>
              <Text style={{
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text,
                marginBottom: spacing.md,
              }}>
                This Week
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{
                  fontSize: typography.fontSize.md,
                  color: colors.textSecondary,
                }}>
                  vs {player.opponent || "BYE"}
                </Text>
                {player.opponent && (
                  <>
                    <View style={{
                      width: 1,
                      height: 16,
                      backgroundColor: colors.border,
                      marginHorizontal: spacing.md,
                    }} />
                    <Text style={{
                      fontSize: typography.fontSize.md,
                      fontWeight: typography.fontWeight.semibold,
                      color: colors.primary,
                    }}>
                      {player.projectedPoints?.toFixed(1)} proj pts
                    </Text>
                  </>
                )}
              </View>
            </View>

            {/* Season Stats by Position */}
            {seasonStats && (
              <View style={{
                backgroundColor: colors.card,
                borderRadius: borderRadius.lg,
                padding: spacing.lg,
                marginBottom: spacing.md,
              }}>
                <Text style={{
                  fontSize: typography.fontSize.sm,
                  fontWeight: typography.fontWeight.semibold,
                  color: colors.text,
                  marginBottom: spacing.md,
                }}>
                  Season Stats
                </Text>

                {/* QB Stats */}
                {player.position === "QB" && (
                  <View style={{ gap: spacing.sm }}>
                    <StatRow label="Pass Yards" value={seasonStats.passingYards || 0} />
                    <StatRow label="Pass TDs" value={seasonStats.passingTouchdowns || 0} />
                    <StatRow label="Interceptions" value={seasonStats.interceptions || 0} negative />
                    <StatRow label="Rush Yards" value={seasonStats.rushingYards || 0} />
                    <StatRow label="Rush TDs" value={seasonStats.rushingTouchdowns || 0} />
                  </View>
                )}

                {/* RB Stats */}
                {player.position === "RB" && (
                  <View style={{ gap: spacing.sm }}>
                    <StatRow label="Rush Yards" value={seasonStats.rushingYards || 0} />
                    <StatRow label="Rush TDs" value={seasonStats.rushingTouchdowns || 0} />
                    <StatRow label="Receptions" value={seasonStats.receptions || 0} />
                    <StatRow label="Rec Yards" value={seasonStats.receivingYards || 0} />
                    <StatRow label="Rec TDs" value={seasonStats.receivingTouchdowns || 0} />
                    <StatRow label="Fumbles" value={seasonStats.fumbles || 0} negative />
                  </View>
                )}

                {/* WR/TE Stats */}
                {(player.position === "WR" || player.position === "TE") && (
                  <View style={{ gap: spacing.sm }}>
                    <StatRow label="Receptions" value={seasonStats.receptions || 0} />
                    <StatRow label="Targets" value={seasonStats.targets || 0} />
                    <StatRow label="Rec Yards" value={seasonStats.receivingYards || 0} />
                    <StatRow label="Rec TDs" value={seasonStats.receivingTouchdowns || 0} />
                    <StatRow label="Fumbles" value={seasonStats.fumbles || 0} negative />
                  </View>
                )}

                {/* K Stats */}
                {player.position === "K" && (
                  <View style={{ gap: spacing.sm }}>
                    <StatRow label="FG Made" value={seasonStats.fieldGoalsMade || 0} />
                    <StatRow label="FG Attempted" value={seasonStats.fieldGoalsAttempted || 0} />
                    <StatRow label="XP Made" value={seasonStats.extraPointsMade || 0} />
                  </View>
                )}
              </View>
            )}

            {/* Game Log */}
            <View style={{
              backgroundColor: colors.card,
              borderRadius: borderRadius.lg,
              padding: spacing.lg,
              marginBottom: spacing.xxl,
            }}>
              <Text style={{
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text,
                marginBottom: spacing.md,
              }}>
                Game Log
              </Text>
              {/* Game log table would go here */}
              <Text style={{ color: colors.textSecondary, fontStyle: "italic" }}>
                Detailed game log coming soon
              </Text>
            </View>
          </View>
        )}

        {activeTab === "news" && (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <View style={{
              backgroundColor: colors.card,
              borderRadius: borderRadius.lg,
              padding: spacing.lg,
            }}>
              <Text style={{ color: colors.textSecondary, fontStyle: "italic" }}>
                Player news coming soon
              </Text>
            </View>
          </View>
        )}

        {activeTab === "schedule" && (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <View style={{
              backgroundColor: colors.card,
              borderRadius: borderRadius.lg,
              padding: spacing.lg,
            }}>
              <Text style={{ color: colors.textSecondary, fontStyle: "italic" }}>
                Schedule coming soon
              </Text>
            </View>
          </View>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      {/* Action Buttons */}
      <View style={{
        flexDirection: "row",
        padding: spacing.lg,
        gap: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}>
        <Pressable style={{
          flex: 1,
          backgroundColor: colors.card,
          padding: spacing.md,
          borderRadius: borderRadius.lg,
          alignItems: "center",
        }}>
          <Text style={{ color: colors.text, fontWeight: typography.fontWeight.medium }}>
            Add to Queue
          </Text>
        </Pressable>
        <Pressable style={{
          flex: 1,
          backgroundColor: colors.primary,
          padding: spacing.md,
          borderRadius: borderRadius.lg,
          alignItems: "center",
        }}>
          <Text style={{ color: colors.textInverse, fontWeight: typography.fontWeight.semibold }}>
            Trade/Add
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function StatRow({
  label,
  value,
  negative = false,
}: {
  label: string;
  value: number;
  negative?: boolean;
}) {
  return (
    <View style={{
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: spacing.xs,
    }}>
      <Text style={{ fontSize: typography.fontSize.sm, color: colors.textSecondary }}>
        {label}
      </Text>
      <Text style={{
        fontSize: typography.fontSize.md,
        fontWeight: typography.fontWeight.semibold,
        color: negative && value > 0 ? colors.negative : colors.text,
      }}>
        {value.toLocaleString()}
      </Text>
    </View>
  );
}
