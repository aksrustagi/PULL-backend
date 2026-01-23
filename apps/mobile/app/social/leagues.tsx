/**
 * Social - Public League Finder
 */

import { View, Text, ScrollView, Pressable, TextInput, RefreshControl, FlatList } from "react-native";
import { useState, useCallback } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../services/api";
import { colors, spacing, borderRadius, typography } from "../../constants/theme";

interface PublicLeague {
  id: string;
  name: string;
  memberCount: number;
  teamCount: number;
  scoringType: string;
  draftType: string;
  draftDate?: string;
  entryFee: number;
  prizePool: number;
  commissioner: string;
  description?: string;
  tags: string[];
}

export default function PublicLeaguesScreen() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "free" | "paid" | "drafting_soon">("all");
  const [refreshing, setRefreshing] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ["public-leagues", search, filter],
    queryFn: () => api.getPublicLeagues({ search, filter }),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const leagues: PublicLeague[] = data?.data || [
    { id: "1", name: "Sunday Funday League", memberCount: 8, teamCount: 12, scoringType: "PPR", draftType: "snake", draftDate: "2025-08-25", entryFee: 0, prizePool: 0, commissioner: "JohnD", tags: ["casual", "free"] },
    { id: "2", name: "High Rollers Fantasy", memberCount: 10, teamCount: 10, scoringType: "Half PPR", draftType: "auction", draftDate: "2025-08-28", entryFee: 50, prizePool: 500, commissioner: "FantasyKing", tags: ["competitive", "paid"] },
    { id: "3", name: "Rookie League 2025", memberCount: 5, teamCount: 10, scoringType: "Standard", draftType: "snake", draftDate: "2025-09-01", entryFee: 0, prizePool: 0, commissioner: "NewbieMentor", tags: ["beginner", "free"] },
    { id: "4", name: "Dynasty Startup", memberCount: 11, teamCount: 12, scoringType: "PPR", draftType: "auction", entryFee: 25, prizePool: 300, commissioner: "DynastyGuru", tags: ["dynasty", "competitive"] },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: spacing.md }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.text }}>Find Leagues</Text>
      </View>

      {/* Search */}
      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.card, margin: spacing.md, paddingHorizontal: spacing.md, borderRadius: borderRadius.md }}>
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search public leagues..."
          placeholderTextColor={colors.textTertiary}
          style={{ flex: 1, padding: spacing.md, color: colors.text }}
        />
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.sm, marginBottom: spacing.md }}>
        {([["all", "All"], ["free", "Free"], ["paid", "Paid"], ["drafting_soon", "Drafting Soon"]] as const).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setFilter(key)}
            style={{ backgroundColor: filter === key ? colors.primary : colors.card, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.full }}
          >
            <Text style={{ color: filter === key ? colors.textInverse : colors.text, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium }}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <FlatList
        data={leagues}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/league/${item.id}`)}
            style={{ backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.lg }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.bold, color: colors.text }}>{item.name}</Text>
                <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>by {item.commissioner}</Text>
              </View>
              {item.entryFee > 0 ? (
                <View style={{ backgroundColor: colors.warning + "20", paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.sm }}>
                  <Text style={{ color: colors.warning, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold }}>${item.entryFee}</Text>
                </View>
              ) : (
                <View style={{ backgroundColor: colors.primary + "20", paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.sm }}>
                  <Text style={{ color: colors.primary, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold }}>FREE</Text>
                </View>
              )}
            </View>

            <View style={{ flexDirection: "row", gap: spacing.lg, marginBottom: spacing.md }}>
              <View>
                <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>Spots</Text>
                <Text style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.text }}>{item.memberCount}/{item.teamCount}</Text>
              </View>
              <View>
                <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>Scoring</Text>
                <Text style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.text }}>{item.scoringType}</Text>
              </View>
              <View>
                <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>Draft</Text>
                <Text style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.text, textTransform: "capitalize" }}>{item.draftType}</Text>
              </View>
              {item.prizePool > 0 && (
                <View>
                  <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>Prize</Text>
                  <Text style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold, color: colors.primary }}>${item.prizePool}</Text>
                </View>
              )}
            </View>

            <View style={{ flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" }}>
              {item.tags.map((tag) => (
                <View key={tag} style={{ backgroundColor: colors.cardElevated, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 10 }}>#{tag}</Text>
                </View>
              ))}
            </View>

            {item.memberCount < item.teamCount && (
              <Pressable style={{ backgroundColor: colors.primary, borderRadius: borderRadius.md, padding: spacing.sm, alignItems: "center", marginTop: spacing.md }}>
                <Text style={{ color: colors.textInverse, fontWeight: typography.fontWeight.semibold }}>Join League</Text>
              </Pressable>
            )}
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={{ padding: spacing.xxl, alignItems: "center" }}>
            <Ionicons name="search" size={64} color={colors.textSecondary} />
            <Text style={{ fontSize: typography.fontSize.lg, color: colors.text, marginTop: spacing.lg }}>No Leagues Found</Text>
            <Text style={{ color: colors.textSecondary, marginTop: spacing.sm }}>Try different search terms or filters</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
