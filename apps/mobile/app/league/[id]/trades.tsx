/**
 * Trades Screen
 */

import { View, Text, ScrollView, Pressable, RefreshControl, Alert } from "react-native";
import { useState, useCallback } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../../services/api";
import { colors, spacing, borderRadius, typography } from "../../../constants/theme";
import type { Trade, Player } from "../../../types";

export default function TradesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");

  const queryClient = useQueryClient();

  const { data: tradesData, refetch } = useQuery({
    queryKey: ["league", id, "trades", activeTab],
    queryFn: () => api.getTrades(id, { status: activeTab === "pending" ? "pending" : "completed" }),
  });

  const respondMutation = useMutation({
    mutationFn: ({ tradeId, action }: { tradeId: string; action: "accept" | "reject" }) =>
      api.respondToTrade(id, tradeId, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["league", id, "trades"] });
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to respond to trade");
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const trades = (tradesData?.data || []) as Trade[];

  const handleAccept = (tradeId: string) => {
    Alert.alert(
      "Accept Trade",
      "Are you sure you want to accept this trade?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Accept",
          onPress: () => respondMutation.mutate({ tradeId, action: "accept" }),
        },
      ]
    );
  };

  const handleReject = (tradeId: string) => {
    Alert.alert(
      "Reject Trade",
      "Are you sure you want to reject this trade?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: () => respondMutation.mutate({ tradeId, action: "reject" }),
        },
      ]
    );
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
          Trades
        </Text>
        <Pressable
          onPress={() => router.push(`/league/${id}/trades/new`)}
          style={{
            backgroundColor: colors.primary,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
            borderRadius: borderRadius.md,
          }}
        >
          <Text style={{ color: colors.textInverse, fontWeight: typography.fontWeight.medium }}>
            Propose
          </Text>
        </Pressable>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable
          onPress={() => setActiveTab("pending")}
          style={{
            flex: 1,
            paddingVertical: spacing.md,
            alignItems: "center",
            borderBottomWidth: 2,
            borderBottomColor: activeTab === "pending" ? colors.primary : "transparent",
          }}
        >
          <Text style={{
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.semibold,
            color: activeTab === "pending" ? colors.primary : colors.textSecondary,
          }}>
            Pending
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("history")}
          style={{
            flex: 1,
            paddingVertical: spacing.md,
            alignItems: "center",
            borderBottomWidth: 2,
            borderBottomColor: activeTab === "history" ? colors.primary : "transparent",
          }}
        >
          <Text style={{
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.semibold,
            color: activeTab === "history" ? colors.primary : colors.textSecondary,
          }}>
            History
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {trades.length === 0 ? (
          <View style={{
            backgroundColor: colors.card,
            borderRadius: borderRadius.lg,
            padding: spacing.xxl,
            alignItems: "center",
          }}>
            <Ionicons name="repeat-outline" size={64} color={colors.textSecondary} />
            <Text style={{
              fontSize: typography.fontSize.lg,
              fontWeight: typography.fontWeight.semibold,
              color: colors.text,
              marginTop: spacing.lg,
            }}>
              {activeTab === "pending" ? "No Pending Trades" : "No Trade History"}
            </Text>
            <Text style={{
              fontSize: typography.fontSize.sm,
              color: colors.textSecondary,
              textAlign: "center",
              marginTop: spacing.sm,
            }}>
              {activeTab === "pending"
                ? "Propose a trade to get started!"
                : "Completed trades will appear here."}
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            {trades.map((trade) => (
              <TradeCard
                key={trade.id}
                trade={trade}
                onAccept={() => handleAccept(trade.id)}
                onReject={() => handleReject(trade.id)}
                isLoading={respondMutation.isPending}
              />
            ))}
          </View>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function TradeCard({
  trade,
  onAccept,
  onReject,
  isLoading,
}: {
  trade: Trade;
  onAccept: () => void;
  onReject: () => void;
  isLoading: boolean;
}) {
  const isPending = trade.status === "pending";
  const isIncoming = trade.isIncoming;

  const statusColor = {
    pending: colors.warning,
    accepted: colors.primary,
    rejected: colors.negative,
    cancelled: colors.textSecondary,
  }[trade.status];

  return (
    <View style={{
      backgroundColor: colors.card,
      borderRadius: borderRadius.lg,
      overflow: "hidden",
    }}>
      {/* Header */}
      <View style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: spacing.md,
        backgroundColor: colors.cardElevated,
      }}>
        <View>
          <Text style={{
            fontSize: typography.fontSize.xs,
            color: colors.textSecondary,
          }}>
            {isIncoming ? "From" : "To"}: {isIncoming ? trade.proposerName : trade.receiverName}
          </Text>
          <Text style={{
            fontSize: typography.fontSize.xs,
            color: colors.textTertiary,
          }}>
            {new Date(trade.createdAt).toLocaleDateString()}
          </Text>
        </View>
        <View style={{
          backgroundColor: statusColor + "20",
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs,
          borderRadius: borderRadius.sm,
        }}>
          <Text style={{
            fontSize: typography.fontSize.xs,
            fontWeight: typography.fontWeight.bold,
            color: statusColor,
            textTransform: "uppercase",
          }}>
            {trade.status}
          </Text>
        </View>
      </View>

      {/* Trade Content */}
      <View style={{ flexDirection: "row", padding: spacing.md }}>
        {/* You Give */}
        <View style={{ flex: 1 }}>
          <Text style={{
            fontSize: typography.fontSize.xs,
            color: colors.textSecondary,
            marginBottom: spacing.sm,
          }}>
            {isIncoming ? "You Get" : "You Give"}
          </Text>
          {(isIncoming ? trade.proposerPlayers : trade.receiverPlayers)?.map((player: Player) => (
            <View
              key={player.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: spacing.xs,
              }}
            >
              <View style={{
                width: 24,
                height: 24,
                borderRadius: 4,
                backgroundColor: colors.primary + "20",
                justifyContent: "center",
                alignItems: "center",
                marginRight: spacing.xs,
              }}>
                <Text style={{ fontSize: 10, fontWeight: "bold", color: colors.primary }}>
                  {player.position}
                </Text>
              </View>
              <Text style={{
                fontSize: typography.fontSize.sm,
                color: colors.text,
              }} numberOfLines={1}>
                {player.name}
              </Text>
            </View>
          ))}
        </View>

        {/* Arrow */}
        <View style={{
          width: 40,
          justifyContent: "center",
          alignItems: "center",
        }}>
          <Ionicons name="swap-horizontal" size={24} color={colors.textSecondary} />
        </View>

        {/* You Get */}
        <View style={{ flex: 1 }}>
          <Text style={{
            fontSize: typography.fontSize.xs,
            color: colors.textSecondary,
            marginBottom: spacing.sm,
          }}>
            {isIncoming ? "You Give" : "You Get"}
          </Text>
          {(isIncoming ? trade.receiverPlayers : trade.proposerPlayers)?.map((player: Player) => (
            <View
              key={player.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: spacing.xs,
              }}
            >
              <View style={{
                width: 24,
                height: 24,
                borderRadius: 4,
                backgroundColor: colors.accent + "20",
                justifyContent: "center",
                alignItems: "center",
                marginRight: spacing.xs,
              }}>
                <Text style={{ fontSize: 10, fontWeight: "bold", color: colors.accent }}>
                  {player.position}
                </Text>
              </View>
              <Text style={{
                fontSize: typography.fontSize.sm,
                color: colors.text,
              }} numberOfLines={1}>
                {player.name}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Message */}
      {trade.message && (
        <View style={{
          paddingHorizontal: spacing.md,
          paddingBottom: spacing.md,
        }}>
          <Text style={{
            fontSize: typography.fontSize.xs,
            color: colors.textSecondary,
            fontStyle: "italic",
          }}>
            "{trade.message}"
          </Text>
        </View>
      )}

      {/* Actions */}
      {isPending && isIncoming && (
        <View style={{
          flexDirection: "row",
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}>
          <Pressable
            onPress={onReject}
            disabled={isLoading}
            style={{
              flex: 1,
              padding: spacing.md,
              alignItems: "center",
              borderRightWidth: 1,
              borderRightColor: colors.border,
            }}
          >
            <Text style={{ color: colors.negative, fontWeight: typography.fontWeight.medium }}>
              Reject
            </Text>
          </Pressable>
          <Pressable
            onPress={onAccept}
            disabled={isLoading}
            style={{
              flex: 1,
              padding: spacing.md,
              alignItems: "center",
            }}
          >
            <Text style={{ color: colors.primary, fontWeight: typography.fontWeight.semibold }}>
              Accept
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
