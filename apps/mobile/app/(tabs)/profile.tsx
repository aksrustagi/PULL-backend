/**
 * Profile Screen
 */

import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../../stores/auth";
import { colors, spacing, borderRadius, typography } from "../../constants/theme";

export default function ProfileScreen() {
  const { user, isAuthenticated, logout } = useAuthStore();

  const handleLogout = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            await logout();
            router.replace("/(auth)/login");
          },
        },
      ]
    );
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xl }}>
          <Ionicons name="person-circle-outline" size={80} color={colors.textSecondary} />
          <Text style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
            marginTop: spacing.lg,
          }}>
            Sign In Required
          </Text>
          <Text style={{
            fontSize: typography.fontSize.sm,
            color: colors.textSecondary,
            textAlign: "center",
            marginTop: spacing.sm,
          }}>
            Sign in to access your profile and settings.
          </Text>
          <Pressable
            onPress={() => router.push("/(auth)/login")}
            style={{
              backgroundColor: colors.primary,
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.xxl,
              borderRadius: borderRadius.lg,
              marginTop: spacing.xl,
            }}
          >
            <Text style={{
              fontSize: typography.fontSize.md,
              fontWeight: typography.fontWeight.semibold,
              color: colors.textInverse,
            }}>
              Sign In
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg }}>
        {/* Profile Header */}
        <View style={{
          backgroundColor: colors.card,
          borderRadius: borderRadius.lg,
          padding: spacing.xl,
          alignItems: "center",
          marginBottom: spacing.xl,
        }}>
          <View style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: colors.cardElevated,
            justifyContent: "center",
            alignItems: "center",
          }}>
            {user?.avatarUrl ? (
              <Text>Avatar</Text>
            ) : (
              <Text style={{ fontSize: 32 }}>
                {user?.displayName?.[0]?.toUpperCase() || "?"}
              </Text>
            )}
          </View>
          <Text style={{
            fontSize: typography.fontSize.xl,
            fontWeight: typography.fontWeight.bold,
            color: colors.text,
            marginTop: spacing.md,
          }}>
            {user?.displayName || "Fantasy Manager"}
          </Text>
          <Text style={{
            fontSize: typography.fontSize.sm,
            color: colors.textSecondary,
            marginTop: spacing.xs,
          }}>
            {user?.email}
          </Text>
        </View>

        {/* Wallet Balance */}
        <View style={{
          backgroundColor: colors.card,
          borderRadius: borderRadius.lg,
          padding: spacing.lg,
          marginBottom: spacing.xl,
        }}>
          <Text style={{
            fontSize: typography.fontSize.sm,
            color: colors.textSecondary,
          }}>
            Wallet Balance
          </Text>
          <Text style={{
            fontSize: typography.fontSize.xxxl,
            fontWeight: typography.fontWeight.bold,
            color: colors.primary,
            marginTop: spacing.xs,
          }}>
            ${(user?.walletBalance || 0).toFixed(2)}
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }}>
            <Pressable
              style={{
                flex: 1,
                backgroundColor: colors.primary,
                padding: spacing.md,
                borderRadius: borderRadius.md,
                alignItems: "center",
              }}
            >
              <Text style={{ color: colors.textInverse, fontWeight: typography.fontWeight.semibold }}>Deposit</Text>
            </Pressable>
            <Pressable
              style={{
                flex: 1,
                backgroundColor: colors.cardElevated,
                padding: spacing.md,
                borderRadius: borderRadius.md,
                alignItems: "center",
              }}
            >
              <Text style={{ color: colors.text, fontWeight: typography.fontWeight.semibold }}>Withdraw</Text>
            </Pressable>
          </View>
        </View>

        {/* Menu Items */}
        <View style={{ gap: spacing.sm }}>
          <MenuItem icon="trophy" label="My Teams" onPress={() => {}} />
          <MenuItem icon="stats-chart" label="Betting History" onPress={() => {}} />
          <MenuItem icon="ribbon" label="Achievements" onPress={() => {}} />
          <MenuItem icon="notifications" label="Notifications" onPress={() => {}} />
          <MenuItem icon="settings" label="Settings" onPress={() => {}} />
          <MenuItem icon="help-circle" label="Help & Support" onPress={() => {}} />
          <MenuItem icon="document-text" label="Terms & Privacy" onPress={() => {}} />
        </View>

        {/* Sign Out */}
        <Pressable
          onPress={handleLogout}
          style={{
            backgroundColor: colors.card,
            borderRadius: borderRadius.lg,
            padding: spacing.lg,
            marginTop: spacing.xl,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="log-out" size={20} color={colors.negative} />
          <Text style={{
            fontSize: typography.fontSize.md,
            fontWeight: typography.fontWeight.semibold,
            color: colors.negative,
            marginLeft: spacing.sm,
          }}>
            Sign Out
          </Text>
        </Pressable>

        {/* Version */}
        <Text style={{
          fontSize: typography.fontSize.xs,
          color: colors.textTertiary,
          textAlign: "center",
          marginTop: spacing.xl,
        }}>
          Fantasy Markets v1.0.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuItem({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.lg,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <Ionicons name={icon as any} size={22} color={colors.textSecondary} />
      <Text style={{
        fontSize: typography.fontSize.md,
        color: colors.text,
        marginLeft: spacing.md,
        flex: 1,
      }}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </Pressable>
  );
}
