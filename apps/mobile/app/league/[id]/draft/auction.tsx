/**
 * Auction Draft Screen
 * Real-time bidding interface for auction-style drafts
 */

import { View, Text, ScrollView, Pressable, TextInput, FlatList } from "react-native";
import { useState, useEffect, useRef } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../../../services/api";
import { colors, spacing, borderRadius, typography } from "../../../../constants/theme";

interface AuctionPlayer {
  id: string;
  name: string;
  position: string;
  team: string;
  projectedValue: number;
  avgCost: number;
}

interface ActiveBid {
  playerId: string;
  playerName: string;
  currentBid: number;
  highBidder: string;
  highBidderTeam: string;
  timeRemaining: number;
  nominatedBy: string;
}

interface DraftTeam {
  id: string;
  name: string;
  owner: string;
  budget: number;
  rosterCount: number;
  maxRoster: number;
}

export default function AuctionDraftScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [bidAmount, setBidAmount] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState<"board" | "teams" | "queue">("board");
  const [timeLeft, setTimeLeft] = useState(30);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const { data: draftData } = useQuery({
    queryKey: ["auction-draft", id],
    queryFn: () => api.getAuctionDraft(id),
    refetchInterval: 2000,
  });

  const activeBid: ActiveBid | null = draftData?.data?.activeBid || {
    playerId: "p1",
    playerName: "Christian McCaffrey",
    currentBid: 58,
    highBidder: "user-2",
    highBidderTeam: "Team Bravo",
    timeRemaining: 22,
    nominatedBy: "Team Alpha",
  };

  const myBudget = draftData?.data?.myBudget || 200;
  const myRosterCount = draftData?.data?.myRosterCount || 3;
  const maxRoster = 15;
  const isMyTurn = draftData?.data?.isMyTurn || false;

  const teams: DraftTeam[] = draftData?.data?.teams || [
    { id: "1", name: "Team Alpha", owner: "You", budget: 200, rosterCount: 3, maxRoster: 15 },
    { id: "2", name: "Team Bravo", owner: "Player2", budget: 142, rosterCount: 5, maxRoster: 15 },
    { id: "3", name: "Team Charlie", owner: "Player3", budget: 185, rosterCount: 2, maxRoster: 15 },
    { id: "4", name: "Team Delta", owner: "Player4", budget: 168, rosterCount: 4, maxRoster: 15 },
  ];

  const availablePlayers: AuctionPlayer[] = draftData?.data?.available || [
    { id: "p2", name: "Tyreek Hill", position: "WR", team: "MIA", projectedValue: 52, avgCost: 48 },
    { id: "p3", name: "Travis Kelce", position: "TE", team: "KC", projectedValue: 45, avgCost: 42 },
    { id: "p4", name: "Josh Allen", position: "QB", team: "BUF", projectedValue: 38, avgCost: 35 },
    { id: "p5", name: "Bijan Robinson", position: "RB", team: "ATL", projectedValue: 55, avgCost: 50 },
    { id: "p6", name: "CeeDee Lamb", position: "WR", team: "DAL", projectedValue: 50, avgCost: 46 },
    { id: "p7", name: "Ja'Marr Chase", position: "WR", team: "CIN", projectedValue: 48, avgCost: 44 },
  ];

  // Timer countdown
  useEffect(() => {
    if (activeBid) {
      setTimeLeft(activeBid.timeRemaining);
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeBid?.currentBid]);

  const maxBid = myBudget - (maxRoster - myRosterCount - 1); // Reserve $1 per remaining slot

  const handleBid = (amount: number) => {
    if (amount > maxBid) return;
    setBidAmount(String(amount));
    // api.placeBid(id, activeBid.playerId, amount);
  };

  const handleNominate = (player: AuctionPlayer) => {
    // api.nominate(id, player.id, 1);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: spacing.md }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: colors.text, flex: 1 }}>Auction Draft</Text>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>Budget</Text>
          <Text style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.bold, color: colors.primary }}>${myBudget}</Text>
        </View>
      </View>

      {/* Active Bid Card */}
      {activeBid && (
        <View style={{ backgroundColor: colors.card, margin: spacing.md, borderRadius: borderRadius.lg, padding: spacing.lg, borderWidth: 2, borderColor: colors.primary }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
            <View>
              <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>Now Bidding</Text>
              <Text style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.text }}>{activeBid.playerName}</Text>
              <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>Nominated by {activeBid.nominatedBy}</Text>
            </View>
            <View style={{ alignItems: "center" }}>
              <View style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                borderWidth: 3,
                borderColor: timeLeft <= 5 ? colors.negative : colors.primary,
                justifyContent: "center",
                alignItems: "center",
              }}>
                <Text style={{
                  fontSize: typography.fontSize.xl,
                  fontWeight: typography.fontWeight.bold,
                  color: timeLeft <= 5 ? colors.negative : colors.text,
                }}>
                  {timeLeft}
                </Text>
              </View>
              <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 2 }}>seconds</Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
            <View>
              <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>Current Bid</Text>
              <Text style={{ fontSize: 28, fontWeight: typography.fontWeight.bold, color: colors.primary }}>${activeBid.currentBid}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>High Bidder</Text>
              <Text style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.text }}>{activeBid.highBidderTeam}</Text>
            </View>
          </View>

          {/* Bid Controls */}
          <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm }}>
            {[1, 2, 5, 10].map((increment) => (
              <Pressable
                key={increment}
                onPress={() => handleBid(activeBid.currentBid + increment)}
                disabled={activeBid.currentBid + increment > maxBid}
                style={{
                  flex: 1,
                  backgroundColor: activeBid.currentBid + increment > maxBid ? colors.cardElevated : colors.primary + "20",
                  borderRadius: borderRadius.md,
                  padding: spacing.sm,
                  alignItems: "center",
                }}
              >
                <Text style={{
                  fontWeight: typography.fontWeight.bold,
                  color: activeBid.currentBid + increment > maxBid ? colors.textSecondary : colors.primary,
                  fontSize: typography.fontSize.sm,
                }}>
                  +${increment}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <TextInput
              value={bidAmount}
              onChangeText={setBidAmount}
              keyboardType="numeric"
              placeholder="Custom bid..."
              placeholderTextColor={colors.textTertiary}
              style={{ flex: 1, backgroundColor: colors.cardElevated, borderRadius: borderRadius.md, padding: spacing.md, color: colors.text }}
            />
            <Pressable
              onPress={() => handleBid(parseInt(bidAmount) || 0)}
              disabled={!bidAmount || parseInt(bidAmount) <= activeBid.currentBid || parseInt(bidAmount) > maxBid}
              style={{
                backgroundColor: bidAmount && parseInt(bidAmount) > activeBid.currentBid ? colors.primary : colors.cardElevated,
                borderRadius: borderRadius.md,
                paddingHorizontal: spacing.lg,
                justifyContent: "center",
              }}
            >
              <Text style={{ color: colors.textInverse, fontWeight: typography.fontWeight.bold }}>BID</Text>
            </Pressable>
          </View>

          <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: spacing.sm, textAlign: "center" }}>
            Max bid: ${maxBid} (reserving $1 per remaining roster slot)
          </Text>
        </View>
      )}

      {/* Tabs */}
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {(["board", "teams", "queue"] as const).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setSelectedTab(tab)}
            style={{ flex: 1, alignItems: "center", paddingVertical: spacing.md, borderBottomWidth: 2, borderBottomColor: selectedTab === tab ? colors.primary : "transparent" }}
          >
            <Text style={{ color: selectedTab === tab ? colors.primary : colors.textSecondary, fontWeight: typography.fontWeight.medium, textTransform: "capitalize" }}>{tab}</Text>
          </Pressable>
        ))}
      </View>

      {/* Content */}
      {selectedTab === "board" && (
        <FlatList
          data={availablePlayers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.md }}
          ListHeaderComponent={
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search players..."
              placeholderTextColor={colors.textTertiary}
              style={{ backgroundColor: colors.card, borderRadius: borderRadius.md, padding: spacing.md, color: colors.text, marginBottom: spacing.md }}
            />
          }
          renderItem={({ item }) => (
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.text }}>{item.name}</Text>
                <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>{item.team} - {item.position}</Text>
              </View>
              <View style={{ alignItems: "flex-end", marginRight: spacing.md }}>
                <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>Avg Cost</Text>
                <Text style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold, color: colors.text }}>${item.avgCost}</Text>
              </View>
              {isMyTurn && (
                <Pressable
                  onPress={() => handleNominate(item)}
                  style={{ backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}
                >
                  <Text style={{ color: colors.textInverse, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold }}>Nominate</Text>
                </Pressable>
              )}
            </View>
          )}
        />
      )}

      {selectedTab === "teams" && (
        <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}>
          {teams.map((team) => (
            <View key={team.id} style={{ backgroundColor: colors.card, borderRadius: borderRadius.md, padding: spacing.md }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View>
                  <Text style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.text }}>{team.name}</Text>
                  <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>{team.owner}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: team.budget > 50 ? colors.primary : colors.negative }}>${team.budget}</Text>
                  <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>{team.rosterCount}/{team.maxRoster} roster</Text>
                </View>
              </View>
              {/* Budget bar */}
              <View style={{ height: 4, backgroundColor: colors.cardElevated, borderRadius: 2, marginTop: spacing.sm }}>
                <View style={{ height: "100%", width: `${(team.budget / 200) * 100}%`, backgroundColor: team.budget > 50 ? colors.primary : colors.negative, borderRadius: 2 }} />
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {selectedTab === "queue" && (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xxl }}>
          <Ionicons name="list" size={64} color={colors.textSecondary} />
          <Text style={{ fontSize: typography.fontSize.lg, color: colors.text, marginTop: spacing.lg }}>Your Queue</Text>
          <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: spacing.sm }}>
            Add players to your queue to quickly nominate them when it's your turn
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}
