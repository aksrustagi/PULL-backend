/**
 * Onboarding Screen
 */

import { View, Text, Pressable, useWindowDimensions } from "react-native";
import { useState, useRef } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolation } from "react-native-reanimated";
import { colors, spacing, borderRadius, typography } from "../../constants/theme";

const SLIDES = [
  {
    icon: "trophy" as const,
    iconColor: colors.warning,
    title: "Fantasy Football",
    subtitle: "Create or join leagues, draft players, and compete against friends all season long.",
  },
  {
    icon: "trending-up" as const,
    iconColor: colors.primary,
    title: "Prediction Markets",
    subtitle: "Bet on matchups, player props, and league outcomes with real-time odds powered by LMSR.",
  },
  {
    icon: "chatbubbles" as const,
    iconColor: colors.accent,
    title: "League Chat",
    subtitle: "Talk trash, discuss trades, and stay connected with your league through integrated chat.",
  },
  {
    icon: "analytics" as const,
    iconColor: "#8B5CF6",
    title: "AI-Powered Insights",
    subtitle: "Get draft recommendations, trade analysis, and lineup optimization from our AI assistant.",
  },
];

export default function OnboardingScreen() {
  const { width } = useWindowDimensions();
  const scrollX = useSharedValue(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<any>(null);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      const nextIndex = currentIndex + 1;
      scrollRef.current?.scrollTo({ x: nextIndex * width, animated: true });
      setCurrentIndex(nextIndex);
    } else {
      router.replace("/(auth)/register");
    }
  };

  const handleSkip = () => {
    router.replace("/(auth)/login");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Skip Button */}
      <View style={{ flexDirection: "row", justifyContent: "flex-end", padding: spacing.lg }}>
        <Pressable onPress={handleSkip}>
          <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.md }}>Skip</Text>
        </Pressable>
      </View>

      {/* Slides */}
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(index);
        }}
      >
        {SLIDES.map((slide, index) => (
          <View key={index} style={{ width, flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: spacing.xxl }}>
            <View style={{
              width: 120,
              height: 120,
              borderRadius: 60,
              backgroundColor: slide.iconColor + "20",
              justifyContent: "center",
              alignItems: "center",
              marginBottom: spacing.xxl,
            }}>
              <Ionicons name={slide.icon} size={60} color={slide.iconColor} />
            </View>

            <Text style={{
              fontSize: 28,
              fontWeight: typography.fontWeight.bold,
              color: colors.text,
              textAlign: "center",
              marginBottom: spacing.md,
            }}>
              {slide.title}
            </Text>

            <Text style={{
              fontSize: typography.fontSize.md,
              color: colors.textSecondary,
              textAlign: "center",
              lineHeight: 24,
            }}>
              {slide.subtitle}
            </Text>
          </View>
        ))}
      </Animated.ScrollView>

      {/* Bottom */}
      <View style={{ padding: spacing.xl }}>
        {/* Dots */}
        <View style={{ flexDirection: "row", justifyContent: "center", marginBottom: spacing.xl, gap: spacing.sm }}>
          {SLIDES.map((_, index) => (
            <View
              key={index}
              style={{
                width: currentIndex === index ? 24 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: currentIndex === index ? colors.primary : colors.card,
              }}
            />
          ))}
        </View>

        {/* Button */}
        <Pressable
          onPress={handleNext}
          style={{
            backgroundColor: colors.primary,
            borderRadius: borderRadius.lg,
            padding: spacing.lg,
            alignItems: "center",
          }}
        >
          <Text style={{ color: colors.textInverse, fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.bold }}>
            {currentIndex === SLIDES.length - 1 ? "Get Started" : "Next"}
          </Text>
        </Pressable>

        {currentIndex === SLIDES.length - 1 && (
          <Pressable onPress={() => router.replace("/(auth)/login")} style={{ marginTop: spacing.lg, alignItems: "center" }}>
            <Text style={{ color: colors.textSecondary }}>
              Already have an account? <Text style={{ color: colors.primary }}>Sign In</Text>
            </Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}
