/**
 * Notifications Inbox Screen
 */

import { View, Text, Pressable, FlatList, RefreshControl } from "react-native";
import { useState, useCallback } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../services/api";
import { colors, spacing, borderRadius, typography } from "../../constants/theme";

type NotificationCategory = "all" | "trades" | "league" | "scoring" | "markets" | "social";

interface AppNotification {
  id: string;
  type: string;
  category: string;
  priority: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  actions: { label: string; type: string; payload: any }[];
  metadata: Record<string, any>;
}

const CATEGORY_ICONS: Record<string, string> = {
  trades: "swap-horizontal",
  league: "trophy",
  scoring: "stats-chart",
  markets: "trending-up",
  social: "people",
  system: "information-circle",
};

const CATEGORY_COLORS: Record<string, string> = {
  trades: colors.accent,
  league: colors.warning,
  scoring: colors.primary,
  markets: "#8B5CF6",
  social: "#EC4899",
  system: colors.textSecondary,
};

export default function NotificationsScreen() {
  const [category, setCategory] = useState<NotificationCategory>("all");
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const { data, refetch } = useQuery({
    queryKey: ["notifications", category],
    queryFn: () => api.getNotifications({ category: category === "all" ? undefined : category }),
  });

  const markReadMutation = useMutation({
    mutationFn: (ids: string[]) => api.markNotificationsRead(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.markAllNotificationsRead(category === "all" ? undefined : category),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const notifications: AppNotification[] = data?.data?.notifications || [];
  const unreadCount = data?.data?.unreadCount || 0;

  const handleNotificationPress = (notification: AppNotification) => {
    if (!notification.read) {
      markReadMutation.mutate([notification.id]);
    }

    // Navigate based on first navigate action
    const navAction = notification.actions.find(a => a.type === "navigate");
    if (navAction?.payload?.route) {
      router.push(navAction.payload.route);
    }
  };

  const getTimeAgo = (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return `${Math.floor(days / 7)}w`;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable onPress={() => router.back()} style={{ marginRight: spacing.md }}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.text }}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={{ backgroundColor: colors.negative, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginLeft: spacing.sm }}>
              <Text style={{ color: colors.textInverse, fontSize: 11, fontWeight: typography.fontWeight.bold }}>{unreadCount}</Text>
            </View>
          )}
        </View>
        {unreadCount > 0 && (
          <Pressable onPress={() => markAllReadMutation.mutate()}>
            <Text style={{ color: colors.primary, fontSize: typography.fontSize.sm }}>Mark All Read</Text>
          </Pressable>
        )}
      </View>

      {/* Category Tabs */}
      <View style={{ flexDirection: "row", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {(["all", "trades", "league", "scoring", "markets", "social"] as const).map((cat) => (
          <Pressable
            key={cat}
            onPress={() => setCategory(cat)}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: spacing.sm,
              borderRadius: borderRadius.md,
              backgroundColor: category === cat ? colors.primary + "20" : "transparent",
            }}
          >
            <Ionicons
              name={(cat === "all" ? "notifications" : CATEGORY_ICONS[cat]) as any}
              size={18}
              color={category === cat ? colors.primary : colors.textSecondary}
            />
            <Text style={{
              fontSize: 10,
              color: category === cat ? colors.primary : colors.textSecondary,
              marginTop: 2,
              textTransform: "capitalize",
            }}>
              {cat}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Notifications List */}
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ padding: spacing.md }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handleNotificationPress(item)}
            style={{
              flexDirection: "row",
              padding: spacing.md,
              marginBottom: spacing.sm,
              backgroundColor: item.read ? colors.card : colors.primary + "08",
              borderRadius: borderRadius.md,
              borderLeftWidth: item.read ? 0 : 3,
              borderLeftColor: CATEGORY_COLORS[item.category] || colors.primary,
            }}
          >
            <View style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: (CATEGORY_COLORS[item.category] || colors.primary) + "20",
              justifyContent: "center",
              alignItems: "center",
              marginRight: spacing.md,
            }}>
              <Ionicons
                name={(CATEGORY_ICONS[item.category] || "notifications") as any}
                size={18}
                color={CATEGORY_COLORS[item.category] || colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{
                  fontSize: typography.fontSize.sm,
                  fontWeight: item.read ? typography.fontWeight.regular : typography.fontWeight.bold,
                  color: colors.text,
                  flex: 1,
                }}>
                  {item.title}
                </Text>
                <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary, marginLeft: spacing.sm }}>
                  {getTimeAgo(item.createdAt)}
                </Text>
              </View>
              <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2 }} numberOfLines={2}>
                {item.body}
              </Text>
              {/* Action buttons */}
              {!item.read && item.actions.filter(a => a.type === "api_call").length > 0 && (
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                  {item.actions.filter(a => a.type === "api_call").map((action, idx) => (
                    <Pressable
                      key={idx}
                      style={{
                        paddingVertical: spacing.xs,
                        paddingHorizontal: spacing.sm,
                        backgroundColor: idx === 0 ? colors.primary : colors.card,
                        borderRadius: borderRadius.sm,
                      }}
                    >
                      <Text style={{
                        fontSize: typography.fontSize.xs,
                        fontWeight: typography.fontWeight.medium,
                        color: idx === 0 ? colors.textInverse : colors.text,
                      }}>
                        {action.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
            {!item.read && (
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginLeft: spacing.sm, marginTop: 4 }} />
            )}
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={{ padding: spacing.xxl, alignItems: "center" }}>
            <Ionicons name="notifications-off" size={64} color={colors.textSecondary} />
            <Text style={{ fontSize: typography.fontSize.lg, color: colors.text, marginTop: spacing.lg }}>No Notifications</Text>
            <Text style={{ color: colors.textSecondary, marginTop: spacing.sm, textAlign: "center" }}>
              You're all caught up! New notifications will appear here.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
