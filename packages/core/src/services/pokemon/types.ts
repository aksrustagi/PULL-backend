/**
 * Pokemon Pricing Types
 * Type definitions for Pokemon card pricing service
 */

// ============================================================================
// Card Types
// ============================================================================

export interface Card {
  id: string;
  name: string;
  supertype: "Pokémon" | "Trainer" | "Energy";
  subtypes: string[];
  hp?: string;
  types?: string[];
  evolvesFrom?: string;
  evolvesTo?: string[];
  rules?: string[];
  attacks?: Attack[];
  weaknesses?: Weakness[];
  resistances?: Resistance[];
  retreatCost?: string[];
  convertedRetreatCost?: number;
  set: SetBrief;
  number: string;
  artist?: string;
  rarity: Rarity;
  flavorText?: string;
  nationalPokedexNumbers?: number[];
  legalities: Legalities;
  regulationMark?: string;
  images: CardImages;
  tcgplayer?: TCGPlayerData;
  cardmarket?: CardMarketData;
}

export interface Attack {
  name: string;
  cost: string[];
  convertedEnergyCost: number;
  damage: string;
  text: string;
}

export interface Weakness {
  type: string;
  value: string;
}

export interface Resistance {
  type: string;
  value: string;
}

export interface SetBrief {
  id: string;
  name: string;
  series: string;
  printedTotal: number;
  total: number;
  legalities: Legalities;
  ptcgoCode?: string;
  releaseDate: string;
  updatedAt: string;
  images: SetImages;
}

export interface Legalities {
  unlimited?: "Legal" | "Banned";
  standard?: "Legal" | "Banned";
  expanded?: "Legal" | "Banned";
}

export interface CardImages {
  small: string;
  large: string;
}

export interface SetImages {
  symbol: string;
  logo: string;
}

export type Rarity =
  | "Common"
  | "Uncommon"
  | "Rare"
  | "Rare Holo"
  | "Rare Holo EX"
  | "Rare Holo GX"
  | "Rare Holo V"
  | "Rare Holo VMAX"
  | "Rare Holo VSTAR"
  | "Rare Ultra"
  | "Rare Secret"
  | "Rare Rainbow"
  | "Rare Shiny"
  | "Amazing Rare"
  | "Promo"
  | "LEGEND"
  | "Classic Collection";

// ============================================================================
// Set Types
// ============================================================================

export interface Set {
  id: string;
  name: string;
  series: string;
  printedTotal: number;
  total: number;
  legalities: Legalities;
  ptcgoCode?: string;
  releaseDate: string;
  updatedAt: string;
  images: SetImages;
}

// ============================================================================
// Pricing Types
// ============================================================================

export interface TCGPlayerData {
  url: string;
  updatedAt: string;
  prices?: {
    normal?: PriceData;
    holofoil?: PriceData;
    reverseHolofoil?: PriceData;
    "1stEditionHolofoil"?: PriceData;
    "1stEditionNormal"?: PriceData;
  };
}

export interface PriceData {
  low: number | null;
  mid: number | null;
  high: number | null;
  market: number | null;
  directLow: number | null;
}

export interface CardMarketData {
  url: string;
  updatedAt: string;
  prices?: {
    averageSellPrice: number | null;
    lowPrice: number | null;
    trendPrice: number | null;
    germanProLow: number | null;
    suggestedPrice: number | null;
    reverseHoloSell: number | null;
    reverseHoloLow: number | null;
    reverseHoloTrend: number | null;
    lowPriceExPlus: number | null;
    avg1: number | null;
    avg7: number | null;
    avg30: number | null;
    reverseHoloAvg1: number | null;
    reverseHoloAvg7: number | null;
    reverseHoloAvg30: number | null;
  };
}

export interface Pricing {
  cardId: string;
  cardName: string;
  setName: string;
  tcgplayerMarket: number | null;
  tcgplayerLow: number | null;
  tcgplayerMid: number | null;
  tcgplayerHigh: number | null;
  ebayAverage: number | null;
  ebayLow: number | null;
  ebayHigh: number | null;
  ebayRecentSales: number;
  gradedPrices?: GradedPricing;
  lastUpdated: string;
}

export interface GradedPricing {
  psa8: GradedPrice | null;
  psa9: GradedPrice | null;
  psa10: GradedPrice | null;
  bgs8: GradedPrice | null;
  bgs9: GradedPrice | null;
  bgs95: GradedPrice | null;
  bgs10: GradedPrice | null;
  cgc8: GradedPrice | null;
  cgc9: GradedPrice | null;
  cgc95: GradedPrice | null;
  cgc10: GradedPrice | null;
}

export interface GradedPrice {
  average: number;
  low: number;
  high: number;
  recentSales: number;
  lastSaleDate: string | null;
}

// ============================================================================
// Price History Types
// ============================================================================

export interface PriceHistory {
  cardId: string;
  date: string;
  tcgplayerMarket: number | null;
  ebayAverage: number | null;
  psa10Average: number | null;
}

export interface PriceHistoryRange {
  cardId: string;
  cardName: string;
  setName: string;
  startDate: string;
  endDate: string;
  dataPoints: PriceHistory[];
  priceChange: {
    tcgplayer: number | null;
    tcgplayerPercent: number | null;
    ebay: number | null;
    ebayPercent: number | null;
    psa10: number | null;
    psa10Percent: number | null;
  };
}

// ============================================================================
// Search Types
// ============================================================================

export interface SearchCardsParams {
  q?: string;
  name?: string;
  setId?: string;
  setName?: string;
  types?: string[];
  subtypes?: string[];
  supertype?: string;
  rarity?: Rarity[];
  hp?: string;
  attacks?: string;
  weaknesses?: string;
  resistances?: string;
  pokedexNumber?: number;
  artist?: string;
  page?: number;
  pageSize?: number;
  orderBy?: "name" | "set" | "number" | "rarity";
}

export interface SearchResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  count: number;
  totalCount: number;
}

// ============================================================================
// Title Parser Types (for eBay listings)
// ============================================================================

export interface ParsedTitle {
  cardName: string | null;
  setName: string | null;
  cardNumber: string | null;
  year: number | null;
  grade: number | null;
  gradingCompany: "PSA" | "BGS" | "CGC" | null;
  certNumber: string | null;
  isFirstEdition: boolean;
  isHolo: boolean;
  isShadowless: boolean;
  language: string | null;
  condition: "NM" | "LP" | "MP" | "HP" | "DMG" | null;
}

// ============================================================================
// Cache Types
// ============================================================================

export interface CachedPrice {
  pricing: Pricing;
  cachedAt: number;
  expiresAt: number;
}

export interface CacheConfig {
  ttlMs: number;
  maxSize: number;
}

// ============================================================================
// Error Types
// ============================================================================

export interface PokemonPriceError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class PokemonPriceApiError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = "PokemonPriceApiError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

// Error codes
export const PRICE_ERRORS = {
  CARD_NOT_FOUND: "CARD_NOT_FOUND",
  SET_NOT_FOUND: "SET_NOT_FOUND",
  PRICING_UNAVAILABLE: "PRICING_UNAVAILABLE",
  RATE_LIMITED: "RATE_LIMITED",
  API_ERROR: "API_ERROR",
  PARSE_ERROR: "PARSE_ERROR",
  CACHE_ERROR: "CACHE_ERROR",
} as const;
