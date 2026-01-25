/**
 * OrderForm Component
 * Form for placing orders on prediction markets
 */

import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useState, useCallback, useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, spacing, borderRadius, typography } from "../constants/theme";
import type { MarketOutcome } from "../types";

// ============================================================================
// Types
// ============================================================================

interface OrderFormProps {
  outcome: MarketOutcome;
  userBalance: number;
  onSubmit: (order: OrderData) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
  minAmount?: number;
  maxAmount?: number;
}

interface OrderData {
  outcomeId: string;
  amount: number;
  type: "market" | "limit";
  side: "buy" | "sell";
  limitPrice?: number;
}

type OrderSide = "buy" | "sell";
type OrderType = "market" | "limit";

const QUICK_AMOUNTS = [5, 10, 25, 50, 100];

// ============================================================================
// Component
// ============================================================================

export function OrderForm({
  outcome,
  userBalance,
  onSubmit,
  onCancel,
  isLoading = false,
  minAmount = 1,
  maxAmount = 10000,
}: OrderFormProps) {
  const [orderSide, setOrderSide] = useState<OrderSide>("buy");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [amount, setAmount] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  const currentPrice = outcome.impliedProbability;

  // Calculate order details
  const orderDetails = useMemo(() => {
    const amountNum = parseFloat(amount) || 0;
    const priceNum = orderType === "limit" ? (parseFloat(limitPrice) || currentPrice * 100) / 100 : currentPrice;

    const shares = amountNum / priceNum;
    const potentialReturn = shares * 1; // Max return if outcome wins
    const potentialProfit = potentialReturn - amountNum;
    const roi = amountNum > 0 ? (potentialProfit / amountNum) * 100 : 0;

    return {
      shares: shares.toFixed(2),
      potentialReturn: potentialReturn.toFixed(2),
      potentialProfit: potentialProfit.toFixed(2),
      roi: roi.toFixed(1),
      effectivePrice: (priceNum * 100).toFixed(1),
    };
  }, [amount, limitPrice, orderType, currentPrice]);

  // Validation
  const validateOrder = useCallback((): string | null => {
    const amountNum = parseFloat(amount);

    if (!amount || isNaN(amountNum)) {
      return "Please enter an amount";
    }

    if (amountNum < minAmount) {
      return `Minimum amount is $${minAmount}`;
    }

    if (amountNum > maxAmount) {
      return `Maximum amount is $${maxAmount}`;
    }

    if (orderSide === "buy" && amountNum > userBalance) {
      return "Insufficient balance";
    }

    if (orderType === "limit") {
      const priceNum = parseFloat(limitPrice);
      if (!limitPrice || isNaN(priceNum)) {
        return "Please enter a limit price";
      }
      if (priceNum <= 0 || priceNum >= 100) {
        return "Limit price must be between 0 and 100";
      }
    }

    return null;
  }, [amount, limitPrice, orderSide, orderType, userBalance, minAmount, maxAmount]);

  const handleAmountChange = (value: string) => {
    // Clean input
    const cleaned = value.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2) return;
    if (parts[1]?.length > 2) return;

    setAmount(cleaned);
    setError(null);
  };

  const handleLimitPriceChange = (value: string) => {
    const cleaned = value.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2) return;
    if (parts[1]?.length > 1) return;

    setLimitPrice(cleaned);
    setError(null);
  };

  const handleQuickAmount = (value: number) => {
    Haptics.selectionAsync();
    setAmount(value.toString());
    setError(null);
  };

  const handleSubmit = async () => {
    const validationError = validateOrder();
    if (validationError) {
      setError(validationError);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await onSubmit({
        outcomeId: outcome.id,
        amount: parseFloat(amount),
        type: orderType,
        side: orderSide,
        limitPrice: orderType === "limit" ? parseFloat(limitPrice) / 100 : undefined,
      });
    } catch (err: any) {
      setError(err.message || "Failed to place order");
    }
  };

  const handleSideChange = (side: OrderSide) => {
    Haptics.selectionAsync();
    setOrderSide(side);
    setError(null);
  };

  const handleTypeChange = (type: OrderType) => {
    Haptics.selectionAsync();
    setOrderType(type);
    if (type === "limit" && !limitPrice) {
      setLimitPrice((currentPrice * 100).toFixed(1));
    }
    setError(null);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      {/* Outcome Info */}
      <View style={styles.outcomeInfo}>
        <View style={styles.outcomeHeader}>
          <Text style={styles.outcomeLabel}>Betting on</Text>
          {onCancel && (
            <Pressable onPress={onCancel}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>
        <Text style={styles.outcomeName}>{outcome.label}</Text>
        <View style={styles.currentPriceRow}>
          <Text style={styles.currentPriceLabel}>Current Price</Text>
          <Text style={styles.currentPriceValue}>
            {(currentPrice * 100).toFixed(1)}%
          </Text>
        </View>
      </View>

      {/* Buy/Sell Toggle */}
      <View style={styles.toggleContainer}>
        <Pressable
          onPress={() => handleSideChange("buy")}
          style={[
            styles.toggleButton,
            orderSide === "buy" && styles.toggleButtonActiveBuy,
          ]}
        >
          <Text
            style={[
              styles.toggleText,
              orderSide === "buy" && styles.toggleTextActive,
            ]}
          >
            Buy
          </Text>
        </Pressable>
        <Pressable
          onPress={() => handleSideChange("sell")}
          style={[
            styles.toggleButton,
            orderSide === "sell" && styles.toggleButtonActiveSell,
          ]}
        >
          <Text
            style={[
              styles.toggleText,
              orderSide === "sell" && styles.toggleTextActive,
            ]}
          >
            Sell
          </Text>
        </Pressable>
      </View>

      {/* Order Type */}
      <View style={styles.orderTypeContainer}>
        <Pressable
          onPress={() => handleTypeChange("market")}
          style={[
            styles.orderTypeButton,
            orderType === "market" && styles.orderTypeButtonActive,
          ]}
        >
          <Text
            style={[
              styles.orderTypeText,
              orderType === "market" && styles.orderTypeTextActive,
            ]}
          >
            Market
          </Text>
        </Pressable>
        <Pressable
          onPress={() => handleTypeChange("limit")}
          style={[
            styles.orderTypeButton,
            orderType === "limit" && styles.orderTypeButtonActive,
          ]}
        >
          <Text
            style={[
              styles.orderTypeText,
              orderType === "limit" && styles.orderTypeTextActive,
            ]}
          >
            Limit
          </Text>
        </Pressable>
      </View>

      {/* Amount Input */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Amount</Text>
        <View style={styles.amountInputContainer}>
          <Text style={styles.currencySymbol}>$</Text>
          <TextInput
            value={amount}
            onChangeText={handleAmountChange}
            placeholder="0.00"
            placeholderTextColor={colors.textTertiary}
            keyboardType="decimal-pad"
            style={styles.amountInput}
          />
          <Pressable
            onPress={() => handleAmountChange(userBalance.toFixed(2))}
            style={styles.maxButton}
          >
            <Text style={styles.maxButtonText}>MAX</Text>
          </Pressable>
        </View>
        <Text style={styles.balanceText}>
          Balance: ${userBalance.toFixed(2)}
        </Text>
      </View>

      {/* Quick Amount Buttons */}
      <View style={styles.quickAmounts}>
        {QUICK_AMOUNTS.map((val) => (
          <Pressable
            key={val}
            onPress={() => handleQuickAmount(val)}
            style={[
              styles.quickAmountButton,
              parseFloat(amount) === val && styles.quickAmountButtonActive,
            ]}
          >
            <Text
              style={[
                styles.quickAmountText,
                parseFloat(amount) === val && styles.quickAmountTextActive,
              ]}
            >
              ${val}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Limit Price Input (if limit order) */}
      {orderType === "limit" && (
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Limit Price (%)</Text>
          <View style={styles.limitInputContainer}>
            <TextInput
              value={limitPrice}
              onChangeText={handleLimitPriceChange}
              placeholder={(currentPrice * 100).toFixed(1)}
              placeholderTextColor={colors.textTertiary}
              keyboardType="decimal-pad"
              style={styles.limitInput}
            />
            <Text style={styles.percentSymbol}>%</Text>
          </View>
        </View>
      )}

      {/* Order Summary */}
      {amount && parseFloat(amount) > 0 && (
        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Est. Shares</Text>
            <Text style={styles.summaryValue}>{orderDetails.shares}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Price</Text>
            <Text style={styles.summaryValue}>{orderDetails.effectivePrice}%</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Max Return</Text>
            <Text style={[styles.summaryValue, { color: colors.primary }]}>
              ${orderDetails.potentialReturn}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Potential Profit</Text>
            <Text style={[styles.summaryValue, { color: colors.primary }]}>
              +${orderDetails.potentialProfit} ({orderDetails.roi}%)
            </Text>
          </View>
        </View>
      )}

      {/* Error Message */}
      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={16} color={colors.negative} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Submit Button */}
      <Pressable
        onPress={handleSubmit}
        disabled={isLoading || !amount}
        style={[
          styles.submitButton,
          orderSide === "buy" ? styles.submitButtonBuy : styles.submitButtonSell,
          (isLoading || !amount) && styles.submitButtonDisabled,
        ]}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <Text style={styles.submitButtonText}>
            {orderSide === "buy" ? "Buy" : "Sell"} {outcome.label}
          </Text>
        )}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  outcomeInfo: {
    marginBottom: spacing.lg,
  },
  outcomeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  outcomeLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  outcomeName: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    marginTop: spacing.xs,
  },
  currentPriceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  currentPriceLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  currentPriceValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary,
  },
  toggleContainer: {
    flexDirection: "row",
    backgroundColor: colors.cardElevated,
    borderRadius: borderRadius.lg,
    padding: spacing.xs,
    marginBottom: spacing.md,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderRadius: borderRadius.md,
  },
  toggleButtonActiveBuy: {
    backgroundColor: colors.primary,
  },
  toggleButtonActiveSell: {
    backgroundColor: colors.negative,
  },
  toggleText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textSecondary,
  },
  toggleTextActive: {
    color: colors.textInverse,
  },
  orderTypeContainer: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  orderTypeButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: "center",
    backgroundColor: colors.cardElevated,
    borderRadius: borderRadius.md,
  },
  orderTypeButtonActive: {
    backgroundColor: colors.primary + "20",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  orderTypeText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium,
  },
  orderTypeTextActive: {
    color: colors.primary,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    fontWeight: typography.fontWeight.medium,
  },
  amountInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.cardElevated,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
  },
  currencySymbol: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
  },
  amountInput: {
    flex: 1,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  maxButton: {
    backgroundColor: colors.card,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  maxButtonText: {
    fontSize: typography.fontSize.xs,
    color: colors.accent,
    fontWeight: typography.fontWeight.medium,
  },
  balanceText: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  quickAmounts: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  quickAmountButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: "center",
    backgroundColor: colors.cardElevated,
    borderRadius: borderRadius.md,
  },
  quickAmountButtonActive: {
    backgroundColor: colors.primary + "20",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  quickAmountText: {
    fontSize: typography.fontSize.sm,
    color: colors.text,
    fontWeight: typography.fontWeight.medium,
  },
  quickAmountTextActive: {
    color: colors.primary,
  },
  limitInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.cardElevated,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
  },
  limitInput: {
    flex: 1,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    paddingVertical: spacing.md,
  },
  percentSymbol: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.textSecondary,
  },
  summary: {
    backgroundColor: colors.primary + "10",
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  summaryLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  summaryValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.negative + "20",
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    color: colors.negative,
    marginLeft: spacing.sm,
  },
  submitButton: {
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonBuy: {
    backgroundColor: colors.primary,
  },
  submitButtonSell: {
    backgroundColor: colors.negative,
  },
  submitButtonDisabled: {
    backgroundColor: colors.textSecondary,
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.textInverse,
  },
});

export default OrderForm;
