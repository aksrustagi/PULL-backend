import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ============================================================================
// Insurance Products Queries
// ============================================================================

/**
 * Get all active insurance products
 */
export const getProducts = query({
  args: {
    sport: v.optional(v.string()),
    betType: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let products = await ctx.db
      .query("insuranceProducts")
      .withIndex("by_active", (q) => q.eq("isActive", args.isActive ?? true))
      .collect();

    // Filter by sport if specified
    if (args.sport) {
      products = products.filter((p) => {
        const eligibility = p.eligibility as any;
        return eligibility?.sports?.includes(args.sport) ?? true;
      });
    }

    // Filter by bet type if specified
    if (args.betType) {
      products = products.filter((p) => {
        const eligibility = p.eligibility as any;
        return eligibility?.betTypes?.includes(args.betType) ?? true;
      });
    }

    return products.map((p) => ({
      id: p._id,
      type: p.type,
      name: p.name,
      description: p.description,
      coverageDetails: p.coverageDetails,
      premiumRates: p.premiumRates,
      eligibility: p.eligibility,
      terms: p.terms,
      isActive: p.isActive,
      createdAt: p.createdAt,
    }));
  },
});

/**
 * Get a specific insurance product by ID
 */
export const getProductById = query({
  args: { productId: v.id("insuranceProducts") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) return null;

    return {
      id: product._id,
      type: product.type,
      name: product.name,
      description: product.description,
      coverageDetails: product.coverageDetails,
      premiumRates: product.premiumRates,
      eligibility: product.eligibility,
      terms: product.terms,
      isActive: product.isActive,
      createdAt: product.createdAt,
    };
  },
});

/**
 * Get insurance product by type
 */
export const getProductByType = query({
  args: {
    type: v.union(
      v.literal("close_loss"),
      v.literal("push_protection"),
      v.literal("half_point"),
      v.literal("overtime"),
      v.literal("injury"),
      v.literal("weather"),
      v.literal("full_refund")
    ),
  },
  handler: async (ctx, args) => {
    const product = await ctx.db
      .query("insuranceProducts")
      .withIndex("by_type", (q) => q.eq("type", args.type))
      .first();

    if (!product) return null;

    return {
      id: product._id,
      type: product.type,
      name: product.name,
      description: product.description,
      coverageDetails: product.coverageDetails,
      premiumRates: product.premiumRates,
      eligibility: product.eligibility,
      terms: product.terms,
      isActive: product.isActive,
    };
  },
});

// ============================================================================
// Insurance Quote
// ============================================================================

/**
 * Get insurance quote for a bet
 */
export const getQuote = query({
  args: {
    userId: v.id("users"),
    productId: v.id("insuranceProducts"),
    betId: v.string(),
    betAmount: v.number(),
    betOdds: v.number(),
    sport: v.string(),
    coverageAmount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product || !product.isActive) {
      return {
        eligible: false,
        eligibilityReason: "Product not found or inactive",
        quote: null,
      };
    }

    // Get user VIP status for discount
    const vipStatus = await ctx.db
      .query("vipStatus")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    const vipTier = vipStatus?.currentTier ?? "bronze";

    // Check eligibility
    const eligibility = product.eligibility as any;
    if (eligibility?.sports && !eligibility.sports.includes(args.sport)) {
      return {
        eligible: false,
        eligibilityReason: `Sport "${args.sport}" is not eligible for this product`,
        quote: null,
      };
    }

    if (eligibility?.minOdds && args.betOdds < eligibility.minOdds) {
      return {
        eligible: false,
        eligibilityReason: `Odds must be at least ${eligibility.minOdds}`,
        quote: null,
      };
    }

    if (eligibility?.maxOdds && args.betOdds > eligibility.maxOdds) {
      return {
        eligible: false,
        eligibilityReason: `Odds must be at most ${eligibility.maxOdds}`,
        quote: null,
      };
    }

    // Calculate premium
    const premiumRates = product.premiumRates as any;
    const baseRate = premiumRates?.baseRate ?? 0.08;
    const coverageAmount = args.coverageAmount ?? args.betAmount;

    // Base premium calculation
    let basePremium = coverageAmount * baseRate;

    // Odds adjustment (higher odds = higher premium)
    const oddsAdjustment = args.betOdds > 2.0 ? basePremium * 0.05 * (args.betOdds - 2.0) : 0;

    // VIP discount
    const vipDiscounts: Record<string, number> = {
      bronze: 0,
      silver: 0.03,
      gold: 0.05,
      platinum: 0.08,
      diamond: 0.12,
    };
    const vipDiscount = basePremium * (vipDiscounts[vipTier] ?? 0);

    // Get user's insurance credits
    const credits = await ctx.db
      .query("insuranceCredits")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const now = Date.now();
    const availableCredits = credits
      .filter((c) => c.remainingAmount > 0 && (!c.expiresAt || c.expiresAt > now))
      .reduce((sum, c) => sum + c.remainingAmount, 0);

    const finalPremium = Math.max(0, basePremium + oddsAdjustment - vipDiscount);

    return {
      eligible: true,
      eligibilityReason: null,
      quote: {
        betId: args.betId,
        productId: args.productId,
        productName: product.name,
        productType: product.type,
        stake: args.betAmount,
        odds: args.betOdds,
        sport: args.sport,
        coverageAmount,
        basePremium: Math.round(basePremium * 100) / 100,
        oddsAdjustment: Math.round(oddsAdjustment * 100) / 100,
        vipDiscount: Math.round(vipDiscount * 100) / 100,
        vipTier,
        availableCredits: Math.round(availableCredits * 100) / 100,
        finalPremium: Math.round(finalPremium * 100) / 100,
        maxPayout: coverageAmount,
        quoteId: `quote_${Date.now()}_${args.userId}`,
        expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
      },
    };
  },
});

