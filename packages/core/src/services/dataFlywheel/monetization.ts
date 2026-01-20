/**
 * Data Monetization Service
 *
 * Manages:
 * - Data product catalog
 * - Subscription management
 * - Usage tracking
 * - Revenue sharing
 * - Research report generation
 */

import type {
  DataProduct,
  DataSubscription,
  ResearchReport,
  AnonymizedSignal,
} from "./types";

// ============================================================================
// Data Product Manager
// ============================================================================

export class DataProductManager {
  /**
   * Define a new data product
   */
  createDataProduct(input: {
    name: string;
    description: string;
    productType: DataProduct["productType"];
    dataCategories: string[];
    assetClasses: string[];
    updateFrequency: DataProduct["updateFrequency"];
    pricingModel: DataProduct["pricingModel"];
    basePrice: number;
    currency: string;
    tiers?: Array<{
      name: string;
      price: number;
      features: string[];
      limits: Record<string, number>;
    }>;
    requiresInstitutional: boolean;
    requiresNDA: boolean;
    minKycTier: string;
  }): DataProduct {
    return {
      productId: `prod_${crypto.randomUUID().slice(0, 8)}`,
      ...input,
    };
  }

  /**
   * Get predefined data products catalog
   */
  getDefaultProductCatalog(): DataProduct[] {
    return [
      // Signal Feed Products
      {
        productId: "prod_signal_basic",
        name: "Community Signals - Basic",
        description: "Daily community conviction signals for popular assets",
        productType: "signal_feed",
        dataCategories: ["community_conviction", "sentiment"],
        assetClasses: ["crypto", "prediction"],
        updateFrequency: "daily",
        pricingModel: "subscription",
        basePrice: 29,
        currency: "USD",
        requiresInstitutional: false,
        requiresNDA: false,
        minKycTier: "basic",
      },
      {
        productId: "prod_signal_pro",
        name: "Community Signals - Pro",
        description: "Real-time signals including smart money flow",
        productType: "signal_feed",
        dataCategories: [
          "community_conviction",
          "sentiment",
          "smart_money_flow",
          "cross_asset",
        ],
        assetClasses: ["crypto", "prediction", "rwa"],
        updateFrequency: "real_time",
        pricingModel: "subscription",
        basePrice: 99,
        currency: "USD",
        requiresInstitutional: false,
        requiresNDA: false,
        minKycTier: "verified",
      },

      // Predictive Model Products
      {
        productId: "prod_model_alpha",
        name: "Alpha Signal Model",
        description: "AI-powered trading signals with historical accuracy",
        productType: "predictive_model",
        dataCategories: ["alpha_signals", "cross_asset", "alternative_data"],
        assetClasses: ["crypto", "prediction"],
        updateFrequency: "hourly",
        pricingModel: "subscription",
        basePrice: 499,
        currency: "USD",
        requiresInstitutional: false,
        requiresNDA: true,
        minKycTier: "verified",
      },

      // Research Reports
      {
        productId: "prod_research_monthly",
        name: "Monthly Market Intelligence",
        description: "Comprehensive monthly market analysis and predictions",
        productType: "research_report",
        dataCategories: ["market_overview", "correlation_analysis", "sentiment"],
        assetClasses: ["crypto", "prediction", "rwa"],
        updateFrequency: "monthly",
        pricingModel: "subscription",
        basePrice: 199,
        currency: "USD",
        requiresInstitutional: false,
        requiresNDA: false,
        minKycTier: "basic",
      },

      // Data Export Products
      {
        productId: "prod_data_flow",
        name: "Anonymized Flow Data",
        description: "Daily anonymized trading flow data export",
        productType: "data_export",
        dataCategories: ["trading_flow", "volume", "direction"],
        assetClasses: ["crypto", "prediction"],
        updateFrequency: "daily",
        pricingModel: "subscription",
        basePrice: 999,
        currency: "USD",
        requiresInstitutional: true,
        requiresNDA: true,
        minKycTier: "institutional",
      },

      // API Access Products
      {
        productId: "prod_api_basic",
        name: "Data API - Basic",
        description: "REST API access to public signals and leaderboards",
        productType: "api_access",
        dataCategories: ["leaderboards", "public_signals"],
        assetClasses: ["crypto", "prediction", "rwa"],
        updateFrequency: "real_time",
        pricingModel: "tiered",
        basePrice: 49,
        currency: "USD",
        requiresInstitutional: false,
        requiresNDA: false,
        minKycTier: "basic",
      },
      {
        productId: "prod_api_institutional",
        name: "Data API - Institutional",
        description: "Full API access with high rate limits and raw data",
        productType: "api_access",
        dataCategories: [
          "all_signals",
          "flow_data",
          "correlations",
          "alternative_data",
        ],
        assetClasses: ["crypto", "prediction", "rwa"],
        updateFrequency: "real_time",
        pricingModel: "custom",
        basePrice: 5000,
        currency: "USD",
        requiresInstitutional: true,
        requiresNDA: true,
        minKycTier: "institutional",
      },
    ];
  }

