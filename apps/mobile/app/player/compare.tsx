/**
 * Player Comparison Screen
 */

import { View, Text, ScrollView, Pressable, TextInput } from "react-native";
import { useState } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../services/api";
import { colors, spacing, borderRadius, typography } from "../../constants/theme";

interface ComparePlayer {
  id: string;
  name: string;
  position: string;
  team: string;
  stats: {
    pprPoints: number;
    projectedPoints: number;
    gamesPlayed: number;
    avgPoints: number;
    floor: number;
    ceiling: number;
    consistency: number;
    targetShare?: number;
    rushShare?: number;
    redZoneTargets?: number;
  };
}

export default function PlayerCompareScreen() {
  const [player1Id, setPlayer1Id] = useState<string | null>(null);
  const [player2Id, setPlayer2Id] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectingSlot, setSelectingSlot] = useState<1 | 2 | null>(null);

  const { data: searchResults } = useQuery({
    queryKey: ["player-search", searchQuery],
    queryFn: () => api.searchPlayers(searchQuery),
    enabled: searchQuery.length >= 2,
  });

  const { data: player1Data } = useQuery({
    queryKey: ["player-compare", player1Id],
    queryFn: () => api.getPlayerComparison(player1Id!),
    enabled: !!player1Id,
  });

  const { data: player2Data } = useQuery({
    queryKey: ["player-compare", player2Id],
    queryFn: () => api.getPlayerComparison(player2Id!),
    enabled: !!player2Id,
  });

  const player1: ComparePlayer | null = player1Data?.data || (player1Id ? {
    id: "p1", name: "Player One", position: "RB", team: "KC",
    stats: { pprPoints: 245.8, projectedPoints: 260.0, gamesPlayed: 14, avgPoints: 17.6, floor: 8.2, ceiling: 32.4, consistency: 0.72, rushShare: 0.68, redZoneTargets: 12 },
  } : null);

  const player2: ComparePlayer | null = player2Data?.data || (player2Id ? {
    id: "p2", name: "Player Two", position: "RB", team: "SF",
    stats: { pprPoints: 238.2, projectedPoints: 245.0, gamesPlayed: 15, avgPoints: 15.9, floor: 10.5, ceiling: 28.1, consistency: 0.81, rushShare: 0.55, redZoneTargets: 15 },
  } : null);

  const comparisons = player1 && player2 ? [
    { label: "Total Points", p1: player1.stats.pprPoints, p2: player2.stats.pprPoints },
    { label: "Projected ROS", p1: player1.stats.projectedPoints, p2: player2.stats.projectedPoints },
    { label: "Avg PPG", p1: player1.stats.avgPoints, p2: player2.stats.avgPoints },
    { label: "Floor", p1: player1.stats.floor, p2: player2.stats.floor },
    { label: "Ceiling", p1: player1.stats.ceiling, p2: player2.stats.ceiling },
    { label: "Consistency", p1: player1.stats.consistency * 100, p2: player2.stats.consistency * 100, suffix: "%" },
    { label: "Games Played", p1: player1.stats.gamesPlayed, p2: player2.stats.gamesPlayed, int: true },
    { label: "Red Zone Targets", p1: player1.stats.redZoneTargets || 0, p2: player2.stats.redZoneTargets || 0, int: true },
  ] : [];

  const selectPlayer = (player: any) => {
    if (selectingSlot === 1) setPlayer1Id(player.id);
    else if (selectingSlot === 2) setPlayer2Id(player.id);
    setSelectingSlot(null);
    setSearchQuery("");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: spacing.md }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.text }}>Compare Players</Text>
      </View>

      {/* Player Selection */}
      {selectingSlot && (
        <View style={{ padding: spacing.md, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={`Search player ${selectingSlot}...`}
            placeholderTextColor={colors.textTertiary}
            autoFocus
            style={{ backgroundColor: colors.cardElevated, borderRadius: borderRadius.md, padding: spacing.md, color: colors.text }}
          />
          {(searchResults?.data || []).slice(0, 5).map((player: any) => (
            <Pressable key={player.id} onPress={() => selectPlayer(player)} style={{ padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.text }}>{player.name} - {player.position} ({player.team})</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setSelectingSlot(null)} style={{ padding: spacing.md, alignItems: "center" }}>
            <Text style={{ color: colors.negative }}>Cancel</Text>
          </Pressable>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg }}>
        {/* Player Headers */}
        <View style={{ flexDirection: "row", marginBottom: spacing.xl }}>
          <Pressable onPress={() => setSelectingSlot(1)} style={{ flex: 1, backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.lg, alignItems: "center", marginRight: spacing.sm }}>
            {player1 ? (
              <>
                <Text style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: colors.text }}>{player1.name}</Text>
                <Text style={{ color: colors.textSecondary }}>{player1.team} - {player1.position}</Text>
              </>
            ) : (
              <>
                <Ionicons name="add-circle" size={32} color={colors.primary} />
                <Text style={{ color: colors.primary, marginTop: spacing.sm }}>Select Player</Text>
              </>
            )}
          </Pressable>

          <View style={{ justifyContent: "center" }}>
            <Text style={{ color: colors.textSecondary, fontWeight: typography.fontWeight.bold }}>VS</Text>
          </View>

          <Pressable onPress={() => setSelectingSlot(2)} style={{ flex: 1, backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.lg, alignItems: "center", marginLeft: spacing.sm }}>
            {player2 ? (
              <>
                <Text style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: colors.text }}>{player2.name}</Text>
                <Text style={{ color: colors.textSecondary }}>{player2.team} - {player2.position}</Text>
              </>
            ) : (
              <>
                <Ionicons name="add-circle" size={32} color={colors.primary} />
                <Text style={{ color: colors.primary, marginTop: spacing.sm }}>Select Player</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Comparison Bars */}
        {comparisons.length > 0 && (
          <View style={{ gap: spacing.md }}>
            {comparisons.map((comp) => {
              const max = Math.max(comp.p1, comp.p2);
              const p1Width = max > 0 ? (comp.p1 / max) * 100 : 50;
              const p2Width = max > 0 ? (comp.p2 / max) * 100 : 50;
              const p1Wins = comp.p1 > comp.p2;

              return (
                <View key={comp.label} style={{ backgroundColor: colors.card, borderRadius: borderRadius.md, padding: spacing.md }}>
                  <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary, textAlign: "center", marginBottom: spacing.sm }}>{comp.label}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ width: 50, textAlign: "right", color: p1Wins ? colors.primary : colors.text, fontWeight: p1Wins ? typography.fontWeight.bold : typography.fontWeight.regular, fontSize: typography.fontSize.sm }}>
                      {comp.int ? comp.p1 : comp.p1.toFixed(1)}{comp.suffix || ""}
                    </Text>
                    <View style={{ flex: 1, flexDirection: "row", height: 8, marginHorizontal: spacing.sm, gap: 2 }}>
                      <View style={{ flex: p1Width, backgroundColor: p1Wins ? colors.primary : colors.textSecondary, borderRadius: 4, height: "100%" }} />
                      <View style={{ flex: p2Width, backgroundColor: !p1Wins ? colors.accent : colors.textSecondary, borderRadius: 4, height: "100%" }} />
                    </View>
                    <Text style={{ width: 50, color: !p1Wins ? colors.accent : colors.text, fontWeight: !p1Wins ? typography.fontWeight.bold : typography.fontWeight.regular, fontSize: typography.fontSize.sm }}>
                      {comp.int ? comp.p2 : comp.p2.toFixed(1)}{comp.suffix || ""}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {!player1 && !player2 && (
          <View style={{ alignItems: "center", paddingVertical: spacing.xxl }}>
            <Ionicons name="git-compare" size={64} color={colors.textSecondary} />
            <Text style={{ fontSize: typography.fontSize.lg, color: colors.text, marginTop: spacing.lg }}>Compare Two Players</Text>
            <Text style={{ color: colors.textSecondary, marginTop: spacing.sm, textAlign: "center" }}>Select two players above to see a detailed stat comparison</Text>
          </View>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}
