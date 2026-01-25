/**
 * Roster Management Screen
 */

import { View, Text, ScrollView, Pressable, RefreshControl, Alert } from "react-native";
import { useState, useCallback } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../../services/api";
import { colors, spacing, borderRadius, typography } from "../../../constants/theme";
import type { Player, Roster } from "../../../types";

const POSITION_ORDER = ["QB", "RB", "WR", "TE", "FLEX", "K", "DEF", "BN", "IR"];

export default function RosterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [swapTarget, setSwapTarget] = useState<Player | null>(null);

  const queryClient = useQueryClient();

  const { data: rosterData, refetch } = useQuery({
    queryKey: ["league", id, "roster"],
    queryFn: () => api.getMyRoster(id),
  });

  const swapMutation = useMutation({
    mutationFn: ({ player1Id, player2Id }: { player1Id: string; player2Id: string }) =>
      api.swapPlayers(id, player1Id, player2Id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["league", id, "roster"] });
      setSelectedPlayer(null);
      setSwapTarget(null);
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to swap players");
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const roster = rosterData?.data as Roster | undefined;

  const handlePlayerPress = (player: Player) => {
    if (!selectedPlayer) {
      setSelectedPlayer(player);
    } else if (selectedPlayer.id === player.id) {
      setSelectedPlayer(null);
    } else {
      // Try to swap
      setSwapTarget(player);
      Alert.alert(
        "Swap Players",
        `Move ${selectedPlayer.name} to ${player.rosterSlot} and ${player.name} to ${selectedPlayer.rosterSlot}?`,
        [
          { text: "Cancel", style: "cancel", onPress: () => setSwapTarget(null) },
          {
            text: "Swap",
            onPress: () => swapMutation.mutate({
              player1Id: selectedPlayer.id,
              player2Id: player.id,
            }),
          },
        ]
      );
    }
  };

  // Group players by slot
  const playersBySlot = new Map<string, Player[]>();
  roster?.players?.forEach((player) => {
    const slot = player.rosterSlot || "BN";
    if (!playersBySlot.has(slot)) {
      playersBySlot.set(slot, []);
    }
    playersBySlot.get(slot)!.push(player);
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
          My Roster
        </Text>
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: colors.primary,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
            borderRadius: borderRadius.md,
          }}
        >
          <Text style={{ color: colors.textInverse, fontWeight: typography.fontWeight.medium }}>
            Auto-Set
          </Text>
        </Pressable>
      </View>

      {/* Instructions */}
      {selectedPlayer && (
        <View style={{
          backgroundColor: colors.primary + "20",
          padding: spacing.md,
          flexDirection: "row",
          alignItems: "center",
        }}>
          <Ionicons name="information-circle" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, marginLeft: spacing.sm, flex: 1 }}>
            Tap another player to swap with {selectedPlayer.name}
          </Text>
          <Pressable onPress={() => setSelectedPlayer(null)}>
            <Text style={{ color: colors.primary, fontWeight: typography.fontWeight.semibold }}>
              Cancel
            </Text>
          </Pressable>
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Team Score Projection */}
        <View style={{
          backgroundColor: colors.card,
          margin: spacing.lg,
          padding: spacing.lg,
          borderRadius: borderRadius.lg,
        }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View>
              <Text style={{ fontSize: typography.fontSize.sm, color: colors.textSecondary }}>
                Projected Score
              </Text>
              <Text style={{
                fontSize: typography.fontSize.xxxl,
                fontWeight: typography.fontWeight.bold,
                color: colors.primary,
              }}>
                {roster?.projectedScore?.toFixed(1) || "0.0"}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontSize: typography.fontSize.sm, color: colors.textSecondary }}>
                Current Score
              </Text>
              <Text style={{
                fontSize: typography.fontSize.xxxl,
                fontWeight: typography.fontWeight.bold,
                color: colors.text,
              }}>
                {roster?.currentScore?.toFixed(1) || "0.0"}
              </Text>
            </View>
          </View>
        </View>

        {/* Starters */}
        <View style={{ paddingHorizontal: spacing.lg }}>
          <Text style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
            marginBottom: spacing.md,
          }}>
            Starters
          </Text>
        </View>

        {POSITION_ORDER.filter(slot => slot !== "BN" && slot !== "IR").map((slot) => {
          const players = playersBySlot.get(slot) || [];
          return players.length > 0 ? (
            players.map((player) => (
              <PlayerRow
                key={player.id}
                player={player}
                slot={slot}
                isSelected={selectedPlayer?.id === player.id}
                onPress={() => handlePlayerPress(player)}
              />
            ))
          ) : (
            <EmptySlot key={slot} slot={slot} />
          );
        })}

        {/* Bench */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.xl }}>
          <Text style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
            marginBottom: spacing.md,
          }}>
            Bench
          </Text>
        </View>

        {(playersBySlot.get("BN") || []).map((player) => (
          <PlayerRow
            key={player.id}
            player={player}
            slot="BN"
            isSelected={selectedPlayer?.id === player.id}
            onPress={() => handlePlayerPress(player)}
          />
        ))}

        {/* IR */}
        {(playersBySlot.get("IR") || []).length > 0 && (
          <>
            <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.xl }}>
              <Text style={{
                fontSize: typography.fontSize.lg,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text,
                marginBottom: spacing.md,
              }}>
                Injured Reserve
              </Text>
            </View>
            {(playersBySlot.get("IR") || []).map((player) => (
              <PlayerRow
                key={player.id}
                player={player}
                slot="IR"
                isSelected={selectedPlayer?.id === player.id}
                onPress={() => handlePlayerPress(player)}
              />
            ))}
          </>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function PlayerRow({
  player,
  slot,
  isSelected,
  onPress,
}: {
  player: Player;
  slot: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  const statusColor = {
    active: colors.primary,
    questionable: colors.warning,
    out: colors.negative,
    injured: colors.negative,
    bye: colors.textSecondary,
  }[player.status || "active"];

  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        backgroundColor: isSelected ? colors.primary + "20" : colors.background,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      {/* Position Slot */}
      <View style={{
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: colors.card,
        justifyContent: "center",
        alignItems: "center",
        marginRight: spacing.md,
      }}>
        <Text style={{
          fontSize: typography.fontSize.xs,
          fontWeight: typography.fontWeight.bold,
          color: colors.textSecondary,
        }}>
          {slot}
        </Text>
      </View>

      {/* Player Info */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{
            fontSize: typography.fontSize.md,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
          }}>
            {player.name}
          </Text>
          {player.status && player.status !== "active" && (
            <View style={{
              backgroundColor: statusColor + "20",
              paddingHorizontal: spacing.xs,
              paddingVertical: 2,
              borderRadius: 4,
              marginLeft: spacing.xs,
            }}>
              <Text style={{
                fontSize: 10,
                fontWeight: typography.fontWeight.bold,
                color: statusColor,
              }}>
                {player.status.toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <Text style={{
          fontSize: typography.fontSize.xs,
          color: colors.textSecondary,
        }}>
          {player.team} - {player.position} • {player.opponent || "BYE"}
        </Text>
      </View>

      {/* Points */}
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{
          fontSize: typography.fontSize.lg,
          fontWeight: typography.fontWeight.bold,
          color: colors.text,
        }}>
          {(player.points || 0).toFixed(1)}
        </Text>
        <Text style={{
          fontSize: typography.fontSize.xs,
          color: colors.textSecondary,
        }}>
          proj {(player.projectedPoints || 0).toFixed(1)}
        </Text>
      </View>
    </Pressable>
  );
}

function EmptySlot({ slot }: { slot: string }) {
  return (
    <View style={{
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    }}>
      <View style={{
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: colors.card,
        justifyContent: "center",
        alignItems: "center",
        marginRight: spacing.md,
      }}>
        <Text style={{
          fontSize: typography.fontSize.xs,
          fontWeight: typography.fontWeight.bold,
          color: colors.textSecondary,
        }}>
          {slot}
        </Text>
      </View>
      <Text style={{
        fontSize: typography.fontSize.sm,
        color: colors.textTertiary,
        fontStyle: "italic",
      }}>
        Empty slot
      </Text>
    </View>
  );
}