  /**
   * Check if user can access a product
   */
  checkProductAccess(
    product: DataProduct,
    user: {
      kycTier: string;
      isInstitutional: boolean;
      hasSignedNDA: boolean;
    }
  ): { allowed: boolean; reason?: string } {
    const kycTierOrder = ["none", "basic", "verified", "premium", "institutional"];
    const userTierIndex = kycTierOrder.indexOf(user.kycTier);
    const requiredTierIndex = kycTierOrder.indexOf(product.minKycTier);

    if (userTierIndex < requiredTierIndex) {
      return {
        allowed: false,
        reason: `Requires ${product.minKycTier} KYC tier`,
      };
    }

    if (product.requiresInstitutional && !user.isInstitutional) {
      return {
        allowed: false,
        reason: "Institutional account required",
      };
    }

    if (product.requiresNDA && !user.hasSignedNDA) {
      return {
        allowed: false,
        reason: "NDA signature required",
      };
    }

    return { allowed: true };
  }
}

// ============================================================================
// Subscription Manager
// ============================================================================

export class SubscriptionManager {
  /**
   * Create a new subscription
   */
  createSubscription(
    subscriberId: string,
    subscriberType: DataSubscription["subscriberType"],
    productId: string,
    billingCycle: DataSubscription["billingCycle"],
    price: number
  ): DataSubscription {
    const now = Date.now();
    const periodLength = this.getBillingPeriodMs(billingCycle);

    return {
      subscriberId,
      subscriberType,
      productId,
      status: "trial",
      billingCycle,
      currentPeriodStart: now,
      currentPeriodEnd: now + periodLength,
      price,
      usageThisMonth: 0,
    };
  }

  /**
   * Check if subscription is active
   */
  isSubscriptionActive(subscription: DataSubscription): boolean {
    return (
      ["trial", "active"].includes(subscription.status) &&
      subscription.currentPeriodEnd > Date.now()
    );
  }

  /**
   * Check if usage is within limits
   */
  checkUsageLimits(
    subscription: DataSubscription,
    requestCount: number = 1
  ): { allowed: boolean; remaining?: number; reason?: string } {
    if (!this.isSubscriptionActive(subscription)) {
      return { allowed: false, reason: "Subscription not active" };
    }

    if (
      subscription.usageLimit &&
      subscription.usageThisMonth + requestCount > subscription.usageLimit
    ) {
      return {
        allowed: false,
        remaining: Math.max(0, subscription.usageLimit - subscription.usageThisMonth),
        reason: "Usage limit exceeded",
      };
    }

    return {
      allowed: true,
      remaining: subscription.usageLimit
        ? subscription.usageLimit - subscription.usageThisMonth - requestCount
        : undefined,
    };
  }