// ============================================================================
// Insurance Policies
// ============================================================================

/**
 * Purchase an insurance policy
 */
export const purchasePolicy = mutation({
  args: {
    userId: v.id("users"),
    productId: v.id("insuranceProducts"),
    betId: v.string(),
    orderId: v.string(),
    coverageAmount: v.number(),
    premiumPaid: v.number(),
    premiumBreakdown: v.any(),
    betAmount: v.number(),
    betOdds: v.number(),
    sport: v.string(),
    event: v.string(),
    market: v.string(),
    selection: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get product
    const product = await ctx.db.get(args.productId);
    if (!product || !product.isActive) {
      throw new Error("Product not found or inactive");
    }

    // Verify user has sufficient balance
    const balance = await ctx.db
      .query("balances")
      .withIndex("by_user_asset", (q) =>
        q.eq("userId", args.userId).eq("assetType", "usd").eq("assetId", "usd")
      )
      .unique();

    if (!balance || balance.available < args.premiumPaid) {
      throw new Error("Insufficient balance for premium");
    }

    // Deduct premium from balance
    await ctx.db.patch(balance._id, {
      available: balance.available - args.premiumPaid,
      updatedAt: now,
    });

    // Create policy
    const policyId = await ctx.db.insert("insurancePolicies", {
      userId: args.userId,
      productId: args.productId,
      betId: args.betId,
      orderId: args.orderId,
      type: product.type,
      status: "active",
      coverageAmount: args.coverageAmount,
      premiumPaid: args.premiumPaid,
      premiumBreakdown: args.premiumBreakdown,
      betAmount: args.betAmount,
      betOdds: args.betOdds,
      potentialPayout: args.betAmount * args.betOdds,
      sport: args.sport,
      event: args.event,
      market: args.market,
      selection: args.selection,
      coverageDetails: product.coverageDetails,
      purchasedAt: now,
      activatesAt: now,
      expiresAt: now + 7 * 24 * 60 * 60 * 1000, // 7 days default
    });

    // Audit log
    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "insurance.purchased",
      resourceType: "insurancePolicies",
      resourceId: policyId,
      metadata: {
        productId: args.productId,
        productType: product.type,
        betId: args.betId,
        premiumPaid: args.premiumPaid,
        coverageAmount: args.coverageAmount,
      },
      timestamp: now,
    });

    return {
      policyId,
      betId: args.betId,
      productId: args.productId,
      productName: product.name,
      productType: product.type,
      coverageAmount: args.coverageAmount,
      premiumPaid: args.premiumPaid,
      status: "active",
      purchasedAt: now,
      expiresAt: now + 7 * 24 * 60 * 60 * 1000,
      terms: product.terms,
    };
  },
});

/**
 * Get user's insurance policies
 */
