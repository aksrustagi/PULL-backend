/**
 * League Settings Screen
 */

import { View, Text, ScrollView, Pressable, Switch, TextInput, Alert } from "react-native";
import { useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../../services/api";
import { colors, spacing, borderRadius, typography } from "../../../constants/theme";

export default function LeagueSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: leagueData } = useQuery({
    queryKey: ["league", id],
    queryFn: () => api.getLeague(id),
  });

  const league = leagueData?.data;
  const [notifications, setNotifications] = useState({
    scoringUpdates: true,
    tradeProposals: true,
    waiverResults: true,
    draftReminders: true,
    chatMessages: false,
    injuryAlerts: true,
    weeklyRecap: true,
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: spacing.md }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.text }}>Settings</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl }}>
        {/* Notifications */}
        <View>
          <Text style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text, marginBottom: spacing.md }}>Notifications</Text>
          <View style={{ backgroundColor: colors.card, borderRadius: borderRadius.lg, overflow: "hidden" }}>
            {Object.entries(notifications).map(([key, value], index) => (
              <View key={key} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md, borderBottomWidth: index < Object.entries(notifications).length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                <Text style={{ color: colors.text, textTransform: "capitalize" }}>
                  {key.replace(/([A-Z])/g, " $1").trim()}
                </Text>
                <Switch
                  value={value}
                  onValueChange={(v) => setNotifications((n) => ({ ...n, [key]: v }))}
                  trackColor={{ true: colors.primary }}
                />
              </View>
            ))}
          </View>
        </View>

        {/* Display */}
        <View>
          <Text style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text, marginBottom: spacing.md }}>Display</Text>
          <View style={{ backgroundColor: colors.card, borderRadius: borderRadius.lg, overflow: "hidden" }}>
            <SettingRow label="Scoring Format" value={league?.scoringType?.toUpperCase() || "PPR"} />
            <SettingRow label="Team Name" value={league?.myTeamName || "My Team"} editable />
            <SettingRow label="Team Logo" value="Change" onPress={() => {}} />
          </View>
        </View>

        {/* League Info */}
        <View>
          <Text style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text, marginBottom: spacing.md }}>League Info</Text>
          <View style={{ backgroundColor: colors.card, borderRadius: borderRadius.lg, overflow: "hidden" }}>
            <SettingRow label="League ID" value={id} />
            <SettingRow label="Invite Code" value={league?.inviteCode || "ABC123"} onPress={() => Alert.alert("Copied!")} />
            <SettingRow label="Members" value={`${league?.memberCount || 0}/${league?.teamCount || 10}`} />
            <SettingRow label="Season" value={league?.seasonYear?.toString() || "2025"} />
          </View>
        </View>

        {/* Danger Zone */}
        <View>
          <Text style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.negative, marginBottom: spacing.md }}>Danger Zone</Text>
          <Pressable
            onPress={() => Alert.alert("Leave League", "Are you sure you want to leave this league?", [
              { text: "Cancel" },
              { text: "Leave", style: "destructive", onPress: () => router.replace("/(tabs)/leagues") },
            ])}
            style={{ backgroundColor: colors.negative + "20", borderRadius: borderRadius.lg, padding: spacing.lg, alignItems: "center" }}
          >
            <Text style={{ color: colors.negative, fontWeight: typography.fontWeight.semibold }}>Leave League</Text>
          </Pressable>
        </View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingRow({ label, value, editable, onPress }: { label: string; value: string; editable?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress && !editable} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ color: colors.textSecondary }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ color: colors.text, marginRight: onPress ? spacing.sm : 0 }}>{value}</Text>
        {(onPress || editable) && <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />}
      </View>
    </Pressable>
  );
}
