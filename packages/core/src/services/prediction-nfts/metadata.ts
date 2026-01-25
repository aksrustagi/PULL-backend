/**
 * Prediction NFT Metadata Generator
 * Generate NFT metadata and visual assets
 */

import {
  PredictionNFT,
  NFTMetadata,
  NFTAttribute,
  NFTRarity,
  NFTCategory,
  ParlayLeg,
  RARITY_COLORS,
} from "./types";

// ============================================================================
// Configuration
// ============================================================================

export interface MetadataConfig {
  baseExternalUrl: string;
  imageBaseUrl: string;
  animationBaseUrl: string;
  platformName: string;
}

const DEFAULT_CONFIG: MetadataConfig = {
  baseExternalUrl: "https://pull.bet/nft",
  imageBaseUrl: "https://assets.pull.bet/nft/images",
  animationBaseUrl: "https://assets.pull.bet/nft/animations",
  platformName: "PULL",
};

// ============================================================================
// Metadata Generator
// ============================================================================

export class MetadataGenerator {
  private config: MetadataConfig;

  constructor(config?: Partial<MetadataConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Metadata Generation
  // ==========================================================================

  /**
   * Generate full NFT metadata
   */
  generateMetadata(nft: Partial<PredictionNFT>): NFTMetadata {
    const attributes = this.generateAttributes(nft);

    return {
      name: nft.name || this.generateName(nft),
      description: nft.description || this.generateDescription(nft),
      image: nft.imageUrl || this.generateImageUrl(nft),
      animation_url: nft.animationUrl,
      external_url: `${this.config.baseExternalUrl}/${nft.id}`,
      attributes,
      background_color: this.getRarityBackgroundColor(nft.rarity || "common"),

      properties: {
        category: nft.category || "winning_bet",
        rarity: nft.rarity || "common",
        rarityScore: nft.rarityScore || 0,
        betDetails: {
          type: nft.betType || "single",
          odds: nft.odds || 0,
          stake: nft.stake || 0,
          payout: nft.payout || 0,
          profit: nft.profit || 0,
        },
        event: {
          id: nft.eventId || "",
          name: nft.eventName || "",
          sport: nft.sport,
          league: nft.league,
          date: nft.betSettledAt?.toISOString() || new Date().toISOString(),
        },
        creator: {
          id: nft.creatorId || "",
          address: nft.mintedTo || "",
        },
      },
    };
  }

  /**
   * Generate NFT attributes array
   */
  generateAttributes(nft: Partial<PredictionNFT>): NFTAttribute[] {
    const attributes: NFTAttribute[] = [];

    // Rarity
    attributes.push({
      traitType: "Rarity",
      value: this.capitalizeFirst(nft.rarity || "common"),
    });

    // Rarity Score
    attributes.push({
      traitType: "Rarity Score",
      value: Math.round(nft.rarityScore || 0),
      displayType: "number",
      maxValue: 100,
    });

    // Category
    attributes.push({
      traitType: "Category",
      value: this.formatCategory(nft.category || "winning_bet"),
    });

    // Bet Type
    attributes.push({
      traitType: "Bet Type",
      value: this.capitalizeFirst(nft.betType || "single"),
    });

    // Sport (if applicable)
    if (nft.sport) {
      attributes.push({
        traitType: "Sport",
        value: nft.sport.toUpperCase(),
      });
    }

    // League (if applicable)
    if (nft.league) {
      attributes.push({
        traitType: "League",
        value: nft.league,
      });
    }

    // Odds
    attributes.push({
      traitType: "Odds",
      value: nft.odds || 0,
      displayType: "number",
    });

    // Profit
    attributes.push({
      traitType: "Profit ($)",
      value: Math.round((nft.profit || 0) * 100) / 100,
      displayType: "number",
    });

    // Profit Multiplier
    attributes.push({
      traitType: "Profit Multiplier",
      value: `${((nft.profitMultiplier || 0) * 100).toFixed(0)}%`,
    });

    // Payout
    attributes.push({
      traitType: "Payout ($)",
      value: Math.round((nft.payout || 0) * 100) / 100,
      displayType: "number",
    });

    // Parlay Legs (if applicable)
    if (nft.parlayLegs && nft.parlayLegs.length > 1) {
      attributes.push({
        traitType: "Parlay Legs",
        value: nft.parlayLegs.length,
        displayType: "number",
      });
    }

    // Edition
    if (nft.edition !== undefined) {
      attributes.push({
        traitType: "Edition",
        value: `${nft.edition}/${nft.maxEdition || 1}`,
      });
    }

    // Date
    if (nft.betSettledAt) {
      attributes.push({
        traitType: "Settled Date",
        value: Math.floor(nft.betSettledAt.getTime() / 1000),
        displayType: "date",
      });
    }

    return attributes;
  }

  // ==========================================================================
  // Name & Description Generation
  // ==========================================================================

  /**
   * Generate NFT name
   */
  generateName(nft: Partial<PredictionNFT>): string {
    const rarity = this.capitalizeFirst(nft.rarity || "common");
    const category = this.formatCategory(nft.category || "winning_bet");

    if (nft.parlayLegs && nft.parlayLegs.length > 1) {
      return `${rarity} ${nft.parlayLegs.length}-Leg Parlay`;
    }

    if (nft.category === "streak") {
      return `${rarity} Winning Streak`;
    }

    if (nft.category === "milestone") {
      return `${rarity} Milestone Achievement`;
    }

    if (nft.sport) {
      return `${rarity} ${nft.sport.toUpperCase()} ${category}`;
    }

    return `${rarity} ${category}`;
  }

  /**
   * Generate NFT description
   */
  generateDescription(nft: Partial<PredictionNFT>): string {
    const parts: string[] = [];

    // Opening
    const rarity = this.capitalizeFirst(nft.rarity || "common");
    parts.push(`This ${rarity} ${this.config.platformName} NFT commemorates `);

    // Bet description
    if (nft.parlayLegs && nft.parlayLegs.length > 1) {
      parts.push(`a perfect ${nft.parlayLegs.length}-leg parlay `);
    } else if (nft.category === "streak") {
      parts.push(`an impressive winning streak `);
    } else if (nft.category === "milestone") {
      parts.push(`a significant betting milestone `);
    } else {
      parts.push(`a winning prediction `);
    }

    // Event details
    if (nft.eventName) {
      parts.push(`on ${nft.eventName}. `);
    } else {
      parts.push(". ");
    }

    // Selection
    if (nft.selection) {
      parts.push(`The winning selection was "${nft.selection}" `);
    }

    // Odds and profit
    if (nft.odds) {
      parts.push(`at ${nft.odds}x odds`);
    }
    if (nft.profit && nft.profit > 0) {
      parts.push(`, earning a profit of $${nft.profit.toFixed(2)}`);
    }
    parts.push(". ");

    // Rarity explanation
    if (nft.rarityScore && nft.rarityScore >= 80) {
      parts.push(`With a rarity score of ${Math.round(nft.rarityScore)}/100, this is an exceptionally rare collectible.`);
    } else if (nft.rarityScore && nft.rarityScore >= 60) {
      parts.push(`With a rarity score of ${Math.round(nft.rarityScore)}/100, this is a prized addition to any collection.`);
    }

    return parts.join("");
  }

  // ==========================================================================
  // Image Generation
  // ==========================================================================

  /**
   * Generate image URL based on NFT properties
   */
  generateImageUrl(nft: Partial<PredictionNFT>): string {
    const rarity = nft.rarity || "common";
    const category = nft.category || "winning_bet";
    const sport = nft.sport?.toLowerCase() || "default";

    return `${this.config.imageBaseUrl}/${rarity}/${category}/${sport}.png`;
  }

  /**
   * Generate animation URL for higher rarities
   */
  generateAnimationUrl(nft: Partial<PredictionNFT>): string | undefined {
    const rarity = nft.rarity || "common";

    // Only legendary and mythic get animations
    if (!["legendary", "mythic"].includes(rarity)) {
      return undefined;
    }

    const category = nft.category || "winning_bet";
    return `${this.config.animationBaseUrl}/${rarity}/${category}.mp4`;
  }

  /**
   * Get background color for rarity
   */
  getRarityBackgroundColor(rarity: NFTRarity): string {
    // Return hex without #
    return RARITY_COLORS[rarity].replace("#", "");
  }

  /**
   * Generate image composition parameters
   */
  generateImageParams(nft: Partial<PredictionNFT>): ImageCompositionParams {
    return {
      rarity: nft.rarity || "common",
      category: nft.category || "winning_bet",
      sport: nft.sport,
      league: nft.league,
      odds: nft.odds || 0,
      profit: nft.profit || 0,
      eventName: nft.eventName,
      selection: nft.selection,
      parlayLegs: nft.parlayLegs?.length || 1,
      backgroundColor: RARITY_COLORS[nft.rarity || "common"],
      includeAnimation: ["legendary", "mythic"].includes(nft.rarity || "common"),
    };
  }

  // ==========================================================================
  // Parlay Metadata
  // ==========================================================================

  /**
   * Generate parlay-specific description
   */
  generateParlayDescription(legs: ParlayLeg[], totalOdds: number, profit: number): string {
    const parts: string[] = [];

    parts.push(`A perfect ${legs.length}-leg parlay at combined odds of ${totalOdds.toFixed(2)}x:\n\n`);

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      parts.push(`${i + 1}. ${leg.eventName}: ${leg.selection} @ ${leg.odds}x\n`);
    }

    parts.push(`\nTotal profit: $${profit.toFixed(2)}`);

    return parts.join("");
  }

