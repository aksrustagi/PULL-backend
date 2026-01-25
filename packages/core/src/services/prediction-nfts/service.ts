/**
 * Prediction NFTs Service
 * Mint, trade, and manage prediction NFTs
 */

import {
  PredictionNFT,
  NFTStatus,
  NFTRarity,
  NFTCategory,
  NFTCollection,
  NFTListing,
  NFTOffer,
  NFTTrade,
  MintRequest,
  MintEligibility,
  CheckMintEligibilityParams,
  MintNFTParams,
  ListNFTParams,
  MakeOfferParams,
  AcceptOfferParams,
  BuyNFTParams,
  TransferNFTParams,
  GetNFTsParams,
  GetMarketplaceParams,
  MINT_FEES,
  PLATFORM_FEE_PERCENT,
  CREATOR_ROYALTY_PERCENT,
} from "./types";
import { RarityCalculator, rarityCalculator } from "./rarity";
import { MetadataGenerator, metadataGenerator } from "./metadata";

// ============================================================================
// Configuration
// ============================================================================

export interface PredictionNFTServiceConfig {
  minOddsForMint: number;
  minProfitForMint: number;
  maxMintPerDay: number;
  listingExpirationDays: number;
  offerExpirationHours: number;
  defaultChain: "ethereum" | "polygon" | "base" | "arbitrum";
  logger?: Logger;
}

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

interface ConvexClient {
  query<T>(name: string, args: Record<string, unknown>): Promise<T>;
  mutation<T>(name: string, args: Record<string, unknown>): Promise<T>;
}

const DEFAULT_CONFIG: PredictionNFTServiceConfig = {
  minOddsForMint: 1.5,
  minProfitForMint: 10,
  maxMintPerDay: 5,
  listingExpirationDays: 30,
  offerExpirationHours: 72,
  defaultChain: "polygon",
};

// ============================================================================
// Prediction NFT Service
// ============================================================================

export class PredictionNFTService {
  private readonly config: PredictionNFTServiceConfig;
  private readonly db: ConvexClient;
  private readonly logger: Logger;
  private readonly rarityCalculator: RarityCalculator;
  private readonly metadataGenerator: MetadataGenerator;

