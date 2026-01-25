/**
 * Trading Screen - Advanced Order Interface
 * Full trading interface with order book and advanced options
 */

import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from "react-native";
import { useState, useCallback, useEffect, useRef } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api } from "../../services/api";
import { useAuthStore } from "../../stores/auth";
import { colors, spacing, borderRadius, typography } from "../../constants/theme";
import type { Market, MarketOutcome } from "../../types";

type OrderType = "market" | "limit";
type OrderSide = "buy" | "sell";

export default function TradeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [selectedOutcome, setSelectedOutcome] = useState<MarketOutcome | null>(null);
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [orderSide, setOrderSide] = useState<OrderSide>("buy");
  const [amount, setAmount] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const slideAnim = useRef(new Animated.Value(0)).current;

  const { data: marketData, refetch } = useQuery({
    queryKey: ["market", id],
    queryFn: () => api.getMarket(id),
    refetchInterval: 5000,
  });

  const { data: positionsData } = useQuery({
    queryKey: ["positions", id],
    queryFn: () => api.getMyPositions(id),
  });

  const placeBetMutation = useMutation({
    mutationFn: ({ outcomeId, amount, type, limitPrice }: {
      outcomeId: string;
      amount: number;
      type: OrderType;
      limitPrice?: number;
    }) => api.placeBet(id, outcomeId, amount),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["market", id] });
      queryClient.invalidateQueries({ queryKey: ["positions", id] });
      queryClient.invalidateQueries({ queryKey: ["user"] });
      Alert.alert("Order Placed", "Your order has been placed successfully!", [
        { text: "OK", onPress: () => router.back() },
      ]);
      resetForm();
    },
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Order Failed", error.message || "Failed to place order");
    },
  });

  const market = marketData?.data as Market | undefined;
  const positions = positionsData?.data || [];

  useEffect(() => {
    if (market?.outcomes && !selectedOutcome) {
      setSelectedOutcome(market.outcomes[0]);
    }
  }, [market, selectedOutcome]);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: showAdvanced ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [showAdvanced]);

  const resetForm = () => {
    setAmount("");
    setLimitPrice("");
    setOrderType("market");
  };

  const handleAmountChange = (value: string) => {
    const cleaned = value.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2) return;
    if (parts[1]?.length > 2) return;
    setAmount(cleaned);
  };

  const handlePlaceOrder = () => {
    const amountNum = parseFloat(amount);

    if (!selectedOutcome) {
      Alert.alert("Error", "Please select an outcome");
      return;
    }

    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert("Error", "Please enter a valid amount");
      return;
    }

    if (orderSide === "buy" && amountNum > (user?.walletBalance || 0)) {
      Alert.alert("Insufficient Balance", "You don't have enough funds for this order");
      return;
    }

    if (orderType === "limit" && !limitPrice) {
      Alert.alert("Error", "Please enter a limit price");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    placeBetMutation.mutate({
      outcomeId: selectedOutcome.id,
      amount: amountNum,
      type: orderType,
      limitPrice: limitPrice ? parseFloat(limitPrice) : undefined,
    });
  };

  const currentPrice = selectedOutcome?.impliedProbability || 0.5;
  const estimatedShares = parseFloat(amount) / currentPrice || 0;
  const potentialReturn = estimatedShares * 1; // Max return if outcome wins
  const maxProfit = potentialReturn - parseFloat(amount || "0");

  if (!market) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: colors.textSecondary }}>Loading market...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const userPosition = positions.find(
    (p: any) => p.outcomeId === selectedOutcome?.id
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          padding: spacing.lg,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}>
          <Pressable
            onPress={() => router.back()}
            style={{ marginRight: spacing.md }}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{
              fontSize: typography.fontSize.lg,
              fontWeight: typography.fontWeight.bold,
              color: colors.text,
            }}>
              Trade
            </Text>
            <Text style={{
              fontSize: typography.fontSize.xs,
              color: colors.textSecondary,
            }} numberOfLines={1}>
              {market.title}
            </Text>
          </View>
          <Pressable onPress={() => refetch()}>
            <Ionicons name="refresh" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }}>
          {/* Outcome Selector */}
          <View style={{ padding: spacing.lg }}>
            <Text style={{
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
              color: colors.textSecondary,
              marginBottom: spacing.sm,
            }}>
              Select Outcome
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {market.outcomes.map((outcome) => (
                <Pressable
                  key={outcome.id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedOutcome(outcome);
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: selectedOutcome?.id === outcome.id
                      ? colors.primary + "20"
                      : colors.card,
                    borderRadius: borderRadius.lg,
                    padding: spacing.md,
                    borderWidth: 2,
                    borderColor: selectedOutcome?.id === outcome.id
                      ? colors.primary
                      : "transparent",
                  }}
                >
                  <Text style={{
                    fontSize: typography.fontSize.sm,
                    color: colors.textSecondary,
                    textAlign: "center",
                  }} numberOfLines={1}>
                    {outcome.label}
                  </Text>
                  <Text style={{
                    fontSize: typography.fontSize.xl,
                    fontWeight: typography.fontWeight.bold,
                    color: selectedOutcome?.id === outcome.id
                      ? colors.primary
                      : colors.text,
                    textAlign: "center",
                    marginTop: spacing.xs,
                  }}>
                    {(outcome.impliedProbability * 100).toFixed(0)}%
                  </Text>
                  <Text style={{
                    fontSize: typography.fontSize.xs,
                    color: colors.textSecondary,
                    textAlign: "center",
                  }}>
                    {outcome.displayOdds}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Order Type Tabs */}
          <View style={{ paddingHorizontal: spacing.lg }}>
            <View style={{
              flexDirection: "row",
              backgroundColor: colors.card,
              borderRadius: borderRadius.lg,
              padding: spacing.xs,
            }}>
              <Pressable
                onPress={() => setOrderType("market")}
                style={{
                  flex: 1,
                  backgroundColor: orderType === "market" ? colors.primary : "transparent",
                  paddingVertical: spacing.sm,
                  borderRadius: borderRadius.md,
                  alignItems: "center",
                }}
              >
                <Text style={{
                  color: orderType === "market" ? colors.textInverse : colors.text,
                  fontWeight: typography.fontWeight.medium,
                }}>
                  Market
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setOrderType("limit")}
                style={{
                  flex: 1,
                  backgroundColor: orderType === "limit" ? colors.primary : "transparent",
                  paddingVertical: spacing.sm,
                  borderRadius: borderRadius.md,
                  alignItems: "center",
                }}
              >
                <Text style={{
                  color: orderType === "limit" ? colors.textInverse : colors.text,
                  fontWeight: typography.fontWeight.medium,
                }}>
                  Limit
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Buy/Sell Toggle */}
          <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
            <View style={{
              flexDirection: "row",
              backgroundColor: colors.card,
              borderRadius: borderRadius.lg,
              padding: spacing.xs,
            }}>
              <Pressable
                onPress={() => setOrderSide("buy")}
                style={{
                  flex: 1,
                  backgroundColor: orderSide === "buy" ? colors.primary : "transparent",
                  paddingVertical: spacing.md,
                  borderRadius: borderRadius.md,
                  alignItems: "center",
                }}
              >
                <Text style={{
                  fontSize: typography.fontSize.md,
                  color: orderSide === "buy" ? colors.textInverse : colors.text,
                  fontWeight: typography.fontWeight.semibold,
                }}>
                  Buy
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setOrderSide("sell")}
                style={{
                  flex: 1,
                  backgroundColor: orderSide === "sell" ? colors.negative : "transparent",
                  paddingVertical: spacing.md,
                  borderRadius: borderRadius.md,
                  alignItems: "center",
                }}
              >
                <Text style={{
                  fontSize: typography.fontSize.md,
                  color: orderSide === "sell" ? colors.textInverse : colors.text,
                  fontWeight: typography.fontWeight.semibold,
                }}>
                  Sell
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Amount Input */}
          <View style={{ padding: spacing.lg }}>
            <Text style={{
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
              color: colors.textSecondary,
              marginBottom: spacing.sm,
            }}>
              Amount
            </Text>
            <View style={{
              backgroundColor: colors.card,
              borderRadius: borderRadius.lg,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: spacing.md,
            }}>
              <Text style={{
                fontSize: typography.fontSize.xxl,
                fontWeight: typography.fontWeight.bold,
                color: colors.text,
              }}>
                $
              </Text>
              <TextInput
                value={amount}
                onChangeText={handleAmountChange}
                placeholder="0.00"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
                style={{
                  flex: 1,
                  fontSize: typography.fontSize.xxl,
                  fontWeight: typography.fontWeight.bold,
                  color: colors.text,
                  padding: spacing.md,
                }}
              />
              <Pressable
                onPress={() => setAmount((user?.walletBalance || 0).toString())}
                style={{
                  backgroundColor: colors.cardElevated,
                  paddingVertical: spacing.xs,
                  paddingHorizontal: spacing.sm,
                  borderRadius: borderRadius.sm,
                }}
              >
                <Text style={{
                  color: colors.accent,
                  fontSize: typography.fontSize.xs,
                  fontWeight: typography.fontWeight.medium,
                }}>
                  MAX
                </Text>
              </Pressable>
            </View>
            <Text style={{
              fontSize: typography.fontSize.xs,
              color: colors.textSecondary,
              marginTop: spacing.xs,
            }}>
              Available: ${(user?.walletBalance || 0).toFixed(2)}
            </Text>
          </View>

          {/* Quick Amount Buttons */}
          <View style={{
            flexDirection: "row",
            paddingHorizontal: spacing.lg,
            gap: spacing.sm,
          }}>
            {[10, 25, 50, 100, 250].map((val) => (
              <Pressable
                key={val}
                onPress={() => {
                  Haptics.selectionAsync();
                  setAmount(val.toString());
                }}
                style={{
                  flex: 1,
                  backgroundColor: colors.card,
                  paddingVertical: spacing.sm,
                  borderRadius: borderRadius.md,
                  alignItems: "center",
                }}
              >
                <Text style={{
                  color: colors.text,
                  fontSize: typography.fontSize.sm,
                  fontWeight: typography.fontWeight.medium,
                }}>
                  ${val}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Limit Price (if limit order) */}
          {orderType === "limit" && (
            <View style={{ padding: spacing.lg }}>
              <Text style={{
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.medium,
                color: colors.textSecondary,
                marginBottom: spacing.sm,
              }}>
                Limit Price (%)
              </Text>
              <View style={{
                backgroundColor: colors.card,
                borderRadius: borderRadius.lg,
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: spacing.md,
              }}>
                <TextInput
                  value={limitPrice}
                  onChangeText={setLimitPrice}
                  placeholder={`${(currentPrice * 100).toFixed(0)}`}
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="decimal-pad"
                  style={{
                    flex: 1,
                    fontSize: typography.fontSize.xl,
                    fontWeight: typography.fontWeight.bold,
                    color: colors.text,
                    padding: spacing.md,
                  }}
                />
                <Text style={{
                  fontSize: typography.fontSize.xl,
                  fontWeight: typography.fontWeight.bold,
                  color: colors.textSecondary,
                }}>
                  %
                </Text>
              </View>
            </View>
          )}

          {/* Order Summary */}
          {amount && parseFloat(amount) > 0 && (
            <View style={{
              margin: spacing.lg,
              backgroundColor: colors.card,
              borderRadius: borderRadius.lg,
              padding: spacing.lg,
            }}>
              <Text style={{
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text,
                marginBottom: spacing.md,
              }}>
                Order Summary
              </Text>
              <View style={{ gap: spacing.sm }}>
                <SummaryRow label="Outcome" value={selectedOutcome?.label || ""} />
                <SummaryRow
                  label="Price"
                  value={`${(currentPrice * 100).toFixed(1)}%`}
                />
                <SummaryRow
                  label="Est. Shares"
                  value={estimatedShares.toFixed(2)}
                />
                <SummaryRow
                  label="Max Return"
                  value={`$${potentialReturn.toFixed(2)}`}
                  valueColor={colors.primary}
                />
                <SummaryRow
                  label="Max Profit"
                  value={`+$${maxProfit.toFixed(2)}`}
                  valueColor={colors.primary}
                />
              </View>
            </View>
          )}

          {/* User's Current Position */}
          {userPosition && (
            <View style={{
              marginHorizontal: spacing.lg,
              backgroundColor: colors.cardElevated,
              borderRadius: borderRadius.lg,
              padding: spacing.lg,
              marginBottom: spacing.lg,
            }}>
              <Text style={{
                fontSize: typography.fontSize.sm,
                color: colors.textSecondary,
                marginBottom: spacing.sm,
              }}>
                Your Position
              </Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <View>
                  <Text style={{
                    fontSize: typography.fontSize.lg,
                    fontWeight: typography.fontWeight.bold,
                    color: colors.text,
                  }}>
                    {userPosition.shares} shares
                  </Text>
                  <Text style={{
                    fontSize: typography.fontSize.xs,
                    color: colors.textSecondary,
                  }}>
                    Avg: ${userPosition.avgPrice.toFixed(2)}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{
                    fontSize: typography.fontSize.lg,
                    fontWeight: typography.fontWeight.bold,
                    color: userPosition.unrealizedPnL >= 0 ? colors.primary : colors.negative,
                  }}>
                    {userPosition.unrealizedPnL >= 0 ? "+" : ""}${userPosition.unrealizedPnL.toFixed(2)}
                  </Text>
                  <Text style={{
                    fontSize: typography.fontSize.xs,
                    color: colors.textSecondary,
                  }}>
                    Value: ${userPosition.currentValue.toFixed(2)}
                  </Text>
                </View>
              </View>
            </View>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Place Order Button */}
        <View style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: spacing.lg,
          paddingBottom: spacing.xxl,
          backgroundColor: colors.background,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}>
          <Pressable
            onPress={handlePlaceOrder}
            disabled={placeBetMutation.isPending || !amount || !selectedOutcome}
            style={{
              backgroundColor:
                placeBetMutation.isPending || !amount
                  ? colors.textSecondary
                  : orderSide === "buy"
                  ? colors.primary
                  : colors.negative,
              borderRadius: borderRadius.lg,
              padding: spacing.lg,
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {placeBetMutation.isPending ? (
              <Text style={{
                color: colors.textInverse,
                fontSize: typography.fontSize.md,
                fontWeight: typography.fontWeight.bold,
              }}>
                Placing Order...
              </Text>
            ) : (
              <>
                <Text style={{
                  color: colors.textInverse,
                  fontSize: typography.fontSize.md,
                  fontWeight: typography.fontWeight.bold,
                }}>
                  {orderSide === "buy" ? "Buy" : "Sell"} {selectedOutcome?.label}
                </Text>
                {amount && parseFloat(amount) > 0 && (
                  <Text style={{
                    color: colors.textInverse,
                    fontSize: typography.fontSize.md,
                    fontWeight: typography.fontWeight.bold,
                    opacity: 0.8,
                    marginLeft: spacing.sm,
                  }}>
                    for ${parseFloat(amount).toFixed(2)}
                  </Text>
                )}
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SummaryRow({
  label,
  value,
  valueColor = colors.text,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{
        fontSize: typography.fontSize.sm,
        color: colors.textSecondary,
      }}>
        {label}
      </Text>
      <Text style={{
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.medium,
        color: valueColor,
      }}>
        {value}
      </Text>
    </View>
  );
}
