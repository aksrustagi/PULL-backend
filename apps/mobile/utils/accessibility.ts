/**
 * Accessibility Utilities
 * Screen reader support, dynamic text sizing, and accessibility helpers
 */

import { AccessibilityInfo, Platform, PixelRatio } from "react-native";
import { useEffect, useState } from "react";

// ============================================================================
// Accessibility Props Builders
// ============================================================================

/**
 * Build accessibility props for interactive elements
 */
export function a11yButton(label: string, hint?: string) {
  return {
    accessible: true,
    accessibilityRole: "button" as const,
    accessibilityLabel: label,
    ...(hint && { accessibilityHint: hint }),
  };
}

export function a11yLink(label: string, hint?: string) {
  return {
    accessible: true,
    accessibilityRole: "link" as const,
    accessibilityLabel: label,
    ...(hint && { accessibilityHint: hint }),
  };
}

export function a11yHeader(label: string, level?: 1 | 2 | 3) {
  return {
    accessible: true,
    accessibilityRole: "header" as const,
    accessibilityLabel: label,
  };
}

export function a11yImage(label: string) {
  return {
    accessible: true,
    accessibilityRole: "image" as const,
    accessibilityLabel: label,
  };
}

export function a11yTab(label: string, selected: boolean) {
  return {
    accessible: true,
    accessibilityRole: "tab" as const,
    accessibilityLabel: label,
    accessibilityState: { selected },
  };
}

export function a11yCheckbox(label: string, checked: boolean) {
  return {
    accessible: true,
    accessibilityRole: "checkbox" as const,
    accessibilityLabel: label,
    accessibilityState: { checked },
  };
}

export function a11ySwitch(label: string, checked: boolean) {
  return {
    accessible: true,
    accessibilityRole: "switch" as const,
    accessibilityLabel: label,
    accessibilityState: { checked },
  };
}

export function a11yProgress(label: string, current: number, max: number) {
  return {
    accessible: true,
    accessibilityRole: "progressbar" as const,
    accessibilityLabel: label,
    accessibilityValue: {
      min: 0,
      max,
      now: current,
      text: `${Math.round((current / max) * 100)}%`,
    },
  };
}

export function a11yLiveRegion(label: string, live: "polite" | "assertive" = "polite") {
  return {
    accessible: true,
    accessibilityLabel: label,
    accessibilityLiveRegion: live,
  };
}

// ============================================================================
// Fantasy-specific Accessibility Labels
// ============================================================================

export const FantasyA11y = {
  playerCard(name: string, position: string, team: string, points?: number): string {
    let label = `${name}, ${position} for ${team}`;
    if (points !== undefined) label += `, ${points} points`;
    return label;
  },

  matchupScore(team1: string, score1: number, team2: string, score2: number): string {
    const leader = score1 > score2 ? team1 : team2;
    return `${team1} ${score1} versus ${team2} ${score2}. ${leader} is winning.`;
  },

  tradeDetails(sending: string[], receiving: string[]): string {
    return `Trade: sending ${sending.join(", ")} for ${receiving.join(", ")}`;
  },

  marketBet(title: string, odds: number, stake: number): string {
    return `Market: ${title}. Odds ${(odds * 100).toFixed(0)}%, stake $${stake}`;
  },

  draftPick(round: number, pick: number, timeRemaining?: number): string {
    let label = `Round ${round}, pick ${pick}`;
    if (timeRemaining) label += `. ${timeRemaining} seconds remaining`;
    return label;
  },

  auctionBid(player: string, currentBid: number, highBidder: string): string {
    return `${player}, current bid $${currentBid} by ${highBidder}`;
  },

  keeperPlayer(name: string, cost: number, value: number): string {
    return `${name}, keeper cost $${cost}, value rating ${value} out of 10`;
  },

  notification(title: string, time: string, unread: boolean): string {
    return `${unread ? "Unread: " : ""}${title}, ${time}`;
  },

  statBar(label: string, value1: number, value2: number, player1: string, player2: string): string {
    const winner = value1 > value2 ? player1 : player2;
    return `${label}: ${player1} ${value1}, ${player2} ${value2}. ${winner} leads.`;
  },
};

// ============================================================================
// Dynamic Text Sizing Hooks
// ============================================================================

