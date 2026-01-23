/**
 * Keeper Selection Screen
 * Interface for selecting keeper players before draft
 */

import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../../../services/api";
import { colors, spacing, borderRadius, typography } from "../../../../constants/theme";

interface KeeperEligiblePlayer {
  id: string;
  name: string;
  position: string;
  team: string;
  lastSeasonPoints: number;
  keeperCost: number; // Draft round or auction dollars
  originalCost: number;
  yearsKept: number;
  maxYears: number;
  projectedPoints: number;
  valueRating: number; // 1-10 how good the value is
}

export default function KeeperDraftScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [selectedKeepers, setSelectedKeepers] = useState<Set<string>>(new Set());

  const { data } = useQuery({
    queryKey: ["keeper-eligible", id],
    queryFn: () => api.getKeeperEligible(id),
  });

  const submitMutation = useMutation({
    mutationFn: (playerIds: string[]) => api.submitKeepers(id, playerIds),
    onSuccess: () => {
      Alert.alert("Keepers Submitted", "Your keeper selections have been locked in.");
      router.back();
    },
  });

  const maxKeepers = data?.data?.maxKeepers || 3;
  const deadline = data?.data?.deadline || "2025-08-20T23:59:00Z";
  const leagueSettings = data?.data?.settings || {
    type: "auction", // "snake" | "auction"
    costIncrease: 5, // $ increase per year kept
    maxYears: 3,
  };

  const eligiblePlayers: KeeperEligiblePlayer[] = data?.data?.players || [
    { id: "k1", name: "Justin Jefferson", position: "WR", team: "MIN", lastSeasonPoints: 298.5, keeperCost: 52, originalCost: 47, yearsKept: 1, maxYears: 3, projectedPoints: 310, valueRating: 9 },
    { id: "k2", name: "Austin Ekeler", position: "RB", team: "WSH", lastSeasonPoints: 245.2, keeperCost: 38, originalCost: 33, yearsKept: 1, maxYears: 3, projectedPoints: 220, valueRating: 6 },
    { id: "k3", name: "Puka Nacua", position: "WR", team: "LAR", lastSeasonPoints: 267.8, keeperCost: 8, originalCost: 3, yearsKept: 1, maxYears: 3, projectedPoints: 280, valueRating: 10 },
    { id: "k4", name: "Sam LaPorta", position: "TE", team: "DET", lastSeasonPoints: 198.4, keeperCost: 12, originalCost: 7, yearsKept: 1, maxYears: 3, projectedPoints: 210, valueRating: 8 },
    { id: "k5", name: "C.J. Stroud", position: "QB", team: "HOU", lastSeasonPoints: 312.6, keeperCost: 15, originalCost: 10, yearsKept: 1, maxYears: 3, projectedPoints: 320, valueRating: 9 },
    { id: "k6", name: "Derrick Henry", position: "RB", team: "BAL", lastSeasonPoints: 225.8, keeperCost: 42, originalCost: 37, yearsKept: 2, maxYears: 3, projectedPoints: 200, valueRating: 4 },
  ];

  const toggleKeeper = (playerId: string) => {
    const next = new Set(selectedKeepers);
    if (next.has(playerId)) {
      next.delete(playerId);
    } else if (next.size < maxKeepers) {
      next.add(playerId);
    }
    setSelectedKeepers(next);
  };

  const totalKeeperCost = eligiblePlayers
    .filter(p => selectedKeepers.has(p.id))
    .reduce((sum, p) => sum + p.keeperCost, 0);

  const getValueColor = (rating: number): string => {
    if (rating >= 8) return colors.primary;
    if (rating >= 6) return colors.warning;
    return colors.negative;
  };

  const getDeadlineText = (): string => {
    const diff = new Date(deadline).getTime() - Date.now();
    if (diff < 0) return "Deadline passed";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h remaining`;
    return `${hours}h remaining`;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: spacing.md }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.text }}>Select Keepers</Text>
          <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>{getDeadlineText()}</Text>
        </View>
      </View>

      {/* Selection Summary */}
      <View style={{ flexDirection: "row", padding: spacing.md, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>Selected</Text>
          <Text style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: selectedKeepers.size === maxKeepers ? colors.primary : colors.text }}>
            {selectedKeepers.size}/{maxKeepers}
          </Text>
        </View>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>Keeper Cost</Text>
          <Text style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: colors.text }}>${totalKeeperCost}</Text>
        </View>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>Draft Budget</Text>
          <Text style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: colors.primary }}>${200 - totalKeeperCost}</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}>
        {/* Info Banner */}
        <View style={{ backgroundColor: colors.primary + "15", borderRadius: borderRadius.md, padding: spacing.md, flexDirection: "row", alignItems: "center" }}>
          <Ionicons name="information-circle" size={20} color={colors.primary} style={{ marginRight: spacing.sm }} />
          <Text style={{ flex: 1, fontSize: typography.fontSize.xs, color: colors.text }}>
            Keeper cost increases by ${leagueSettings.costIncrease} each year. Players can be kept for a maximum of {leagueSettings.maxYears} years.
          </Text>
        </View>

        {/* Player Cards */}
        {eligiblePlayers.map((player) => {
          const isSelected = selectedKeepers.has(player.id);
          const isDisabled = !isSelected && selectedKeepers.size >= maxKeepers;
          const atMaxYears = player.yearsKept >= player.maxYears;

          return (
            <Pressable
              key={player.id}
              onPress={() => !atMaxYears && toggleKeeper(player.id)}
              disabled={isDisabled || atMaxYears}
              style={{
                backgroundColor: isSelected ? colors.primary + "10" : colors.card,
                borderRadius: borderRadius.lg,
                padding: spacing.lg,
                borderWidth: isSelected ? 2 : 1,
                borderColor: isSelected ? colors.primary : colors.border,
                opacity: isDisabled || atMaxYears ? 0.5 : 1,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {/* Checkbox */}
                <View style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: isSelected ? colors.primary : colors.textSecondary,
                  backgroundColor: isSelected ? colors.primary : "transparent",
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: spacing.md,
                }}>
                  {isSelected && <Ionicons name="checkmark" size={14} color={colors.textInverse} />}
                </View>

                {/* Player Info */}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.bold, color: colors.text }}>{player.name}</Text>
                  <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>{player.team} - {player.position}</Text>
                </View>

                {/* Value Rating */}
                <View style={{ alignItems: "center", marginLeft: spacing.md }}>
                  <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>Value</Text>
                  <View style={{
                    backgroundColor: getValueColor(player.valueRating) + "20",
                    borderRadius: borderRadius.sm,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 2,
                  }}>
                    <Text style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold, color: getValueColor(player.valueRating) }}>
                      {player.valueRating}/10
                    </Text>
                  </View>
                </View>
              </View>

              {/* Stats Row */}
              <View style={{ flexDirection: "row", marginTop: spacing.md, gap: spacing.lg }}>
                <View>
                  <Text style={{ fontSize: 10, color: colors.textSecondary }}>Keeper Cost</Text>
                  <Text style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold, color: colors.text }}>${player.keeperCost}</Text>
                </View>
                <View>
                  <Text style={{ fontSize: 10, color: colors.textSecondary }}>Original</Text>
                  <Text style={{ fontSize: typography.fontSize.sm, color: colors.textSecondary }}>${player.originalCost}</Text>
                </View>
                <View>
                  <Text style={{ fontSize: 10, color: colors.textSecondary }}>Last Season</Text>
                  <Text style={{ fontSize: typography.fontSize.sm, color: colors.text }}>{player.lastSeasonPoints.toFixed(1)} pts</Text>
                </View>
                <View>
                  <Text style={{ fontSize: 10, color: colors.textSecondary }}>Projected</Text>
                  <Text style={{ fontSize: typography.fontSize.sm, color: colors.primary }}>{player.projectedPoints} pts</Text>
                </View>
                <View>
                  <Text style={{ fontSize: 10, color: colors.textSecondary }}>Years Kept</Text>
                  <Text style={{ fontSize: typography.fontSize.sm, color: player.yearsKept >= player.maxYears - 1 ? colors.negative : colors.text }}>
                    {player.yearsKept}/{player.maxYears}
                  </Text>
                </View>
              </View>

              {atMaxYears && (
                <Text style={{ fontSize: typography.fontSize.xs, color: colors.negative, marginTop: spacing.sm }}>
                  Cannot keep - max years reached
                </Text>
              )}
            </Pressable>
          );
        })}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Submit Button */}
      <View style={{ padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background }}>
        <Pressable
          onPress={() => {
            Alert.alert(
              "Confirm Keepers",
              `Lock in ${selectedKeepers.size} keeper${selectedKeepers.size !== 1 ? "s" : ""} for $${totalKeeperCost}?`,
              [
                { text: "Cancel", style: "cancel" },
                { text: "Confirm", onPress: () => submitMutation.mutate(Array.from(selectedKeepers)) },
              ]
            );
          }}
          disabled={selectedKeepers.size === 0}
          style={{
            backgroundColor: selectedKeepers.size > 0 ? colors.primary : colors.cardElevated,
            borderRadius: borderRadius.lg,
            padding: spacing.lg,
            alignItems: "center",
          }}
        >
          <Text style={{ color: selectedKeepers.size > 0 ? colors.textInverse : colors.textSecondary, fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.md }}>
            {selectedKeepers.size > 0
              ? `Submit ${selectedKeepers.size} Keeper${selectedKeepers.size !== 1 ? "s" : ""} ($${totalKeeperCost})`
              : "Select Keepers to Continue"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
