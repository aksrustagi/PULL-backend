/**
 * Market Detail Screen - Betting Interface
 */

import { View, Text, ScrollView, Pressable, TextInput, Alert } from "react-native";
import { useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../services/api";
import { useAuthStore } from "../../stores/auth";
import { colors, spacing, borderRadius, typography } from "../../constants/theme";
import type { Market, MarketOutcome } from "../../types";

export default function MarketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [selectedOutcome, setSelectedOutcome] = useState<MarketOutcome | null>(null);
  const [betAmount, setBetAmount] = useState("");
  const [showBetSheet, setShowBetSheet] = useState(false);

  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: marketData, refetch } = useQuery({
    queryKey: ["market", id],
    queryFn: () => api.getMarket(id),
    refetchInterval: 10000, // Refresh odds every 10 seconds
  });

  const { data: positionsData } = useQuery({
    queryKey: ["market", id, "positions"],
    queryFn: () => api.getMyPositions(id),
  });

  const placeBetMutation = useMutation({
    mutationFn: ({ outcomeId, amount }: { outcomeId: string; amount: number }) =>
      api.placeBet(id, outcomeId, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market", id] });
      queryClient.invalidateQueries({ queryKey: ["user"] });
      setShowBetSheet(false);
      setBetAmount("");
      setSelectedOutcome(null);
      Alert.alert("Success", "Bet placed successfully!");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to place bet");
    },
  });

  const market = marketData?.data as Market | undefined;
  const positions = positionsData?.data || [];

  if (!market) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: colors.textSecondary }}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const closesIn = market.closesAt - Date.now();
  const closesInHours = Math.max(0, Math.floor(closesIn / (1000 * 60 * 60)));
  const closesInDays = Math.floor(closesInHours / 24);

  const handleOutcomeSelect = (outcome: MarketOutcome) => {
    setSelectedOutcome(outcome);
    setShowBetSheet(true);
  };

  const handlePlaceBet = () => {
    const amount = parseFloat(betAmount);
    if (!selectedOutcome || isNaN(amount) || amount <= 0) {
      Alert.alert("Error", "Please enter a valid bet amount");
      return;
    }

    if (amount > (user?.walletBalance || 0)) {
      Alert.alert("Error", "Insufficient balance");
      return;
    }

    placeBetMutation.mutate({ outcomeId: selectedOutcome.id, amount });
  };

  const estimatedReturn = selectedOutcome && betAmount
    ? parseFloat(betAmount) / selectedOutcome.impliedProbability
    : 0;

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
          Market
        </Text>
        <Pressable onPress={() => refetch()}>
          <Ionicons name="refresh" size={24} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }}>
        {/* Market Info */}
        <View style={{
          backgroundColor: colors.card,
          margin: spacing.lg,
          borderRadius: borderRadius.lg,
          padding: spacing.lg,
        }}>
          <View style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: spacing.md,
          }}>
            <View style={{
              backgroundColor: colors.cardElevated,
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xs,
              borderRadius: borderRadius.sm,
            }}>
              <Text style={{
                fontSize: typography.fontSize.xs,
                color: colors.textSecondary,
                textTransform: "uppercase",
              }}>
                {market.type.replace("_", " ")}
              </Text>
            </View>
            <View style={{
              backgroundColor: market.status === "open" ? colors.primary + "20" : colors.negative + "20",
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xs,
              borderRadius: borderRadius.sm,
            }}>
              <Text style={{
                fontSize: typography.fontSize.xs,
                fontWeight: typography.fontWeight.medium,
                color: market.status === "open" ? colors.primary : colors.negative,
              }}>
                {market.status.toUpperCase()}
              </Text>
            </View>
          </View>

          <Text style={{
            fontSize: typography.fontSize.xl,
            fontWeight: typography.fontWeight.bold,
            color: colors.text,
            marginBottom: spacing.md,
          }}>
            {market.title}
          </Text>

          {market.description && (
            <Text style={{
              fontSize: typography.fontSize.sm,
              color: colors.textSecondary,
              marginBottom: spacing.md,
              lineHeight: 20,
            }}>
              {market.description}
            </Text>
          )}

          <View style={{ flexDirection: "row", gap: spacing.lg }}>
            <View>
              <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                Closes In
              </Text>
              <Text style={{
                fontSize: typography.fontSize.md,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text,
              }}>
                {closesInDays > 0 ? `${closesInDays}d ${closesInHours % 24}h` : `${closesInHours}h`}
              </Text>
            </View>
            <View>
              <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                Volume
              </Text>
              <Text style={{
                fontSize: typography.fontSize.md,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text,
              }}>
                ${market.totalVolume.toLocaleString()}
              </Text>
            </View>
            <View>
              <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                Liquidity
              </Text>
              <Text style={{
                fontSize: typography.fontSize.md,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text,
              }}>
                ${market.liquidity?.toLocaleString() || "N/A"}
              </Text>
            </View>
          </View>
        </View>

        {/* Outcomes */}
        <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
          <Text style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
          }}>
            Select Outcome
          </Text>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          {market.outcomes.map((outcome) => (
            <Pressable
              key={outcome.id}
              onPress={() => handleOutcomeSelect(outcome)}
              disabled={market.status !== "open"}
              style={{
                backgroundColor: colors.card,
                borderRadius: borderRadius.lg,
                padding: spacing.lg,
                borderWidth: 2,
                borderColor: selectedOutcome?.id === outcome.id ? colors.primary : "transparent",
                opacity: market.status !== "open" ? 0.6 : 1,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: typography.fontSize.md,
                    fontWeight: typography.fontWeight.semibold,
                    color: colors.text,
                  }}>
                    {outcome.label}
                  </Text>
                  <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                    {(outcome.impliedProbability * 100).toFixed(1)}% implied
                  </Text>
                </View>
                <View style={{
                  backgroundColor: colors.primary,
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.md,
                  borderRadius: borderRadius.md,
                }}>
                  <Text style={{
                    fontSize: typography.fontSize.lg,
                    fontWeight: typography.fontWeight.bold,
                    color: colors.textInverse,
                  }}>
                    {outcome.displayOdds || `${(outcome.impliedProbability * 100).toFixed(0)}%`}
                  </Text>
                </View>
              </View>

              {/* Probability Bar */}
              <View style={{
                height: 4,
                backgroundColor: colors.cardElevated,
                borderRadius: 2,
                marginTop: spacing.md,
                overflow: "hidden",
              }}>
                <View style={{
                  width: `${outcome.impliedProbability * 100}%`,
                  height: "100%",
                  backgroundColor: colors.primary,
                }} />
              </View>
            </Pressable>
          ))}
        </View>

        {/* My Positions */}
        {positions.length > 0 && (
          <View style={{ padding: spacing.lg }}>
            <Text style={{
              fontSize: typography.fontSize.lg,
              fontWeight: typography.fontWeight.semibold,
              color: colors.text,
              marginBottom: spacing.md,
            }}>
              My Positions
            </Text>
            <View style={{
              backgroundColor: colors.card,
              borderRadius: borderRadius.lg,
              padding: spacing.lg,
            }}>
              {positions.map((position: any) => (
                <View
                  key={position.id}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingVertical: spacing.sm,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <View>
                    <Text style={{
                      fontSize: typography.fontSize.sm,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.text,
                    }}>
                      {position.outcomeName}
                    </Text>
                    <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                      {position.shares} shares @ {position.avgPrice.toFixed(2)}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{
                      fontSize: typography.fontSize.md,
                      fontWeight: typography.fontWeight.bold,
                      color: position.unrealizedPnL >= 0 ? colors.primary : colors.negative,
                    }}>
                      {position.unrealizedPnL >= 0 ? "+" : ""}${position.unrealizedPnL.toFixed(2)}
                    </Text>
                    <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                      ${position.currentValue.toFixed(2)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Price History Chart Placeholder */}
        <View style={{ padding: spacing.lg }}>
          <Text style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
            marginBottom: spacing.md,
          }}>
            Price History
          </Text>
          <View style={{
            backgroundColor: colors.card,
            borderRadius: borderRadius.lg,
            padding: spacing.xl,
            height: 200,
            justifyContent: "center",
            alignItems: "center",
          }}>
            <Ionicons name="analytics" size={48} color={colors.textSecondary} />
            <Text style={{
              fontSize: typography.fontSize.sm,
              color: colors.textSecondary,
              marginTop: spacing.md,
            }}>
              Price chart coming soon
            </Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bet Sheet */}
      {showBetSheet && selectedOutcome && (
        <View style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: colors.card,
          borderTopLeftRadius: borderRadius.xl,
          borderTopRightRadius: borderRadius.xl,
          padding: spacing.lg,
          paddingBottom: spacing.xxl,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 10,
        }}>
          {/* Handle */}
          <View style={{
            width: 40,
            height: 4,
            backgroundColor: colors.border,
            borderRadius: 2,
            alignSelf: "center",
            marginBottom: spacing.lg,
          }} />

          {/* Selected Outcome */}
          <View style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: spacing.lg,
          }}>
            <View>
              <Text style={{ fontSize: typography.fontSize.sm, color: colors.textSecondary }}>
                Betting On
              </Text>
              <Text style={{
                fontSize: typography.fontSize.lg,
                fontWeight: typography.fontWeight.bold,
                color: colors.text,
              }}>
                {selectedOutcome.label}
              </Text>
            </View>
            <Pressable onPress={() => setShowBetSheet(false)}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Amount Input */}
          <View style={{ marginBottom: spacing.lg }}>
            <Text style={{
              fontSize: typography.fontSize.sm,
              color: colors.textSecondary,
              marginBottom: spacing.sm,
            }}>
              Bet Amount
            </Text>
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.cardElevated,
              borderRadius: borderRadius.md,
              paddingHorizontal: spacing.md,
            }}>
              <Text style={{
                fontSize: typography.fontSize.xl,
                fontWeight: typography.fontWeight.bold,
                color: colors.text,
              }}>
                $
              </Text>
              <TextInput
                value={betAmount}
                onChangeText={setBetAmount}
                placeholder="0.00"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
                style={{
                  flex: 1,
                  padding: spacing.md,
                  fontSize: typography.fontSize.xl,
                  fontWeight: typography.fontWeight.bold,
                  color: colors.text,
                }}
              />
            </View>
            <Text style={{
              fontSize: typography.fontSize.xs,
              color: colors.textSecondary,
              marginTop: spacing.xs,
            }}>
              Balance: ${user?.walletBalance?.toFixed(2) || "0.00"}
            </Text>
          </View>

          {/* Quick Amounts */}
          <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg }}>
            {[5, 10, 25, 50, 100].map((amount) => (
              <Pressable
                key={amount}
                onPress={() => setBetAmount(amount.toString())}
                style={{
                  flex: 1,
                  backgroundColor: colors.cardElevated,
                  padding: spacing.sm,
                  borderRadius: borderRadius.md,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: colors.text, fontWeight: typography.fontWeight.medium }}>
                  ${amount}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Estimated Return */}
          {betAmount && parseFloat(betAmount) > 0 && (
            <View style={{
              backgroundColor: colors.primary + "10",
              borderRadius: borderRadius.md,
              padding: spacing.md,
              marginBottom: spacing.lg,
            }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.textSecondary }}>Estimated Return</Text>
                <Text style={{
                  fontSize: typography.fontSize.lg,
                  fontWeight: typography.fontWeight.bold,
                  color: colors.primary,
                }}>
                  ${estimatedReturn.toFixed(2)}
                </Text>
              </View>
              <Text style={{ fontSize: typography.fontSize.xs, color: colors.textTertiary }}>
                If {selectedOutcome.label} wins
              </Text>
            </View>
          )}

          {/* Place Bet Button */}
          <Pressable
            onPress={handlePlaceBet}
            disabled={placeBetMutation.isPending || !betAmount}
            style={{
              backgroundColor: placeBetMutation.isPending || !betAmount
                ? colors.textSecondary
                : colors.primary,
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
              {placeBetMutation.isPending ? "Placing Bet..." : "Place Bet"}
            </Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
