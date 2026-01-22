/**
 * Leagues Screen
 */

import { View, Text, ScrollView, Pressable, RefreshControl, TextInput } from "react-native";
import { useState, useCallback } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../services/api";
import { colors, spacing, borderRadius, typography } from "../../constants/theme";
import type { League } from "../../types";

export default function LeaguesScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [showJoinModal, setShowJoinModal] = useState(false);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["leagues"],
    queryFn: () => api.getLeagues(),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const leagues = data?.data || [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Header */}
        <View style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: spacing.xl,
        }}>
          <Text style={{
            fontSize: typography.fontSize.xxl,
            fontWeight: typography.fontWeight.bold,
            color: colors.text,
          }}>
            My Leagues
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Pressable
              onPress={() => setShowJoinModal(true)}
              style={{
                backgroundColor: colors.card,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                borderRadius: borderRadius.md,
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.xs,
              }}
            >
              <Ionicons name="enter" size={18} color={colors.accent} />
              <Text style={{ color: colors.accent, fontWeight: typography.fontWeight.medium }}>Join</Text>
            </Pressable>
            <Pressable
              onPress={() => {}}
              style={{
                backgroundColor: colors.primary,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                borderRadius: borderRadius.md,
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.xs,
              }}
            >
              <Ionicons name="add" size={18} color={colors.textInverse} />
              <Text style={{ color: colors.textInverse, fontWeight: typography.fontWeight.medium }}>Create</Text>
            </Pressable>
          </View>
        </View>

        {/* Join League Input */}
        {showJoinModal && (
          <View style={{
            backgroundColor: colors.card,
            borderRadius: borderRadius.lg,
            padding: spacing.lg,
            marginBottom: spacing.xl,
          }}>
            <Text style={{
              fontSize: typography.fontSize.md,
              fontWeight: typography.fontWeight.semibold,
              color: colors.text,
              marginBottom: spacing.md,
            }}>
              Join a League
            </Text>
            <TextInput
              value={joinCode}
              onChangeText={setJoinCode}
              placeholder="Enter invite code"
              placeholderTextColor={colors.textSecondary}
              style={{
                backgroundColor: colors.cardElevated,
                borderRadius: borderRadius.md,
                padding: spacing.md,
                color: colors.text,
                fontSize: typography.fontSize.md,
                marginBottom: spacing.md,
              }}
              autoCapitalize="characters"
            />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Pressable
                onPress={() => setShowJoinModal(false)}
                style={{
                  flex: 1,
                  backgroundColor: colors.cardElevated,
                  padding: spacing.md,
                  borderRadius: borderRadius.md,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: colors.text }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {}}
                style={{
                  flex: 1,
                  backgroundColor: colors.primary,
                  padding: spacing.md,
                  borderRadius: borderRadius.md,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: colors.textInverse, fontWeight: typography.fontWeight.semibold }}>Join</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Leagues List */}
        {leagues.length === 0 ? (
          <View style={{
            backgroundColor: colors.card,
            borderRadius: borderRadius.lg,
            padding: spacing.xxl,
            alignItems: "center",
          }}>
            <Ionicons name="trophy-outline" size={64} color={colors.textSecondary} />
            <Text style={{
              fontSize: typography.fontSize.lg,
              fontWeight: typography.fontWeight.semibold,
              color: colors.text,
              marginTop: spacing.lg,
            }}>
              No Leagues Yet
            </Text>
            <Text style={{
              fontSize: typography.fontSize.sm,
              color: colors.textSecondary,
              textAlign: "center",
              marginTop: spacing.sm,
            }}>
              Create a new league or join an existing one with an invite code.
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            {leagues.map((league: League) => (
              <LeagueCard key={league.id} league={league} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function LeagueCard({ league }: { league: League }) {
  const statusColor = {
    pre_draft: colors.warning,
    drafting: colors.accent,
    active: colors.primary,
    playoffs: colors.accent,
    complete: colors.textSecondary,
  }[league.status] || colors.textSecondary;

  return (
    <Pressable
      onPress={() => router.push(`/league/${league.id}`)}
      style={{
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.lg,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{
          width: 56,
          height: 56,
          borderRadius: borderRadius.md,
          backgroundColor: colors.cardElevated,
          justifyContent: "center",
          alignItems: "center",
          marginRight: spacing.md,
        }}>
          <Ionicons name="trophy" size={28} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
          }}>
            {league.name}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.xs }}>
            <View style={{
              backgroundColor: statusColor,
              paddingHorizontal: spacing.sm,
              paddingVertical: 2,
              borderRadius: borderRadius.sm,
              marginRight: spacing.sm,
            }}>
              <Text style={{
                fontSize: typography.fontSize.xs,
                fontWeight: typography.fontWeight.medium,
                color: colors.textInverse,
                textTransform: "uppercase",
              }}>
                {league.status.replace("_", " ")}
              </Text>
            </View>
            <Text style={{
              fontSize: typography.fontSize.sm,
              color: colors.textSecondary,
            }}>
              {league.currentTeams}/{league.maxTeams} teams
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={24} color={colors.textSecondary} />
      </View>

      <View style={{
        flexDirection: "row",
        marginTop: spacing.md,
        paddingTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>Week</Text>
          <Text style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.text }}>
            {league.currentWeek}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>Format</Text>
          <Text style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.text }}>
            {league.scoringType.toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>Season</Text>
          <Text style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.text }}>
            {league.season}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