  /**
   * Record usage
   */
  recordUsage(subscription: DataSubscription, count: number = 1): DataSubscription {
    return {
      ...subscription,
      usageThisMonth: subscription.usageThisMonth + count,
      lastUsedAt: Date.now(),
    };
  }

  /**
   * Renew subscription for next period
   */
  renewSubscription(subscription: DataSubscription): DataSubscription {
    const periodLength = this.getBillingPeriodMs(subscription.billingCycle);

    return {
      ...subscription,
      status: "active",
      currentPeriodStart: subscription.currentPeriodEnd,
      currentPeriodEnd: subscription.currentPeriodEnd + periodLength,
      usageThisMonth: 0,
    };
  }

  /**
   * Calculate prorated amount for plan change
   */
  calculateProration(
    currentSubscription: DataSubscription,
    newPrice: number
  ): number {
    const now = Date.now();
    const periodLength = this.getBillingPeriodMs(currentSubscription.billingCycle);
    const timeRemaining = currentSubscription.currentPeriodEnd - now;
    const remainingRatio = Math.max(0, timeRemaining / periodLength);

    // Credit for unused current period
    const credit = currentSubscription.price * remainingRatio;

    // Charge for new plan's remaining period
    const charge = newPrice * remainingRatio;

    return charge - credit;
  }

  /**
   * Get billing period in milliseconds
   */
  private getBillingPeriodMs(
    billingCycle: DataSubscription["billingCycle"]
  ): number {
    switch (billingCycle) {
      case "monthly":
        return 30 * 24 * 60 * 60 * 1000;
      case "quarterly":
        return 90 * 24 * 60 * 60 * 1000;
      case "annual":
        return 365 * 24 * 60 * 60 * 1000;
    }
  }
}

// ============================================================================
// Revenue Share Calculator
// ============================================================================

export class RevenueShareCalculator {
  private readonly platformCut: number = 0.3; // 30% platform
  private readonly dataProviderCut: number = 0.7; // 70% to data providers

  /**
   * Calculate revenue share for data providers
   */
  calculateRevenueShare(
    totalRevenue: number,
    dataProviders: Array<{
      userId: string;
      contributionScore: number; // 0-100
      dataTypes: string[];
    }>
  ): Array<{
    userId: string;
    share: number;
    amount: number;
  }> {
    const providerPool = totalRevenue * this.dataProviderCut;

    // Calculate total contribution score
    const totalScore = dataProviders.reduce(
      (sum, p) => sum + p.contributionScore,
      0
    );

    if (totalScore === 0) {
      return [];
    }

    // Distribute proportionally
    return dataProviders.map((provider) => ({
      userId: provider.userId,
      share: provider.contributionScore / totalScore,
      amount: (provider.contributionScore / totalScore) * providerPool,
    }));
  }

  /**
   * Calculate contribution score for a user
   */
  calculateContributionScore(metrics: {
    tradingVolumeContributed: number;
    signalContributions: number;
    dataQualityScore: number;
    activeMonths: number;
    alphaScore?: number;
  }): number {
    // Weight each factor
    const volumeScore = Math.min(metrics.tradingVolumeContributed / 100000, 1) * 20;
    const signalScore = Math.min(metrics.signalContributions / 100, 1) * 25;
    const qualityScore = metrics.dataQualityScore * 25;
    const tenureScore = Math.min(metrics.activeMonths / 12, 1) * 15;
    const alphaBonus = metrics.alphaScore ? metrics.alphaScore * 0.15 : 0;

    return volumeScore + signalScore + qualityScore + tenureScore + alphaBonus;
  }
}

// ============================================================================
// Research Report Generator
// ============================================================================

