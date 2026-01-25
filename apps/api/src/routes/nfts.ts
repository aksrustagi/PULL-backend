import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";

const app = new Hono<Env>();

// ============================================================================
// Validation Schemas
// ============================================================================

const raritySchema = z.enum(["common", "uncommon", "rare", "epic", "legendary", "mythic"]);

const categorySchema = z.enum([
  "winning_bet",
  "perfect_parlay",
  "streak",
  "milestone",
  "event_special",
  "leaderboard",
  "achievement",
]);

const mintNFTSchema = z.object({
  betId: z.string(),
  payWithCredits: z.boolean().default(false),
});

const listNFTSchema = z.object({
  nftId: z.string(),
  price: z.number().positive(),
  currency: z.enum(["usd", "eth", "pull"]).default("usd"),
  expiresAt: z.number().positive().optional(),
});

const makeOfferSchema = z.object({
  nftId: z.string(),
  amount: z.number().positive(),
  currency: z.enum(["usd", "eth", "pull"]).default("usd"),
  expiresAt: z.number().positive().optional(),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

// ============================================================================
// GET /nfts/eligible
// Get bets eligible for NFT minting
// ============================================================================

app.get("/eligible", zValidator("query", paginationSchema), async (c) => {
  const userId = c.get("userId");
  const { limit, cursor } = c.req.valid("query");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Call Convex query nfts.getEligibleBets
  const eligibleBets = [
    {
      betId: "bet_001",
      eventName: "Lakers @ Celtics",
      selection: "Lakers +5.5",
      odds: 1.91,
      stake: 100,
      payout: 191,
      profit: 91,
      settledAt: Date.now() - 86400000,
      rarity: "rare" as const,
      rarityScore: 62,
      category: "winning_bet" as const,
      mintFee: 4.99,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days to mint
    },
    {
      betId: "bet_002",
      eventName: "5-Leg Parlay",
      selection: "Perfect Parlay",
      odds: 24.5,
      stake: 50,
      payout: 1225,
      profit: 1175,
      settledAt: Date.now() - 172800000,
      rarity: "legendary" as const,
      rarityScore: 88,
      category: "perfect_parlay" as const,
      mintFee: 19.99,
      expiresAt: Date.now() + 5 * 24 * 60 * 60 * 1000,
    },
    {
      betId: "bet_003",
      eventName: "Chiefs @ Bills",
      selection: "Chiefs ML",
      odds: 2.50,
      stake: 200,
      payout: 500,
      profit: 300,
      settledAt: Date.now() - 43200000,
      rarity: "uncommon" as const,
      rarityScore: 38,
      category: "winning_bet" as const,
      mintFee: 2.99,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    },
  ];

  return c.json({
    success: true,
    data: {
      items: eligibleBets,
      hasMore: false,
      nextCursor: undefined,
      stats: {
        totalEligible: 3,
        expiringSoon: 1,
        highestRarity: "legendary",
      },
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// POST /nfts/mint
// Mint an NFT from a winning bet
// ============================================================================

app.post("/mint", zValidator("json", mintNFTSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Call Convex mutation nfts.mintNFT
  const nft = {
    id: `nft_${Date.now()}`,
    tokenId: `PULL-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    betId: body.betId,
    name: "Legendary 5-Leg Parlay",
    description: "This Legendary PULL NFT commemorates a perfect 5-leg parlay at combined odds of 24.50x on multiple NFL games. Total profit: $1,175.00. With a rarity score of 88/100, this is an exceptionally rare collectible.",
    rarity: "legendary" as const,
    rarityScore: 88,
    category: "perfect_parlay" as const,
    imageUrl: "https://assets.pull.bet/nft/images/legendary/perfect_parlay/nfl.png",
    animationUrl: "https://assets.pull.bet/nft/animations/legendary/perfect_parlay.mp4",
    metadata: {
      odds: 24.5,
      stake: 50,
      payout: 1225,
      profit: 1175,
      sport: "nfl",
      parlayLegs: 5,
      settledAt: Date.now() - 172800000,
    },
    mintedAt: Date.now(),
    mintFee: body.payWithCredits ? 0 : 19.99,
    status: "minted" as const,
    owner: userId,
    edition: 1,
    maxEdition: 1,
    contractAddress: "0x1234...5678",
    transactionHash: "0xabcd...ef01",
  };

  return c.json({
    success: true,
    data: nft,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /nfts/collection
// Get user's NFT collection
// ============================================================================

app.get("/collection", zValidator("query", paginationSchema.extend({
  rarity: raritySchema.optional(),
  category: categorySchema.optional(),
  sort: z.enum(["newest", "rarity", "value"]).default("newest"),
})), async (c) => {
  const userId = c.get("userId");
  const { limit, cursor, rarity, category, sort } = c.req.valid("query");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Call Convex query nfts.getUserCollection
  const collection = {
    items: [
      {
        id: "nft_001",
        tokenId: "PULL-ABC123XY",
        name: "Legendary 5-Leg Parlay",
        rarity: "legendary" as const,
        rarityScore: 88,
        category: "perfect_parlay" as const,
        imageUrl: "https://assets.pull.bet/nft/images/legendary/perfect_parlay/nfl.png",
        animationUrl: "https://assets.pull.bet/nft/animations/legendary/perfect_parlay.mp4",
        mintedAt: Date.now() - 172800000,
        estimatedValue: 250,
        isListed: false,
        profit: 1175,
        odds: 24.5,
      },
      {
        id: "nft_002",
        tokenId: "PULL-DEF456ZW",
        name: "Rare NBA Victory",
        rarity: "rare" as const,
        rarityScore: 62,
        category: "winning_bet" as const,
        imageUrl: "https://assets.pull.bet/nft/images/rare/winning_bet/nba.png",
        mintedAt: Date.now() - 604800000,
        estimatedValue: 45,
        isListed: true,
        listingPrice: 50,
        profit: 91,
        odds: 1.91,
      },
      {
        id: "nft_003",
        tokenId: "PULL-GHI789VU",
        name: "Epic Winning Streak",
        rarity: "epic" as const,
        rarityScore: 75,
        category: "streak" as const,
        imageUrl: "https://assets.pull.bet/nft/images/epic/streak/default.png",
        mintedAt: Date.now() - 1209600000,
        estimatedValue: 120,
        isListed: false,
        profit: 450,
        streakLength: 8,
      },
    ],
    stats: {
      totalNFTs: 12,
      totalValue: 1850,
      byRarity: {
        common: 4,
        uncommon: 3,
        rare: 2,
        epic: 2,
        legendary: 1,
        mythic: 0,
      },
      highestRarityScore: 88,
    },
    hasMore: false,
    nextCursor: undefined,
  };

  return c.json({
    success: true,
    data: collection,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /nfts/:nftId
// Get specific NFT details
// ============================================================================

app.get("/:nftId", async (c) => {
  const userId = c.get("userId");
  const nftId = c.req.param("nftId");

  // TODO: Call Convex query nfts.getNFTById
  const nft = {
    id: nftId,
    tokenId: "PULL-ABC123XY",
    name: "Legendary 5-Leg Parlay",
    description: "This Legendary PULL NFT commemorates a perfect 5-leg parlay at combined odds of 24.50x. Total profit: $1,175.00. With a rarity score of 88/100, this is an exceptionally rare collectible.",
    rarity: "legendary" as const,
    rarityScore: 88,
    category: "perfect_parlay" as const,
    imageUrl: "https://assets.pull.bet/nft/images/legendary/perfect_parlay/nfl.png",
    animationUrl: "https://assets.pull.bet/nft/animations/legendary/perfect_parlay.mp4",
    externalUrl: `https://pull.bet/nft/${nftId}`,
    backgroundColor: "F59E0B",
    attributes: [
      { traitType: "Rarity", value: "Legendary" },
      { traitType: "Rarity Score", value: 88, displayType: "number", maxValue: 100 },
      { traitType: "Category", value: "Perfect Parlay" },
      { traitType: "Bet Type", value: "Parlay" },
      { traitType: "Sport", value: "NFL" },
      { traitType: "Odds", value: 24.5, displayType: "number" },
      { traitType: "Profit ($)", value: 1175, displayType: "number" },
      { traitType: "Parlay Legs", value: 5, displayType: "number" },
      { traitType: "Settled Date", value: Math.floor((Date.now() - 172800000) / 1000), displayType: "date" },
    ],
    parlayLegs: [
      { eventName: "Chiefs @ Bills", selection: "Chiefs ML", odds: 2.10, result: "won" },
      { eventName: "49ers @ Seahawks", selection: "49ers -3.5", odds: 1.95, result: "won" },
      { eventName: "Cowboys @ Eagles", selection: "Over 48.5", odds: 1.91, result: "won" },
      { eventName: "Ravens @ Dolphins", selection: "Ravens ML", odds: 1.85, result: "won" },
      { eventName: "Lions @ Packers", selection: "Lions +3", odds: 1.91, result: "won" },
    ],
    betDetails: {
      betId: "bet_002",
      odds: 24.5,
      stake: 50,
      payout: 1225,
      profit: 1175,
      sport: "nfl",
      settledAt: Date.now() - 172800000,
    },
    owner: {
      userId: "user_001",
      username: "PropMaster",
    },
    isOwner: userId === "user_001",
    mintedAt: Date.now() - 172800000,
    mintedBy: "user_001",
    edition: 1,
    maxEdition: 1,
    contractAddress: "0x1234567890abcdef1234567890abcdef12345678",
    transactionHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    blockchain: "ethereum",
    listing: null,
    offers: [
      {
        id: "offer_001",
        offererId: "user_002",
        offererName: "NFTCollector",
        amount: 200,
        currency: "usd",
        status: "pending" as const,
        createdAt: Date.now() - 86400000,
        expiresAt: Date.now() + 172800000,
      },
    ],
    priceHistory: [
      { price: 150, date: Date.now() - 604800000 },
      { price: 180, date: Date.now() - 259200000 },
    ],
    estimatedValue: 250,
  };

  return c.json({
    success: true,
    data: nft,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// POST /nfts/:nftId/list
// List an NFT for sale
// ============================================================================

app.post("/:nftId/list", zValidator("json", z.object({
  price: z.number().positive(),
  currency: z.enum(["usd", "eth", "pull"]).default("usd"),
  expiresAt: z.number().positive().optional(),
})), async (c) => {
  const userId = c.get("userId");
  const nftId = c.req.param("nftId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Call Convex mutation nfts.listNFT
  const listing = {
    listingId: `list_${Date.now()}`,
    nftId,
    price: body.price,
    currency: body.currency,
    status: "active" as const,
    createdAt: Date.now(),
    expiresAt: body.expiresAt || Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days default
    platformFee: body.price * 0.025, // 2.5% fee
    sellerReceives: body.price * 0.975,
    message: "NFT listed successfully",
  };

  return c.json({
    success: true,
    data: listing,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// DELETE /nfts/:nftId/list
// Delist an NFT
// ============================================================================

app.delete("/:nftId/list", async (c) => {
  const userId = c.get("userId");
  const nftId = c.req.param("nftId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Call Convex mutation nfts.delistNFT
  const result = {
    nftId,
    status: "delisted" as const,
    message: "NFT delisted successfully",
  };

  return c.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// POST /nfts/:nftId/offer
// Make an offer on an NFT
// ============================================================================

app.post("/:nftId/offer", zValidator("json", z.object({
  amount: z.number().positive(),
  currency: z.enum(["usd", "eth", "pull"]).default("usd"),
  expiresAt: z.number().positive().optional(),
})), async (c) => {
  const userId = c.get("userId");
  const nftId = c.req.param("nftId");
  const body = c.req.valid("json");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Call Convex mutation nfts.makeOffer
  const offer = {
    offerId: `offer_${Date.now()}`,
    nftId,
    offererId: userId,
    amount: body.amount,
    currency: body.currency,
    status: "pending" as const,
    createdAt: Date.now(),
    expiresAt: body.expiresAt || Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days default
    message: "Offer submitted successfully",
  };

  return c.json({
    success: true,
    data: offer,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// POST /nfts/:nftId/offer/:offerId/accept
// Accept an offer on an NFT
// ============================================================================

app.post("/:nftId/offer/:offerId/accept", async (c) => {
  const userId = c.get("userId");
  const nftId = c.req.param("nftId");
  const offerId = c.req.param("offerId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Call Convex mutation nfts.acceptOffer
  const trade = {
    tradeId: `trade_${Date.now()}`,
    nftId,
    offerId,
    sellerId: userId,
    buyerId: "user_002",
    salePrice: 200,
    currency: "usd",
    platformFee: 5, // 2.5%
    sellerReceived: 195,
    status: "completed" as const,
    completedAt: Date.now(),
    transactionHash: "0x...",
    message: "Trade completed successfully",
  };

  return c.json({
    success: true,
    data: trade,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// POST /nfts/:nftId/buy
// Buy a listed NFT
// ============================================================================

app.post("/:nftId/buy", async (c) => {
  const userId = c.get("userId");
  const nftId = c.req.param("nftId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      },
      401
    );
  }

  // TODO: Call Convex mutation nfts.buyNFT
  const purchase = {
    tradeId: `trade_${Date.now()}`,
    nftId,
    buyerId: userId,
    sellerId: "user_001",
    salePrice: 50,
    currency: "usd",
    platformFee: 1.25,
    totalPaid: 51.25,
    status: "completed" as const,
    completedAt: Date.now(),
    transactionHash: "0x...",
    message: "NFT purchased successfully",
  };

  return c.json({
    success: true,
    data: purchase,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /nfts/marketplace
// Browse NFT marketplace
// ============================================================================

app.get("/marketplace", zValidator("query", paginationSchema.extend({
  rarity: raritySchema.optional(),
  category: categorySchema.optional(),
  sport: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  sort: z.enum(["price_asc", "price_desc", "newest", "rarity", "ending_soon"]).default("newest"),
})), async (c) => {
  const { limit, cursor, rarity, category, sport, minPrice, maxPrice, sort } = c.req.valid("query");

  // TODO: Call Convex query nfts.getMarketplaceListings
  const marketplace = {
    items: [
      {
        id: "nft_list_001",
        tokenId: "PULL-XYZ789AB",
        name: "Mythic March Madness Victory",
        rarity: "mythic" as const,
        rarityScore: 95,
        category: "event_special" as const,
        imageUrl: "https://assets.pull.bet/nft/images/mythic/event_special/ncaa.png",
        animationUrl: "https://assets.pull.bet/nft/animations/mythic/event_special.mp4",
        price: 1500,
        currency: "usd",
        seller: { userId: "user_010", username: "MadnessKing" },
        listedAt: Date.now() - 86400000,
        expiresAt: Date.now() + 29 * 24 * 60 * 60 * 1000,
        views: 245,
        likes: 45,
      },
      {
        id: "nft_list_002",
        tokenId: "PULL-DEF456ZW",
        name: "Rare NBA Victory",
        rarity: "rare" as const,
        rarityScore: 62,
        category: "winning_bet" as const,
        imageUrl: "https://assets.pull.bet/nft/images/rare/winning_bet/nba.png",
        price: 50,
        currency: "usd",
        seller: { userId: "user_001", username: "PropMaster" },
        listedAt: Date.now() - 604800000,
        expiresAt: Date.now() + 23 * 24 * 60 * 60 * 1000,
        views: 89,
        likes: 12,
      },
      {
        id: "nft_list_003",
        tokenId: "PULL-LMN012CD",
        name: "Epic 10-Win Streak",
        rarity: "epic" as const,
        rarityScore: 78,
        category: "streak" as const,
        imageUrl: "https://assets.pull.bet/nft/images/epic/streak/default.png",
        price: 175,
        currency: "usd",
        seller: { userId: "user_005", username: "StreakMaster" },
        listedAt: Date.now() - 172800000,
        expiresAt: Date.now() + 27 * 24 * 60 * 60 * 1000,
        views: 156,
        likes: 28,
      },
    ],
    stats: {
      totalListings: 342,
      totalVolume24h: 12500,
      avgPrice: 125,
      floorPrices: {
        common: 5,
        uncommon: 15,
        rare: 35,
        epic: 85,
        legendary: 200,
        mythic: 800,
      },
    },
    hasMore: true,
    nextCursor: "nft_list_004",
  };

  return c.json({
    success: true,
    data: marketplace,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /nfts/leaderboard
// Get NFT collector leaderboard
// ============================================================================

app.get("/leaderboard", zValidator("query", z.object({
  type: z.enum(["value", "count", "rarity"]).default("value"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})), async (c) => {
  const { type, limit } = c.req.valid("query");

  // TODO: Call Convex query nfts.getCollectorLeaderboard
  const leaderboard = {
    entries: [
      {
        rank: 1,
        userId: "user_010",
        username: "MadnessKing",
        nftCount: 156,
        totalValue: 45000,
        highestRarity: "mythic" as const,
        mythicCount: 3,
        legendaryCount: 12,
      },
      {
        rank: 2,
        userId: "user_015",
        username: "BetCollector",
        nftCount: 234,
        totalValue: 38500,
        highestRarity: "legendary" as const,
        mythicCount: 0,
        legendaryCount: 25,
      },
      {
        rank: 3,
        userId: "user_001",
        username: "PropMaster",
        nftCount: 89,
        totalValue: 32000,
        highestRarity: "legendary" as const,
        mythicCount: 0,
        legendaryCount: 18,
      },
    ],
    type,
    totalCollectors: 5420,
  };

  return c.json({
    success: true,
    data: leaderboard,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /nfts/activity
// Get NFT trading activity
// ============================================================================

app.get("/activity", zValidator("query", paginationSchema.extend({
  type: z.enum(["all", "sales", "listings", "offers", "mints"]).default("all"),
})), async (c) => {
  const { limit, cursor, type } = c.req.valid("query");

  // TODO: Call Convex query nfts.getActivity
  const activity = {
    items: [
      {
        id: "act_001",
        type: "sale" as const,
        nftId: "nft_005",
        nftName: "Epic Super Bowl Victory",
        rarity: "epic" as const,
        price: 275,
        currency: "usd",
        from: { userId: "user_020", username: "NFTSeller" },
        to: { userId: "user_021", username: "NewCollector" },
        timestamp: Date.now() - 1800000,
      },
      {
        id: "act_002",
        type: "listing" as const,
        nftId: "nft_list_001",
        nftName: "Mythic March Madness Victory",
        rarity: "mythic" as const,
        price: 1500,
        currency: "usd",
        from: { userId: "user_010", username: "MadnessKing" },
        timestamp: Date.now() - 86400000,
      },
      {
        id: "act_003",
        type: "mint" as const,
        nftId: "nft_006",
        nftName: "Legendary 5-Leg Parlay",
        rarity: "legendary" as const,
        from: { userId: "user_001", username: "PropMaster" },
        timestamp: Date.now() - 172800000,
      },
    ],
    hasMore: true,
    nextCursor: "act_004",
  };

  return c.json({
    success: true,
    data: activity,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// GET /nfts/stats
// Get NFT platform stats
// ============================================================================

app.get("/stats", async (c) => {
  // TODO: Call Convex query nfts.getPlatformStats
  const stats = {
    totalMinted: 15420,
    totalVolume: 1250000,
    totalTrades: 8500,
    uniqueCollectors: 5420,
    floorPrices: {
      common: 5,
      uncommon: 15,
      rare: 35,
      epic: 85,
      legendary: 200,
      mythic: 800,
    },
    rarityDistribution: {
      common: 7500,
      uncommon: 4200,
      rare: 2100,
      epic: 1050,
      legendary: 420,
      mythic: 150,
    },
    volume24h: 12500,
    trades24h: 85,
    topSale: {
      nftId: "nft_legendary_001",
      name: "The Perfect Season",
      rarity: "mythic" as const,
      price: 25000,
      date: Date.now() - 604800000,
    },
  };

  return c.json({
    success: true,
    data: stats,
    timestamp: new Date().toISOString(),
  });
});

export { app as nftsRoutes };
