import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authenticatedQuery, authenticatedMutation, adminMutation } from "./lib/auth";
import { Id } from "./_generated/dataModel";

// Get assets with filtering
export const getAssets = query({
  args: {
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query("rwaAssets");

    if (args.status) {
      q = q.withIndex("by_status", (q) => q.eq("status", args.status as any));
    }

    const assets = await q.order("desc").take(args.limit ?? 50);

    // Filter by type if specified
    if (args.type) {
      return assets.filter(a => a.type === args.type);
    }
    return assets;
  },
});

// Get asset by ID
export const getById = query({
  args: { id: v.id("rwaAssets") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Get assets owned by the authenticated user
 */
export const getAssetsByOwner = authenticatedQuery({
  args: {},
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    return await ctx.db
      .query("rwaAssets")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect();
  },
});

/**
 * Search assets
 */
export const searchAssets = query({
  args: {
    query: v.string(),
    type: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("rwaAssets")
      .withSearchIndex("search_assets", (q) => {
        let search = q.search("name", args.query);
        if (args.type) search = search.eq("type", args.type as any);
        return search;
      })
      .take(args.limit ?? 20);
  },
});

// Get active listings
export const getListings = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const listings = await ctx.db
      .query("rwaListings")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .order("desc")
      .take(args.limit ?? 50);

    // Enrich with asset data
    const enriched = await Promise.all(
      listings.map(async (listing) => {
        const asset = await ctx.db.get(listing.assetId);
        return { ...listing, asset };
      })
    );

    return enriched;
  },
});

/**
 * Get ownership records for the authenticated user
 */