export class ResearchReportGenerator {
  /**
   * Generate a market overview report
   */
  generateMarketOverview(input: {
    assetClasses: string[];
    windowDays: number;
    marketData: Record<string, { price: number; change: number }>;
    sentimentData: Record<string, { score: number; direction: string }>;
    correlationHighlights: Array<{ asset1: string; asset2: string; correlation: number }>;
  }): Omit<ResearchReport, "reportId"> {
    const sections = [
      {
        title: "Executive Summary",
        content: this.generateExecutiveSummary(input),
        charts: [],
      },
      {
        title: "Market Performance",
        content: this.generateMarketPerformanceSection(input.marketData),
        charts: ["market_performance_chart"],
      },
      {
        title: "Sentiment Analysis",
        content: this.generateSentimentSection(input.sentimentData),
        charts: ["sentiment_heatmap"],
      },
      {
        title: "Correlation Analysis",
        content: this.generateCorrelationSection(input.correlationHighlights),
        charts: ["correlation_matrix"],
      },
    ];

    const keyFindings = [
      ...this.extractKeyFindings(input.marketData, input.sentimentData),
    ];

    return {
      title: `Market Overview - ${new Date().toLocaleDateString()}`,
      summary: this.generateReportSummary(keyFindings),
      reportType: "market_overview",
      assetClasses: input.assetClasses,
      price: 0,
      currency: "USD",
      accessLevel: "subscribers",
      sections,
      timeframeDays: input.windowDays,
      symbols: Object.keys(input.marketData),
      keyFindings,
    };
  }

  private generateExecutiveSummary(input: {
    marketData: Record<string, { price: number; change: number }>;
    sentimentData: Record<string, { score: number; direction: string }>;
  }): string {
    const avgChange =
      Object.values(input.marketData).reduce((sum, d) => sum + d.change, 0) /
      Object.keys(input.marketData).length;

    const avgSentiment =
      Object.values(input.sentimentData).reduce((sum, d) => sum + d.score, 0) /
      Object.keys(input.sentimentData).length;

    const marketDirection = avgChange > 0 ? "positive" : "negative";
    const sentimentDirection = avgSentiment > 0 ? "bullish" : "bearish";

    return `
Markets showed ${marketDirection} momentum with an average change of ${avgChange.toFixed(2)}%.
Community sentiment remains ${sentimentDirection} with an aggregate score of ${avgSentiment.toFixed(2)}.
    `.trim();
  }

  private generateMarketPerformanceSection(
    marketData: Record<string, { price: number; change: number }>
  ): string {
    const sorted = Object.entries(marketData).sort(
      (a, b) => b[1].change - a[1].change
    );

    const topPerformers = sorted.slice(0, 3);
    const worstPerformers = sorted.slice(-3).reverse();

    return `
**Top Performers:**
${topPerformers.map(([symbol, data]) => `- ${symbol}: ${data.change > 0 ? "+" : ""}${data.change.toFixed(2)}%`).join("\n")}

**Worst Performers:**
${worstPerformers.map(([symbol, data]) => `- ${symbol}: ${data.change > 0 ? "+" : ""}${data.change.toFixed(2)}%`).join("\n")}
    `.trim();
  }

  private generateSentimentSection(
    sentimentData: Record<string, { score: number; direction: string }>
  ): string {
    const bullish = Object.entries(sentimentData).filter(
      ([, d]) => d.direction === "bullish"
    );
    const bearish = Object.entries(sentimentData).filter(
      ([, d]) => d.direction === "bearish"
    );

    return `
**Bullish Consensus (${bullish.length} assets):**
${bullish.slice(0, 5).map(([symbol, data]) => `- ${symbol}: ${(data.score * 100).toFixed(0)}% conviction`).join("\n")}

**Bearish Consensus (${bearish.length} assets):**
${bearish.slice(0, 5).map(([symbol, data]) => `- ${symbol}: ${(Math.abs(data.score) * 100).toFixed(0)}% conviction`).join("\n")}
    `.trim();
  }

  private generateCorrelationSection(
    correlations: Array<{ asset1: string; asset2: string; correlation: number }>
  ): string {
    const strong = correlations.filter((c) => Math.abs(c.correlation) > 0.7);

    return `
**Strong Correlations:**
${strong.map((c) => `- ${c.asset1} ↔ ${c.asset2}: ${(c.correlation * 100).toFixed(0)}% correlation`).join("\n") || "No strong correlations detected in this period."}
    `.trim();
  }