  /**
   * Generate parlay attributes
   */
  generateParlayAttributes(legs: ParlayLeg[]): NFTAttribute[] {
    const attributes: NFTAttribute[] = [];

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      attributes.push({
        traitType: `Leg ${i + 1} Event`,
        value: leg.eventName,
      });
      attributes.push({
        traitType: `Leg ${i + 1} Selection`,
        value: leg.selection,
      });
      attributes.push({
        traitType: `Leg ${i + 1} Odds`,
        value: leg.odds,
        displayType: "number",
      });
    }

    return attributes;
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private formatCategory(category: NFTCategory): string {
    return category
      .split("_")
      .map(word => this.capitalizeFirst(word))
      .join(" ");
  }

  /**
   * Validate metadata against OpenSea standards
   */
  validateMetadata(metadata: NFTMetadata): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!metadata.name || metadata.name.length === 0) {
      errors.push("Name is required");
    }
    if (metadata.name && metadata.name.length > 200) {
      errors.push("Name must be 200 characters or less");
    }

    if (!metadata.description || metadata.description.length === 0) {
      errors.push("Description is required");
    }
    if (metadata.description && metadata.description.length > 5000) {
      errors.push("Description must be 5000 characters or less");
    }

    if (!metadata.image) {
      errors.push("Image URL is required");
    }

    if (metadata.background_color && !/^[0-9a-fA-F]{6}$/.test(metadata.background_color)) {
      errors.push("Background color must be a valid 6-character hex code");
    }

    return { valid: errors.length === 0, errors };
  }
}

// ============================================================================
// Types
// ============================================================================

export interface ImageCompositionParams {
  rarity: NFTRarity;
  category: NFTCategory;
  sport?: string;
  league?: string;
  odds: number;
  profit: number;
  eventName?: string;
  selection?: string;
  parlayLegs: number;
  backgroundColor: string;
  includeAnimation: boolean;
}

// Export singleton instance
export const metadataGenerator = new MetadataGenerator();
