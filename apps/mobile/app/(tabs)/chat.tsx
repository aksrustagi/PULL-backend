/**
 * Chat Screen - League Chat Rooms
 */

import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import { useState, useCallback } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, borderRadius, typography } from "../../constants/theme";

// Mock data for now
const MOCK_ROOMS = [
  {
    id: "1",
    name: "Dynasty League Chat",
    avatarUrl: null,
    memberCount: 12,
    lastMessageAt: Date.now() - 1000 * 60 * 5,
    lastMessagePreview: "Anyone interested in trading Ja'Marr Chase?",
    unreadCount: 3,
  },
  {
    id: "2",
    name: "Work League",
    avatarUrl: null,
    memberCount: 10,
    lastMessageAt: Date.now() - 1000 * 60 * 60,
    lastMessagePreview: "Good luck everyone this week!",
    unreadCount: 0,
  },
  {
    id: "3",
    name: "Family Fantasy",
    avatarUrl: null,
    memberCount: 8,
    lastMessageAt: Date.now() - 1000 * 60 * 60 * 24,
    lastMessagePreview: "Dad, stop picking up kickers early 😂",
    unreadCount: 12,
  },
];

export default function ChatScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Refresh rooms
    setRefreshing(false);
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Header */}
        <View style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: spacing.xl,
        }}>
          <Text style={{
            fontSize: typography.fontSize.xxl,
            fontWeight: typography.fontWeight.bold,
            color: colors.text,
          }}>
            Messages
          </Text>
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: colors.card,
              padding: spacing.sm,
              borderRadius: borderRadius.full,
            }}
          >
            <Ionicons name="create-outline" size={24} color={colors.accent} />
          </Pressable>
        </View>

        {/* Chat Rooms */}
        <View style={{ gap: spacing.sm }}>
          {MOCK_ROOMS.map((room) => (
            <ChatRoomCard key={room.id} room={room} />
          ))}
        </View>

        {MOCK_ROOMS.length === 0 && (
          <View style={{
            backgroundColor: colors.card,
            borderRadius: borderRadius.lg,
            padding: spacing.xxl,
            alignItems: "center",
          }}>
            <Ionicons name="chatbubbles-outline" size={64} color={colors.textSecondary} />
            <Text style={{
              fontSize: typography.fontSize.lg,
              fontWeight: typography.fontWeight.semibold,
              color: colors.text,
              marginTop: spacing.lg,
            }}>
              No Messages Yet
            </Text>
            <Text style={{
              fontSize: typography.fontSize.sm,
              color: colors.textSecondary,
              textAlign: "center",
              marginTop: spacing.sm,
            }}>
              Join a league to start chatting with other managers.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ChatRoomCard({ room }: { room: typeof MOCK_ROOMS[0] }) {
  const timeAgo = getTimeAgo(room.lastMessageAt);

  return (
    <Pressable
      onPress={() => router.push(`/chat/${room.id}`)}
      style={{
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <View style={{
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: colors.cardElevated,
        justifyContent: "center",
        alignItems: "center",
        marginRight: spacing.md,
      }}>
        <Ionicons name="people" size={24} color={colors.primary} />
      </View>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{
            fontSize: typography.fontSize.md,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
          }}>
            {room.name}
          </Text>
          <Text style={{
            fontSize: typography.fontSize.xs,
            color: colors.textSecondary,
          }}>
            {timeAgo}
          </Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.xs }}>
          <Text style={{
            fontSize: typography.fontSize.sm,
            color: colors.textSecondary,
            flex: 1,
          }} numberOfLines={1}>
            {room.lastMessagePreview}
          </Text>
          {room.unreadCount > 0 && (
            <View style={{
              backgroundColor: colors.primary,
              minWidth: 20,
              height: 20,
              borderRadius: 10,
              justifyContent: "center",
              alignItems: "center",
              marginLeft: spacing.sm,
              paddingHorizontal: spacing.xs,
            }}>
              <Text style={{
                fontSize: typography.fontSize.xs,
                fontWeight: typography.fontWeight.bold,
                color: colors.textInverse,
              }}>
                {room.unreadCount > 99 ? "99+" : room.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function getTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return new Date(timestamp).toLocaleDateString();
}