export const getUserPolicies = query({
  args: {
    userId: v.id("users"),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("pending_claim"),
        v.literal("claimed"),
        v.literal("expired"),
        v.literal("cancelled"),
        v.literal("void")
      )
    ),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let policies = await ctx.db
      .query("insurancePolicies")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    // Filter by status if specified
    if (args.status) {
      policies = policies.filter((p) => p.status === args.status);
    }

    const total = policies.length;
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 50;

    const paginatedPolicies = policies.slice(offset, offset + limit);

    // Get product details for each policy
    const policiesWithDetails = await Promise.all(
      paginatedPolicies.map(async (policy) => {
        const product = await ctx.db.get(policy.productId);
        return {
          policyId: policy._id,
          betId: policy.betId,
          productType: policy.type,
          productName: product?.name ?? "Unknown Product",
          coverageAmount: policy.coverageAmount,
          premiumPaid: policy.premiumPaid,
          status: policy.status,
          purchasedAt: policy.purchasedAt,
          claimedAt: policy.claimedAt,
          betDetails: {
            event: policy.event,
            selection: policy.selection,
            odds: policy.betOdds,
            stake: policy.betAmount,
            status: policy.status === "claimed" ? "settled" : "pending",
          },
        };
      })
    );

    return {
      items: policiesWithDetails,
      total,
      hasMore: offset + limit < total,
    };
  },
});

/**
 * Get a specific policy by ID
 */
export const getPolicyById = query({
  args: {
    policyId: v.id("insurancePolicies"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const policy = await ctx.db.get(args.policyId);
    if (!policy) return null;

    // Verify ownership
    if (policy.userId !== args.userId) {
      return null;
    }

    const product = await ctx.db.get(policy.productId);

    // Get claim history for this policy
    const claims = await ctx.db
      .query("insuranceClaims")
      .withIndex("by_policy", (q) => q.eq("policyId", args.policyId))
      .collect();

    return {
      policyId: policy._id,
      betId: policy.betId,
      productType: policy.type,
      productName: product?.name ?? "Unknown Product",
      coverageAmount: policy.coverageAmount,
      premiumPaid: policy.premiumPaid,
      status: policy.status,
      purchasedAt: policy.purchasedAt,
      terms: product?.terms ?? {},
      betDetails: {
        event: policy.event,
        selection: policy.selection,
        odds: policy.betOdds,
        stake: policy.betAmount,
        status: policy.status === "claimed" ? "settled" : "pending",
        eventDate: policy.activatesAt,
      },
      claimHistory: claims.map((c) => ({
        claimId: c._id,
        status: c.status,
        submittedAt: c.submittedAt,
        reviewedAt: c.reviewedAt,
        claimAmount: c.claimAmount,
        approvedAmount: c.approvedAmount,
        paidAmount: c.paidAmount,
      })),
    };
  },
});

// ============================================================================
// Insurance Claims
// ============================================================================

/**
 * Submit an insurance claim
 */
export const submitClaim = mutation({
  args: {
    policyId: v.id("insurancePolicies"),
    userId: v.id("users"),
    claimReason: v.string(),
    evidence: v.optional(v.array(v.string())),
    betResult: v.optional(v.string()),
    actualMargin: v.optional(v.number()),
    eventOutcome: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get policy
    const policy = await ctx.db.get(args.policyId);
    if (!policy) {
      throw new Error("Policy not found");
    }

    // Verify ownership
    if (policy.userId !== args.userId) {
      throw new Error("Unauthorized");
    }

    // Check policy status
    if (policy.status !== "active") {
      throw new Error("Policy is not active");
    }

    // Check if policy has expired
    if (policy.expiresAt < now) {
      throw new Error("Policy has expired");
    }

    // Calculate claim amount based on policy type
    let claimAmount = policy.coverageAmount;
    if (policy.type === "push_protection") {
      claimAmount = policy.betAmount * 0.5;
    }

    // Create claim
    const claimId = await ctx.db.insert("insuranceClaims", {
      policyId: args.policyId,
      userId: args.userId,
      status: claimAmount > 500 ? "under_review" : "pending",
      claimType: policy.type,
      claimAmount,
      betResult: args.betResult ?? "loss",
      actualMargin: args.actualMargin,
      eventOutcome: args.eventOutcome ?? "",
      settlementDetails: {
        claimReason: args.claimReason,
        submittedAt: now,
      },
      submittedAt: now,
      evidence: args.evidence?.map((e) => ({ url: e })) ?? [],
    });

    // Update policy status
    await ctx.db.patch(args.policyId, {
      status: "pending_claim",
    });

    // Audit log
    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "insurance.claim_submitted",
      resourceType: "insuranceClaims",
      resourceId: claimId,
      metadata: {
        policyId: args.policyId,
        claimAmount,
        claimType: policy.type,
      },
      timestamp: now,
    });

    return {
      claimId,
      policyId: args.policyId,
      status: claimAmount > 500 ? "under_review" : "pending",
      submittedAt: now,
      reason: args.claimReason,
      evidence: args.evidence ?? [],
      estimatedReviewTime: claimAmount > 500 ? "24-48 hours" : "1-2 hours",
      message:
        claimAmount > 500
          ? "Your claim has been submitted and is under review"
          : "Your claim has been submitted and will be processed shortly",
    };
  },
});

