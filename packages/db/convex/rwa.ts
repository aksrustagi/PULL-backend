import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * RWA (Real World Asset) queries and mutations for PULL
 */

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get all assets with filters
 */
export const getAssets = query({
  args: {
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("rwaAssets");

    if (args.type && args.status) {
      query = query.withIndex("by_type", (q) =>
        q
          .eq("type", args.type as "pokemon_card")
          .eq("status", args.status as "listed")
      );
    } else if (args.status) {
      query = query.withIndex("by_status", (q) =>
        q.eq("status", args.status as "listed")
      );
    }

    return await query.order("desc").take(args.limit ?? 50);
  },
});

/**
 * Get asset by ID with listing
 */
export const getAssetById = query({
  args: { id: v.id("rwaAssets") },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.id);
    if (!asset) return null;

    // Get active listing if any
    const listing = await ctx.db
      .query("rwaListings")
      .withIndex("by_asset", (q) => q.eq("assetId", args.id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    // Get owner info
    const owner = await ctx.db.get(asset.ownerId);

    // Get ownership records
    const ownership = await ctx.db
      .query("rwaOwnership")
      .withIndex("by_asset", (q) => q.eq("assetId", args.id))
      .collect();

    return {
      ...asset,
      listing,
      owner: owner
        ? { id: owner._id, displayName: owner.displayName, avatarUrl: owner.avatarUrl }
        : null,
      ownershipCount: ownership.length,
      totalOwners: new Set(ownership.map((o) => o.ownerId)).size,
    };
  },
});

/**
 * Get assets owned by user
 */
export const getAssetsByOwner = query({
  args: { ownerId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("rwaAssets")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
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
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let searchQuery = ctx.db
      .query("rwaAssets")
      .withSearchIndex("search_assets", (q) => {
        let search = q.search("name", args.query);
        if (args.type) {
          search = search.eq("type", args.type as "pokemon_card");
        }
        if (args.status) {
          search = search.eq("status", args.status as "listed");
        }
        return search;
      });

    return await searchQuery.take(args.limit ?? 20);
  },
});

/**
 * Get listing by ID
 */
export const getListing = query({
  args: { id: v.id("rwaListings") },
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.id);
    if (!listing) return null;

    const asset = await ctx.db.get(listing.assetId);

    return {
      ...listing,
      asset,
    };
  },
});

/**
 * Get active listings
 */
export const getActiveListings = query({
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
    return await Promise.all(
      listings.map(async (listing) => {
        const asset = await ctx.db.get(listing.assetId);
        return { ...listing, asset };
      })
    );
  },
});

/**
 * Get ownership records for a user
 */
export const getOwnership = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const ownership = await ctx.db
      .query("rwaOwnership")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
      .collect();

    // Enrich with asset data
    return await Promise.all(
      ownership.map(async (record) => {
        const asset = await ctx.db.get(record.assetId);
        return { ...record, asset };
      })
    );
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create a new RWA asset
 */
export const createAsset = mutation({
  args: {
    ownerId: v.id("users"),
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
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const assetId = await ctx.db.insert("rwaAssets", {
      type: args.type,
      name: args.name,
      description: args.description,
      imageUrls: args.imageUrls,
      status: "pending_verification",
      ownerId: args.ownerId,
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
      ownerId: args.ownerId,
      shares: args.totalShares,
      sharePercentage: 100,
      averageCost: args.pricePerShare,
      acquiredAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: args.ownerId,
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
 * Update asset status/details
 */
export const updateAsset = mutation({
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
      userId: asset.ownerId,
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
export const createListing = mutation({
  args: {
    assetId: v.id("rwaAssets"),
    sellerId: v.id("users"),
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
        q.eq("assetId", args.assetId).eq("ownerId", args.sellerId)
      )
      .unique();

    if (!ownership || ownership.shares < args.maxShares) {
      throw new Error("Insufficient shares to list");
    }

    const listingId = await ctx.db.insert("rwaListings", {
      assetId: args.assetId,
      sellerId: args.sellerId,
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
      userId: args.sellerId,
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
export const purchaseShares = mutation({
  args: {
    listingId: v.id("rwaListings"),
    buyerId: v.id("users"),
    shares: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const listing = await ctx.db.get(args.listingId);
    if (!listing) {
      throw new Error("Listing not found");
    }

    if (listing.status !== "active") {
      throw new Error("Listing is not active");
    }

    if (args.shares < listing.minShares) {
      throw new Error(`Minimum purchase is ${listing.minShares} shares`);
    }

    if (args.shares > listing.availableShares) {
      throw new Error("Not enough shares available");
    }

    const totalCost = args.shares * listing.pricePerShare;

    // Check buyer balance
    const buyerBalance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q.eq("userId", args.buyerId).eq("assetType", "usd").eq("assetId", "USD")
      )
      .unique();

    if (!buyerBalance || buyerBalance.available < totalCost) {
      throw new Error("Insufficient balance");
    }

    // Debit buyer
    await ctx.db.patch(buyerBalance._id, {
      available: buyerBalance.available - totalCost,
      updatedAt: now,
    });

    // Credit seller
    const sellerBalance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q.eq("userId", listing.sellerId).eq("assetType", "usd").eq("assetId", "USD")
      )
      .unique();

    if (sellerBalance) {
      await ctx.db.patch(sellerBalance._id, {
        available: sellerBalance.available + totalCost,
        updatedAt: now,
      });
    }

    // Update ownership - reduce seller
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
        q.eq("assetId", listing.assetId).eq("ownerId", args.buyerId)
      )
      .unique();

    const asset = await ctx.db.get(listing.assetId);

    if (buyerOwnership) {
      const newShares = buyerOwnership.shares + args.shares;
      const newCostBasis =
        buyerOwnership.shares * buyerOwnership.averageCost + totalCost;
      await ctx.db.patch(buyerOwnership._id, {
        shares: newShares,
        sharePercentage: asset ? (newShares / asset.totalShares) * 100 : 0,
        averageCost: newCostBasis / newShares,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("rwaOwnership", {
        assetId: listing.assetId,
        ownerId: args.buyerId,
        shares: args.shares,
        sharePercentage: asset ? (args.shares / asset.totalShares) * 100 : 0,
        averageCost: listing.pricePerShare,
        acquiredAt: now,
        updatedAt: now,
      });
    }

    // Update listing
    const newAvailable = listing.availableShares - args.shares;
    await ctx.db.patch(args.listingId, {
      availableShares: newAvailable,
      status: newAvailable <= 0 ? "sold" : "active",
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: args.buyerId,
      action: "rwa.shares_purchased",
      resourceType: "rwaListings",
      resourceId: args.listingId,
      metadata: {
        assetId: listing.assetId,
        shares: args.shares,
        totalCost,
        sellerId: listing.sellerId,
      },
      timestamp: now,
    });

    return { success: true, shares: args.shares, totalCost };
  },
});
