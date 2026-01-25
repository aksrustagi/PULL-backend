/**
 * PriceChart Component
 * Displays price history for a market outcome
 * Uses custom drawing for lightweight chart rendering
 */

import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  PanResponder,
  Animated,
} from "react-native";
import { useState, useMemo, useRef, useCallback } from "react";
import Svg, { Path, Line, Circle, Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { colors, spacing, borderRadius, typography } from "../constants/theme";

// ============================================================================
// Types
// ============================================================================

interface PricePoint {
  timestamp: number;
  price: number;
  volume?: number;
}

interface PriceChartProps {
  data: PricePoint[];
  height?: number;
  showGrid?: boolean;
  showLabels?: boolean;
  showTooltip?: boolean;
  timeRange?: "1H" | "1D" | "1W" | "1M" | "ALL";
  onTimeRangeChange?: (range: string) => void;
  color?: string;
  gradientColor?: string;
}

const TIME_RANGES = ["1H", "1D", "1W", "1M", "ALL"] as const;
const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ============================================================================
// Component
// ============================================================================

export function PriceChart({
  data,
  height = 200,
  showGrid = true,
  showLabels = true,
  showTooltip = true,
  timeRange = "1D",
  onTimeRangeChange,
  color = colors.primary,
  gradientColor = colors.primary + "40",
}: PriceChartProps) {
  const [selectedPoint, setSelectedPoint] = useState<PricePoint | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const chartWidth = SCREEN_WIDTH - spacing.lg * 2;
  const chartHeight = height - 60; // Reserve space for labels and time range selector

  // Filter data based on time range
  const filteredData = useMemo(() => {
    if (data.length === 0) return [];

    const now = Date.now();
    let cutoff: number;

    switch (timeRange) {
      case "1H":
        cutoff = now - 60 * 60 * 1000;
        break;
      case "1D":
        cutoff = now - 24 * 60 * 60 * 1000;
        break;
      case "1W":
        cutoff = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case "1M":
        cutoff = now - 30 * 24 * 60 * 60 * 1000;
        break;
      case "ALL":
      default:
        return data;
    }

    return data.filter((point) => point.timestamp >= cutoff);
  }, [data, timeRange]);

  // Calculate chart bounds
  const { minPrice, maxPrice, priceRange, pathD, areaD } = useMemo(() => {
    if (filteredData.length === 0) {
      return { minPrice: 0, maxPrice: 1, priceRange: 1, pathD: "", areaD: "" };
    }

    const prices = filteredData.map((p) => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 0.1; // Avoid division by zero
    const padding = range * 0.1;

    const adjustedMin = Math.max(0, min - padding);
    const adjustedMax = Math.min(1, max + padding);
    const adjustedRange = adjustedMax - adjustedMin;

    // Generate SVG path
    const points = filteredData.map((point, index) => {
      const x = (index / (filteredData.length - 1)) * chartWidth;
      const y = chartHeight - ((point.price - adjustedMin) / adjustedRange) * chartHeight;
      return { x, y };
    });

    const pathD = points.reduce((path, point, index) => {
      if (index === 0) return `M ${point.x} ${point.y}`;
      return `${path} L ${point.x} ${point.y}`;
    }, "");

    // Area path for gradient fill
    const areaD = `${pathD} L ${chartWidth} ${chartHeight} L 0 ${chartHeight} Z`;

    return {
      minPrice: adjustedMin,
      maxPrice: adjustedMax,
      priceRange: adjustedRange,
      pathD,
      areaD,
    };
  }, [filteredData, chartWidth, chartHeight]);

  // Price change calculation
  const priceChange = useMemo(() => {
    if (filteredData.length < 2) return { value: 0, percent: 0, isPositive: true };

    const first = filteredData[0].price;
    const last = filteredData[filteredData.length - 1].price;
    const change = last - first;
    const percent = first > 0 ? (change / first) * 100 : 0;

    return {
      value: change,
      percent,
      isPositive: change >= 0,
    };
  }, [filteredData]);

  // Pan responder for touch interactions
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => showTooltip,
      onMoveShouldSetPanResponder: () => showTooltip,
      onPanResponderGrant: (e) => handleTouch(e.nativeEvent.locationX),
      onPanResponderMove: (e) => handleTouch(e.nativeEvent.locationX),
      onPanResponderRelease: () => setSelectedPoint(null),
      onPanResponderTerminate: () => setSelectedPoint(null),
    })
  ).current;

  const handleTouch = useCallback(
    (x: number) => {
      if (filteredData.length === 0) return;

      const index = Math.round((x / chartWidth) * (filteredData.length - 1));
      const clampedIndex = Math.max(0, Math.min(filteredData.length - 1, index));
      const point = filteredData[clampedIndex];

      if (point) {
        const pointX = (clampedIndex / (filteredData.length - 1)) * chartWidth;
        const pointY =
          chartHeight - ((point.price - minPrice) / priceRange) * chartHeight;

        setSelectedPoint(point);
        setTooltipPosition({ x: pointX, y: pointY });
      }
    },
    [filteredData, chartWidth, chartHeight, minPrice, priceRange]
  );

  // Grid lines
  const gridLines = useMemo(() => {
    const lines = [];
    const numLines = 4;

    for (let i = 0; i <= numLines; i++) {
      const y = (i / numLines) * chartHeight;
      const price = maxPrice - (i / numLines) * priceRange;
      lines.push({ y, price });
    }

    return lines;
  }, [chartHeight, maxPrice, priceRange]);

  if (data.length === 0) {
    return (
      <View style={[styles.container, { height }]}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No price data available</Text>
        </View>
      </View>
    );
  }

  const currentPrice = filteredData.length > 0 ? filteredData[filteredData.length - 1].price : 0;

  return (
    <View style={[styles.container, { height }]}>
      {/* Header with current price and change */}
      <View style={styles.header}>
        <View>
          <Text style={styles.currentPrice}>
            {(currentPrice * 100).toFixed(1)}%
          </Text>
          <Text
            style={[
              styles.priceChange,
              { color: priceChange.isPositive ? colors.primary : colors.negative },
            ]}
          >
            {priceChange.isPositive ? "+" : ""}
            {priceChange.percent.toFixed(2)}%
          </Text>
        </View>
        {selectedPoint && (
          <View style={styles.tooltipInfo}>
            <Text style={styles.tooltipPrice}>
              {(selectedPoint.price * 100).toFixed(1)}%
            </Text>
            <Text style={styles.tooltipTime}>
              {new Date(selectedPoint.timestamp).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </Text>
          </View>
        )}
      </View>

      {/* Chart */}
      <View style={styles.chartContainer} {...panResponder.panHandlers}>
        <Svg width={chartWidth} height={chartHeight}>
          <Defs>
            <LinearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={gradientColor} stopOpacity="0.6" />
              <Stop offset="100%" stopColor={gradientColor} stopOpacity="0" />
            </LinearGradient>
          </Defs>

          {/* Grid lines */}
          {showGrid &&
            gridLines.map((line, index) => (
              <Line
                key={index}
                x1={0}
                y1={line.y}
                x2={chartWidth}
                y2={line.y}
                stroke={colors.border}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            ))}

          {/* Area fill */}
          <Path d={areaD} fill="url(#areaGradient)" />

          {/* Line */}
          <Path
            d={pathD}
            fill="none"
            stroke={priceChange.isPositive ? colors.primary : colors.negative}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Selected point indicator */}
          {selectedPoint && (
            <>
              <Line
                x1={tooltipPosition.x}
                y1={0}
                x2={tooltipPosition.x}
                y2={chartHeight}
                stroke={colors.textSecondary}
                strokeWidth={1}
                strokeDasharray="2 2"
              />
              <Circle
                cx={tooltipPosition.x}
                cy={tooltipPosition.y}
                r={6}
                fill={colors.background}
                stroke={color}
                strokeWidth={2}
              />
              <Circle
                cx={tooltipPosition.x}
                cy={tooltipPosition.y}
                r={3}
                fill={color}
              />
            </>
          )}
        </Svg>

        {/* Y-axis labels */}
        {showLabels && (
          <View style={styles.yAxisLabels}>
            {gridLines.map((line, index) => (
              <Text
                key={index}
                style={[styles.axisLabel, { top: line.y - 8 }]}
              >
                {(line.price * 100).toFixed(0)}%
              </Text>
            ))}
          </View>
        )}
      </View>

      {/* Time range selector */}
      <View style={styles.timeRangeContainer}>
        {TIME_RANGES.map((range) => (
          <Pressable
            key={range}
            onPress={() => onTimeRangeChange?.(range)}
            style={[
              styles.timeRangeButton,
              timeRange === range && styles.timeRangeButtonActive,
            ]}
          >
            <Text
              style={[
                styles.timeRangeText,
                timeRange === range && styles.timeRangeTextActive,
              ]}
            >
              {range}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  currentPrice: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
  },
  priceChange: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginTop: spacing.xs,
  },
  tooltipInfo: {
    alignItems: "flex-end",
  },
  tooltipPrice: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
  },
  tooltipTime: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  chartContainer: {
    position: "relative",
  },
  yAxisLabels: {
    position: "absolute",
    right: -30,
    top: 0,
    bottom: 0,
  },
  axisLabel: {
    position: "absolute",
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  timeRangeContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  timeRangeButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  timeRangeButtonActive: {
    backgroundColor: colors.primary + "20",
  },
  timeRangeText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium,
  },
  timeRangeTextActive: {
    color: colors.primary,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
});

export default PriceChart;