/**
 * Get user's insurance claims
 */
export const getUserClaims = query({
  args: {
    userId: v.id("users"),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("under_review"),
        v.literal("approved"),
        v.literal("denied"),
        v.literal("paid"),
        v.literal("disputed")
      )
    ),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let claims = await ctx.db
      .query("insuranceClaims")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    // Filter by status if specified
    if (args.status) {
      claims = claims.filter((c) => c.status === args.status);
    }

    const total = claims.length;
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 50;

    const paginatedClaims = claims.slice(offset, offset + limit);

    // Get policy details for each claim
    const claimsWithDetails = await Promise.all(
      paginatedClaims.map(async (claim) => {
        const policy = await ctx.db.get(claim.policyId);
        return {
          claimId: claim._id,
          policyId: claim.policyId,
          productType: claim.claimType,
          status: claim.status,
          submittedAt: claim.submittedAt,
          reviewedAt: claim.reviewedAt,
          paidAt: claim.paidAt,
          amount: claim.claimAmount,
          approvedAmount: claim.approvedAmount,
          paidAmount: claim.paidAmount,
          reason: (claim.settlementDetails as any)?.claimReason ?? "",
          denialReason: claim.denialReason,
          betDetails: policy
            ? {
                event: policy.event,
                selection: policy.selection,
              }
            : null,
        };
      })
    );

    return {
      items: claimsWithDetails,
      total,
      hasMore: offset + limit < total,
    };
  },
});

// ============================================================================
// Insurance Credits
// ============================================================================

/**
 * Get user's insurance credit balance
 */
export const getCreditBalance = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;

    const credits = await ctx.db
      .query("insuranceCredits")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    let totalBalance = 0;
    let lifetimeEarned = 0;
    let lifetimeUsed = 0;
    let pendingCredits = 0;
    let expiringAmount = 0;
    let expiringAt: number | null = null;

    const recentTransactions: Array<{
      type: "earned" | "used";
      amount: number;
      reason: string;
      date: number;
    }> = [];

    for (const credit of credits) {
      lifetimeEarned += credit.amount;
      lifetimeUsed += credit.usedAmount;

      // Active credits
      if (!credit.expiresAt || credit.expiresAt > now) {
        totalBalance += credit.remainingAmount;
      }

      // Expiring soon (within 30 days)
      if (credit.expiresAt && credit.expiresAt <= thirtyDaysFromNow && credit.expiresAt > now) {
        expiringAmount += credit.remainingAmount;
        if (!expiringAt || credit.expiresAt < expiringAt) {
          expiringAt = credit.expiresAt;
        }
      }

      // Add to recent transactions
      if (credit.remainingAmount !== credit.amount) {
        recentTransactions.push({
          type: "used",
          amount: -(credit.amount - credit.remainingAmount),
          reason: "Insurance premium payment",
          date: credit.updatedAt ?? credit.createdAt,
        });
      }
      recentTransactions.push({
        type: "earned",
        amount: credit.amount,
        reason: credit.source,
        date: credit.createdAt,
      });
    }

    // Sort transactions by date desc and limit to 10
    recentTransactions.sort((a, b) => b.date - a.date);
    const limitedTransactions = recentTransactions.slice(0, 10);

    return {
      balance: Math.round(totalBalance * 100) / 100,
      lifetimeEarned: Math.round(lifetimeEarned * 100) / 100,
      lifetimeUsed: Math.round(lifetimeUsed * 100) / 100,
      pendingCredits: Math.round(pendingCredits * 100) / 100,
      expiringCredits: expiringAmount > 0
        ? {
            amount: Math.round(expiringAmount * 100) / 100,
            expiresAt: expiringAt,
          }
        : null,
      recentTransactions: limitedTransactions,
    };
  },
});

