/**
 * League Creation Wizard
 */

import { View, Text, ScrollView, Pressable, TextInput, Switch } from "react-native";
import { useState } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../services/api";
import { colors, spacing, borderRadius, typography } from "../../constants/theme";

type Step = "basics" | "scoring" | "roster" | "schedule" | "review";

const STEPS: Step[] = ["basics", "scoring", "roster", "schedule", "review"];

export default function CreateLeagueScreen() {
  const [currentStep, setCurrentStep] = useState<Step>("basics");
  const [leagueData, setLeagueData] = useState({
    name: "",
    teamCount: 10,
    scoringType: "ppr" as "ppr" | "half_ppr" | "standard",
    draftType: "snake" as "snake" | "auction" | "linear",
    isPublic: false,
    rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1, BN: 6, IR: 2 },
    waiverType: "faab" as "faab" | "rolling" | "reverse_standings",
    faabBudget: 100,
    tradeDeadlineWeek: 11,
    playoffTeams: 6,
    playoffStartWeek: 15,
    seasonYear: 2025,
  });

  const createMutation = useMutation({
    mutationFn: () => api.createLeague(leagueData),
    onSuccess: (data: any) => {
      router.replace(`/league/${data.data.id}`);
    },
  });

  const stepIndex = STEPS.indexOf(currentStep);
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  const goNext = () => {
    if (isLast) {
      createMutation.mutate();
    } else {
      setCurrentStep(STEPS[stepIndex + 1]);
    }
  };

  const goBack = () => {
    if (isFirst) {
      router.back();
    } else {
      setCurrentStep(STEPS[stepIndex - 1]);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={goBack} style={{ marginRight: spacing.md }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.text, flex: 1 }}>
          Create League
        </Text>
        <Text style={{ color: colors.textSecondary }}>{stepIndex + 1}/{STEPS.length}</Text>
      </View>

      {/* Progress Bar */}
      <View style={{ height: 4, backgroundColor: colors.card, flexDirection: "row" }}>
        {STEPS.map((step, i) => (
          <View key={step} style={{ flex: 1, backgroundColor: i <= stepIndex ? colors.primary : colors.card, marginHorizontal: 1 }} />
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg }}>
        {currentStep === "basics" && (
          <View style={{ gap: spacing.lg }}>
            <Text style={{ fontSize: typography.fontSize.xxl, fontWeight: typography.fontWeight.bold, color: colors.text }}>League Basics</Text>

            <View>
              <Text style={{ fontSize: typography.fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>League Name</Text>
              <TextInput
                value={leagueData.name}
                onChangeText={(name) => setLeagueData((d) => ({ ...d, name }))}
                placeholder="My Fantasy League"
                placeholderTextColor={colors.textTertiary}
                style={{ backgroundColor: colors.card, borderRadius: borderRadius.md, padding: spacing.md, color: colors.text, fontSize: typography.fontSize.md }}
              />
            </View>

            <View>
              <Text style={{ fontSize: typography.fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>Number of Teams</Text>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                {[8, 10, 12, 14, 16].map((count) => (
                  <Pressable
                    key={count}
                    onPress={() => setLeagueData((d) => ({ ...d, teamCount: count }))}
                    style={{ flex: 1, backgroundColor: leagueData.teamCount === count ? colors.primary : colors.card, padding: spacing.md, borderRadius: borderRadius.md, alignItems: "center" }}
                  >
                    <Text style={{ color: leagueData.teamCount === count ? colors.textInverse : colors.text, fontWeight: typography.fontWeight.semibold }}>{count}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View>
              <Text style={{ fontSize: typography.fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>Draft Type</Text>
              {(["snake", "auction", "linear"] as const).map((type) => (
                <Pressable
                  key={type}
                  onPress={() => setLeagueData((d) => ({ ...d, draftType: type }))}
                  style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 2, borderColor: leagueData.draftType === type ? colors.primary : "transparent" }}
                >
                  <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: leagueData.draftType === type ? colors.primary : colors.textSecondary, justifyContent: "center", alignItems: "center", marginRight: spacing.md }}>
                    {leagueData.draftType === type && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />}
                  </View>
                  <View>
                    <Text style={{ color: colors.text, fontWeight: typography.fontWeight.medium, textTransform: "capitalize" }}>{type}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs }}>
                      {type === "snake" ? "Alternating pick order each round" : type === "auction" ? "Bid on players with budget" : "Same order every round"}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.card, borderRadius: borderRadius.md, padding: spacing.md }}>
              <View>
                <Text style={{ color: colors.text, fontWeight: typography.fontWeight.medium }}>Public League</Text>
                <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs }}>Anyone can find and join</Text>
              </View>
              <Switch value={leagueData.isPublic} onValueChange={(isPublic) => setLeagueData((d) => ({ ...d, isPublic }))} trackColor={{ true: colors.primary }} />
            </View>
          </View>
        )}

        {currentStep === "scoring" && (
          <View style={{ gap: spacing.lg }}>
            <Text style={{ fontSize: typography.fontSize.xxl, fontWeight: typography.fontWeight.bold, color: colors.text }}>Scoring Settings</Text>

            <View>
              <Text style={{ fontSize: typography.fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>Scoring Format</Text>
              {(["ppr", "half_ppr", "standard"] as const).map((type) => (
                <Pressable
                  key={type}
                  onPress={() => setLeagueData((d) => ({ ...d, scoringType: type }))}
                  style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 2, borderColor: leagueData.scoringType === type ? colors.primary : "transparent" }}
                >
                  <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: leagueData.scoringType === type ? colors.primary : colors.textSecondary, justifyContent: "center", alignItems: "center", marginRight: spacing.md }}>
                    {leagueData.scoringType === type && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />}
                  </View>
                  <View>
                    <Text style={{ color: colors.text, fontWeight: typography.fontWeight.medium }}>
                      {type === "ppr" ? "PPR (1 pt per reception)" : type === "half_ppr" ? "Half PPR (0.5 pt per reception)" : "Standard (no reception bonus)"}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>

            <View style={{ backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.lg }}>
              <Text style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.text, marginBottom: spacing.md }}>Scoring Preview</Text>
              {[
                { label: "Passing TD", value: "4 pts" },
                { label: "Passing Yard", value: "0.04 pts" },
                { label: "Rushing/Receiving TD", value: "6 pts" },
                { label: "Rushing/Receiving Yard", value: "0.1 pts" },
                { label: "Reception", value: leagueData.scoringType === "ppr" ? "1 pt" : leagueData.scoringType === "half_ppr" ? "0.5 pts" : "0 pts" },
                { label: "Interception", value: "-2 pts" },
                { label: "Fumble Lost", value: "-2 pts" },
              ].map((item) => (
                <View key={item.label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs }}>
                  <Text style={{ color: colors.textSecondary }}>{item.label}</Text>
                  <Text style={{ color: colors.text, fontWeight: typography.fontWeight.medium }}>{item.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {currentStep === "roster" && (
          <View style={{ gap: spacing.lg }}>
            <Text style={{ fontSize: typography.fontSize.xxl, fontWeight: typography.fontWeight.bold, color: colors.text }}>Roster Settings</Text>

            <View style={{ backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.lg }}>
              {Object.entries(leagueData.rosterSlots).map(([pos, count]) => (
                <View key={pos} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ color: colors.text, fontWeight: typography.fontWeight.medium }}>{pos}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                    <Pressable
                      onPress={() => setLeagueData((d) => ({ ...d, rosterSlots: { ...d.rosterSlots, [pos]: Math.max(0, count - 1) } }))}
                      style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.cardElevated, justifyContent: "center", alignItems: "center" }}
                    >
                      <Ionicons name="remove" size={18} color={colors.text} />
                    </Pressable>
                    <Text style={{ color: colors.text, fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, width: 24, textAlign: "center" }}>{count}</Text>
                    <Pressable
                      onPress={() => setLeagueData((d) => ({ ...d, rosterSlots: { ...d.rosterSlots, [pos]: count + 1 } }))}
                      style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, justifyContent: "center", alignItems: "center" }}
                    >
                      <Ionicons name="add" size={18} color={colors.textInverse} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>

            <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
              Total roster size: {Object.values(leagueData.rosterSlots).reduce((a, b) => a + b, 0)} players
            </Text>
          </View>
        )}

        {currentStep === "schedule" && (
          <View style={{ gap: spacing.lg }}>
            <Text style={{ fontSize: typography.fontSize.xxl, fontWeight: typography.fontWeight.bold, color: colors.text }}>Schedule & Waivers</Text>

            <View>
              <Text style={{ fontSize: typography.fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>Waiver Type</Text>
              {(["faab", "rolling", "reverse_standings"] as const).map((type) => (
                <Pressable
                  key={type}
                  onPress={() => setLeagueData((d) => ({ ...d, waiverType: type }))}
                  style={{ backgroundColor: colors.card, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 2, borderColor: leagueData.waiverType === type ? colors.primary : "transparent" }}
                >
                  <Text style={{ color: colors.text, fontWeight: typography.fontWeight.medium, textTransform: "capitalize" }}>{type.replace("_", " ")}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs }}>
                    {type === "faab" ? "Free Agent Acquisition Budget - bid money" : type === "rolling" ? "Rolling priority list" : "Worst record gets first priority"}
                  </Text>
                </Pressable>
              ))}
            </View>

            {leagueData.waiverType === "faab" && (
              <View>
                <Text style={{ fontSize: typography.fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>FAAB Budget: ${leagueData.faabBudget}</Text>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  {[50, 100, 200, 500].map((budget) => (
                    <Pressable
                      key={budget}
                      onPress={() => setLeagueData((d) => ({ ...d, faabBudget: budget }))}
                      style={{ flex: 1, backgroundColor: leagueData.faabBudget === budget ? colors.primary : colors.card, padding: spacing.sm, borderRadius: borderRadius.md, alignItems: "center" }}
                    >
                      <Text style={{ color: leagueData.faabBudget === budget ? colors.textInverse : colors.text }}>${budget}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            <View style={{ backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.lg, gap: spacing.md }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.textSecondary }}>Trade Deadline</Text>
                <Text style={{ color: colors.text, fontWeight: typography.fontWeight.medium }}>Week {leagueData.tradeDeadlineWeek}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.textSecondary }}>Playoff Teams</Text>
                <Text style={{ color: colors.text, fontWeight: typography.fontWeight.medium }}>{leagueData.playoffTeams}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.textSecondary }}>Playoff Start</Text>
                <Text style={{ color: colors.text, fontWeight: typography.fontWeight.medium }}>Week {leagueData.playoffStartWeek}</Text>
              </View>
            </View>
          </View>
        )}

        {currentStep === "review" && (
          <View style={{ gap: spacing.lg }}>
            <Text style={{ fontSize: typography.fontSize.xxl, fontWeight: typography.fontWeight.bold, color: colors.text }}>Review & Create</Text>

            <View style={{ backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.lg, gap: spacing.md }}>
              {[
                { label: "League Name", value: leagueData.name || "Untitled" },
                { label: "Teams", value: leagueData.teamCount.toString() },
                { label: "Scoring", value: leagueData.scoringType.toUpperCase().replace("_", " ") },
                { label: "Draft", value: leagueData.draftType.charAt(0).toUpperCase() + leagueData.draftType.slice(1) },
                { label: "Waivers", value: leagueData.waiverType.replace("_", " ").toUpperCase() },
                { label: "Roster Size", value: Object.values(leagueData.rosterSlots).reduce((a, b) => a + b, 0).toString() },
                { label: "Visibility", value: leagueData.isPublic ? "Public" : "Private" },
              ].map((item) => (
                <View key={item.label} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: colors.textSecondary }}>{item.label}</Text>
                  <Text style={{ color: colors.text, fontWeight: typography.fontWeight.medium }}>{item.value}</Text>
                </View>
              ))}
            </View>

            {createMutation.isError && (
              <View style={{ backgroundColor: colors.negative + "20", borderRadius: borderRadius.md, padding: spacing.md }}>
                <Text style={{ color: colors.negative }}>Failed to create league. Please try again.</Text>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Button */}
      <View style={{ padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Pressable
          onPress={goNext}
          disabled={createMutation.isPending || (currentStep === "basics" && !leagueData.name)}
          style={{ backgroundColor: createMutation.isPending || (currentStep === "basics" && !leagueData.name) ? colors.textSecondary : colors.primary, borderRadius: borderRadius.lg, padding: spacing.lg, alignItems: "center" }}
        >
          <Text style={{ color: colors.textInverse, fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.bold }}>
            {createMutation.isPending ? "Creating..." : isLast ? "Create League" : "Continue"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
