/**
 * Fantasy Markets - Design System
 * Robinhood-inspired dark theme
 */

export const colors = {
  // Backgrounds
  background: "#0D0D0D",
  backgroundSecondary: "#1A1A1A",
  card: "#1A1A1A",
  cardElevated: "#242424",

  // Primary colors
  primary: "#00D632", // Green for gains/positive
  primaryDark: "#00A828",
  primaryLight: "#33E05C",

  // Negative/Error
  negative: "#FF3B30", // Red for losses/negative
  negativeDark: "#CC2F26",
  negativeLight: "#FF6259",

  // Accent
  accent: "#007AFF", // Blue for CTAs
  accentDark: "#0062CC",
  accentLight: "#339AFF",

  // Text
  text: "#FFFFFF",
  textSecondary: "#8E8E93",
  textTertiary: "#636366",
  textInverse: "#0D0D0D",

  // Borders
  border: "rgba(255, 255, 255, 0.08)",
  borderLight: "rgba(255, 255, 255, 0.12)",
  borderActive: "rgba(255, 255, 255, 0.24)",

  // Status colors
  success: "#00D632",
  warning: "#FF9500",
  error: "#FF3B30",
  info: "#007AFF",

  // Position colors
  qb: "#E91E63",
  rb: "#4CAF50",
  wr: "#2196F3",
  te: "#FF9800",
  k: "#9C27B0",
  def: "#607D8B",

  // Misc
  overlay: "rgba(0, 0, 0, 0.5)",
  transparent: "transparent",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const typography = {
  // Font families (use system fonts)
  fontFamily: {
    regular: "System",
    medium: "System",
    semibold: "System",
    bold: "System",
  },

  // Font sizes
  fontSize: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 24,
    xxxl: 32,
    display: 48,
  },

  // Line heights
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },

  // Font weights
  fontWeight: {
    regular: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
  },
};

export const shadows = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 1.0,
    elevation: 1,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
};

// Position color mapping
export const positionColors: Record<string, string> = {
  QB: colors.qb,
  RB: colors.rb,
  WR: colors.wr,
  TE: colors.te,
  K: colors.k,
  DEF: colors.def,
};

// Status indicators
export const statusColors = {
  active: colors.success,
  injured_reserve: colors.error,
  out: colors.error,
  doubtful: colors.error,
  questionable: colors.warning,
  probable: colors.success,
  bye: colors.textSecondary,
};

export const theme = {
  colors,
  spacing,
  borderRadius,
  typography,
  shadows,
  positionColors,
  statusColors,
};

export default theme;
