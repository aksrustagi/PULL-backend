/**
 * Forgot Password Screen
 */

import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useState } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, borderRadius, typography } from "../../constants/theme";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!email) {
      setError("Please enter your email");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      // API call would go here
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message || "Failed to send reset link. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{
          flex: 1,
          padding: spacing.xl,
          justifyContent: "center",
          alignItems: "center",
        }}>
          <View style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: colors.primary + "20",
            justifyContent: "center",
            alignItems: "center",
            marginBottom: spacing.xl,
          }}>
            <Ionicons name="mail" size={40} color={colors.primary} />
          </View>
          <Text style={{
            fontSize: typography.fontSize.xxl,
            fontWeight: typography.fontWeight.bold,
            color: colors.text,
            textAlign: "center",
          }}>
            Check Your Email
          </Text>
          <Text style={{
            fontSize: typography.fontSize.md,
            color: colors.textSecondary,
            textAlign: "center",
            marginTop: spacing.md,
            lineHeight: 24,
          }}>
            We've sent a password reset link to{"\n"}
            <Text style={{ color: colors.text, fontWeight: typography.fontWeight.medium }}>
              {email}
            </Text>
          </Text>

          <Pressable
            onPress={() => router.push("/(auth)/login")}
            style={{
              backgroundColor: colors.primary,
              borderRadius: borderRadius.lg,
              padding: spacing.lg,
              alignItems: "center",
              marginTop: spacing.xxl,
              width: "100%",
            }}
          >
            <Text style={{
              color: colors.textInverse,
              fontSize: typography.fontSize.md,
              fontWeight: typography.fontWeight.semibold,
            }}>
              Back to Sign In
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setIsSuccess(false)}
            style={{ marginTop: spacing.lg }}
          >
            <Text style={{ color: colors.accent }}>
              Didn't receive the email? Try again
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1, padding: spacing.xl }}>
          {/* Back Button */}
          <Pressable
            onPress={() => router.back()}
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: spacing.xl,
            }}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
            <Text style={{ color: colors.text, marginLeft: spacing.sm }}>Back</Text>
          </Pressable>

          {/* Header */}
          <View style={{ marginBottom: spacing.xxl }}>
            <Text style={{
              fontSize: typography.fontSize.xxxl,
              fontWeight: typography.fontWeight.bold,
              color: colors.text,
            }}>
              Reset Password
            </Text>
            <Text style={{
              fontSize: typography.fontSize.md,
              color: colors.textSecondary,
              marginTop: spacing.sm,
              lineHeight: 24,
            }}>
              Enter your email address and we'll send you a link to reset your password.
            </Text>
          </View>

          {/* Error Message */}
          {error ? (
            <View style={{
              backgroundColor: colors.negative + "20",
              borderRadius: borderRadius.md,
              padding: spacing.md,
              marginBottom: spacing.lg,
              flexDirection: "row",
              alignItems: "center",
            }}>
              <Ionicons name="alert-circle" size={20} color={colors.negative} />
              <Text style={{
                color: colors.negative,
                marginLeft: spacing.sm,
                flex: 1,
              }}>
                {error}
              </Text>
            </View>
          ) : null}

          {/* Email Input */}
          <View style={{ marginBottom: spacing.xl }}>
            <Text style={{
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
              color: colors.textSecondary,
              marginBottom: spacing.sm,
            }}>
              Email
            </Text>
            <View style={{
              backgroundColor: colors.card,
              borderRadius: borderRadius.lg,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: spacing.md,
            }}>
              <Ionicons name="mail-outline" size={20} color={colors.textSecondary} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Enter your email"
                placeholderTextColor={colors.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  flex: 1,
                  padding: spacing.md,
                  color: colors.text,
                  fontSize: typography.fontSize.md,
                }}
              />
            </View>
          </View>

          {/* Submit Button */}
          <Pressable
            onPress={handleSubmit}
            disabled={isLoading}
            style={{
              backgroundColor: isLoading ? colors.textSecondary : colors.primary,
              borderRadius: borderRadius.lg,
              padding: spacing.lg,
              alignItems: "center",
            }}
          >
            <Text style={{
              color: colors.textInverse,
              fontSize: typography.fontSize.md,
              fontWeight: typography.fontWeight.semibold,
            }}>
              {isLoading ? "Sending..." : "Send Reset Link"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
