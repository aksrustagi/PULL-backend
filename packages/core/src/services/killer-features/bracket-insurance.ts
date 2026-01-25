/**
 * KILLER FEATURE #9: Bracket Insurance
 *
 * Protect your bracket picks with automatic insurance.
 * Keep your bracket alive even when upsets happen.
 *
 * WHY IT KILLS:
 * - Reduces frustration from early busts
 * - Keeps users engaged longer
 * - Premium upsell opportunity
 * - Creates "save my bracket" moments
 *
 * K-FACTOR BOOST:
 * - Share insurance saves on social
 * - "My bracket survived!" moments
 * - Referral bonus for insurance signups
 * - Group insurance for pools
 */

import { z } from "zod";

// ============================================================================
// TYPES
// ============================================================================

export const InsuranceTierSchema = z.enum([
  "basic",        // 1 mulligan in first round
  "standard",     // 2 mulligans, any round
  "premium",      // 3 mulligans + upset protection
  "elite",        // Unlimited first round, 5 total
]);

export type InsuranceTier = z.infer<typeof InsuranceTierSchema>;

export interface BracketInsurance {
  id: string;
  bracketId: string;
  userId: string;
  tier: InsuranceTier;

  // Coverage
  mulligansTotal: number;
  mulligansUsed: number;
  mulligansRemaining: number;

  // Upset protection (Premium+)
  upsetProtection: boolean;
  upsetProtectionUsed: number;
  upsetProtectionLimit: number;

  // Stats
  pointsSaved: number;
  picksSaved: string[]; // Pick IDs that were saved

  // Purchase
  price: number;
  purchasedAt: number;

  // Status
  isActive: boolean;
  expiresAt: number;
}

export interface InsuranceClaim {
  id: string;
  insuranceId: string;
  bracketId: string;
  userId: string;

  // The pick being saved
  pickId: string;
  originalPick: string;
  correctPick: string;
  round: number;
  pointValue: number;

  // Type of save
  claimType: "mulligan" | "upset_protection" | "auto_swap";

  // Status
  status: "pending" | "approved" | "applied" | "denied";
  deniedReason?: string;

  createdAt: number;
  processedAt?: number;
}

export interface UpsetAlert {
  id: string;
  bracketId: string;
  userId: string;

  // Upset details
  gameId: string;
  favoriteTeam: string;
  favoriteSeed: number;
  underdogTeam: string;
  underdogSeed: number;
  round: number;

  // User's pick
  userPick: string;
  isAtRisk: boolean;

  // Insurance status
  hasInsurance: boolean;
  canUseMulligan: boolean;
  autoProtected: boolean; // If upset protection applies

  // Current game state
  score?: { favorite: number; underdog: number };
  timeRemaining?: string;
  upsetProbability: number;

  createdAt: number;
}

export interface PoolInsurance {
  id: string;
  poolId: string;
  poolName: string;
  adminUserId: string;

  // Coverage type
  coverageType: "individual" | "pool_wide";
  tier: InsuranceTier;

  // For individual: each member gets their own
  // For pool-wide: shared pool of mulligans
  sharedMulligans?: number;
  sharedMulligansUsed?: number;

  // Participants covered
  coveredUserIds: string[];
  totalParticipants: number;

  // Pricing
  pricePerPerson: number;
  totalPrice: number;
  paidBy: "admin" | "split" | "included";

  purchasedAt: number;
  expiresAt: number;
}

export interface InsuranceStats {
  userId: string;

  // Usage
  totalMulligansUsed: number;
  totalPointsSaved: number;
  totalClaimsApproved: number;
  totalClaimsDenied: number;

  // Value
  totalPremiumsPaid: number;
  estimatedValueReceived: number;
  roi: number;

  // History
  insuranceHistory: Array<{
    bracketId: string;
    tier: InsuranceTier;
    mulligansUsed: number;
    pointsSaved: number;
    season: string;
  }>;
}

// ============================================================================
// BRACKET INSURANCE SERVICE
// ============================================================================

export class BracketInsuranceService {
  /**
   * Get insurance tier details
   */
  getTierDetails(tier: InsuranceTier): {
    name: string;
    description: string;
    mulligans: number;
    upsetProtection: boolean;
    upsetProtectionLimit: number;
    price: number;
    features: string[];
  } {
    switch (tier) {
      case "basic":
        return {
          name: "Basic Insurance",
          description: "One free pass on an early-round mistake",
          mulligans: 1,
          upsetProtection: false,
          upsetProtectionLimit: 0,
          price: 4.99,
          features: [
            "1 mulligan (first round only)",
            "Keep your bracket alive",
          ],
        };
      case "standard":
        return {
          name: "Standard Insurance",
          description: "Two mulligans to use any time",
          mulligans: 2,
          upsetProtection: false,
          upsetProtectionLimit: 0,
          price: 9.99,
          features: [
            "2 mulligans (any round)",
            "Use strategically",
            "Save for big upsets",
          ],
        };
      case "premium":
        return {
          name: "Premium Insurance",
          description: "Full protection with upset coverage",
          mulligans: 3,
          upsetProtection: true,
          upsetProtectionLimit: 2,
          price: 19.99,
          features: [
            "3 mulligans (any round)",
            "Auto upset protection (2 saves)",
            "Real-time upset alerts",
            "Priority claim processing",
          ],
        };
      case "elite":
        return {
          name: "Elite Insurance",
          description: "Maximum protection for serious competitors",
          mulligans: 5,
          upsetProtection: true,
          upsetProtectionLimit: 4,
          price: 34.99,
          features: [
            "Unlimited first-round mulligans",
            "5 total mulligans (rounds 2+)",
            "Auto upset protection (4 saves)",
            "Real-time upset alerts",
            "Dedicated support",
            "Insurance stats dashboard",
          ],
        };
    }
  }