  private generateReportSummary(keyFindings: string[]): string {
    return keyFindings.slice(0, 3).join(" ");
  }

  private extractKeyFindings(
    marketData: Record<string, { price: number; change: number }>,
    sentimentData: Record<string, { score: number; direction: string }>
  ): string[] {
    const findings: string[] = [];

    // Find biggest mover
    const sorted = Object.entries(marketData).sort(
      (a, b) => Math.abs(b[1].change) - Math.abs(a[1].change)
    );
    if (sorted.length > 0) {
      const [symbol, data] = sorted[0];
      findings.push(
        `${symbol} was the biggest mover with a ${data.change > 0 ? "+" : ""}${data.change.toFixed(2)}% change.`
      );
    }

    // Sentiment divergence
    const sentimentSorted = Object.entries(sentimentData).sort(
      (a, b) => Math.abs(b[1].score) - Math.abs(a[1].score)
    );
    if (sentimentSorted.length > 0) {
      const [symbol, data] = sentimentSorted[0];
      findings.push(
        `${symbol} shows strongest ${data.direction} sentiment at ${(data.score * 100).toFixed(0)}%.`
      );
    }

    return findings;
  }
}

// ============================================================================
// Signal Delivery Service
// ============================================================================

export class SignalDeliveryService {
  /**
   * Filter signals for a subscription
   */
  filterSignalsForSubscription(
    signals: AnonymizedSignal[],
    subscription: DataSubscription,
    product: DataProduct
  ): AnonymizedSignal[] {
    return signals.filter((signal) => {
      // Check asset class
      if (
        product.assetClasses.length > 0 &&
        !product.assetClasses.includes(signal.assetClass)
      ) {
        return false;
      }

      // Check signal type
      if (
        product.dataCategories.length > 0 &&
        !product.dataCategories.includes(signal.signalType)
      ) {
        return false;
      }

      return true;
    });
  }

  /**
   * Format signals for delivery
   */
  formatSignalsForDelivery(
    signals: AnonymizedSignal[],
    format: "json" | "csv" | "webhook"
  ): string | object {
    switch (format) {
      case "json":
        return signals;

      case "csv":
        const headers = [
          "signalId",
          "signalType",
          "assetClass",
          "symbol",
          "direction",
          "strength",
          "confidence",
        ];
        const rows = signals.map((s) =>
          [
            s.signalId,
            s.signalType,
            s.assetClass,
            s.symbol,
            s.direction,
            s.strength,
            s.confidence,
          ].join(",")
        );
        return [headers.join(","), ...rows].join("\n");

      case "webhook":
        return {
          event: "new_signals",
          timestamp: new Date().toISOString(),
          count: signals.length,
          signals: signals.map((s) => ({
            id: s.signalId,
            type: s.signalType,
            asset: `${s.assetClass}:${s.symbol}`,
            direction: s.direction,
            confidence: s.confidence,
          })),
        };
    }
  }

  /**
   * Create API key for subscription
   */
  generateApiKey(subscriptionId: string): string {
    const key = `pull_${crypto.randomUUID().replace(/-/g, "")}`;
    // In production, store hash in database
    return key;
  }

  /**
   * Validate API key
   */
  validateApiKey(apiKey: string): { valid: boolean; subscriptionId?: string } {
    // In production, check against stored hashes
    if (apiKey.startsWith("pull_") && apiKey.length === 37) {
      return { valid: true, subscriptionId: "sub_..." };
    }
    return { valid: false };
  }
}

// ============================================================================
// Export instances
// ============================================================================

export const dataProductManager = new DataProductManager();
export const subscriptionManager = new SubscriptionManager();
export const revenueShareCalculator = new RevenueShareCalculator();
export const researchReportGenerator = new ResearchReportGenerator();
export const signalDeliveryService = new SignalDeliveryService();
