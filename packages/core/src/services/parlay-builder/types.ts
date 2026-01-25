/**
 * Parlay Builder Types
 * Visual parlay builder with real-time odds calculation
 */

import { z } from "zod";

// ============================================================================
// ENUMS & SCHEMAS
// ============================================================================

export const BetTypeSchema = z.enum([
  "moneyline",
  "spread",
  "total",
  "prop",
  "futures",
  "live",
]);

export type BetType = z.infer<typeof BetTypeSchema>;

export const OddsFormatSchema = z.enum([
  "american",     // +150, -110
  "decimal",      // 2.50, 1.91
  "fractional",   // 3/2, 10/11
]);

export type OddsFormat = z.infer<typeof OddsFormatSchema>;

export const ParlayStatusSchema = z.enum([
  "building",     // Still being constructed
  "pending",      // Submitted, waiting for results
  "partial",      // Some legs settled
  "won",          // All legs won
  "lost",         // At least one leg lost
  "pushed",       // All remaining legs pushed
  "cashed_out",   // Early cashout taken
  "void",         // Cancelled/voided
]);

export type ParlayStatus = z.infer<typeof ParlayStatusSchema>;

export const LegStatusSchema = z.enum([
  "pending",
  "won",
  "lost",
  "push",
  "void",
  "live",
]);

export type LegStatus = z.infer<typeof LegStatusSchema>;

// ============================================================================
// CORE TYPES
// ============================================================================

export interface ParlayLeg {
  id: string;

  // Event info
  eventId: string;
  eventName: string;
  sport: string;
  league: string;
  startTime: number;
  isLive: boolean;

  // Selection
  betType: BetType;
  selection: string;         // e.g., "Lakers", "Over 220.5"
  selectionDetails: string;  // e.g., "Moneyline", "Point Spread -3.5"
  line?: number;             // e.g., -3.5, 220.5

  // Odds
  odds: number;              // American odds
  decimalOdds: number;
  impliedProbability: number;
  originalOdds: number;      // Odds at time of selection

  // Status
  status: LegStatus;
  result?: string;
  settledAt?: number;

  // Metadata
  addedAt: number;
  lastUpdatedAt: number;
}

export interface Parlay {
  id: string;
  userId: string;

  // Legs
  legs: ParlayLeg[];
  legCount: number;

  // Odds
  combinedOdds: number;           // American
  combinedDecimalOdds: number;
  impliedProbability: number;
  boostedOdds?: number;           // If odds boost applied
  oddsBoostId?: string;

  // Stakes
  stake: number;
  potentialPayout: number;
  actualPayout?: number;

  // Bonuses
  parlayBonus?: ParlayBonus;
  insuranceEligible: boolean;
  insuranceApplied: boolean;

  // Status
  status: ParlayStatus;
  settledLegs: number;
  wonLegs: number;
  lostLegs: number;
  pushedLegs: number;

  // Cashout
  cashoutAvailable: boolean;
  cashoutValue?: number;
  cashedOutAt?: number;
  cashoutAmount?: number;

  // Sharing
  isPublic: boolean;
  shareUrl?: string;
  cardUrl?: string;

  // AI
  aiSuggested: boolean;
  aiConfidence?: number;
  aiReasoning?: string;

  // Timestamps
  createdAt: number;
  submittedAt?: number;
  settledAt?: number;
  updatedAt: number;
}

export interface ParlayBonus {
  type: "percentage" | "fixed";
  value: number;
  minLegs: number;
  maxBonus?: number;
  description: string;

  // Calculated
  bonusAmount: number;
  bonusPercentage: number;
}

// ============================================================================
// PARLAY CARD TYPES
// ============================================================================

export interface ParlayCard {
  id: string;
  parlayId: string;
  userId: string;
  username: string;

  // Design
  template: ParlayCardTemplate;
  colorScheme: ColorScheme;
  showUserAvatar: boolean;
  showOdds: boolean;
  showPotentialPayout: boolean;

  // Content
  title: string;
  subtitle?: string;
  legs: ParlayCardLeg[];

  // Stats
  totalOdds: string;
  potentialPayout: string;
  stake?: string;

  // Result (if settled)
  result?: "won" | "lost" | "pending";
  actualPayout?: string;

  // URLs
  imageUrl: string;
  shareUrl: string;
  deepLink: string;