  constructor(db: ConvexClient, config?: Partial<PredictionNFTServiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = db;
    this.logger = config?.logger ?? this.createDefaultLogger();
    this.rarityCalculator = rarityCalculator;
    this.metadataGenerator = metadataGenerator;
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[PredictionNFT] ${msg}`, meta),
      info: (msg, meta) => console.info(`[PredictionNFT] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[PredictionNFT] ${msg}`, meta),
      error: (msg, meta) => console.error(`[PredictionNFT] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // Mint Eligibility
  // ==========================================================================

  /**
   * Check if a bet is eligible for minting
   */
  async checkMintEligibility(params: CheckMintEligibilityParams): Promise<MintEligibility> {
    const { userId, betId } = params;

    // Get bet details
    const bet = await this.db.query<{
      id: string;
      userId: string;
      status: string;
      odds: number;
      stake: number;
      payout: number;
      profit: number;
      type: string;
      eventId: string;
      eventName: string;
      sport?: string;
      league?: string;
      selection: string;
      parlayLegs?: { odds: number; won: boolean }[];
      settledAt: number;
    } | null>("trades:getById", { id: betId });

    if (!bet) {
      return {
        eligible: false,
        reason: "Bet not found",
        eligibleCategories: [],
        suggestedRarity: "common",
        estimatedRarityScore: 0,
        mintFee: 0,
        mintFeeCurrency: "USD",
      };
    }

    // Check ownership
    if (bet.userId !== userId) {
      return {
        eligible: false,
        reason: "You do not own this bet",
        eligibleCategories: [],
        suggestedRarity: "common",
        estimatedRarityScore: 0,
        mintFee: 0,
        mintFeeCurrency: "USD",
      };
    }

    // Check bet is won
    if (bet.status !== "won") {
      return {
        eligible: false,
        reason: "Only winning bets can be minted",
        eligibleCategories: [],
        suggestedRarity: "common",
        estimatedRarityScore: 0,
        mintFee: 0,
        mintFeeCurrency: "USD",
      };
    }

    // Check already minted
    const existingNFT = await this.db.query<PredictionNFT | null>(
      "predictionNFTs:getByBetId",
      { betId }
    );
    if (existingNFT) {
      return {
        eligible: false,
        reason: "This bet has already been minted",
        eligibleCategories: [],
        suggestedRarity: "common",
        estimatedRarityScore: 0,
        mintFee: 0,
        mintFeeCurrency: "USD",
      };
    }

    // Check minimum requirements
    if (bet.odds < this.config.minOddsForMint) {
      return {
        eligible: false,
        reason: `Minimum odds for minting is ${this.config.minOddsForMint}`,
        eligibleCategories: [],
        suggestedRarity: "common",
        estimatedRarityScore: 0,
        mintFee: 0,
        mintFeeCurrency: "USD",
      };
    }

    if (bet.profit < this.config.minProfitForMint) {
      return {
        eligible: false,
        reason: `Minimum profit for minting is $${this.config.minProfitForMint}`,
        eligibleCategories: [],
        suggestedRarity: "common",
        estimatedRarityScore: 0,
        mintFee: 0,
        mintFeeCurrency: "USD",
      };
    }

    // Check daily limit
    const todayMints = await this.db.query<number>("predictionNFTs:countTodayByUser", {
      userId,
    });
    if (todayMints >= this.config.maxMintPerDay) {
      return {
        eligible: false,
        reason: `Daily mint limit (${this.config.maxMintPerDay}) reached`,
        eligibleCategories: [],
        suggestedRarity: "common",
        estimatedRarityScore: 0,
        mintFee: 0,
        mintFeeCurrency: "USD",
      };
    }

    // Determine categories
    const categories: NFTCategory[] = ["winning_bet"];
    if (bet.parlayLegs && bet.parlayLegs.length > 1 && bet.parlayLegs.every(l => l.won)) {
      categories.push("perfect_parlay");
    }

    // Calculate rarity
    const rarityResult = this.rarityCalculator.calculateRarity({
      odds: bet.odds,
      stake: bet.stake,
      payout: bet.payout,
      profit: bet.profit,
      category: categories.includes("perfect_parlay") ? "perfect_parlay" : "winning_bet",
      parlayLegs: bet.parlayLegs?.length,
    });

    const mintFee = MINT_FEES[rarityResult.rarity];

    return {
      eligible: true,
      eligibleCategories: categories,
      suggestedRarity: rarityResult.rarity,
      estimatedRarityScore: rarityResult.score,
      mintFee,
      mintFeeCurrency: "USD",
    };
  }

  // ==========================================================================
  // Minting
  // ==========================================================================

  /**
   * Mint an NFT from a winning bet
   */
  async mintNFT(params: MintNFTParams): Promise<MintRequest> {
    const { userId, betId, recipientAddress, chain, customName, customDescription } = params;

    // Check eligibility
    const eligibility = await this.checkMintEligibility({ userId, betId });
    if (!eligibility.eligible) {
      throw new Error(eligibility.reason || "Not eligible for minting");
    }

    // Get bet details
    const bet = await this.db.query<{
      id: string;
      userId: string;
      odds: number;
      stake: number;
      payout: number;
      profit: number;
      type: string;
      eventId: string;
      eventName: string;
      sport?: string;
      league?: string;
      selection: string;
      parlayLegs?: { eventId: string; eventName: string; selection: string; odds: number; result: "won" }[];
      placedAt: number;
      settledAt: number;
    } | null>("trades:getById", { id: betId });

    if (!bet) {
      throw new Error("Bet not found");
    }

    // Check user balance for mint fee
    const balance = await this.db.query<{ available: number } | null>(
      "balances:getByUserAsset",
      { userId, assetType: "usd", assetId: "usd" }
    );
    if (!balance || balance.available < eligibility.mintFee) {
      throw new Error("Insufficient balance for mint fee");
    }

    // Deduct mint fee
    await this.db.mutation("balances:debit", {
      userId,
      assetType: "usd",
      assetId: "usd",
      amount: eligibility.mintFee,
      reason: "nft_mint_fee",
      referenceId: betId,
    });

    // Calculate rarity
    const category: NFTCategory = bet.parlayLegs && bet.parlayLegs.length > 1
      ? "perfect_parlay"
      : "winning_bet";

    const rarityResult = this.rarityCalculator.calculateRarity({
      odds: bet.odds,
      stake: bet.stake,
      payout: bet.payout,
      profit: bet.profit,
      category,
      parlayLegs: bet.parlayLegs?.length,
    });

    // Generate metadata
    const nftData: Partial<PredictionNFT> = {
      betId,
      betType: bet.parlayLegs && bet.parlayLegs.length > 1 ? "parlay" : "single",
      eventId: bet.eventId,
      eventName: bet.eventName,
      sport: bet.sport,
      league: bet.league,
      selection: bet.selection,
      odds: bet.odds,
      stake: bet.stake,
      payout: bet.payout,
      profit: bet.profit,
      profitMultiplier: bet.profit / bet.stake,
      betPlacedAt: new Date(bet.placedAt),
      betSettledAt: new Date(bet.settledAt),
      category,
      rarity: rarityResult.rarity,
      rarityScore: rarityResult.score,
      parlayLegs: bet.parlayLegs,
    };

    const name = customName || this.metadataGenerator.generateName(nftData);
    const description = customDescription || this.metadataGenerator.generateDescription(nftData);
    const attributes = this.metadataGenerator.generateAttributes(nftData);
    const imageUrl = this.metadataGenerator.generateImageUrl(nftData);

    const now = Date.now();
    const mintRequest: MintRequest = {
      id: `mint_${now}_${userId}`,
      userId,
      betId,
      category,
      name,
      description,
      imageUrl,
      rarity: rarityResult.rarity,
      rarityScore: rarityResult.score,
      attributes,
      chain: chain || this.config.defaultChain,
      recipientAddress,
      mintFee: eligibility.mintFee,
      mintFeeCurrency: "USD",
      status: "pending",
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };

    // Save mint request
    await this.db.mutation("mintRequests:create", {
      ...mintRequest,
      createdAt: now,
      updatedAt: now,
    });

    // Queue minting job
    await this.queueMintJob(mintRequest);

    this.logger.info("Mint request created", {
      mintRequestId: mintRequest.id,
      userId,
      betId,
      rarity: rarityResult.rarity,
    });

    return mintRequest;
  }

  /**
   * Queue mint job for processing
   */
  private async queueMintJob(request: MintRequest): Promise<void> {
    // This would integrate with a job queue (e.g., Inngest)
    // For now, we'll process immediately (in production this should be async)
    await this.processMint(request.id);
  }

  /**
   * Process mint request
   */
  async processMint(requestId: string): Promise<PredictionNFT | null> {
    const request = await this.db.query<MintRequest | null>(
      "mintRequests:getById",
      { id: requestId }
    );

    if (!request || request.status !== "pending") {
      return null;
    }

    // Update status to processing
    await this.db.mutation("mintRequests:update", {
      id: requestId,
      status: "processing",
      updatedAt: Date.now(),
    });

    try {
      // Mint on blockchain (would call contract)
      const mintResult = await this.mintOnChain(request);

      const now = Date.now();

      // Create NFT record
      const nft: PredictionNFT = {
        id: `nft_${now}_${request.userId}`,
        tokenId: mintResult.tokenId,
        contractAddress: mintResult.contractAddress,
        chain: request.chain,
        ownerId: request.userId,
        ownerAddress: request.recipientAddress,
        creatorId: request.userId,
        mintedTo: request.recipientAddress,
        name: request.name,
        description: request.description,
        category: request.category,
        rarity: request.rarity,
        rarityScore: request.rarityScore,
        edition: 1,
        maxEdition: 1,
        isOneOfOne: true,
        imageUrl: request.imageUrl,
        animationUrl: this.metadataGenerator.generateAnimationUrl({
          rarity: request.rarity,
          category: request.category,
        }),
        betId: request.betId,
        betType: "single", // Would be determined from bet
        eventId: "",
        eventName: "",
        selection: "",
        odds: 0,
        stake: 0,
        payout: 0,
        profit: 0,
        profitMultiplier: 0,
        betPlacedAt: new Date(),
        betSettledAt: new Date(),
        rarityFactors: {
          oddsMultiplier: 0,
          payoutMultiplier: 0,
          profitMultiplier: 0,
          eventSignificance: 0,
          timingBonus: 0,
          streakBonus: 0,
          categoryBonus: 0,
          total: request.rarityScore,
        },
        attributes: request.attributes,
        metadata: this.metadataGenerator.generateMetadata({
          id: `nft_${now}_${request.userId}`,
          name: request.name,
          description: request.description,
          rarity: request.rarity,
          rarityScore: request.rarityScore,
          category: request.category,
          imageUrl: request.imageUrl,
          creatorId: request.userId,
          mintedTo: request.recipientAddress,
        }),
        status: "minted",
        mintedAt: new Date(now),
        mintTxHash: mintResult.txHash,
        isListed: false,
        viewCount: 0,
        likeCount: 0,
        tradeCount: 0,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      };

      // Save NFT
      await this.db.mutation("predictionNFTs:create", {
        ...nft,
        betPlacedAt: now,
        betSettledAt: now,
        mintedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      // Update mint request
      await this.db.mutation("mintRequests:update", {
        id: requestId,
        status: "minted",
        nftId: nft.id,
        tokenId: mintResult.tokenId,
        txHash: mintResult.txHash,
        mintedAt: now,
        updatedAt: now,
      });

      this.logger.info("NFT minted successfully", {
        nftId: nft.id,
        tokenId: mintResult.tokenId,
        requestId,
      });

      return nft;
    } catch (error) {
      // Update request with error
      await this.db.mutation("mintRequests:update", {
        id: requestId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        updatedAt: Date.now(),
      });

      this.logger.error("Mint failed", {
        requestId,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return null;
    }
  }

  /**
   * Mint on blockchain (mock implementation)
   */
  private async mintOnChain(request: MintRequest): Promise<{
    tokenId: string;
    contractAddress: string;
    txHash: string;
  }> {
    // This would call the actual smart contract
    // Mock implementation for demo
    return {
      tokenId: `${Date.now()}`,
      contractAddress: "0x1234567890abcdef1234567890abcdef12345678",
      txHash: `0x${Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join("")}`,
    };
  }

  // ==========================================================================
  // Trading
  // ==========================================================================

  /**
   * List NFT for sale
   */
  async listNFT(params: ListNFTParams): Promise<NFTListing> {
    const { nftId, userId, price, currency, listingType, auctionEndTime, minimumBid, expiresAt } = params;

    const nft = await this.getNFT(nftId);
    if (!nft) {
      throw new Error("NFT not found");
    }

    if (nft.ownerId !== userId) {
      throw new Error("You do not own this NFT");
    }

    if (nft.isListed) {
      throw new Error("NFT is already listed");
    }

    const now = Date.now();
    const listing: NFTListing = {
      id: `listing_${now}_${nftId}`,
      nftId,
      sellerId: userId,
      sellerAddress: nft.ownerAddress,
      price,
      currency,
      priceUsd: price, // Would convert if not USD
      listingType,
      auctionEndTime,
      minimumBid,
      bidCount: 0,
      status: "active",
      expiresAt: expiresAt || new Date(now + this.config.listingExpirationDays * 24 * 60 * 60 * 1000),
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };

    // Save listing
    await this.db.mutation("nftListings:create", {
      ...listing,
      auctionEndTime: auctionEndTime?.getTime(),
      expiresAt: listing.expiresAt?.getTime(),
      createdAt: now,
      updatedAt: now,
    });

    // Update NFT
    await this.db.mutation("predictionNFTs:update", {
      id: nftId,
      isListed: true,
      listPrice: price,
      listCurrency: currency,
      updatedAt: now,
    });

    this.logger.info("NFT listed", {
      listingId: listing.id,
      nftId,
      price,
      currency,
    });

    return listing;
  }

  /**
   * Make an offer on NFT
   */
  async makeOffer(params: MakeOfferParams): Promise<NFTOffer> {
    const { nftId, userId, amount, currency, expiresIn } = params;

    const nft = await this.getNFT(nftId);
    if (!nft) {
      throw new Error("NFT not found");
    }

    if (nft.ownerId === userId) {
      throw new Error("Cannot make offer on your own NFT");
    }

    // Get user's wallet address
    const user = await this.db.query<{ walletAddress: string } | null>(
      "users:getById",
      { id: userId }
    );

    const now = Date.now();
    const expirationHours = expiresIn || this.config.offerExpirationHours;

    const offer: NFTOffer = {
      id: `offer_${now}_${nftId}`,
      nftId,
      bidderId: userId,
      bidderAddress: user?.walletAddress || "",
      amount,
      currency,
      amountUsd: amount, // Would convert
      status: "pending",
      expiresAt: new Date(now + expirationHours * 60 * 60 * 1000),
      createdAt: new Date(now),
    };

    await this.db.mutation("nftOffers:create", {
      ...offer,
      expiresAt: offer.expiresAt.getTime(),
      createdAt: now,
    });

    this.logger.info("Offer made", {
      offerId: offer.id,
      nftId,
      amount,
    });

    return offer;
  }

  /**
   * Accept an offer
   */
  async acceptOffer(params: AcceptOfferParams): Promise<NFTTrade> {
    const { offerId, userId } = params;

    const offer = await this.db.query<NFTOffer | null>(
      "nftOffers:getById",
      { id: offerId }
    );
    if (!offer) {
      throw new Error("Offer not found");
    }

    if (offer.status !== "pending") {
      throw new Error("Offer is no longer valid");
    }

    if (new Date() > offer.expiresAt) {
      throw new Error("Offer has expired");
    }

    const nft = await this.getNFT(offer.nftId);
    if (!nft || nft.ownerId !== userId) {
      throw new Error("You do not own this NFT");
    }

    // Process trade
    return await this.processTrade({
      nftId: offer.nftId,
      sellerId: userId,
      sellerAddress: nft.ownerAddress,
      buyerId: offer.bidderId,
      buyerAddress: offer.bidderAddress,
      price: offer.amount,
      currency: offer.currency,
      offerId,
    });
  }

  /**
   * Buy NFT at listed price
   */
  async buyNFT(params: BuyNFTParams): Promise<NFTTrade> {
    const { listingId, userId, buyerAddress } = params;

    const listing = await this.db.query<NFTListing | null>(
      "nftListings:getById",
      { id: listingId }
    );
    if (!listing) {
      throw new Error("Listing not found");
    }

    if (listing.status !== "active") {
      throw new Error("Listing is not active");
    }

    if (listing.sellerId === userId) {
      throw new Error("Cannot buy your own NFT");
    }

    // Process trade
    return await this.processTrade({
      nftId: listing.nftId,
      sellerId: listing.sellerId,
      sellerAddress: listing.sellerAddress,
      buyerId: userId,
      buyerAddress,
      price: listing.price,
      currency: listing.currency,
      listingId,
    });
  }

  /**
   * Process trade
   */
  private async processTrade(params: {
    nftId: string;
    sellerId: string;
    sellerAddress: string;
    buyerId: string;
    buyerAddress: string;
    price: number;
    currency: string;
    listingId?: string;
    offerId?: string;
  }): Promise<NFTTrade> {
    const {
      nftId,
      sellerId,
      sellerAddress,
      buyerId,
      buyerAddress,
      price,
      currency,
      listingId,
      offerId,
    } = params;

    // Calculate fees
    const platformFee = price * PLATFORM_FEE_PERCENT;
    const royaltyFee = price * CREATOR_ROYALTY_PERCENT;
    const sellerProceeds = price - platformFee - royaltyFee;

    const now = Date.now();
    const trade: NFTTrade = {
      id: `trade_${now}_${nftId}`,
      nftId,
      listingId,
      offerId,
      sellerId,
      sellerAddress,
      buyerId,
      buyerAddress,
      price,
      currency,
      priceUsd: price,
      platformFee,
      royaltyFee,
      sellerProceeds,
      status: "processing",
      createdAt: new Date(now),
    };

    // Save trade
    await this.db.mutation("nftTrades:create", {
      ...trade,
      createdAt: now,
    });

    // Transfer NFT ownership
    await this.db.mutation("predictionNFTs:update", {
      id: nftId,
      ownerId: buyerId,
      ownerAddress: buyerAddress,
      isListed: false,
      listPrice: undefined,
      lastSalePrice: price,
      lastSaleAt: now,
      tradeCount: (await this.getNFT(nftId))?.tradeCount ?? 0 + 1,
      updatedAt: now,
    });

    // Deactivate listing/offer
    if (listingId) {
      await this.db.mutation("nftListings:update", {
        id: listingId,
        status: "completed",
        updatedAt: now,
      });
    }
    if (offerId) {
      await this.db.mutation("nftOffers:update", {
        id: offerId,
        status: "accepted",
        respondedAt: now,
      });
    }

    // Credit seller
    await this.db.mutation("balances:credit", {
      userId: sellerId,
      assetType: "usd",
      assetId: "usd",
      amount: sellerProceeds,
      reason: "nft_sale",
      referenceId: trade.id,
    });

    // Update trade status
    await this.db.mutation("nftTrades:update", {
      id: trade.id,
      status: "completed",
      completedAt: Date.now(),
    });

    this.logger.info("Trade completed", {
      tradeId: trade.id,
      nftId,
      price,
      sellerId,
      buyerId,
    });

    return { ...trade, status: "completed", completedAt: new Date() };
  }

  // ==========================================================================
  // Queries
  // ==========================================================================

  /**
   * Get NFT by ID
   */
  async getNFT(nftId: string): Promise<PredictionNFT | null> {
    return await this.db.query("predictionNFTs:getById", { id: nftId });
  }

  /**
   * Get NFTs with filters
   */
  async getNFTs(params: GetNFTsParams): Promise<{
    nfts: PredictionNFT[];
    total: number;
    hasMore: boolean;
  }> {
    const { limit = 50, offset = 0, ...filters } = params;

    const result = await this.db.query<{ nfts: PredictionNFT[]; total: number }>(
      "predictionNFTs:list",
      { ...filters, limit, offset }
    );

    return {
      nfts: result.nfts,
      total: result.total,
      hasMore: offset + limit < result.total,
    };
  }

  /**
   * Get marketplace listings
   */
  async getMarketplace(params: GetMarketplaceParams): Promise<{
    listings: NFTListing[];
    total: number;
    hasMore: boolean;
  }> {
    const { limit = 50, offset = 0, ...filters } = params;

    const result = await this.db.query<{ listings: NFTListing[]; total: number }>(
      "nftListings:getMarketplace",
      { ...filters, limit, offset, status: "active" }
    );

    return {
      listings: result.listings,
      total: result.total,
      hasMore: offset + limit < result.total,
    };
  }

  /**
   * Get user's collection
   */
  async getUserCollection(userId: string): Promise<NFTCollection> {
    const nfts = await this.db.query<PredictionNFT[]>(
      "predictionNFTs:getByOwner",
      { ownerId: userId }
    );

    // Calculate stats
    const rarityDistribution: Record<NFTRarity, number> = {
      common: 0,
      uncommon: 0,
      rare: 0,
      epic: 0,
      legendary: 0,
      mythic: 0,
    };

    const categoryDistribution: Record<NFTCategory, number> = {
      winning_bet: 0,
      perfect_parlay: 0,
      streak: 0,
      milestone: 0,
      event_special: 0,
      leaderboard: 0,
      achievement: 0,
    };

    let totalValue = 0;
    let floorPrice = Infinity;

    for (const nft of nfts) {
      rarityDistribution[nft.rarity]++;
      categoryDistribution[nft.category]++;

      const value = nft.lastSalePrice || nft.listPrice || 0;
      totalValue += value;
      if (value > 0 && value < floorPrice) {
        floorPrice = value;
      }
    }

    return {
      id: `collection_${userId}`,
      ownerId: userId,
      name: "My Collection",
      nftIds: nfts.map(n => n.id),
      totalNFTs: nfts.length,
      totalValue,
      floorPrice: floorPrice === Infinity ? 0 : floorPrice,
      rarityDistribution,
      categoryDistribution,
      isPublic: true,
      isFeatured: false,
      displayOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

export default PredictionNFTService;
