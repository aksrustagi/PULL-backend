/**
 * Commissioner Tools Screen
 */

import { View, Text, ScrollView, Pressable, Alert, Switch } from "react-native";
import { useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../../services/api";
import { colors, spacing, borderRadius, typography } from "../../../constants/theme";

type ToolSection = "roster" | "scoring" | "schedule" | "members" | "settings";

export default function CommissionerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [activeSection, setActiveSection] = useState<ToolSection>("roster");
  const queryClient = useQueryClient();

  const { data: leagueData } = useQuery({
    queryKey: ["league", id],
    queryFn: () => api.getLeague(id),
  });

  const league = leagueData?.data;

  const scoreCorrectionMutation = useMutation({
    mutationFn: (params: { teamId: string; week: number; adjustment: number; reason: string }) =>
      api.commissionerScoreCorrection(id, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["league", id] });
      Alert.alert("Success", "Score correction applied");
    },
  });

  const rosterMoveMutation = useMutation({
    mutationFn: (params: { teamId: string; playerId: string; action: "add" | "drop" | "ir" }) =>
      api.commissionerRosterMove(id, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["league", id] });
      Alert.alert("Success", "Roster move completed");
    },
  });

  const tools: Array<{ id: ToolSection; label: string; icon: string }> = [
    { id: "roster", label: "Roster", icon: "people" },
    { id: "scoring", label: "Scoring", icon: "calculator" },
    { id: "schedule", label: "Schedule", icon: "calendar" },
    { id: "members", label: "Members", icon: "person-add" },
    { id: "settings", label: "Settings", icon: "settings" },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: spacing.md }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.text, flex: 1 }}>Commissioner Tools</Text>
      </View>

      {/* Tool Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}>
        {tools.map((tool) => (
          <Pressable
            key={tool.id}
            onPress={() => setActiveSection(tool.id)}
            style={{ flexDirection: "row", alignItems: "center", backgroundColor: activeSection === tool.id ? colors.primary : colors.card, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.full, gap: spacing.xs }}
          >
            <Ionicons name={tool.icon as any} size={16} color={activeSection === tool.id ? colors.textInverse : colors.textSecondary} />
            <Text style={{ color: activeSection === tool.id ? colors.textInverse : colors.text, fontWeight: typography.fontWeight.medium, fontSize: typography.fontSize.sm }}>{tool.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg }}>
        {activeSection === "roster" && (
          <View style={{ gap: spacing.lg }}>
            <Text style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text }}>Roster Management</Text>

            <ToolCard title="Add Player to Team" description="Force-add a player to any team's roster" icon="person-add" onPress={() => Alert.alert("Add Player", "Select team and player to add")} />
            <ToolCard title="Drop Player from Team" description="Force-drop a player from any team" icon="person-remove" onPress={() => Alert.alert("Drop Player", "Select team and player to drop")} />
            <ToolCard title="Move Player to IR" description="Place a player on injured reserve" icon="medkit" onPress={() => Alert.alert("IR Move", "Select team and player for IR")} />
            <ToolCard title="Force Trade" description="Execute a trade between two teams" icon="swap-horizontal" onPress={() => Alert.alert("Force Trade", "Configure trade between teams")} />
            <ToolCard title="Lock/Unlock Rosters" description="Prevent or allow roster changes" icon="lock-closed" onPress={() => Alert.alert("Roster Lock", "Toggle roster lock for all teams")} />
          </View>
        )}

        {activeSection === "scoring" && (
          <View style={{ gap: spacing.lg }}>
            <Text style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text }}>Scoring Corrections</Text>

            <ToolCard title="Adjust Team Score" description="Add or subtract points from a team's weekly score" icon="create" onPress={() => Alert.alert("Score Adjustment", "Select team, week, and point adjustment")} />
            <ToolCard title="Recalculate Scores" description="Recalculate all scores for a specific week" icon="refresh" onPress={() => Alert.alert("Recalculate", "This will recalculate all scores for the selected week")} />
            <ToolCard title="Change Scoring Rules" description="Modify league scoring settings" icon="options" onPress={() => router.push(`/league/${id}/settings/scoring`)} />
            <ToolCard title="Stat Corrections" description="View and apply NFL stat corrections" icon="analytics" onPress={() => Alert.alert("Stat Corrections", "NFL stat corrections for recent weeks")} />
          </View>
        )}

        {activeSection === "schedule" && (
          <View style={{ gap: spacing.lg }}>
            <Text style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text }}>Schedule Management</Text>

            <ToolCard title="Edit Matchups" description="Change weekly matchup pairings" icon="git-compare" onPress={() => Alert.alert("Edit Matchups", "Select week to modify matchups")} />
            <ToolCard title="Randomize Schedule" description="Generate a new random schedule" icon="shuffle" onPress={() => Alert.alert("Randomize", "This will generate a new schedule. Current matchups will be lost.")} />
            <ToolCard title="Set Playoff Bracket" description="Configure playoff seeding and matchups" icon="trophy" onPress={() => Alert.alert("Playoffs", "Configure playoff settings")} />
            <ToolCard title="Change Trade Deadline" description="Move the trade deadline to a different week" icon="time" onPress={() => Alert.alert("Trade Deadline", "Select new trade deadline week")} />
          </View>
        )}

        {activeSection === "members" && (
          <View style={{ gap: spacing.lg }}>
            <Text style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text }}>Member Management</Text>

            <ToolCard title="Invite Members" description="Generate invite link or send invitations" icon="mail" onPress={() => Alert.alert("Invite", "Share invite code: ABC123")} />
            <ToolCard title="Remove Member" description="Remove a member from the league" icon="person-remove" onPress={() => Alert.alert("Remove", "Select member to remove")} />
            <ToolCard title="Transfer Ownership" description="Make another member the commissioner" icon="key" onPress={() => Alert.alert("Transfer", "This will make another member the commissioner")} />
            <ToolCard title="Add Co-Commissioner" description="Grant commissioner powers to another member" icon="people" onPress={() => Alert.alert("Co-Commissioner", "Select member to promote")} />
            <ToolCard title="Reset Team" description="Reset a team's roster to empty" icon="trash" onPress={() => Alert.alert("Reset Team", "This action cannot be undone")} />
          </View>
        )}

        {activeSection === "settings" && (
          <View style={{ gap: spacing.lg }}>
            <Text style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text }}>League Settings</Text>

            <ToolCard title="Rename League" description="Change the league name" icon="create" onPress={() => Alert.alert("Rename", "Enter new league name")} />
            <ToolCard title="Change Draft Settings" description="Modify draft type, order, or date" icon="list" onPress={() => Alert.alert("Draft Settings", "Configure draft settings")} />
            <ToolCard title="Waiver Settings" description="Change waiver type and processing day" icon="time" onPress={() => Alert.alert("Waivers", "Configure waiver settings")} />
            <ToolCard title="Delete League" description="Permanently delete this league" icon="trash" onPress={() => Alert.alert("Delete League", "Are you sure? This cannot be undone.", [{ text: "Cancel" }, { text: "Delete", style: "destructive" }])} />

            <View style={{ backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.lg, gap: spacing.md }}>
              <Text style={{ color: colors.text, fontWeight: typography.fontWeight.semibold, marginBottom: spacing.sm }}>Quick Settings</Text>
              {[
                { label: "Allow Trades", key: "tradesEnabled" },
                { label: "Trade Review Required", key: "tradeReview" },
                { label: "Public Matchup Scores", key: "publicScores" },
                { label: "Chat Enabled", key: "chatEnabled" },
              ].map((setting) => (
                <View key={setting.key} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: colors.textSecondary }}>{setting.label}</Text>
                  <Switch value={true} trackColor={{ true: colors.primary }} />
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ToolCard({ title, description, icon, onPress }: { title: string; description: string; icon: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.lg, flexDirection: "row", alignItems: "center" }}>
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary + "20", justifyContent: "center", alignItems: "center", marginRight: spacing.md }}>
        <Ionicons name={icon as any} size={22} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.text }}>{title}</Text>
        <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2 }}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </Pressable>
  );
}
