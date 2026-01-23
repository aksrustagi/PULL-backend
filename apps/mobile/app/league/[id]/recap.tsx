/**
 * Weekly/Season Recap Screen
 */

import { View, Text, ScrollView, Pressable } from "react-native";
import { useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../../services/api";
import { colors, spacing, borderRadius, typography } from "../../../constants/theme";

export default function RecapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [selectedWeek, setSelectedWeek] = useState<number | "season">("season");

  const { data: recapData } = useQuery({
    queryKey: ["league", id, "recap", selectedWeek],
    queryFn: () => api.getLeagueRecap(id, selectedWeek === "season" ? undefined : selectedWeek),
  });

  const recap = recapData?.data;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: spacing.md }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.text, flex: 1 }}>Recap</Text>
      </View>

      {/* Week Selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}>
        <Pressable
          onPress={() => setSelectedWeek("season")}
          style={{ backgroundColor: selectedWeek === "season" ? colors.primary : colors.card, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.full }}
        >
          <Text style={{ color: selectedWeek === "season" ? colors.textInverse : colors.text, fontWeight: typography.fontWeight.medium }}>Season</Text>
        </Pressable>
        {Array.from({ length: 18 }, (_, i) => i + 1).map((week) => (
          <Pressable
            key={week}
            onPress={() => setSelectedWeek(week)}
            style={{ backgroundColor: selectedWeek === week ? colors.primary : colors.card, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.full }}
          >
            <Text style={{ color: selectedWeek === week ? colors.textInverse : colors.text }}>Wk {week}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        {/* High Score */}
        <AwardCard
          title={selectedWeek === "season" ? "Season High Score" : "High Score"}
          icon="trophy"
          iconColor={colors.warning}
          teamName={recap?.highScore?.teamName || "Team Alpha"}
          value={`${recap?.highScore?.points?.toFixed(1) || "186.4"} pts`}
          subtitle={selectedWeek === "season" ? `Week ${recap?.highScore?.week || 8}` : undefined}
        />

        {/* Low Score */}
        <AwardCard
          title={selectedWeek === "season" ? "Season Low Score" : "Low Score"}
          icon="trending-down"
          iconColor={colors.negative}
          teamName={recap?.lowScore?.teamName || "Team Omega"}
          value={`${recap?.lowScore?.points?.toFixed(1) || "62.3"} pts`}
          subtitle={selectedWeek === "season" ? `Week ${recap?.lowScore?.week || 3}` : undefined}
        />

        {/* Biggest Blowout */}
        <AwardCard
          title="Biggest Blowout"
          icon="flash"
          iconColor={colors.primary}
          teamName={recap?.blowout?.winnerName || "Team Bravo"}
          value={`Won by ${recap?.blowout?.margin?.toFixed(1) || "68.2"}`}
          subtitle={`vs ${recap?.blowout?.loserName || "Team Delta"}`}
        />

        {/* Closest Matchup */}
        <AwardCard
          title="Closest Matchup"
          icon="git-compare"
          iconColor={colors.accent}
          teamName={recap?.closest?.winnerName || "Team Echo"}
          value={`Won by ${recap?.closest?.margin?.toFixed(1) || "0.4"}`}
          subtitle={`vs ${recap?.closest?.loserName || "Team Foxtrot"}`}
        />

        {/* MVP */}
        <AwardCard
          title={selectedWeek === "season" ? "Season MVP" : "Player of the Week"}
          icon="star"
          iconColor={colors.warning}
          teamName={recap?.mvp?.playerName || "Patrick Mahomes"}
          value={`${recap?.mvp?.points?.toFixed(1) || "42.8"} pts`}
          subtitle={recap?.mvp?.team || "KC - QB"}
        />

        {/* Bust */}
        <AwardCard
          title={selectedWeek === "season" ? "Biggest Bust" : "Bust of the Week"}
          icon="thumbs-down"
          iconColor={colors.negative}
          teamName={recap?.bust?.playerName || "Underperformer"}
          value={`${recap?.bust?.points?.toFixed(1) || "1.2"} pts`}
          subtitle={`Projected ${recap?.bust?.projected?.toFixed(1) || "18.5"}`}
        />

        {/* Transactions */}
        <View style={{ backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.lg }}>
          <Text style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.text, marginBottom: spacing.md }}>
            {selectedWeek === "season" ? "Season Activity" : "Week Activity"}
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
            <StatBubble label="Trades" value={recap?.activity?.trades || 5} />
            <StatBubble label="Waivers" value={recap?.activity?.waivers || 23} />
            <StatBubble label="Add/Drops" value={recap?.activity?.addDrops || 45} />
            <StatBubble label="Bets" value={recap?.activity?.bets || 67} />
          </View>
        </View>

        {/* Power Rankings */}
        <View style={{ backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.lg }}>
          <Text style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.text, marginBottom: spacing.md }}>Power Rankings</Text>
          {(recap?.powerRankings || [
            { rank: 1, teamName: "Team Alpha", score: 95, trend: "up" },
            { rank: 2, teamName: "Team Bravo", score: 91, trend: "stable" },
            { rank: 3, teamName: "Team Charlie", score: 88, trend: "down" },
            { rank: 4, teamName: "Team Delta", score: 84, trend: "up" },
            { rank: 5, teamName: "Team Echo", score: 80, trend: "down" },
          ]).map((team: any) => (
            <View key={team.rank} style={{ flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ width: 24, color: colors.textSecondary, fontWeight: typography.fontWeight.bold }}>{team.rank}</Text>
              <Ionicons
                name={team.trend === "up" ? "arrow-up" : team.trend === "down" ? "arrow-down" : "remove"}
                size={14}
                color={team.trend === "up" ? colors.primary : team.trend === "down" ? colors.negative : colors.textSecondary}
                style={{ marginRight: spacing.sm }}
              />
              <Text style={{ flex: 1, color: colors.text }}>{team.teamName}</Text>
              <Text style={{ color: colors.textSecondary }}>{team.score}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function AwardCard({ title, icon, iconColor, teamName, value, subtitle }: {
  title: string; icon: string; iconColor: string; teamName: string; value: string; subtitle?: string;
}) {
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.lg, flexDirection: "row", alignItems: "center" }}>
      <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: iconColor + "20", justifyContent: "center", alignItems: "center", marginRight: spacing.md }}>
        <Ionicons name={icon as any} size={24} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary, textTransform: "uppercase" }}>{title}</Text>
        <Text style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.text }}>{teamName}</Text>
        {subtitle && <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>{subtitle}</Text>}
      </View>
      <Text style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: colors.primary }}>{value}</Text>
    </View>
  );
}

function StatBubble({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ fontSize: typography.fontSize.xxl, fontWeight: typography.fontWeight.bold, color: colors.primary }}>{value}</Text>
      <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>{label}</Text>
    </View>
  );
}
