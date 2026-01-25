/**
 * Login Screen
 */

import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useState } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../../stores/auth";
import { colors, spacing, borderRadius, typography } from "../../constants/theme";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const { login } = useAuthStore();

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Please enter email and password");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      await login(email, password);
      router.replace("/(tabs)");
    } catch (err: any) {
      setError(err.message || "Login failed. Please try again.");
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
            justifyContent: "center",
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo / Header */}
          <View style={{ alignItems: "center", marginBottom: spacing.xxl }}>
            <View style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              backgroundColor: colors.primary,
              justifyContent: "center",
              alignItems: "center",
              marginBottom: spacing.lg,
            }}>
              <Ionicons name="trophy" size={40} color={colors.textInverse} />
            </View>
            <Text style={{
              fontSize: typography.fontSize.xxxl,
              fontWeight: typography.fontWeight.bold,
              color: colors.text,
            }}>
              Fantasy Markets
            </Text>
            <Text style={{
              fontSize: typography.fontSize.md,
              color: colors.textSecondary,
              marginTop: spacing.xs,
            }}>
              Trade. Predict. Win.
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
          <View style={{ marginBottom: spacing.xl }}>
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
                placeholder="Enter your password"
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
          </View>

          {/* Forgot Password */}
          <Pressable
            onPress={() => router.push("/(auth)/forgot-password")}
            style={{ alignSelf: "flex-end", marginBottom: spacing.xl }}
          >
            <Text style={{
              color: colors.accent,
              fontSize: typography.fontSize.sm,
            }}>
              Forgot Password?
            </Text>
          </Pressable>

          {/* Login Button */}
          <Pressable
            onPress={handleLogin}
            disabled={isLoading}
            style={{
              backgroundColor: isLoading ? colors.textSecondary : colors.primary,
              borderRadius: borderRadius.lg,
              padding: spacing.lg,
              alignItems: "center",
              marginBottom: spacing.lg,
            }}
          >
            <Text style={{
              color: colors.textInverse,
              fontSize: typography.fontSize.md,
              fontWeight: typography.fontWeight.semibold,
            }}>
              {isLoading ? "Signing In..." : "Sign In"}
            </Text>
          </Pressable>

          {/* Divider */}
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            marginVertical: spacing.lg,
          }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <Text style={{
              color: colors.textSecondary,
              paddingHorizontal: spacing.md,
              fontSize: typography.fontSize.sm,
            }}>
              or continue with
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>

          {/* Social Login */}
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <Pressable style={{
              flex: 1,
              backgroundColor: colors.card,
              borderRadius: borderRadius.lg,
              padding: spacing.md,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: spacing.sm,
            }}>
              <Ionicons name="logo-google" size={20} color={colors.text} />
              <Text style={{ color: colors.text }}>Google</Text>
            </Pressable>
            <Pressable style={{
              flex: 1,
              backgroundColor: colors.card,
              borderRadius: borderRadius.lg,
              padding: spacing.md,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: spacing.sm,
            }}>
              <Ionicons name="logo-apple" size={20} color={colors.text} />
              <Text style={{ color: colors.text }}>Apple</Text>
            </Pressable>
          </View>

          {/* Sign Up Link */}
          <View style={{
            flexDirection: "row",
            justifyContent: "center",
            marginTop: spacing.xxl,
          }}>
            <Text style={{ color: colors.textSecondary }}>
              Don't have an account?{" "}
            </Text>
            <Pressable onPress={() => router.push("/(auth)/register")}>
              <Text style={{ color: colors.accent, fontWeight: typography.fontWeight.semibold }}>
                Sign Up
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