  /**
   * Create insurance for a bracket
   */
  createInsurance(
    bracketId: string,
    userId: string,
    tier: InsuranceTier,
    tournamentEndDate: number
  ): BracketInsurance {
    const details = this.getTierDetails(tier);

    return {
      id: `ins_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      bracketId,
      userId,
      tier,
      mulligansTotal: details.mulligans,
      mulligansUsed: 0,
      mulligansRemaining: details.mulligans,
      upsetProtection: details.upsetProtection,
      upsetProtectionUsed: 0,
      upsetProtectionLimit: details.upsetProtectionLimit,
      pointsSaved: 0,
      picksSaved: [],
      price: details.price,
      purchasedAt: Date.now(),
      isActive: true,
      expiresAt: tournamentEndDate,
    };
  }

  /**
   * Process an insurance claim
   */
  processClaim(
    insurance: BracketInsurance,
    claim: Omit<InsuranceClaim, "id" | "status" | "createdAt">
  ): {
    claim: InsuranceClaim;
    updatedInsurance: BracketInsurance;
    approved: boolean;
    reason?: string;
  } {
    const claimRecord: InsuranceClaim = {
      id: `claim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...claim,
      status: "pending",
      createdAt: Date.now(),
    };

    // Check if insurance is active
    if (!insurance.isActive) {
      claimRecord.status = "denied";
      claimRecord.deniedReason = "Insurance is no longer active";
      return {
        claim: claimRecord,
        updatedInsurance: insurance,
        approved: false,
        reason: "Insurance is no longer active",
      };
    }

    // Check claim type eligibility
    if (claim.claimType === "mulligan") {
      if (insurance.mulligansRemaining <= 0) {
        claimRecord.status = "denied";
        claimRecord.deniedReason = "No mulligans remaining";
        return {
          claim: claimRecord,
          updatedInsurance: insurance,
          approved: false,
          reason: "No mulligans remaining",
        };
      }

      // Basic tier only works in round 1
      if (insurance.tier === "basic" && claim.round > 1) {
        claimRecord.status = "denied";
        claimRecord.deniedReason = "Basic insurance only covers first round";
        return {
          claim: claimRecord,
          updatedInsurance: insurance,
          approved: false,
          reason: "Basic insurance only covers first round",
        };
      }
    } else if (claim.claimType === "upset_protection") {
      if (!insurance.upsetProtection) {
        claimRecord.status = "denied";
        claimRecord.deniedReason = "Upset protection not included in your tier";
        return {
          claim: claimRecord,
          updatedInsurance: insurance,
          approved: false,
          reason: "Upset protection not included",
        };
      }

      if (insurance.upsetProtectionUsed >= insurance.upsetProtectionLimit) {
        claimRecord.status = "denied";
        claimRecord.deniedReason = "Upset protection limit reached";
        return {
          claim: claimRecord,
          updatedInsurance: insurance,
          approved: false,
          reason: "Upset protection limit reached",
        };
      }
    }

    // Approve the claim
    claimRecord.status = "approved";
    claimRecord.processedAt = Date.now();

    const updatedInsurance = { ...insurance };
    if (claim.claimType === "mulligan") {
      updatedInsurance.mulligansUsed++;
      updatedInsurance.mulligansRemaining--;
    } else if (claim.claimType === "upset_protection") {
      updatedInsurance.upsetProtectionUsed++;
    }

    updatedInsurance.pointsSaved += claim.pointValue;
    updatedInsurance.picksSaved.push(claim.pickId);

    return {
      claim: claimRecord,
      updatedInsurance,
      approved: true,
    };
  }

  /**
   * Check if a pick qualifies for upset protection
   */
  qualifiesForUpsetProtection(
    userPick: string,
    actualWinner: string,
    favoriteSeed: number,
    underdogSeed: number
  ): boolean {
    // Upset protection applies when:
    // 1. User picked the favorite
    // 2. The underdog won
    // 3. Seed difference is 4+ (significant upset)

    const seedDiff = underdogSeed - favoriteSeed;
    const userPickedFavorite = userPick !== actualWinner && favoriteSeed < underdogSeed;

    return userPickedFavorite && seedDiff >= 4;
  }

