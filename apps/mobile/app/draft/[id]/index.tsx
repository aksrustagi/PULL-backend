/**
 * Draft Room Screen
 */

import { View, Text, ScrollView, Pressable, TextInput, FlatList } from "react-native";
import { useState, useEffect, useRef } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../../services/api";
import { colors, spacing, borderRadius, typography } from "../../../constants/theme";
import type { Draft, Player, DraftPick } from "../../../types";

const POSITION_FILTERS = ["ALL", "QB", "RB", "WR", "TE", "K", "DEF"];

export default function DraftRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  const queryClient = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);

  const { data: draftData, refetch } = useQuery({
    queryKey: ["draft", id],
    queryFn: () => api.getDraft(id),
    refetchInterval: 5000, // Poll every 5 seconds during draft
  });

  const { data: playersData } = useQuery({
    queryKey: ["draft", id, "available", positionFilter, searchQuery],
    queryFn: () => api.getAvailablePlayers(id, {
      position: positionFilter === "ALL" ? undefined : positionFilter,
      search: searchQuery || undefined,
    }),
  });

  const draftMutation = useMutation({
    mutationFn: (playerId: string) => api.makeDraftPick(id, playerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["draft", id] });
      setSelectedPlayer(null);
    },
  });

  const draft = draftData?.data as Draft | undefined;
  const availablePlayers = (playersData?.data || []) as Player[];

  const isMyPick = draft?.currentTeamId === draft?.myTeamId;
  const timeRemaining = draft?.pickTimeRemaining || 0;

  // Auto-scroll to show current pick
  useEffect(() => {
    if (draft?.currentPick) {
      // Scroll logic if needed
    }
  }, [draft?.currentPick]);

  if (!draft) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: colors.textSecondary }}>Loading draft...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      {/* Header */}
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        padding: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: spacing.md }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.bold,
            color: colors.text,
          }}>
            {draft.leagueName} Draft
          </Text>
          <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
            Round {draft.currentRound} • Pick {draft.currentPick}
          </Text>
        </View>

        {/* Timer */}
        <View style={{
          backgroundColor: timeRemaining < 30 ? colors.negative : colors.card,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          borderRadius: borderRadius.md,
        }}>
          <Text style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.bold,
            color: timeRemaining < 30 ? colors.textInverse : colors.text,
          }}>
            {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, "0")}
          </Text>
        </View>
      </View>

      {/* On the Clock Banner */}
      <View style={{
        backgroundColor: isMyPick ? colors.primary : colors.card,
        padding: spacing.md,
        alignItems: "center",
      }}>
        <Text style={{
          fontSize: typography.fontSize.sm,
          color: isMyPick ? colors.textInverse : colors.textSecondary,
        }}>
          On the Clock
        </Text>
        <Text style={{
          fontSize: typography.fontSize.lg,
          fontWeight: typography.fontWeight.bold,
          color: isMyPick ? colors.textInverse : colors.text,
        }}>
          {isMyPick ? "YOUR PICK!" : draft.currentTeamName}
        </Text>
      </View>

      <View style={{ flex: 1, flexDirection: "row" }}>
        {/* Main Content - Players List */}
        <View style={{ flex: 2 }}>
          {/* Search */}
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.card,
            margin: spacing.md,
            paddingHorizontal: spacing.md,
            borderRadius: borderRadius.md,
          }}>
            <Ionicons name="search" size={20} color={colors.textSecondary} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search players..."
              placeholderTextColor={colors.textTertiary}
              style={{
                flex: 1,
                padding: spacing.md,
                color: colors.text,
                fontSize: typography.fontSize.md,
              }}
            />
          </View>

          {/* Position Filters */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.xs }}
          >
            {POSITION_FILTERS.map((pos) => (
              <Pressable
                key={pos}
                onPress={() => setPositionFilter(pos)}
                style={{
                  backgroundColor: positionFilter === pos ? colors.primary : colors.card,
                  paddingVertical: spacing.xs,
                  paddingHorizontal: spacing.md,
                  borderRadius: borderRadius.full,
                }}
              >
                <Text style={{
                  color: positionFilter === pos ? colors.textInverse : colors.text,
                  fontSize: typography.fontSize.sm,
                  fontWeight: typography.fontWeight.medium,
                }}>
                  {pos}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Players List */}
          <FlatList
            data={availablePlayers}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: spacing.md }}
            renderItem={({ item: player }) => (
              <Pressable
                onPress={() => setSelectedPlayer(player)}
                style={{
                  backgroundColor: selectedPlayer?.id === player.id ? colors.primary + "20" : colors.card,
                  borderRadius: borderRadius.md,
                  padding: spacing.md,
                  marginBottom: spacing.sm,
                  flexDirection: "row",
                  alignItems: "center",
                  borderWidth: selectedPlayer?.id === player.id ? 2 : 0,
                  borderColor: colors.primary,
                }}
              >
                {/* Rank */}
                <View style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: colors.cardElevated,
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: spacing.sm,
                }}>
                  <Text style={{
                    fontSize: typography.fontSize.xs,
                    fontWeight: typography.fontWeight.bold,
                    color: colors.textSecondary,
                  }}>
                    {player.adp}
                  </Text>
                </View>

                {/* Player Info */}
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: typography.fontSize.sm,
                    fontWeight: typography.fontWeight.semibold,
                    color: colors.text,
                  }}>
                    {player.name}
                  </Text>
                  <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                    {player.team} - {player.position}
                  </Text>
                </View>

                {/* Projected Points */}
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{
                    fontSize: typography.fontSize.md,
                    fontWeight: typography.fontWeight.bold,
                    color: colors.primary,
                  }}>
                    {player.projectedPoints?.toFixed(1)}
                  </Text>
                  <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                    proj pts
                  </Text>
                </View>
              </Pressable>
            )}
          />
        </View>

        {/* Sidebar - Draft Board */}
        <View style={{
          flex: 1,
          borderLeftWidth: 1,
          borderLeftColor: colors.border,
          backgroundColor: colors.card,
        }}>
          <Text style={{
            fontSize: typography.fontSize.md,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
            padding: spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}>
            Recent Picks
          </Text>
          <ScrollView ref={scrollRef}>
            {draft.picks?.slice(-10).reverse().map((pick: DraftPick) => (
              <View
                key={pick.id}
                style={{
                  padding: spacing.sm,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{
                    fontSize: typography.fontSize.xs,
                    color: colors.textSecondary,
                    width: 40,
                  }}>
                    {pick.round}.{pick.pickNumber}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      fontSize: typography.fontSize.sm,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.text,
                    }} numberOfLines={1}>
                      {pick.playerName}
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.textTertiary }}>
                      {pick.teamName}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Draft Button */}
      {isMyPick && selectedPlayer && (
        <View style={{
          padding: spacing.lg,
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}>
          <Pressable
            onPress={() => draftMutation.mutate(selectedPlayer.id)}
            disabled={draftMutation.isPending}
            style={{
              backgroundColor: draftMutation.isPending ? colors.textSecondary : colors.primary,
              borderRadius: borderRadius.lg,
              padding: spacing.lg,
              alignItems: "center",
            }}
          >
            <Text style={{
              color: colors.textInverse,
              fontSize: typography.fontSize.md,
              fontWeight: typography.fontWeight.bold,
            }}>
              {draftMutation.isPending ? "Drafting..." : `Draft ${selectedPlayer.name}`}
            </Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
