/**
 * Chat Room Screen
 */

import { View, Text, FlatList, TextInput, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useState, useRef, useEffect } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../services/api";
import { useAuthStore } from "../../stores/auth";
import { colors, spacing, borderRadius, typography } from "../../constants/theme";

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  timestamp: number;
  isSystem?: boolean;
}

export default function ChatRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [message, setMessage] = useState("");
  const flatListRef = useRef<FlatList>(null);

  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: roomData } = useQuery({
    queryKey: ["chat", id],
    queryFn: () => api.getChatRoom(id),
  });

  const { data: messagesData, refetch } = useQuery({
    queryKey: ["chat", id, "messages"],
    queryFn: () => api.getChatMessages(id),
    refetchInterval: 3000, // Poll for new messages
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) => api.sendChatMessage(id, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat", id, "messages"] });
      setMessage("");
    },
  });

  const room = roomData?.data;
  const messages = (messagesData?.data || []) as Message[];

  useEffect(() => {
    // Scroll to bottom on new messages
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const handleSend = () => {
    if (!message.trim()) return;
    sendMutation.mutate(message.trim());
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMe = item.senderId === user?.id;
    const prevMessage = messages[index - 1];
    const showSender = !isMe && (!prevMessage || prevMessage.senderId !== item.senderId);

    if (item.isSystem) {
      return (
        <View style={{
          alignItems: "center",
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.lg,
        }}>
          <Text style={{
            fontSize: typography.fontSize.xs,
            color: colors.textTertiary,
            fontStyle: "italic",
          }}>
            {item.content}
          </Text>
        </View>
      );
    }

    return (
      <View style={{
        alignSelf: isMe ? "flex-end" : "flex-start",
        maxWidth: "80%",
        marginVertical: spacing.xs,
        marginHorizontal: spacing.lg,
      }}>
        {showSender && (
          <Text style={{
            fontSize: typography.fontSize.xs,
            color: colors.textSecondary,
            marginBottom: spacing.xs,
            marginLeft: spacing.xs,
          }}>
            {item.senderName}
          </Text>
        )}
        <View style={{
          backgroundColor: isMe ? colors.primary : colors.card,
          borderRadius: borderRadius.lg,
          borderTopLeftRadius: isMe ? borderRadius.lg : spacing.xs,
          borderTopRightRadius: isMe ? spacing.xs : borderRadius.lg,
          padding: spacing.md,
        }}>
          <Text style={{
            fontSize: typography.fontSize.md,
            color: isMe ? colors.textInverse : colors.text,
            lineHeight: 22,
          }}>
            {item.content}
          </Text>
          <Text style={{
            fontSize: 10,
            color: isMe ? colors.textInverse + "80" : colors.textTertiary,
            marginTop: spacing.xs,
            alignSelf: "flex-end",
          }}>
            {formatTime(item.timestamp)}
          </Text>
        </View>
      </View>
    );
  };

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
        <View style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.cardElevated,
          justifyContent: "center",
          alignItems: "center",
          marginRight: spacing.md,
        }}>
          <Ionicons name="people" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{
            fontSize: typography.fontSize.md,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
          }}>
            {room?.name || "Chat"}
          </Text>
          <Text style={{
            fontSize: typography.fontSize.xs,
            color: colors.textSecondary,
          }}>
            {room?.memberCount || 0} members
          </Text>
        </View>
        <Pressable onPress={() => router.push(`/chat/${id}/settings`)}>
          <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={{ paddingVertical: spacing.md }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              padding: spacing.xxl,
            }}>
              <Ionicons name="chatbubble-outline" size={64} color={colors.textSecondary} />
              <Text style={{
                fontSize: typography.fontSize.lg,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text,
                marginTop: spacing.lg,
              }}>
                No messages yet
              </Text>
              <Text style={{
                fontSize: typography.fontSize.sm,
                color: colors.textSecondary,
                textAlign: "center",
                marginTop: spacing.sm,
              }}>
                Be the first to send a message!
              </Text>
            </View>
          }
        />

        {/* Input */}
        <View style={{
          flexDirection: "row",
          alignItems: "flex-end",
          padding: spacing.md,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.background,
        }}>
          <Pressable style={{
            padding: spacing.sm,
            marginRight: spacing.xs,
          }}>
            <Ionicons name="add-circle-outline" size={28} color={colors.textSecondary} />
          </Pressable>

          <View style={{
            flex: 1,
            backgroundColor: colors.card,
            borderRadius: borderRadius.full,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            flexDirection: "row",
            alignItems: "flex-end",
            maxHeight: 120,
          }}>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Type a message..."
              placeholderTextColor={colors.textTertiary}
              multiline
              style={{
                flex: 1,
                fontSize: typography.fontSize.md,
                color: colors.text,
                maxHeight: 100,
                paddingVertical: spacing.xs,
              }}
            />
            <Pressable style={{ marginLeft: spacing.sm }}>
              <Ionicons name="happy-outline" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          <Pressable
            onPress={handleSend}
            disabled={!message.trim() || sendMutation.isPending}
            style={{
              backgroundColor: message.trim() ? colors.primary : colors.card,
              width: 44,
              height: 44,
              borderRadius: 22,
              justifyContent: "center",
              alignItems: "center",
              marginLeft: spacing.sm,
            }}
          >
            <Ionicons
              name="send"
              size={20}
              color={message.trim() ? colors.textInverse : colors.textSecondary}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
