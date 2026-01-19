/**
 * RWA (Real World Asset) Types for PULL Super App
 * Covers Pokemon cards, collectibles, fractional ownership
 */

/** RWA asset types */
export type RWAAssetType = "pokemon_card" | "sports_card" | "collectible" | "art" | "other";

/** RWA asset status */
export type RWAAssetStatus =
  | "pending_verification"
  | "verified"
  | "listed"
  | "sold"
  | "delisted"
  | "disputed";

/** Grading companies */
export type GradingCompany = "PSA" | "BGS" | "CGC" | "SGC" | "RAW";

/** Base RWA asset interface */
export interface RWAAsset {
  id: string;
  type: RWAAssetType;
  name: string;
  description: string;
  imageUrls: string[];
  status: RWAAssetStatus;
  ownerId: string;
  custodianId?: string;
  totalShares: number;
  availableShares: number;
  pricePerShare: number;
  totalValue: number;
  currency: string;
  grading?: GradingInfo;
  metadata: Record<string, unknown>;
  verificationDocuments: string[];
  verifiedAt?: Date;
  listedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** Pokemon card specific data */
export interface PokemonCard extends RWAAsset {
  type: "pokemon_card";
  cardName: string;
  setName: string;
  setNumber: string;
  cardNumber: string;
  rarity: PokemonRarity;
  edition: PokemonEdition;
  language: string;
  year: number;
  artist?: string;
  isHolo: boolean;
  isReverse: boolean;
  isFirstEdition: boolean;
  isShadowless: boolean;
  pokemonType?: string;
  hp?: number;
}

/** Pokemon card rarities */
export type PokemonRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "holo_rare"
  | "ultra_rare"
  | "secret_rare"
  | "illustration_rare"
  | "special_art_rare"
  | "hyper_rare"
  | "promo";

/** Pokemon card editions */
export type PokemonEdition =
  | "base"
  | "first_edition"
  | "unlimited"
  | "shadowless"
  | "reverse_holo"
  | "promo";

/** Grading information */
export interface GradingInfo {
  company: GradingCompany;
  grade: number;
  subgrades?: GradingSubgrades;
  certNumber: string;
  population?: GradingPopulation;
  label?: string;
  gradedAt?: Date;
  verifiedAt?: Date;
}

/** Grading subgrades (for BGS etc) */
export interface GradingSubgrades {
  centering?: number;
  corners?: number;
  edges?: number;
  surface?: number;
}

/** Grading population data */
export interface GradingPopulation {
  total: number;
  higherGrades: number;
  sameGrade: number;
  lowerGrades: number;
  lastUpdated: Date;
}

/** RWA listing on marketplace */
export interface AssetListing {
  id: string;
  assetId: string;
  sellerId: string;
  listingType: ListingType;
  status: ListingStatus;
  pricePerShare: number;
  minShares: number;
  maxShares: number;
  availableShares: number;
  totalShares: number;
  auctionEndTime?: Date;
  highestBid?: number;
  highestBidderId?: string;
  reservePrice?: number;
  buyNowPrice?: number;
  viewCount: number;
  watchCount: number;
  offerCount: number;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** Listing types */
export type ListingType = "fixed_price" | "auction" | "make_offer";

/** Listing status */
export type ListingStatus =
  | "draft"
  | "pending_review"
  | "active"
  | "sold"
  | "expired"
  | "cancelled"
  | "delisted";

/** Fractional share ownership record */
export interface FractionalShare {
  id: string;
  assetId: string;
  ownerId: string;
  shares: number;
  sharePercentage: number;
  averageCost: number;
  currentValue: number;
  unrealizedPnL: number;
  acquiredAt: Date;
  updatedAt: Date;
}

/** Asset ownership history entry */
export interface OwnershipHistoryEntry {
  id: string;
  assetId: string;
  fromUserId?: string;
  toUserId: string;
  shares: number;
  pricePerShare: number;
  totalValue: number;
  transactionType: "mint" | "purchase" | "sale" | "transfer" | "redemption";
  transactionId?: string;
  timestamp: Date;
}

/** Asset price history */
export interface AssetPriceHistory {
  assetId: string;
  timestamp: Date;
  pricePerShare: number;
  totalValue: number;
  volume: number;
  source: "trade" | "appraisal" | "market";
}

/** Make offer on asset */
export interface AssetOffer {
  id: string;
  listingId: string;
  assetId: string;
  buyerId: string;
  shares: number;
  pricePerShare: number;
  totalValue: number;
  status: "pending" | "accepted" | "rejected" | "expired" | "withdrawn";
  message?: string;
  expiresAt: Date;
  createdAt: Date;
  respondedAt?: Date;
}
