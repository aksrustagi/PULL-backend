/**
 * Prediction NFTs - Type Definitions
 * Mint winning bets as collectible NFTs
 */

// ============================================================================
// NFT Types & Rarity
// ============================================================================

export type NFTRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary"
  | "mythic";

export type NFTStatus =
  | "pending"
  | "minting"
  | "minted"
  | "listed"
  | "sold"
  | "transferred"
  | "burned";

export type NFTCategory =
  | "winning_bet"
  | "perfect_parlay"
  | "streak"
  | "milestone"
  | "event_special"
  | "leaderboard"
  | "achievement";

export type TradeStatus =
  | "active"
  | "pending_payment"
  | "completed"
  | "cancelled"
  | "expired";

// ============================================================================
// Prediction NFT
// ============================================================================

export interface PredictionNFT {
  id: string;
  tokenId: string;
  contractAddress: string;
  chain: "ethereum" | "polygon" | "base" | "arbitrum";

  // Ownership
  ownerId: string;
  ownerAddress: string;
  creatorId: string;
  mintedTo: string;

  // NFT details
  name: string;
  description: string;
  category: NFTCategory;
  rarity: NFTRarity;
  edition: number;
  maxEdition: number;
  isOneOfOne: boolean;

  // Visual
  imageUrl: string;
  animationUrl?: string;
  thumbnailUrl?: string;
  backgroundColor?: string;

  // Bet details
  betId: string;
  betType: "single" | "parlay" | "prop" | "futures";
  eventId: string;
  eventName: string;
  sport?: string;
  league?: string;
  selection: string;
  odds: number;
  stake: number;
  payout: number;
  profit: number;
  profitMultiplier: number;
  betPlacedAt: Date;
  betSettledAt: Date;

  // Parlay details (if applicable)
  parlayLegs?: ParlayLeg[];
  parlayOdds?: number;

  // Rarity factors
  rarityScore: number;
  rarityFactors: RarityFactors;

  // Metadata
  attributes: NFTAttribute[];
  metadata: NFTMetadata;

  // Status
  status: NFTStatus;
  mintedAt?: Date;
  mintTxHash?: string;

  // Trading
  isListed: boolean;
  listPrice?: number;
  listCurrency?: string;
  lastSalePrice?: number;
  lastSaleAt?: Date;

  // Stats
  viewCount: number;
  likeCount: number;
  tradeCount: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface ParlayLeg {
  eventId: string;
  eventName: string;
  selection: string;
  odds: number;
  result: "won" | "lost" | "push";
}

export interface RarityFactors {
  oddsMultiplier: number;
  payoutMultiplier: number;
  profitMultiplier: number;
  eventSignificance: number;
  timingBonus: number;
  streakBonus: number;
  categoryBonus: number;
  total: number;
}

export interface NFTAttribute {
  traitType: string;
  value: string | number;
  displayType?: "number" | "boost_percentage" | "boost_number" | "date";
  maxValue?: number;
}

export interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  animation_url?: string;
  external_url: string;
  attributes: NFTAttribute[];
  background_color?: string;

  // Custom properties
  properties: {
    category: NFTCategory;
    rarity: NFTRarity;
    rarityScore: number;
    betDetails: {
      type: string;
      odds: number;
      stake: number;
      payout: number;
      profit: number;
    };
    event: {
      id: string;
      name: string;
      sport?: string;
      league?: string;
      date: string;
    };
    creator: {
      id: string;
      address: string;
    };
  };
}

// ============================================================================
// Collections
// ============================================================================

export interface NFTCollection {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  coverImageUrl?: string;

  // Contents
  nftIds: string[];
  totalNFTs: number;

  // Stats
  totalValue: number;
  floorPrice: number;
  rarityDistribution: Record<NFTRarity, number>;
  categoryDistribution: Record<NFTCategory, number>;

  // Display
  isPublic: boolean;
  isFeatured: boolean;
  displayOrder: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface CollectionStats {
  collectionId: string;
  totalVolume: number;
  totalSales: number;
  uniqueOwners: number;
  averagePrice: number;
  highestSale: number;
  lowestSale: number;
  priceHistory: { date: Date; price: number }[];
}

// ============================================================================
// Trading
// ============================================================================

export interface NFTListing {
  id: string;
  nftId: string;
  sellerId: string;
  sellerAddress: string;

  // Pricing
  price: number;
  currency: "USD" | "ETH" | "MATIC" | "PULL";
  priceUsd: number;

  // Listing details
  listingType: "fixed_price" | "auction" | "offer";
  auctionEndTime?: Date;
  minimumBid?: number;
  currentBid?: number;
  currentBidderId?: string;
  bidCount: number;

