/**
 * League Detail Screen - Main Hub
 */

import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import { useState, useCallback } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../../services/api";
import { colors, spacing, borderRadius, typography } from "../../../constants/theme";
import type { League, Team } from "../../../types";

const TABS = [
  { id: "overview", label: "Overview", icon: "home" },
  { id: "standings", label: "Standings", icon: "podium" },
  { id: "matchups", label: "Matchups", icon: "git-compare" },
  { id: "players", label: "Players", icon: "people" },
];

export default function LeagueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState("overview");
  const [refreshing, setRefreshing] = useState(false);

  const { data: leagueData, refetch } = useQuery({
    queryKey: ["league", id],
    queryFn: () => api.getLeague(id),
  });

  const { data: myTeamData } = useQuery({
    queryKey: ["league", id, "my-team"],
    queryFn: () => api.getMyTeam(id),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const league = leagueData?.data as League | undefined;
  const myTeam = myTeamData?.data as Team | undefined;

  if (!league) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: colors.textSecondary }}>Loading...</Text>
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
        {/* Header */}
        <View style={{ padding: spacing.lg }}>
          <Pressable
            onPress={() => router.back()}
            style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.md }}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
            <Text style={{ color: colors.text, marginLeft: spacing.sm }}>Back</Text>
          </Pressable>

          <View style={{
            backgroundColor: colors.card,
            borderRadius: borderRadius.lg,
            padding: spacing.lg,
          }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{
                width: 60,
                height: 60,
                borderRadius: borderRadius.md,
                backgroundColor: colors.cardElevated,
                justifyContent: "center",
                alignItems: "center",
                marginRight: spacing.md,
              }}>
                <Ionicons name="trophy" size={32} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontSize: typography.fontSize.xl,
                  fontWeight: typography.fontWeight.bold,
                  color: colors.text,
                }}>
                  {league.name}
                </Text>
                <Text style={{
                  fontSize: typography.fontSize.sm,
                  color: colors.textSecondary,
                  marginTop: spacing.xs,
                }}>
                  {league.currentTeams}/{league.maxTeams} Teams • Week {league.currentWeek}
                </Text>
              </View>
            </View>

            {/* Quick Stats */}
            <View style={{
              flexDirection: "row",
              marginTop: spacing.lg,
              paddingTop: spacing.lg,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                  Format
                </Text>
                <Text style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: colors.text }}>
                  {league.scoringType.toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                  Season
                </Text>
                <Text style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: colors.text }}>
                  {league.season}
                </Text>
              </View>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                  Status
                </Text>
                <Text style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: colors.primary }}>
                  {league.status.replace("_", " ")}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Tab Navigation */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
        >
          {TABS.map((tab) => (
            <Pressable
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              style={{
                backgroundColor: activeTab === tab.id ? colors.primary : colors.card,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                borderRadius: borderRadius.full,
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.xs,
              }}
            >
              <Ionicons
                name={tab.icon as any}
                size={16}
                color={activeTab === tab.id ? colors.textInverse : colors.textSecondary}
              />
              <Text style={{
                color: activeTab === tab.id ? colors.textInverse : colors.text,
                fontWeight: typography.fontWeight.medium,
              }}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* My Team Card */}
        {myTeam && (
          <View style={{ padding: spacing.lg }}>
            <Pressable
              onPress={() => router.push(`/league/${id}/team/${myTeam.id}`)}
              style={{
                backgroundColor: colors.card,
                borderRadius: borderRadius.lg,
                padding: spacing.lg,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View>
                  <Text style={{ fontSize: typography.fontSize.sm, color: colors.textSecondary }}>
                    My Team
                  </Text>
                  <Text style={{
                    fontSize: typography.fontSize.lg,
                    fontWeight: typography.fontWeight.bold,
                    color: colors.text,
                    marginTop: spacing.xs,
                  }}>
                    {myTeam.name}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                    Record
                  </Text>
                  <Text style={{
                    fontSize: typography.fontSize.xl,
                    fontWeight: typography.fontWeight.bold,
                    color: colors.primary,
                  }}>
                    {myTeam.wins}-{myTeam.losses}
                  </Text>
                </View>
              </View>

              <View style={{
                flexDirection: "row",
                marginTop: spacing.md,
                paddingTop: spacing.md,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>Points For</Text>
                  <Text style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.text }}>
                    {myTeam.pointsFor.toFixed(1)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>Points Against</Text>
                  <Text style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.text }}>
                    {myTeam.pointsAgainst.toFixed(1)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>Rank</Text>
                  <Text style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.text }}>
                    #{myTeam.rank}
                  </Text>
                </View>
              </View>
            </Pressable>
          </View>
        )}

        {/* Quick Actions */}
        <View style={{ padding: spacing.lg, paddingTop: 0 }}>
          <Text style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
            marginBottom: spacing.md,
          }}>
            Quick Actions
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <Pressable
              onPress={() => router.push(`/league/${id}/roster`)}
              style={{
                flex: 1,
                backgroundColor: colors.card,
                borderRadius: borderRadius.lg,
                padding: spacing.lg,
                alignItems: "center",
              }}
            >
              <Ionicons name="list" size={24} color={colors.primary} />
              <Text style={{ color: colors.text, marginTop: spacing.sm, fontSize: typography.fontSize.sm }}>
                Set Lineup
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push(`/league/${id}/waivers`)}
              style={{
                flex: 1,
                backgroundColor: colors.card,
                borderRadius: borderRadius.lg,
                padding: spacing.lg,
                alignItems: "center",
              }}
            >
              <Ionicons name="swap-horizontal" size={24} color={colors.accent} />
              <Text style={{ color: colors.text, marginTop: spacing.sm, fontSize: typography.fontSize.sm }}>
                Waivers
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push(`/league/${id}/trades`)}
              style={{
                flex: 1,
                backgroundColor: colors.card,
                borderRadius: borderRadius.lg,
                padding: spacing.lg,
                alignItems: "center",
              }}
            >
              <Ionicons name="repeat" size={24} color={colors.warning} />
              <Text style={{ color: colors.text, marginTop: spacing.sm, fontSize: typography.fontSize.sm }}>
                Trades
              </Text>
            </Pressable>
          </View>
        </View>

        {/* League Chat Preview */}
        <View style={{ padding: spacing.lg, paddingTop: 0 }}>
          <Pressable
            onPress={() => router.push(`/chat/${league.chatRoomId}`)}
            style={{
              backgroundColor: colors.card,
              borderRadius: borderRadius.lg,
              padding: spacing.lg,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <View style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: colors.cardElevated,
              justifyContent: "center",
              alignItems: "center",
              marginRight: spacing.md,
            }}>
              <Ionicons name="chatbubbles" size={22} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{
                fontSize: typography.fontSize.md,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text,
              }}>
                League Chat
              </Text>
              <Text style={{ fontSize: typography.fontSize.sm, color: colors.textSecondary }}>
                Tap to open chat
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Recent Activity */}
        <View style={{ padding: spacing.lg, paddingTop: 0, marginBottom: spacing.xxl }}>
          <Text style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
            marginBottom: spacing.md,
          }}>
            Recent Activity
          </Text>
          <View style={{
            backgroundColor: colors.card,
            borderRadius: borderRadius.lg,
            padding: spacing.lg,
          }}>
            <ActivityItem
              icon="swap-horizontal"
              iconColor={colors.accent}
              title="Trade Completed"
              description="Josh Allen traded to Team Alpha"
              time="2h ago"
            />
            <ActivityItem
              icon="add-circle"
              iconColor={colors.primary}
              title="Waiver Pickup"
              description="Team Beta added Tank Dell"
              time="5h ago"
            />
            <ActivityItem
              icon="trophy"
              iconColor={colors.warning}
              title="Week 10 Results"
              description="Team Gamma defeated Team Delta 142-128"
              time="1d ago"
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ActivityItem({
  icon,
  iconColor,
  title,
  description,
  time,
}: {
  icon: string;
  iconColor: string;
  title: string;
  description: string;
  time: string;
}) {
  return (
    <View style={{
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    }}>
      <View style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: iconColor + "20",
        justifyContent: "center",
        alignItems: "center",
        marginRight: spacing.md,
      }}>
        <Ionicons name={icon as any} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{
          fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.medium,
          color: colors.text,
        }}>
          {title}
        </Text>
        <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
          {description}
        </Text>
      </View>
      <Text style={{ fontSize: typography.fontSize.xs, color: colors.textTertiary }}>
        {time}
      </Text>
    </View>
  );
}