  /**
   * Generate upset alert
   */
  createUpsetAlert(
    bracketId: string,
    userId: string,
    game: {
      id: string;
      favoriteTeam: string;
      favoriteSeed: number;
      underdogTeam: string;
      underdogSeed: number;
      round: number;
    },
    userPick: string,
    insurance?: BracketInsurance,
    upsetProbability: number = 0.3
  ): UpsetAlert {
    const isAtRisk = userPick === game.favoriteTeam;
    const canUseMulligan = insurance
      ? insurance.mulligansRemaining > 0
      : false;
    const autoProtected = insurance?.upsetProtection
      && insurance.upsetProtectionUsed < insurance.upsetProtectionLimit
      && (game.underdogSeed - game.favoriteSeed) >= 4;

    return {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      bracketId,
      userId,
      gameId: game.id,
      favoriteTeam: game.favoriteTeam,
      favoriteSeed: game.favoriteSeed,
      underdogTeam: game.underdogTeam,
      underdogSeed: game.underdogSeed,
      round: game.round,
      userPick,
      isAtRisk,
      hasInsurance: !!insurance,
      canUseMulligan,
      autoProtected: autoProtected ?? false,
      upsetProbability,
      createdAt: Date.now(),
    };
  }

  /**
   * Calculate points for a round
   */
  getPointsForRound(round: number): number {
    // Standard NCAA bracket scoring
    const pointsByRound: Record<number, number> = {
      1: 10,  // First round
      2: 20,  // Second round
      3: 40,  // Sweet 16
      4: 80,  // Elite 8
      5: 160, // Final Four
      6: 320, // Championship
    };
    return pointsByRound[round] ?? 10;
  }

  /**
   * Create pool insurance
   */
  createPoolInsurance(
    poolId: string,
    poolName: string,
    adminUserId: string,
    participants: string[],
    tier: InsuranceTier,
    coverageType: "individual" | "pool_wide",
    paidBy: "admin" | "split" | "included",
    tournamentEndDate: number
  ): PoolInsurance {
    const tierDetails = this.getTierDetails(tier);
    const totalParticipants = participants.length;

    // Pool-wide gets more mulligans (pooled together)
    const sharedMulligans = coverageType === "pool_wide"
      ? Math.ceil(tierDetails.mulligans * totalParticipants * 0.5)
      : undefined;

    // Pricing
    const pricePerPerson = tierDetails.price * 0.8; // 20% group discount
    const totalPrice = pricePerPerson * totalParticipants;

    return {
      id: `pool_ins_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      poolId,
      poolName,
      adminUserId,
      coverageType,
      tier,
      sharedMulligans,
      sharedMulligansUsed: 0,
      coveredUserIds: participants,
      totalParticipants,
      pricePerPerson,
      totalPrice,
      paidBy,
      purchasedAt: Date.now(),
      expiresAt: tournamentEndDate,
    };
  }

  /**
   * Generate shareable save card
   */
  generateSaveCard(claim: InsuranceClaim): {
    title: string;
    subtitle: string;
    details: string;
    pointsSaved: number;
    shareUrl: string;
    shareText: string;
  } {
    const isUpsetSave = claim.claimType === "upset_protection";

    return {
      title: isUpsetSave ? "UPSET PROTECTION ACTIVATED! 🛡️" : "MULLIGAN USED! 🎯",
      subtitle: `${claim.originalPick} lost to ${claim.correctPick}`,
      details: `Round ${claim.round} pick saved by bracket insurance`,
      pointsSaved: claim.pointValue,
      shareUrl: `https://pull.app/bracket/save/${claim.id}`,
      shareText: `My bracket survived! ${isUpsetSave ? "Upset protection" : "Mulligan"} saved my ${claim.originalPick} pick worth ${claim.pointValue} points! 🏀 #BracketInsurance`,
    };
  }

  /**
   * Calculate insurance value
   */
  calculateInsuranceValue(stats: InsuranceStats): {
    totalValue: number;
    roi: number;
    averagePointsSaved: number;
    recommendation: string;
  } {
    const totalValue = stats.totalPointsSaved * 0.5; // Estimated $ value per point
    const roi = stats.totalPremiumsPaid > 0
      ? ((totalValue - stats.totalPremiumsPaid) / stats.totalPremiumsPaid) * 100
      : 0;

    const avgPointsSaved = stats.insuranceHistory.length > 0
      ? stats.totalPointsSaved / stats.insuranceHistory.length
      : 0;

    let recommendation: string;
    if (stats.totalMulligansUsed === 0) {
      recommendation = "You haven't needed insurance yet. Consider basic tier.";
    } else if (roi > 50) {
      recommendation = "Insurance has paid off! Consider upgrading your tier.";
    } else if (roi > 0) {
      recommendation = "Insurance is working for you. Current tier is good.";
    } else {
      recommendation = "Consider a lower tier or going without.";
    }

    return {
      totalValue,
      roi,
      averagePointsSaved: avgPointsSaved,
      recommendation,
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createBracketInsuranceService(): BracketInsuranceService {
  return new BracketInsuranceService();
}