  // Engagement
  views: number;
  copies: number;
  likes: number;

  createdAt: number;
  expiresAt?: number;
}

export interface ParlayCardLeg {
  sport: string;
  sportIcon: string;
  eventName: string;
  selection: string;
  odds: string;
  status: LegStatus;
  startTime: string;
}

export interface ParlayCardTemplate {
  id: string;
  name: string;
  layout: "vertical" | "horizontal" | "grid";
  aspectRatio: "1:1" | "4:5" | "16:9" | "9:16";
  style: "modern" | "classic" | "neon" | "minimal" | "sport";
}

export interface ColorScheme {
  primary: string;
  secondary: string;
  background: string;
  text: string;
  accent: string;
}

// ============================================================================
// AI SUGGESTION TYPES
// ============================================================================

export interface AISuggestion {
  id: string;
  userId: string;

  // Parlay details
  legs: SuggestedLeg[];
  combinedOdds: number;
  impliedProbability: number;

  // AI analysis
  confidence: number;          // 0-100
  expectedValue: number;
  reasoning: string;
  keyFactors: string[];
  risks: string[];

  // Category
  category: SuggestionCategory;
  sport?: string;
  theme?: string;              // e.g., "underdogs", "favorites", "totals"

  // Metadata
  validUntil: number;
  createdAt: number;
}

export interface SuggestedLeg {
  eventId: string;
  eventName: string;
  sport: string;
  selection: string;
  odds: number;
  confidence: number;
  reasoning: string;
  stats?: Record<string, string | number>;
}

export type SuggestionCategory =
  | "best_value"          // High expected value
  | "safe_play"           // Higher probability, lower odds
  | "longshot"            // Low probability, high potential
  | "trending"            // Popular/trending picks
  | "contrarian"          // Against public consensus
  | "correlated"          // Correlated picks
  | "same_game"           // Same game parlay
  | "daily_special";      // Featured daily parlay

// ============================================================================
// ODDS BOOST TYPES
// ============================================================================

export interface OddsBoost {
  id: string;

  // Details
  name: string;
  description: string;
  boostType: "percentage" | "fixed_increase" | "set_odds";
  boostValue: number;

  // Original vs Boosted
  originalOdds: number;
  boostedOdds: number;

  // Eligibility
  minLegs?: number;
  maxLegs?: number;
  sports?: string[];
  betTypes?: BetType[];
  maxStake?: number;

  // Usage
  maxUsesPerUser: number;
  totalUses: number;
  usedByUser: boolean;

  // Validity
  startsAt: number;
  endsAt: number;
  isActive: boolean;
}

// ============================================================================
// API TYPES
// ============================================================================

export interface CreateParlayRequest {
  legs: AddLegRequest[];
  stake?: number;
  isPublic?: boolean;
}

export interface AddLegRequest {
  eventId: string;
  betType: BetType;
  selection: string;
  line?: number;
}

export interface UpdateParlayRequest {
  stake?: number;
  isPublic?: boolean;
  oddsBoostId?: string;
}

export interface SubmitParlayRequest {
  parlayId: string;
  stake: number;
  acceptOddsChanges?: boolean;
}

export interface CashoutRequest {
  parlayId: string;
  acceptValue?: number;  // Optional: only cashout if value >= this
}

export interface GenerateCardRequest {
  parlayId: string;
  template?: string;
  colorScheme?: Partial<ColorScheme>;
  showStake?: boolean;
  customTitle?: string;
}

export interface GetSuggestionsRequest {
  category?: SuggestionCategory;
  sport?: string;
  minLegs?: number;
  maxLegs?: number;
  maxOdds?: number;
  minOdds?: number;
}

export interface ParlayOddsResponse {
  combinedOdds: number;
  decimalOdds: number;
  fractionalOdds: string;
  impliedProbability: number;
  potentialPayout: number;
  parlayBonus?: ParlayBonus;
  hasOddsChanged: boolean;
  changedLegs: string[];  // Leg IDs with changed odds
}

export interface ParlayValidation {
  isValid: boolean;
  errors: ParlayValidationError[];
  warnings: string[];
  maxStake?: number;
  minStake?: number;
}

export interface ParlayValidationError {
  code: string;
  message: string;
  legId?: string;
}