/**
 * Hook to detect if user has larger text enabled
 */
export function useAccessibilityFontScale() {
  const fontScale = PixelRatio.getFontScale();
  return {
    fontScale,
    isLargeText: fontScale > 1.2,
    isExtraLargeText: fontScale > 1.5,
    scaledSize: (size: number) => size * Math.min(fontScale, 1.5), // Cap at 1.5x
  };
}

/**
 * Hook to detect screen reader status
 */
export function useScreenReader() {
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setIsEnabled);

    const subscription = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      setIsEnabled
    );

    return () => subscription.remove();
  }, []);

  return isEnabled;
}

/**
 * Hook to detect reduced motion preference
 */
export function useReducedMotion() {
  const [isReduced, setIsReduced] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setIsReduced);

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setIsReduced
    );

    return () => subscription.remove();
  }, []);

  return isReduced;
}

/**
 * Hook to detect bold text preference (iOS)
 */
export function useBoldText() {
  const [isBold, setIsBold] = useState(false);

  useEffect(() => {
    if (Platform.OS === "ios") {
      AccessibilityInfo.isBoldTextEnabled().then(setIsBold);

      const subscription = AccessibilityInfo.addEventListener(
        "boldTextChanged",
        setIsBold
      );

      return () => subscription.remove();
    }
  }, []);

  return isBold;
}

// ============================================================================
// Announce to Screen Reader
// ============================================================================

/**
 * Announce a message to the screen reader
 */
export function announce(message: string) {
  AccessibilityInfo.announceForAccessibility(message);
}

/**
 * Announce fantasy-specific events
 */
export const announceFantasy = {
  draftPick(team: string, player: string, round: number, pick: number) {
    announce(`${team} selects ${player}, round ${round} pick ${pick}`);
  },

  scoringUpdate(team: string, points: number, change: number) {
    const direction = change > 0 ? "gained" : "lost";
    announce(`${team} ${direction} ${Math.abs(change).toFixed(1)} points, total ${points.toFixed(1)}`);
  },

  tradeCompleted(team1: string, team2: string) {
    announce(`Trade completed between ${team1} and ${team2}`);
  },

  betPlaced(market: string, amount: number) {
    announce(`Bet of $${amount} placed on ${market}`);
  },

  betResult(market: string, won: boolean, payout?: number) {
    if (won) {
      announce(`You won $${payout?.toFixed(2)} on ${market}`);
    } else {
      announce(`Your bet on ${market} did not win`);
    }
  },

  timerWarning(seconds: number) {
    announce(`${seconds} seconds remaining`);
  },

  injuryAlert(player: string, status: string) {
    announce(`Injury alert: ${player} is listed as ${status}`);
  },
};

// ============================================================================
// Touch Target Sizes
// ============================================================================

/**
 * Minimum touch target size (44x44 per WCAG)
 */
export const MIN_TOUCH_TARGET = 44;

/**
 * Get minimum hit slop to meet accessibility guidelines
 */
export function getHitSlop(elementHeight: number, elementWidth: number) {
  const verticalSlop = Math.max(0, (MIN_TOUCH_TARGET - elementHeight) / 2);
  const horizontalSlop = Math.max(0, (MIN_TOUCH_TARGET - elementWidth) / 2);
  return {
    top: verticalSlop,
    bottom: verticalSlop,
    left: horizontalSlop,
    right: horizontalSlop,
  };
}

// ============================================================================
// Color Contrast Helpers
// ============================================================================

/**
 * Check if two colors have sufficient contrast (WCAG AA = 4.5:1)
 */
export function hasAdequateContrast(foreground: string, background: string): boolean {
  const fgLuminance = getRelativeLuminance(foreground);
  const bgLuminance = getRelativeLuminance(background);
  const ratio = (Math.max(fgLuminance, bgLuminance) + 0.05) /
                (Math.min(fgLuminance, bgLuminance) + 0.05);
  return ratio >= 4.5;
}

function getRelativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : null;
}

// ============================================================================
// Focus Management
// ============================================================================

/**
 * Set accessibility focus to an element (useful after navigation/modal)
 */
export function setAccessibilityFocus(ref: any) {
  if (ref?.current) {
    AccessibilityInfo.setAccessibilityFocus(ref.current);
  }
}
