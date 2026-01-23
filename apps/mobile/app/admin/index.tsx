/**
 * Admin/Commissioner Dashboard
 */

import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import { useState, useCallback } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../services/api";
import { colors, spacing, borderRadius, typography } from "../../constants/theme";

interface LeagueAdmin {
  id: string;
  name: string;
  memberCount: number;
  teamCount: number;
  status: "pre_draft" | "active" | "playoffs" | "offseason";
  pendingActions: number;
}

export default function AdminDashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const { data: adminData, refetch } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => api.getAdminDashboard(),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const leagues: LeagueAdmin[] = adminData?.data?.leagues || [
    { id: "1", name: "Main League", memberCount: 10, teamCount: 10, status: "active", pendingActions: 3 },
    { id: "2", name: "Dynasty League", memberCount: 12, teamCount: 12, status: "active", pendingActions: 1 },
  ];

  const stats = adminData?.data?.stats || {
    totalUsers: 156,
    activeToday: 42,
    pendingTrades: 5,
    openDisputes: 2,
    revenue: 2450,
    activeBets: 89,
  };

  const recentActions = adminData?.data?.recentActions || [
    { id: "1", type: "trade_veto", description: "Vetoed trade in Main League", time: "2h ago" },
    { id: "2", type: "score_correction", description: "Score correction: Week 8", time: "5h ago" },
    { id: "3", type: "member_removed", description: "Removed inactive member", time: "1d ago" },
    { id: "4", type: "waiver_override", description: "Overrode waiver priority", time: "2d ago" },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: spacing.md }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.text }}>Commissioner Panel</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Quick Stats */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <StatCard label="Total Users" value={stats.totalUsers} icon="people" color={colors.primary} />
          <StatCard label="Active Today" value={stats.activeToday} icon="pulse" color={colors.primary} />
          <StatCard label="Pending Trades" value={stats.pendingTrades} icon="swap-horizontal" color={colors.warning} />
          <StatCard label="Open Disputes" value={stats.openDisputes} icon="alert-circle" color={colors.negative} />
          <StatCard label="Revenue" value={`$${stats.revenue}`} icon="cash" color={colors.primary} />
          <StatCard label="Active Bets" value={stats.activeBets} icon="trending-up" color="#8B5CF6" />
        </View>

        {/* Managed Leagues */}
        <View>
          <Text style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.bold, color: colors.text, marginBottom: spacing.md }}>Your Leagues</Text>
          {leagues.map((league) => (
            <Pressable
              key={league.id}
              onPress={() => router.push(`/league/${league.id}/commissioner`)}
              style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.text }}>{league.name}</Text>
                <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                  {league.memberCount}/{league.teamCount} members - {league.status.replace("_", " ")}
                </Text>
              </View>
              {league.pendingActions > 0 && (
                <View style={{ backgroundColor: colors.negative, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, marginRight: spacing.sm }}>
                  <Text style={{ color: colors.textInverse, fontSize: 11, fontWeight: typography.fontWeight.bold }}>{league.pendingActions}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </Pressable>
          ))}
        </View>

        {/* Admin Tools */}
        <View>
          <Text style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.bold, color: colors.text, marginBottom: spacing.md }}>Admin Tools</Text>
          <View style={{ gap: spacing.sm }}>
            <AdminToolButton icon="people" label="User Management" subtitle="View and manage all users" onPress={() => router.push("/admin/users")} />
            <AdminToolButton icon="swap-horizontal" label="Trade Review" subtitle="Review pending trades and disputes" onPress={() => router.push("/admin/trades")} />
            <AdminToolButton icon="cash" label="Financial Overview" subtitle="Revenue, payouts, and balances" onPress={() => router.push("/admin/finances")} />
            <AdminToolButton icon="trending-up" label="Market Management" subtitle="Create, resolve, and void markets" onPress={() => router.push("/admin/markets")} />
            <AdminToolButton icon="shield-checkmark" label="Moderation" subtitle="Reports, bans, and content review" onPress={() => router.push("/admin/moderation")} />
            <AdminToolButton icon="analytics" label="Analytics" subtitle="Platform usage and metrics" onPress={() => router.push("/admin/analytics")} />
            <AdminToolButton icon="settings" label="Platform Settings" subtitle="Global configuration" onPress={() => router.push("/admin/settings")} />
          </View>
        </View>

        {/* Recent Actions */}
        <View>
          <Text style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.bold, color: colors.text, marginBottom: spacing.md }}>Recent Actions</Text>
          <View style={{ backgroundColor: colors.card, borderRadius: borderRadius.lg, overflow: "hidden" }}>
            {recentActions.map((action, idx) => (
              <View key={action.id} style={{ flexDirection: "row", alignItems: "center", padding: spacing.md, borderBottomWidth: idx < recentActions.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                <Ionicons name="checkmark-circle" size={20} color={colors.primary} style={{ marginRight: spacing.md }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: typography.fontSize.sm, color: colors.text }}>{action.description}</Text>
                  <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>{action.time}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) {
  return (
    <View style={{ width: "48%", backgroundColor: colors.card, borderRadius: borderRadius.md, padding: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.sm }}>
        <Ionicons name={icon as any} size={16} color={color} style={{ marginRight: spacing.xs }} />
        <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>{label}</Text>
      </View>
      <Text style={{ fontSize: typography.fontSize.xxl, fontWeight: typography.fontWeight.bold, color: colors.text }}>{value}</Text>
    </View>
  );
}

function AdminToolButton({ icon, label, subtitle, onPress }: { icon: string; label: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: borderRadius.md, padding: spacing.md }}>
      <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.primary + "20", justifyContent: "center", alignItems: "center", marginRight: spacing.md }}>
        <Ionicons name={icon as any} size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.text }}>{label}</Text>
        <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </Pressable>
  );
}