  // Status
  status: TradeStatus;
  expiresAt?: Date;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface NFTOffer {
  id: string;
  nftId: string;
  listingId?: string;
  bidderId: string;
  bidderAddress: string;

  // Offer details
  amount: number;
  currency: "USD" | "ETH" | "MATIC" | "PULL";
  amountUsd: number;

  // Status
  status: "pending" | "accepted" | "rejected" | "expired" | "cancelled";
  expiresAt: Date;

  // Response
  respondedAt?: Date;
  respondedBy?: string;
  responseNote?: string;

  // Timestamps
  createdAt: Date;
}

export interface NFTTrade {
  id: string;
  nftId: string;
  listingId?: string;
  offerId?: string;

  // Parties
  sellerId: string;
  sellerAddress: string;
  buyerId: string;
  buyerAddress: string;

  // Transaction
  price: number;
  currency: string;
  priceUsd: number;
  platformFee: number;
  royaltyFee: number;
  sellerProceeds: number;

  // Blockchain
  txHash?: string;
  blockNumber?: number;
  gasUsed?: number;

  // Status
  status: "pending" | "processing" | "completed" | "failed";
  completedAt?: Date;

  // Timestamps
  createdAt: Date;
}

// ============================================================================
// Minting
// ============================================================================

export interface MintRequest {
  id: string;
  userId: string;
  betId: string;

  // NFT details to mint
  category: NFTCategory;
  name: string;
  description: string;
  imageUrl: string;
  rarity: NFTRarity;
  rarityScore: number;
  attributes: NFTAttribute[];

  // Minting config
  chain: "ethereum" | "polygon" | "base" | "arbitrum";
  recipientAddress: string;
  mintFee: number;
  mintFeeCurrency: string;

  // Status
  status: "pending" | "processing" | "minted" | "failed";
  error?: string;

  // Result
  nftId?: string;
  tokenId?: string;
  txHash?: string;
  mintedAt?: Date;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface MintEligibility {
  eligible: boolean;
  reason?: string;
  eligibleCategories: NFTCategory[];
  suggestedRarity: NFTRarity;
  estimatedRarityScore: number;
  mintFee: number;
  mintFeeCurrency: string;
}

// ============================================================================
// Service Types
// ============================================================================

export interface CheckMintEligibilityParams {
  userId: string;
  betId: string;
}

export interface MintNFTParams {
  userId: string;
  betId: string;
  recipientAddress: string;
  chain?: "ethereum" | "polygon" | "base" | "arbitrum";
  customName?: string;
  customDescription?: string;
}

export interface ListNFTParams {
  nftId: string;
  userId: string;
  price: number;
  currency: "USD" | "ETH" | "MATIC" | "PULL";
  listingType: "fixed_price" | "auction";
  auctionEndTime?: Date;
  minimumBid?: number;
  expiresAt?: Date;
}

export interface MakeOfferParams {
  nftId: string;
  userId: string;
  amount: number;
  currency: "USD" | "ETH" | "MATIC" | "PULL";
  expiresIn?: number; // hours
}

export interface AcceptOfferParams {
  offerId: string;
  userId: string;
}

export interface BuyNFTParams {
  listingId: string;
  userId: string;
  buyerAddress: string;
}

export interface TransferNFTParams {
  nftId: string;
  fromUserId: string;
  toAddress: string;
}

export interface GetNFTsParams {
  ownerId?: string;
  category?: NFTCategory;
  rarity?: NFTRarity;
  status?: NFTStatus;
  isListed?: boolean;
  sortBy?: "rarity" | "created" | "price" | "views";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface GetMarketplaceParams {
  category?: NFTCategory;
  rarity?: NFTRarity;
  minPrice?: number;
  maxPrice?: number;
  currency?: string;
  sport?: string;
  sortBy?: "price" | "rarity" | "newest" | "ending_soon";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

// ============================================================================
// Configuration
// ============================================================================

export const RARITY_THRESHOLDS: Record<NFTRarity, { min: number; max: number }> = {
  common: { min: 0, max: 20 },
  uncommon: { min: 20, max: 40 },
  rare: { min: 40, max: 60 },
  epic: { min: 60, max: 80 },
  legendary: { min: 80, max: 95 },
  mythic: { min: 95, max: 100 },
};

export const RARITY_COLORS: Record<NFTRarity, string> = {
  common: "#9CA3AF",
  uncommon: "#22C55E",
  rare: "#3B82F6",
  epic: "#8B5CF6",
  legendary: "#F59E0B",
  mythic: "#EF4444",
};

export const MINT_FEES: Record<NFTRarity, number> = {
  common: 1,
  uncommon: 2,
  rare: 5,
  epic: 10,
  legendary: 25,
  mythic: 50,
};

export const PLATFORM_FEE_PERCENT = 0.025; // 2.5%
export const CREATOR_ROYALTY_PERCENT = 0.05; // 5%
