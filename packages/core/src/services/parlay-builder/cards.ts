/**
 * Parlay Card Generator
 * Generate shareable parlay cards for social media
 */

import type {
  Parlay,
  ParlayLeg,
  ParlayCard,
  ParlayCardLeg,
  ParlayCardTemplate,
  ColorScheme,
  GenerateCardRequest,
  OddsFormat,
} from "./types";
import { OddsConverter } from "./odds";

// ============================================================================
// SPORT ICONS
// ============================================================================

const SPORT_ICONS: Record<string, string> = {
  nfl: "🏈",
  nba: "🏀",
  mlb: "⚾",
  nhl: "🏒",
  ncaaf: "🏈",
  ncaab: "🏀",
  soccer: "⚽",
  mls: "⚽",
  epl: "⚽",
  tennis: "🎾",
  golf: "⛳",
  mma: "🥊",
  ufc: "🥊",
  boxing: "🥊",
  esports: "🎮",
  f1: "🏎️",
  nascar: "🏁",
  horse_racing: "🏇",
  default: "🎯",
};

// ============================================================================
// TEMPLATES
// ============================================================================

const TEMPLATES: Record<string, ParlayCardTemplate> = {
  modern: {
    id: "modern",
    name: "Modern",
    layout: "vertical",
    aspectRatio: "4:5",
    style: "modern",
  },
  classic: {
    id: "classic",
    name: "Classic",
    layout: "vertical",
    aspectRatio: "1:1",
    style: "classic",
  },
  neon: {
    id: "neon",
    name: "Neon",
    layout: "vertical",
    aspectRatio: "4:5",
    style: "neon",
  },
  minimal: {
    id: "minimal",
    name: "Minimal",
    layout: "horizontal",
    aspectRatio: "16:9",
    style: "minimal",
  },
  sport: {
    id: "sport",
    name: "Sport",
    layout: "grid",
    aspectRatio: "1:1",
    style: "sport",
  },
  story: {
    id: "story",
    name: "Story",
    layout: "vertical",
    aspectRatio: "9:16",
    style: "modern",
  },
};

// ============================================================================
// COLOR SCHEMES
// ============================================================================

const COLOR_SCHEMES: Record<string, ColorScheme> = {
  dark: {
    primary: "#1a1a2e",
    secondary: "#16213e",
    background: "#0f0f1a",
    text: "#ffffff",
    accent: "#00ff88",
  },
  light: {
    primary: "#ffffff",
    secondary: "#f5f5f5",
    background: "#e8e8e8",
    text: "#1a1a1a",
    accent: "#4CAF50",
  },
  fire: {
    primary: "#1a0a0a",
    secondary: "#2a1515",
    background: "#0d0505",
    text: "#ffffff",
    accent: "#ff4444",
  },
  ocean: {
    primary: "#0a1a2a",
    secondary: "#152535",
    background: "#050d15",
    text: "#ffffff",
    accent: "#00a8ff",
  },
  gold: {
    primary: "#1a1a0a",
    secondary: "#2a2a15",
    background: "#0d0d05",
    text: "#ffffff",
    accent: "#ffd700",
  },
  neon: {
    primary: "#0a0a1a",
    secondary: "#15152a",
    background: "#05050d",
    text: "#ffffff",
    accent: "#ff00ff",
  },
};

// ============================================================================
// PARLAY CARD GENERATOR
// ============================================================================

export class ParlayCardGenerator {
  private converter = new OddsConverter();
  private baseUrl = "https://pull.app";

  /**
   * Generate a shareable parlay card
   */
  generateCard(
    parlay: Parlay,
    username: string,
    request: GenerateCardRequest
  ): ParlayCard {
    const template = TEMPLATES[request.template ?? "modern"] ?? TEMPLATES.modern;
    const colorScheme = {
      ...COLOR_SCHEMES.dark,
      ...request.colorScheme,
    };

    // Format legs for card
    const cardLegs = parlay.legs.map((leg) => this.formatLegForCard(leg));

    // Generate card ID and URLs
    const cardId = `card_${parlay.id}_${Date.now()}`;
    const shareUrl = `${this.baseUrl}/p/${parlay.id}`;
    const deepLink = `pull://parlay/${parlay.id}`;

    // Determine title
    let title = request.customTitle ?? this.generateTitle(parlay);
    let subtitle = this.generateSubtitle(parlay);

    // Determine result if settled
    let result: "won" | "lost" | "pending" | undefined;
    if (parlay.status === "won") {
      result = "won";
    } else if (parlay.status === "lost") {
      result = "lost";
    } else if (parlay.status !== "building") {
      result = "pending";
    }

    return {
      id: cardId,
      parlayId: parlay.id,
      userId: parlay.userId,
      username,
      template,
      colorScheme,
      showUserAvatar: true,
      showOdds: true,
      showPotentialPayout: true,
      title,
      subtitle,
      legs: cardLegs,
      totalOdds: this.formatOdds(parlay.combinedOdds),
      potentialPayout: this.formatMoney(parlay.potentialPayout),
      stake: request.showStake ? this.formatMoney(parlay.stake) : undefined,
      result,
      actualPayout: parlay.actualPayout ? this.formatMoney(parlay.actualPayout) : undefined,
      imageUrl: this.generateImageUrl(cardId, template.id),
      shareUrl,
      deepLink,
      views: 0,
      copies: 0,
      likes: 0,
      createdAt: Date.now(),
    };
  }

