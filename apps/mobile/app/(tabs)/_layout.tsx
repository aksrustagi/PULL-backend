/**
 * Tab Navigation Layout
 * Main navigation hub for the PULL mobile app
 */

import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, Text } from "react-native";
import { colors } from "../../constants/theme";

type IconName = keyof typeof Ionicons.glyphMap;

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingBottom: 4,
          paddingTop: 4,
          height: 60,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "500",
        },
        headerStyle: {
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
          borderBottomWidth: 1,
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          headerTitle: "PULL",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="markets"
        options={{
          title: "Markets",
          headerTitle: "Prediction Markets",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trending-up" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="bets"
        options={{
          title: "My Bets",
          headerTitle: "My Bets",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="leagues"
        options={{
          title: "Leagues",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trophy" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
      {/* Hide chat from tabs but keep it accessible */}
      <Tabs.Screen
        name="chat"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
