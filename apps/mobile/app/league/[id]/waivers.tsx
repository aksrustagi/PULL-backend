/**
 * Waivers Screen
 */

import { View, Text, ScrollView, Pressable, RefreshControl, TextInput, Alert } from "react-native";
import { useState, useCallback } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../../services/api";
import { colors, spacing, borderRadius, typography } from "../../../constants/theme";
import type { Player, WaiverClaim } from "../../../types";

export default function WaiversScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"available" | "claims">("available");
  const [searchQuery, setSearchQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState("ALL");

  const queryClient = useQueryClient();

  const { data: playersData, refetch: refetchPlayers } = useQuery({
    queryKey: ["league", id, "waivers", "available", positionFilter, searchQuery],
    queryFn: () => api.getAvailablePlayers(id, {
      position: positionFilter === "ALL" ? undefined : positionFilter,
      search: searchQuery || undefined,
      status: "waiver",
    }),
  });

  const { data: claimsData, refetch: refetchClaims } = useQuery({
    queryKey: ["league", id, "waivers", "claims"],
    queryFn: () => api.getMyWaiverClaims(id),
  });

  const { data: rosterData } = useQuery({
    queryKey: ["league", id, "roster"],
    queryFn: () => api.getMyRoster(id),
  });

  const claimMutation = useMutation({
    mutationFn: ({ addPlayerId, dropPlayerId, faabBid }: {
      addPlayerId: string;
      dropPlayerId?: string;
      faabBid?: number;
    }) => api.submitWaiverClaim(id, addPlayerId, dropPlayerId, faabBid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["league", id, "waivers"] });
      Alert.alert("Success", "Waiver claim submitted!");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to submit claim");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (claimId: string) => api.cancelWaiverClaim(id, claimId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["league", id, "waivers", "claims"] });
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchPlayers(), refetchClaims()]);
    setRefreshing(false);
  }, [refetchPlayers, refetchClaims]);

  const availablePlayers = (playersData?.data || []) as Player[];
  const myClaims = (claimsData?.data || []) as WaiverClaim[];
  const myRoster = rosterData?.data;

  const handleAddPlayer = (player: Player) => {
    // Check if roster is full
    const rosterSize = myRoster?.players?.length || 0;
    const maxRosterSize = myRoster?.maxSize || 15;

    if (rosterSize >= maxRosterSize) {
      // Need to select a player to drop
      router.push({
        pathname: `/league/${id}/waivers/claim`,
        params: { addPlayerId: player.id, addPlayerName: player.name },
      });
    } else {
      // Can add directly
      Alert.alert(
        "Add Player",
        `Add ${player.name} to your team?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Add",
            onPress: () => claimMutation.mutate({ addPlayerId: player.id }),
          },
        ]
      );
    }
  };

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
          Waivers
        </Text>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable
          onPress={() => setActiveTab("available")}
          style={{
            flex: 1,
            paddingVertical: spacing.md,
            alignItems: "center",
            borderBottomWidth: 2,
            borderBottomColor: activeTab === "available" ? colors.primary : "transparent",
          }}
        >
          <Text style={{
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.semibold,
            color: activeTab === "available" ? colors.primary : colors.textSecondary,
          }}>
            Available
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("claims")}
          style={{
            flex: 1,
            paddingVertical: spacing.md,
            alignItems: "center",
            borderBottomWidth: 2,
            borderBottomColor: activeTab === "claims" ? colors.primary : "transparent",
          }}
        >
          <Text style={{
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.semibold,
            color: activeTab === "claims" ? colors.primary : colors.textSecondary,
          }}>
            My Claims ({myClaims.length})
          </Text>
        </Pressable>
      </View>

      {activeTab === "available" && (
        <>
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
            {["ALL", "QB", "RB", "WR", "TE", "K", "DEF"].map((pos) => (
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
        </>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.md }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {activeTab === "available" ? (
          availablePlayers.length === 0 ? (
            <View style={{
              backgroundColor: colors.card,
              borderRadius: borderRadius.lg,
              padding: spacing.xxl,
              alignItems: "center",
            }}>
              <Ionicons name="person-add-outline" size={64} color={colors.textSecondary} />
              <Text style={{
                fontSize: typography.fontSize.lg,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text,
                marginTop: spacing.lg,
              }}>
                No Players Found
              </Text>
              <Text style={{
                fontSize: typography.fontSize.sm,
                color: colors.textSecondary,
                textAlign: "center",
                marginTop: spacing.sm,
              }}>
                Try adjusting your search or filters.
              </Text>
            </View>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {availablePlayers.map((player) => (
                <AvailablePlayerCard
                  key={player.id}
                  player={player}
                  onAdd={() => handleAddPlayer(player)}
                />
              ))}
            </View>
          )
        ) : (
          myClaims.length === 0 ? (
            <View style={{
              backgroundColor: colors.card,
              borderRadius: borderRadius.lg,
              padding: spacing.xxl,
              alignItems: "center",
            }}>
              <Ionicons name="list-outline" size={64} color={colors.textSecondary} />
              <Text style={{
                fontSize: typography.fontSize.lg,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text,
                marginTop: spacing.lg,
              }}>
                No Pending Claims
              </Text>
              <Text style={{
                fontSize: typography.fontSize.sm,
                color: colors.textSecondary,
                textAlign: "center",
                marginTop: spacing.sm,
              }}>
                Your waiver claims will appear here.
              </Text>
            </View>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {myClaims.map((claim, index) => (
                <ClaimCard
                  key={claim.id}
                  claim={claim}
                  priority={index + 1}
                  onCancel={() => cancelMutation.mutate(claim.id)}
                />
              ))}
            </View>
          )
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function AvailablePlayerCard({
  player,
  onAdd,
}: {
  player: Player;
  onAdd: () => void;
}) {
  return (
    <Pressable
      onPress={() => router.push(`/player/${player.id}`)}
      style={{
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      {/* Position Badge */}
      <View style={{
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: colors.cardElevated,
        justifyContent: "center",
        alignItems: "center",
        marginRight: spacing.md,
      }}>
        <Text style={{
          fontSize: typography.fontSize.xs,
          fontWeight: typography.fontWeight.bold,
          color: colors.primary,
        }}>
          {player.position}
        </Text>
      </View>

      {/* Player Info */}
      <View style={{ flex: 1 }}>
        <Text style={{
          fontSize: typography.fontSize.md,
          fontWeight: typography.fontWeight.semibold,
          color: colors.text,
        }}>
          {player.name}
        </Text>
        <Text style={{
          fontSize: typography.fontSize.xs,
          color: colors.textSecondary,
        }}>
          {player.team} • {player.ownership?.toFixed(0) || 0}% owned
        </Text>
      </View>

      {/* Stats */}
      <View style={{ alignItems: "flex-end", marginRight: spacing.md }}>
        <Text style={{
          fontSize: typography.fontSize.lg,
          fontWeight: typography.fontWeight.bold,
          color: colors.text,
        }}>
          {player.projectedPoints?.toFixed(1) || "0.0"}
        </Text>
        <Text style={{
          fontSize: typography.fontSize.xs,
          color: colors.textSecondary,
        }}>
          proj pts
        </Text>
      </View>

      {/* Add Button */}
      <Pressable
        onPress={onAdd}
        style={{
          backgroundColor: colors.primary,
          width: 36,
          height: 36,
          borderRadius: 18,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Ionicons name="add" size={20} color={colors.textInverse} />
      </Pressable>
    </Pressable>
  );
}

function ClaimCard({
  claim,
  priority,
  onCancel,
}: {
  claim: WaiverClaim;
  priority: number;
  onCancel: () => void;
}) {
  return (
    <View style={{
      backgroundColor: colors.card,
      borderRadius: borderRadius.lg,
      overflow: "hidden",
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.md }}>
        {/* Priority */}
        <View style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: colors.primary,
          justifyContent: "center",
          alignItems: "center",
          marginRight: spacing.md,
        }}>
          <Text style={{
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.bold,
            color: colors.textInverse,
          }}>
            {priority}
          </Text>
        </View>

        {/* Claim Details */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{
              fontSize: typography.fontSize.sm,
              color: colors.primary,
              fontWeight: typography.fontWeight.semibold,
            }}>
              +{claim.addPlayerName}
            </Text>
          </View>
          {claim.dropPlayerName && (
            <Text style={{
              fontSize: typography.fontSize.sm,
              color: colors.negative,
            }}>
              -{claim.dropPlayerName}
            </Text>
          )}
        </View>

        {/* FAAB Bid (if applicable) */}
        {claim.faabBid !== undefined && (
          <View style={{ marginRight: spacing.md }}>
            <Text style={{
              fontSize: typography.fontSize.lg,
              fontWeight: typography.fontWeight.bold,
              color: colors.warning,
            }}>
              ${claim.faabBid}
            </Text>
            <Text style={{
              fontSize: typography.fontSize.xs,
              color: colors.textSecondary,
            }}>
              FAAB
            </Text>
          </View>
        )}

        {/* Cancel */}
        <Pressable
          onPress={onCancel}
          style={{
            padding: spacing.sm,
          }}
        >
          <Ionicons name="close-circle" size={24} color={colors.negative} />
        </Pressable>
      </View>
    </View>
  );
}