  /**
   * Format a leg for display on card
   */
  private formatLegForCard(leg: ParlayLeg): ParlayCardLeg {
    return {
      sport: leg.sport,
      sportIcon: SPORT_ICONS[leg.sport.toLowerCase()] ?? SPORT_ICONS.default,
      eventName: this.truncate(leg.eventName, 30),
      selection: this.truncate(`${leg.selection} ${leg.selectionDetails}`, 35),
      odds: this.formatOdds(leg.odds),
      status: leg.status,
      startTime: this.formatTime(leg.startTime),
    };
  }

  /**
   * Generate automatic title based on parlay content
   */
  private generateTitle(parlay: Parlay): string {
    const legCount = parlay.legCount;

    // Check for same-game parlay
    const eventIds = new Set(parlay.legs.map((l) => l.eventId));
    if (eventIds.size === 1) {
      return `Same Game Parlay`;
    }

    // Check for single sport
    const sports = new Set(parlay.legs.map((l) => l.sport.toUpperCase()));
    if (sports.size === 1) {
      return `${legCount}-Leg ${Array.from(sports)[0]} Parlay`;
    }

    // Mixed sports
    if (legCount >= 6) {
      return `${legCount}-Leg Mega Parlay`;
    } else if (legCount >= 4) {
      return `${legCount}-Leg Power Parlay`;
    }

    return `${legCount}-Leg Parlay`;
  }

  /**
   * Generate subtitle
   */
  private generateSubtitle(parlay: Parlay): string {
    const odds = this.formatOdds(parlay.combinedOdds);
    const payout = this.formatMoney(parlay.potentialPayout);

    if (parlay.status === "won") {
      return `WON ${parlay.actualPayout ? this.formatMoney(parlay.actualPayout) : payout}!`;
    } else if (parlay.status === "lost") {
      return "Better luck next time";
    } else if (parlay.aiSuggested) {
      return `AI Pick | ${odds} odds`;
    }

    return `${odds} to win ${payout}`;
  }

  /**
   * Format American odds
   */
  private formatOdds(american: number): string {
    return american > 0 ? `+${american}` : String(american);
  }

  /**
   * Format money value
   */
  private formatMoney(amount: number): string {
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(1)}K`;
    }
    return `$${amount.toFixed(2)}`;
  }

  /**
   * Format time for display
   */
  private formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();

    // If today, show time
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
    }

    // If within 7 days, show day name
    const daysDiff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff > 0 && daysDiff <= 7) {
      return date.toLocaleDateString(undefined, { weekday: "short" });
    }

    // Otherwise show date
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  /**
   * Truncate text
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + "...";
  }

  /**
   * Generate image URL (would integrate with image generation service)
   */
  private generateImageUrl(cardId: string, templateId: string): string {
    return `${this.baseUrl}/api/cards/${cardId}/image?template=${templateId}`;
  }

  /**
   * Get available templates
   */
  getTemplates(): ParlayCardTemplate[] {
    return Object.values(TEMPLATES);
  }

  /**
   * Get available color schemes
   */
  getColorSchemes(): Array<{ id: string; name: string; scheme: ColorScheme }> {
    return Object.entries(COLOR_SCHEMES).map(([id, scheme]) => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      scheme,
    }));
  }

  /**
   * Generate share text for social media
   */
  generateShareText(card: ParlayCard, platform: "twitter" | "facebook" | "sms"): string {
    const baseText = `${card.title}\n${card.totalOdds} odds`;
    const resultText = card.result === "won"
      ? ` - WON ${card.actualPayout}!`
      : card.result === "lost"
        ? " - L"
        : "";

    switch (platform) {
      case "twitter":
        return `${baseText}${resultText}\n\n${card.shareUrl}\n\n#betting #parlay #sports`;
      case "facebook":
        return `${baseText}${resultText}\n\nCheck out my parlay on Pull!`;
      case "sms":
        return `Check out my ${card.title}: ${card.shareUrl}`;
      default:
        return `${baseText}${resultText}\n${card.shareUrl}`;
    }
  }

  /**
   * Generate card data for server-side image rendering
   */
  generateRenderData(card: ParlayCard): {
    width: number;
    height: number;
    background: string;
    elements: RenderElement[];
  } {
    const aspectRatios: Record<string, { width: number; height: number }> = {
      "1:1": { width: 1080, height: 1080 },
      "4:5": { width: 1080, height: 1350 },
      "16:9": { width: 1920, height: 1080 },
      "9:16": { width: 1080, height: 1920 },
    };

    const dimensions = aspectRatios[card.template.aspectRatio] ?? aspectRatios["1:1"];

    return {
      ...dimensions,
      background: card.colorScheme.background,
      elements: [
        {
          type: "text",
          content: card.title,
          x: 50,
          y: 80,
          fontSize: 48,
          fontWeight: "bold",
          color: card.colorScheme.text,
        },
        {
          type: "text",
          content: card.subtitle ?? "",
          x: 50,
          y: 140,
          fontSize: 24,
          color: card.colorScheme.accent,
        },
        ...card.legs.map((leg, index) => ({
          type: "leg" as const,
          content: `${leg.sportIcon} ${leg.selection}`,
          x: 50,
          y: 200 + index * 80,
          fontSize: 20,
          color: card.colorScheme.text,
          status: leg.status,
        })),
        {
          type: "text",
          content: `@${card.username}`,
          x: 50,
          y: dimensions.height - 50,
          fontSize: 18,
          color: card.colorScheme.text,
          opacity: 0.7,
        },
      ],
    };
  }
}

interface RenderElement {
  type: "text" | "leg" | "image" | "badge";
  content: string;
  x: number;
  y: number;
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  opacity?: number;
  status?: string;
}

// ============================================================================
// FACTORY
// ============================================================================

export function createParlayCardGenerator(): ParlayCardGenerator {
  return new ParlayCardGenerator();
}
