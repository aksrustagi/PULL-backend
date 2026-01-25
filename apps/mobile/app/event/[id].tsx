/**
 * Event Details Screen
 * Shows details about a sports event and related markets
 */

import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  Image,
  Dimensions,
} from "react-native";
import { useState, useCallback } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../services/api";
import { colors, spacing, borderRadius, typography, positionColors } from "../../constants/theme";
import type { Market, NFLGame } from "../../types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [refreshing, setRefreshing] = useState(false);

  const { data: eventData, refetch: refetchEvent } = useQuery({
    queryKey: ["event", id],
    queryFn: () => api.getEvent(id),
  });

  const { data: marketsData, refetch: refetchMarkets } = useQuery({
    queryKey: ["event", id, "markets"],
    queryFn: () => api.getEventMarkets(id),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchEvent(), refetchMarkets()]);
    setRefreshing(false);
  }, [refetchEvent, refetchMarkets]);

  const event = eventData?.data;
  const markets = marketsData?.data || [];

  if (!event) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: colors.textSecondary }}>Loading event...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isLive = event.status === "in_progress";
  const isUpcoming = event.status === "scheduled";
  const isFinal = event.status === "final";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
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
        <View style={{ flex: 1 }}>
          <Text style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.bold,
            color: colors.text,
          }}>
            Event Details
          </Text>
        </View>
        <Pressable onPress={onRefresh}>
          <Ionicons name="refresh" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Event Card */}
        <View style={{
          backgroundColor: colors.card,
          margin: spacing.lg,
          borderRadius: borderRadius.lg,
          overflow: "hidden",
        }}>
          {/* Status Badge */}
          <View style={{
            backgroundColor: isLive ? colors.negative : isUpcoming ? colors.accent : colors.textSecondary,
            paddingVertical: spacing.xs,
            alignItems: "center",
          }}>
            <Text style={{
              fontSize: typography.fontSize.xs,
              fontWeight: typography.fontWeight.bold,
              color: colors.textInverse,
              textTransform: "uppercase",
            }}>
              {isLive ? "LIVE" : isUpcoming ? "Upcoming" : "Final"}
              {isLive && event.quarter && ` - Q${event.quarter}`}
              {isLive && event.timeRemaining && ` ${event.timeRemaining}`}
            </Text>
          </View>

          {/* Teams */}
          <View style={{ padding: spacing.xl }}>
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              {/* Away Team */}
              <View style={{ flex: 1, alignItems: "center" }}>
                <View style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: colors.cardElevated,
                  justifyContent: "center",
                  alignItems: "center",
                  marginBottom: spacing.sm,
                }}>
                  {event.awayTeam?.logoUrl ? (
                    <Image
                      source={{ uri: event.awayTeam.logoUrl }}
                      style={{ width: 48, height: 48 }}
                      resizeMode="contain"
                    />
                  ) : (
                    <Ionicons name="american-football" size={32} color={colors.primary} />
                  )}
                </View>
                <Text style={{
                  fontSize: typography.fontSize.sm,
                  color: colors.textSecondary,
                }}>
                  {event.awayTeam?.abbreviation || "AWAY"}
                </Text>
                <Text style={{
                  fontSize: typography.fontSize.md,
                  fontWeight: typography.fontWeight.semibold,
                  color: colors.text,
                  textAlign: "center",
                }} numberOfLines={2}>
                  {event.awayTeam?.name || "Away Team"}
                </Text>
                {(isLive || isFinal) && (
                  <Text style={{
                    fontSize: typography.fontSize.xxxl,
                    fontWeight: typography.fontWeight.bold,
                    color: colors.text,
                    marginTop: spacing.sm,
                  }}>
                    {event.awayTeam?.score ?? 0}
                  </Text>
                )}
              </View>

              {/* VS / Score Divider */}
              <View style={{ alignItems: "center", paddingHorizontal: spacing.lg }}>
                {isUpcoming ? (
                  <>
                    <Text style={{
                      fontSize: typography.fontSize.lg,
                      fontWeight: typography.fontWeight.bold,
                      color: colors.textSecondary,
                    }}>
                      VS
                    </Text>
                    <Text style={{
                      fontSize: typography.fontSize.xs,
                      color: colors.textSecondary,
                      marginTop: spacing.sm,
                    }}>
                      {new Date(event.startTime).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </Text>
                    <Text style={{
                      fontSize: typography.fontSize.sm,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.accent,
                    }}>
                      {new Date(event.startTime).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Text>
                  </>
                ) : (
                  <Text style={{
                    fontSize: typography.fontSize.md,
                    color: colors.textSecondary,
                  }}>
                    -
                  </Text>
                )}
              </View>

              {/* Home Team */}
              <View style={{ flex: 1, alignItems: "center" }}>
                <View style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: colors.cardElevated,
                  justifyContent: "center",
                  alignItems: "center",
                  marginBottom: spacing.sm,
                }}>
                  {event.homeTeam?.logoUrl ? (
                    <Image
                      source={{ uri: event.homeTeam.logoUrl }}
                      style={{ width: 48, height: 48 }}
                      resizeMode="contain"
                    />
                  ) : (
                    <Ionicons name="american-football" size={32} color={colors.primary} />
                  )}
                </View>
                <Text style={{
                  fontSize: typography.fontSize.sm,
                  color: colors.textSecondary,
                }}>
                  {event.homeTeam?.abbreviation || "HOME"}
                </Text>
                <Text style={{
                  fontSize: typography.fontSize.md,
                  fontWeight: typography.fontWeight.semibold,
                  color: colors.text,
                  textAlign: "center",
                }} numberOfLines={2}>
                  {event.homeTeam?.name || "Home Team"}
                </Text>
                {(isLive || isFinal) && (
                  <Text style={{
                    fontSize: typography.fontSize.xxxl,
                    fontWeight: typography.fontWeight.bold,
                    color: colors.text,
                    marginTop: spacing.sm,
                  }}>
                    {event.homeTeam?.score ?? 0}
                  </Text>
                )}
              </View>
            </View>

            {/* Venue */}
            {event.venue && (
              <View style={{
                marginTop: spacing.lg,
                paddingTop: spacing.lg,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <Ionicons name="location" size={14} color={colors.textSecondary} />
                <Text style={{
                  fontSize: typography.fontSize.xs,
                  color: colors.textSecondary,
                  marginLeft: spacing.xs,
                }}>
                  {event.venue}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Related Markets */}
        <View style={{ paddingHorizontal: spacing.lg }}>
          <Text style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
            marginBottom: spacing.md,
          }}>
            Related Markets ({markets.length})
          </Text>
        </View>

        {markets.length > 0 ? (
          <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
            {markets.map((market: Market) => (
              <MarketCard key={market.id} market={market} />
            ))}
          </View>
        ) : (
          <View style={{
            backgroundColor: colors.card,
            marginHorizontal: spacing.lg,
            borderRadius: borderRadius.lg,
            padding: spacing.xxl,
            alignItems: "center",
          }}>
            <Ionicons name="trending-up" size={48} color={colors.textSecondary} />
            <Text style={{
              fontSize: typography.fontSize.md,
              fontWeight: typography.fontWeight.medium,
              color: colors.text,
              marginTop: spacing.md,
            }}>
              No Markets Available
            </Text>
            <Text style={{
              fontSize: typography.fontSize.sm,
              color: colors.textSecondary,
              textAlign: "center",
              marginTop: spacing.xs,
            }}>
              Markets for this event will be available soon.
            </Text>
          </View>
        )}

        {/* Player Props Section */}
        {event.playerProps && event.playerProps.length > 0 && (
          <View style={{ marginTop: spacing.xl, paddingHorizontal: spacing.lg }}>
            <Text style={{
              fontSize: typography.fontSize.lg,
              fontWeight: typography.fontWeight.semibold,
              color: colors.text,
              marginBottom: spacing.md,
            }}>
              Player Props
            </Text>
            <View style={{ gap: spacing.sm }}>
              {event.playerProps.map((prop: any) => (
                <Pressable
                  key={prop.id}
                  onPress={() => router.push(`/market/${prop.marketId}`)}
                  style={{
                    backgroundColor: colors.card,
                    borderRadius: borderRadius.lg,
                    padding: spacing.md,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <View style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: positionColors[prop.position] || colors.cardElevated,
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: spacing.md,
                  }}>
                    <Text style={{
                      fontSize: typography.fontSize.xs,
                      fontWeight: typography.fontWeight.bold,
                      color: colors.textInverse,
                    }}>
                      {prop.position}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      fontSize: typography.fontSize.sm,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.text,
                    }}>
                      {prop.playerName}
                    </Text>
                    <Text style={{
                      fontSize: typography.fontSize.xs,
                      color: colors.textSecondary,
                    }}>
                      {prop.propType}: {prop.line}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{
                      fontSize: typography.fontSize.md,
                      fontWeight: typography.fontWeight.bold,
                      color: colors.primary,
                    }}>
                      {prop.odds}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function MarketCard({ market }: { market: Market }) {
  const closesIn = market.closesAt - Date.now();
  const closesInHours = Math.max(0, Math.floor(closesIn / (1000 * 60 * 60)));

  return (
    <Pressable
      onPress={() => router.push(`/market/${market.id}`)}
      style={{
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.lg,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm }}>
        <View style={{
          backgroundColor: colors.cardElevated,
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs,
          borderRadius: borderRadius.sm,
        }}>
          <Text style={{
            fontSize: typography.fontSize.xs,
            color: colors.textSecondary,
            textTransform: "uppercase",
          }}>
            {market.type.replace("_", " ")}
          </Text>
        </View>
        <Text style={{
          fontSize: typography.fontSize.xs,
          color: colors.textSecondary,
        }}>
          Closes in {closesInHours}h
        </Text>
      </View>

      <Text style={{
        fontSize: typography.fontSize.md,
        fontWeight: typography.fontWeight.semibold,
        color: colors.text,
        marginBottom: spacing.md,
      }}>
        {market.title}
      </Text>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {market.outcomes.slice(0, 2).map((outcome) => (
          <View
            key={outcome.id}
            style={{
              flex: 1,
              backgroundColor: colors.cardElevated,
              borderRadius: borderRadius.md,
              padding: spacing.md,
              alignItems: "center",
            }}
          >
            <Text style={{
              fontSize: typography.fontSize.xs,
              color: colors.textSecondary,
            }} numberOfLines={1}>
              {outcome.label}
            </Text>
            <Text style={{
              fontSize: typography.fontSize.lg,
              fontWeight: typography.fontWeight.bold,
              color: colors.primary,
              marginTop: spacing.xs,
            }}>
              {(outcome.impliedProbability * 100).toFixed(0)}%
            </Text>
          </View>
        ))}
      </View>

      <View style={{
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: spacing.md,
        paddingTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}>
        <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
          Volume: ${market.totalVolume.toLocaleString()}
        </Text>
        <Text style={{ fontSize: typography.fontSize.xs, color: colors.accent }}>
          Place Bet
        </Text>
      </View>
    </Pressable>
  );
}
