import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

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

// Search assets
export const search = query({
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

// Get user's ownership
export const getOwnership = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const ownership = await ctx.db
      .query("rwaOwnership")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
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

// Purchase shares
export const purchase = mutation({
  args: {
    userId: v.id("users"),
    listingId: v.id("rwaListings"),
    shares: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const listing = await ctx.db.get(args.listingId);
    if (!listing) throw new Error("Listing not found");
    if (listing.status !== "active") throw new Error("Listing not active");
    if (listing.availableShares < args.shares) throw new Error("Not enough shares available");

    const totalCost = args.shares * listing.pricePerShare;

    // Check balance
    const balance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q.eq("userId", args.userId).eq("assetType", "usd").eq("assetId", "USD")
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

    // Create or update ownership
    const existing = await ctx.db
      .query("rwaOwnership")
      .withIndex("by_asset_owner", (q) =>
        q.eq("assetId", listing.assetId).eq("ownerId", args.userId)
      )
      .unique();

    if (existing) {
      const newShares = existing.shares + args.shares;
      await ctx.db.patch(existing._id, {
        shares: newShares,
        averageCost: (existing.averageCost * existing.shares + totalCost) / newShares,
        updatedAt: now,
      });
    } else {
      // Get asset to calculate percentage
      const asset = await ctx.db.get(listing.assetId);
      await ctx.db.insert("rwaOwnership", {
        assetId: listing.assetId,
        ownerId: args.userId,
        shares: args.shares,
        sharePercentage: (args.shares / (asset?.totalShares ?? 1)) * 100,
        averageCost: listing.pricePerShare,
        acquiredAt: now,
        updatedAt: now,
      });
    }

    // Audit log
    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "rwa.purchased",
      resourceType: "rwaListings",
      resourceId: args.listingId,
      metadata: { shares: args.shares, totalCost },
      timestamp: now,
    });

    return { success: true, shares: args.shares, totalCost };
  },
});
