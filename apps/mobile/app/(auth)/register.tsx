/**
 * Register Screen
 */

import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useState } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../../stores/auth";
import { colors, spacing, borderRadius, typography } from "../../constants/theme";

export default function RegisterScreen() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [agreeToTerms, setAgreeToTerms] = useState(false);

  const { register } = useAuthStore();

  const handleRegister = async () => {
    if (!displayName || !email || !password) {
      setError("Please fill in all fields");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (!agreeToTerms) {
      setError("Please agree to the Terms of Service");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      await register(email, password, displayName);
      router.replace("/(tabs)");
    } catch (err: any) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            padding: spacing.xl,
          }}
          keyboardShouldPersistTaps="handled"
        >
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
              Create Account
            </Text>
            <Text style={{
              fontSize: typography.fontSize.md,
              color: colors.textSecondary,
              marginTop: spacing.sm,
            }}>
              Join Fantasy Markets and start competing
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

          {/* Display Name Input */}
          <View style={{ marginBottom: spacing.lg }}>
            <Text style={{
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
              color: colors.textSecondary,
              marginBottom: spacing.sm,
            }}>
              Display Name
            </Text>
            <View style={{
              backgroundColor: colors.card,
              borderRadius: borderRadius.lg,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: spacing.md,
            }}>
              <Ionicons name="person-outline" size={20} color={colors.textSecondary} />
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your display name"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="words"
                style={{
                  flex: 1,
                  padding: spacing.md,
                  color: colors.text,
                  fontSize: typography.fontSize.md,
                }}
              />
            </View>
          </View>

          {/* Email Input */}
          <View style={{ marginBottom: spacing.lg }}>
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

          {/* Password Input */}
          <View style={{ marginBottom: spacing.lg }}>
            <Text style={{
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
              color: colors.textSecondary,
              marginBottom: spacing.sm,
            }}>
              Password
            </Text>
            <View style={{
              backgroundColor: colors.card,
              borderRadius: borderRadius.lg,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: spacing.md,
            }}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Create a password"
                placeholderTextColor={colors.textTertiary}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                style={{
                  flex: 1,
                  padding: spacing.md,
                  color: colors.text,
                  fontSize: typography.fontSize.md,
                }}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)}>
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={colors.textSecondary}
                />
              </Pressable>
            </View>
            <Text style={{
              fontSize: typography.fontSize.xs,
              color: colors.textTertiary,
              marginTop: spacing.xs,
            }}>
              Must be at least 8 characters
            </Text>
          </View>

          {/* Confirm Password Input */}
          <View style={{ marginBottom: spacing.xl }}>
            <Text style={{
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
              color: colors.textSecondary,
              marginBottom: spacing.sm,
            }}>
              Confirm Password
            </Text>
            <View style={{
              backgroundColor: colors.card,
              borderRadius: borderRadius.lg,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: spacing.md,
            }}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm your password"
                placeholderTextColor={colors.textTertiary}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                style={{
                  flex: 1,
                  padding: spacing.md,
                  color: colors.text,
                  fontSize: typography.fontSize.md,
                }}
              />
            </View>
          </View>

          {/* Terms Checkbox */}
          <Pressable
            onPress={() => setAgreeToTerms(!agreeToTerms)}
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              marginBottom: spacing.xl,
            }}
          >
            <View style={{
              width: 24,
              height: 24,
              borderRadius: borderRadius.sm,
              borderWidth: 2,
              borderColor: agreeToTerms ? colors.primary : colors.border,
              backgroundColor: agreeToTerms ? colors.primary : "transparent",
              justifyContent: "center",
              alignItems: "center",
              marginRight: spacing.sm,
            }}>
              {agreeToTerms && (
                <Ionicons name="checkmark" size={16} color={colors.textInverse} />
              )}
            </View>
            <Text style={{
              flex: 1,
              color: colors.textSecondary,
              fontSize: typography.fontSize.sm,
              lineHeight: 20,
            }}>
              I agree to the{" "}
              <Text style={{ color: colors.accent }}>Terms of Service</Text>
              {" "}and{" "}
              <Text style={{ color: colors.accent }}>Privacy Policy</Text>
            </Text>
          </Pressable>

          {/* Register Button */}
          <Pressable
            onPress={handleRegister}
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
              {isLoading ? "Creating Account..." : "Create Account"}
            </Text>
          </Pressable>

          {/* Sign In Link */}
          <View style={{
            flexDirection: "row",
            justifyContent: "center",
            marginTop: spacing.xl,
          }}>
            <Text style={{ color: colors.textSecondary }}>
              Already have an account?{" "}
            </Text>
            <Pressable onPress={() => router.push("/(auth)/login")}>
              <Text style={{ color: colors.accent, fontWeight: typography.fontWeight.semibold }}>
                Sign In
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