/**
 * Add insurance credits to user
 */
export const addCredits = mutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    type: v.union(
      v.literal("purchase"),
      v.literal("bonus"),
      v.literal("vip_reward"),
      v.literal("promo"),
      v.literal("refund")
    ),
    source: v.string(),
    expirationDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const expiresAt = args.expirationDays
      ? now + args.expirationDays * 24 * 60 * 60 * 1000
      : now + 90 * 24 * 60 * 60 * 1000; // Default 90 days

    const creditId = await ctx.db.insert("insuranceCredits", {
      userId: args.userId,
      type: args.type,
      amount: args.amount,
      usedAmount: 0,
      remainingAmount: args.amount,
      expiresAt,
      source: args.source,
      createdAt: now,
    });

    return {
      creditId,
      amount: args.amount,
      expiresAt,
    };
  },
});

// ============================================================================
// Insurance Statistics
// ============================================================================

/**
 * Get user's insurance statistics
 */
export const getUserStats = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const policies = await ctx.db
      .query("insurancePolicies")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const claims = await ctx.db
      .query("insuranceClaims")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Calculate stats
    const totalPolicies = policies.length;
    const activePolicies = policies.filter((p) => p.status === "active").length;
    const totalPremiumsPaid = policies.reduce((sum, p) => sum + p.premiumPaid, 0);

    const paidClaims = claims.filter((c) => c.status === "paid");
    const totalClaimsPaid = paidClaims.reduce((sum, c) => sum + (c.paidAmount ?? 0), 0);

    const approvedOrPaidClaims = claims.filter(
      (c) => c.status === "approved" || c.status === "paid"
    ).length;
    const totalClaimsSubmitted = claims.length;
    const claimSuccessRate =
      totalClaimsSubmitted > 0 ? approvedOrPaidClaims / totalClaimsSubmitted : 0;

    const avgPremiumPerPolicy = totalPolicies > 0 ? totalPremiumsPaid / totalPolicies : 0;

    // Find most used product type
    const productTypeCounts: Record<string, number> = {};
    for (const policy of policies) {
      productTypeCounts[policy.type] = (productTypeCounts[policy.type] ?? 0) + 1;
    }
    const mostUsedProduct = Object.entries(productTypeCounts).sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0];

    // Calculate monthly stats for last 3 months
    const now = Date.now();
    const threeMonthsAgo = now - 90 * 24 * 60 * 60 * 1000;
    const monthlyStats: Array<{
      month: string;
      policies: number;
      premiums: number;
      claims: number;
    }> = [];

    for (let i = 0; i < 3; i++) {
      const monthStart = new Date(now);
      monthStart.setMonth(monthStart.getMonth() - i);
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);

      const monthPolicies = policies.filter(
        (p) => p.purchasedAt >= monthStart.getTime() && p.purchasedAt < monthEnd.getTime()
      );
      const monthClaims = claims.filter(
        (c) =>
          c.status === "paid" &&
          c.paidAt &&
          c.paidAt >= monthStart.getTime() &&
          c.paidAt < monthEnd.getTime()
      );

      monthlyStats.unshift({
        month: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`,
        policies: monthPolicies.length,
        premiums: Math.round(monthPolicies.reduce((sum, p) => sum + p.premiumPaid, 0) * 100) / 100,
        claims: Math.round(monthClaims.reduce((sum, c) => sum + (c.paidAmount ?? 0), 0) * 100) / 100,
      });
    }

    return {
      totalPolicies,
      activePolicies,
      totalPremiumsPaid: Math.round(totalPremiumsPaid * 100) / 100,
      totalClaimsPaid: Math.round(totalClaimsPaid * 100) / 100,
      claimSuccessRate: Math.round(claimSuccessRate * 1000) / 1000,
      avgPremiumPerPolicy: Math.round(avgPremiumPerPolicy * 100) / 100,
      mostUsedProduct: mostUsedProduct ?? null,
      savingsFromInsurance: Math.round((totalClaimsPaid - totalPremiumsPaid) * 100) / 100,
      monthlyStats,
    };
  },
});

// ============================================================================
// Admin Operations
// ============================================================================

/**
 * Process a claim (approve/deny)
 */
export const processClaim = mutation({
  args: {
    claimId: v.id("insuranceClaims"),
    action: v.union(v.literal("approve"), v.literal("deny")),
    approvedAmount: v.optional(v.number()),
    denialReason: v.optional(v.string()),
    reviewedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const claim = await ctx.db.get(args.claimId);
    if (!claim) {
      throw new Error("Claim not found");
    }

    if (claim.status !== "pending" && claim.status !== "under_review") {
      throw new Error("Claim has already been processed");
    }

    if (args.action === "approve") {
      const payoutAmount = args.approvedAmount ?? claim.claimAmount;

      // Update claim
      await ctx.db.patch(args.claimId, {
        status: "approved",
        approvedAmount: payoutAmount,
        reviewedAt: now,
        reviewedBy: args.reviewedBy,
        approvedAt: now,
      });

      // Credit user's balance
      const balance = await ctx.db
        .query("balances")
        .withIndex("by_user_asset", (q) =>
          q.eq("userId", claim.userId).eq("assetType", "usd").eq("assetId", "usd")
        )
        .unique();

      if (balance) {
        await ctx.db.patch(balance._id, {
          available: balance.available + payoutAmount,
          updatedAt: now,
        });
      }

      // Update claim to paid
      await ctx.db.patch(args.claimId, {
        status: "paid",
        paidAmount: payoutAmount,
        paidAt: now,
      });

      // Update policy status
      await ctx.db.patch(claim.policyId, {
        status: "claimed",
        claimedAt: now,
        settledAt: now,
      });

      return { success: true, action: "approved", paidAmount: payoutAmount };
    } else {
      // Deny claim
      await ctx.db.patch(args.claimId, {
        status: "denied",
        reviewedAt: now,
        reviewedBy: args.reviewedBy,
        denialReason: args.denialReason ?? "Claim does not meet policy criteria",
      });

      // Update policy back to active
      await ctx.db.patch(claim.policyId, {
        status: "active",
      });

      return { success: true, action: "denied", reason: args.denialReason };
    }
  },
});

/**
 * Seed default insurance products
 */
export const seedProducts = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Check if products already exist
    const existing = await ctx.db.query("insuranceProducts").collect();
    if (existing.length > 0) {
      return { seeded: false, message: "Products already exist" };
    }

    const products = [
      {
        type: "close_loss" as const,
        name: "Close Loss Protection",
        description: "Get your stake back if you lose by 1 point or less",
        coverageDetails: { marginThreshold: 1 },
        premiumRates: { baseRate: 0.08 },
        eligibility: {
          sports: ["nba", "nfl", "mlb", "nhl"],
          betTypes: ["spread", "total", "moneyline"],
          minOdds: 1.5,
          maxOdds: 5.0,
        },
        terms: {
          activationTime: "immediate",
          cancellationPeriod: 1,
          claimDeadline: "24 hours after bet settlement",
        },
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        type: "push_protection" as const,
        name: "Push Protection",
        description: "Get paid on pushes instead of getting stake returned",
        coverageDetails: { pushPayout: 0.5 },
        premiumRates: { baseRate: 0.05 },
        eligibility: {
          sports: ["nba", "nfl", "ncaaf", "ncaab"],
          betTypes: ["spread", "total"],
          minOdds: 1.3,
          maxOdds: 3.0,
        },
        terms: {
          activationTime: "immediate",
          cancellationPeriod: 1,
          claimDeadline: "24 hours after bet settlement",
        },
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        type: "half_point" as const,
        name: "Half-Point Coverage",
        description: "Win if you would have won with a half-point better line",
        coverageDetails: { marginThreshold: 0.5 },
        premiumRates: { baseRate: 0.12 },
        eligibility: {
          sports: ["nba", "nfl"],
          betTypes: ["spread"],
          minOdds: 1.8,
          maxOdds: 2.2,
        },
        terms: {
          activationTime: "immediate",
          cancellationPeriod: 2,
          claimDeadline: "24 hours after bet settlement",
        },
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        type: "overtime" as const,
        name: "Overtime Loss Protection",
        description: "Get refunded if your team loses in overtime",
        coverageDetails: { overtimeOnly: true },
        premiumRates: { baseRate: 0.10 },
        eligibility: {
          sports: ["nba", "nfl", "nhl"],
          betTypes: ["moneyline"],
          minOdds: 1.5,
          maxOdds: 4.0,
        },
        terms: {
          activationTime: "immediate",
          cancellationPeriod: 1,
          claimDeadline: "24 hours after bet settlement",
        },
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ];

    for (const product of products) {
      await ctx.db.insert("insuranceProducts", product);
    }

    return { seeded: true, count: products.length };
  },
});