export const getOwnership = authenticatedQuery({
  args: {},
  handler: async (ctx, args) => {
    const userId = ctx.userId as Id<"users">;
    const ownership = await ctx.db
      .query("rwaOwnership")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect();

    // Enrich with asset data
    const enriched = await Promise.all(
      ownership.map(async (o) => {
        const asset = await ctx.db.get(o.assetId);
        return { ...o, asset };
      })
    );

    return enriched;
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create a new RWA asset
 */
export const createAsset = authenticatedMutation({
  args: {
    type: v.union(
      v.literal("pokemon_card"),
      v.literal("sports_card"),
      v.literal("collectible"),
      v.literal("art"),
      v.literal("other")
    ),
    name: v.string(),
    description: v.string(),
    imageUrls: v.array(v.string()),
    totalShares: v.number(),
    pricePerShare: v.number(),
    currency: v.string(),
    gradingCompany: v.optional(v.string()),
    grade: v.optional(v.number()),
    certNumber: v.optional(v.string()),
    cardName: v.optional(v.string()),
    setName: v.optional(v.string()),
    cardNumber: v.optional(v.string()),
    rarity: v.optional(v.string()),
    year: v.optional(v.number()),
    metadata: v.optional(v.object({
      condition: v.optional(v.string()),
      edition: v.optional(v.string()),
      language: v.optional(v.string()),
      marketPrice: v.optional(v.number()),
      notes: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ownerId = ctx.userId as Id<"users">;

    const assetId = await ctx.db.insert("rwaAssets", {
      type: args.type,
      name: args.name,
      description: args.description,
      imageUrls: args.imageUrls,
      status: "pending_verification",
      ownerId,
      totalShares: args.totalShares,
      availableShares: args.totalShares,
      pricePerShare: args.pricePerShare,
      currency: args.currency,
      gradingCompany: args.gradingCompany,
      grade: args.grade,
      certNumber: args.certNumber,
      cardName: args.cardName,
      setName: args.setName,
      cardNumber: args.cardNumber,
      rarity: args.rarity,
      year: args.year,
      verificationDocuments: [],
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });

    // Create initial ownership record
    await ctx.db.insert("rwaOwnership", {
      assetId,
      ownerId,
      shares: args.totalShares,
      sharePercentage: 100,
      averageCost: args.pricePerShare,
      acquiredAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: ownerId,
      action: "rwa.asset_created",
      resourceType: "rwaAssets",
      resourceId: assetId,
      metadata: { name: args.name, type: args.type },
      timestamp: now,
    });

    return assetId;
  },
});

/**
 * Update asset status/details (admin only)
 */
export const updateAsset = adminMutation({
  args: {
    id: v.id("rwaAssets"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.string()),
    pricePerShare: v.optional(v.number()),
    verificationDocuments: v.optional(v.array(v.string())),
    verifiedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { id, ...updates } = args;

    const asset = await ctx.db.get(id);
    if (!asset) {
      throw new Error("Asset not found");
    }

    await ctx.db.patch(id, {
      ...updates,
      status: updates.status as "verified" | undefined,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: ctx.userId as Id<"users">,
      action: "rwa.asset_updated",
      resourceType: "rwaAssets",
      resourceId: id,
      changes: updates,
      timestamp: now,
    });

    return id;
  },
});

/**
 * Create a listing
 */
export const createListing = authenticatedMutation({
  args: {
    assetId: v.id("rwaAssets"),
    listingType: v.union(
      v.literal("fixed_price"),
      v.literal("auction"),
      v.literal("make_offer")
    ),
    pricePerShare: v.number(),
    minShares: v.number(),
    maxShares: v.number(),
    auctionEndTime: v.optional(v.number()),
    reservePrice: v.optional(v.number()),
    buyNowPrice: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const sellerId = ctx.userId as Id<"users">;

    const asset = await ctx.db.get(args.assetId);
    if (!asset) {
      throw new Error("Asset not found");
    }

    if (asset.status !== "verified" && asset.status !== "listed") {
      throw new Error("Asset must be verified before listing");
    }

    // Check seller owns the shares
    const ownership = await ctx.db
      .query("rwaOwnership")
      .withIndex("by_asset_owner", (q) =>
        q.eq("assetId", args.assetId).eq("ownerId", sellerId)
      )
      .unique();

    if (!ownership || ownership.shares < args.maxShares) {
      throw new Error("Insufficient shares to list");
    }

    const listingId = await ctx.db.insert("rwaListings", {
      assetId: args.assetId,
      sellerId,
      listingType: args.listingType,
      status: "active",
      pricePerShare: args.pricePerShare,
      minShares: args.minShares,
      maxShares: args.maxShares,
      availableShares: args.maxShares,
      auctionEndTime: args.auctionEndTime,
      reservePrice: args.reservePrice,
      buyNowPrice: args.buyNowPrice,
      viewCount: 0,
      watchCount: 0,
      expiresAt: args.expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    // Update asset status
    await ctx.db.patch(args.assetId, {
      status: "listed",
      listedAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: sellerId,
      action: "rwa.listing_created",
      resourceType: "rwaListings",
      resourceId: listingId,
      metadata: { assetId: args.assetId, pricePerShare: args.pricePerShare },
      timestamp: now,
    });

    return listingId;
  },
});

/**
 * Purchase shares from a listing
 */
export const purchaseShares = authenticatedMutation({
  args: {
    listingId: v.id("rwaListings"),
    shares: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const buyerId = ctx.userId as Id<"users">;

    const listing = await ctx.db.get(args.listingId);
    if (!listing) {
      throw new Error("Listing not found");
    }

    if (listing.status !== "active") {
      throw new Error("Listing is not active");
    }

    // Prevent self-purchase
    if (listing.sellerId === buyerId) {
      throw new Error("Cannot purchase from your own listing");
    }

    if (args.shares <= 0) {
      throw new Error("Shares must be a positive number");
    }

    if (args.shares < listing.minShares) {
      throw new Error(`Minimum purchase is ${listing.minShares} shares`);
    }

    if (args.shares > listing.availableShares) {
      throw new Error("Not enough shares available");
    }

    const totalCost = args.shares * listing.pricePerShare;

    // Check balance
    const balance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q.eq("userId", buyerId).eq("assetType", "usd").eq("assetId", "USD")
      )
      .unique();

    if (!balance || balance.available < totalCost) {
      throw new Error("Insufficient funds");
    }

    // Deduct balance
    await ctx.db.patch(balance._id, {
      available: balance.available - totalCost,
      updatedAt: now,
    });

    // Update listing
    const newAvailable = listing.availableShares - args.shares;
    await ctx.db.patch(args.listingId, {
      availableShares: newAvailable,
      status: newAvailable === 0 ? "sold" : "active",
      updatedAt: now,
    });

    // Update ownership - remove from seller
    const sellerOwnership = await ctx.db
      .query("rwaOwnership")
      .withIndex("by_asset_owner", (q) =>
        q.eq("assetId", listing.assetId).eq("ownerId", listing.sellerId)
      )
      .unique();

    if (sellerOwnership) {
      const newShares = sellerOwnership.shares - args.shares;
      if (newShares <= 0) {
        await ctx.db.delete(sellerOwnership._id);
      } else {
        const asset = await ctx.db.get(listing.assetId);
        await ctx.db.patch(sellerOwnership._id, {
          shares: newShares,
          sharePercentage: asset ? (newShares / asset.totalShares) * 100 : 0,
          updatedAt: now,
        });
      }
    }

    // Update ownership - add buyer
    const buyerOwnership = await ctx.db
      .query("rwaOwnership")
      .withIndex("by_asset_owner", (q) =>
        q.eq("assetId", listing.assetId).eq("ownerId", buyerId)
      )
      .unique();

    const asset = await ctx.db.get(listing.assetId);

    if (buyerOwnership) {
      const newShares = buyerOwnership.shares + args.shares;
      const newCostBasis =
        buyerOwnership.shares * buyerOwnership.averageCost + totalCost;
      await ctx.db.patch(buyerOwnership._id, {
        shares: newShares,
        averageCost: newCostBasis / newShares,
        sharePercentage: asset ? (newShares / asset.totalShares) * 100 : 0,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("rwaOwnership", {
        assetId: listing.assetId,
        ownerId: buyerId,
        shares: args.shares,
        sharePercentage: (args.shares / (asset?.totalShares ?? 1)) * 100,
        averageCost: listing.pricePerShare,
        acquiredAt: now,
        updatedAt: now,
      });
    }

    // Audit log
    await ctx.db.insert("auditLog", {
      userId: buyerId,
      action: "rwa.shares_purchased",
      resourceType: "rwaListings",
      resourceId: args.listingId,
      metadata: { shares: args.shares, totalCost },
      timestamp: now,
    });

    return { success: true, shares: args.shares, totalCost };
  },
});
