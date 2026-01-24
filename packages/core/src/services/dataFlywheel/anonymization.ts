/**
 * Data Anonymization Service
 *
 * Provides utilities for:
 * - User identity anonymization
 * - Data aggregation and generalization
 * - Differential privacy
 * - K-anonymity enforcement
 * - Data masking and pseudonymization
 */

import * as crypto from "crypto";

// ============================================================================
// Hashing and Pseudonymization
// ============================================================================

export class PseudonymizationService {
  private salt: string;

  constructor(salt?: string) {
    this.salt = salt || process.env.ANONYMIZATION_SALT || "default-salt-change-me";
  }

  /**
   * Create a one-way hash of an identifier
   */
  hashIdentifier(identifier: string): string {
    return crypto
      .createHash("sha256")
      .update(identifier + this.salt)
      .digest("hex")
      .slice(0, 16); // Truncate for shorter IDs
  }

  /**
   * Create a deterministic pseudonym that preserves relationships
   */
  createPseudonym(userId: string, context: string): string {
    const hash = crypto
      .createHash("sha256")
      .update(`${userId}:${context}:${this.salt}`)
      .digest("hex");

    // Create a readable pseudonym format
    return `anon_${hash.slice(0, 12)}`;
  }

  /**
   * Create a rotating pseudonym (changes over time)
   */
  createRotatingPseudonym(
    userId: string,
    rotationPeriodMs: number = 24 * 60 * 60 * 1000
  ): string {
    const period = Math.floor(Date.now() / rotationPeriodMs);
    return this.createPseudonym(userId, period.toString());
  }

  /**
   * Anonymize email address while preserving domain info
   */
  anonymizeEmail(email: string): string {
    const [local, domain] = email.split("@");
    const hashedLocal = this.hashIdentifier(local).slice(0, 8);
    return `${hashedLocal}@${domain}`;
  }

  /**
   * Anonymize IP address to /24 network
   */
  anonymizeIP(ip: string): string {
    const parts = ip.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    }
    // IPv6 - truncate last 64 bits
    return ip.replace(/:[\da-f]+:[\da-f]+:[\da-f]+:[\da-f]+$/i, "::");
  }
}

// ============================================================================
// Data Generalization
// ============================================================================

export class DataGeneralizer {
  /**
   * Generalize a numeric value to a range
   */
  generalizeNumericToRange(
    value: number,
    buckets: number[]
  ): string {
    const sortedBuckets = [...buckets].sort((a, b) => a - b);

    for (let i = 0; i < sortedBuckets.length; i++) {
      if (value < sortedBuckets[i]) {
        if (i === 0) {
          return `<${sortedBuckets[0]}`;
        }
        return `${sortedBuckets[i - 1]}-${sortedBuckets[i]}`;
      }
    }

    return `>${sortedBuckets[sortedBuckets.length - 1]}`;
  }

  /**
   * Generalize timestamp to period
   */
  generalizeTimestamp(
    timestamp: number,
    granularity: "hour" | "day" | "week" | "month" | "quarter" | "year"
  ): number {
    const date = new Date(timestamp);

    switch (granularity) {
      case "hour":
        date.setMinutes(0, 0, 0);
        break;
      case "day":
        date.setHours(0, 0, 0, 0);
        break;
      case "week":
        const dayOfWeek = date.getDay();
        date.setDate(date.getDate() - dayOfWeek);
        date.setHours(0, 0, 0, 0);
        break;
      case "month":
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
        break;
      case "quarter":
        const quarter = Math.floor(date.getMonth() / 3);
        date.setMonth(quarter * 3, 1);
        date.setHours(0, 0, 0, 0);
        break;
      case "year":
        date.setMonth(0, 1);
        date.setHours(0, 0, 0, 0);
        break;
    }

    return date.getTime();
  }

  /**
   * Generalize location to region
   */
  generalizeLocation(
    country: string,
    state?: string,
    city?: string,
    level: "country" | "region" | "state"
  ): { country: string; region?: string } {
    switch (level) {
      case "country":
        return { country };
      case "region":
        // Map countries to regions
        const regionMap: Record<string, string> = {
          US: "North America",
          CA: "North America",
          MX: "North America",
          UK: "Europe",
          DE: "Europe",
          FR: "Europe",
          JP: "Asia Pacific",
          CN: "Asia Pacific",
          AU: "Asia Pacific",
        };
        return {
          country: "Redacted",
          region: regionMap[country] || "Other",
        };
      case "state":
        return { country, region: state };
      default:
        return { country };
    }
  }

  /**
   * Generalize age to bracket
   */
  generalizeAge(age: number): string {
    if (age < 18) return "under_18";
    if (age < 25) return "18-24";
    if (age < 35) return "25-34";
    if (age < 45) return "35-44";
    if (age < 55) return "45-54";
    if (age < 65) return "55-64";
    return "65+";
  }

  /**
   * Generalize trading volume to tier
   */
  generalizeVolume(volume: number): string {
    if (volume < 1000) return "retail_small";
    if (volume < 10000) return "retail_medium";
    if (volume < 100000) return "retail_large";
    if (volume < 1000000) return "professional";
    return "institutional";
  }
}

// ============================================================================
// K-Anonymity Enforcement
// ============================================================================

export class KAnonymityEnforcer {
  private k: number;

  constructor(k: number = 5) {
    this.k = k;
  }

  /**
   * Check if a dataset meets k-anonymity requirements
   */
  checkKAnonymity<T extends Record<string, unknown>>(
    records: T[],
    quasiIdentifiers: (keyof T)[]
  ): { isKAnonymous: boolean; violations: Array<{ group: string; count: number }> } {
    // Group records by quasi-identifiers
    const groups = new Map<string, number>();

    for (const record of records) {
      const groupKey = quasiIdentifiers
        .map((qi) => String(record[qi]))
        .join("|");

      groups.set(groupKey, (groups.get(groupKey) || 0) + 1);
    }

    // Find violations (groups with fewer than k records)
    const violations: Array<{ group: string; count: number }> = [];

    for (const [group, count] of groups) {
      if (count < this.k) {
        violations.push({ group, count });
      }
    }

    return {
      isKAnonymous: violations.length === 0,
      violations,
    };
  }

  /**
   * Suppress records that violate k-anonymity
   */
  enforceKAnonymity<T extends Record<string, unknown>>(
    records: T[],
    quasiIdentifiers: (keyof T)[]
  ): T[] {
    // Group records
    const groups = new Map<string, T[]>();

    for (const record of records) {
      const groupKey = quasiIdentifiers
        .map((qi) => String(record[qi]))
        .join("|");

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(record);
    }

    // Filter out groups with fewer than k records
    const result: T[] = [];
    for (const groupRecords of groups.values()) {
      if (groupRecords.length >= this.k) {
        result.push(...groupRecords);
      }
    }

    return result;
  }

  /**
   * Apply generalization to meet k-anonymity
   */
  generalizeToKAnonymity<T extends Record<string, unknown>>(
    records: T[],
    quasiIdentifiers: (keyof T)[],
    generalizers: Partial<Record<keyof T, (value: unknown) => unknown>>
  ): T[] {
    // Apply generalizers
    const generalizedRecords = records.map((record) => {
      const generalized = { ...record };

      for (const [field, generalizer] of Object.entries(generalizers)) {
        if (generalizer && field in record) {
          (generalized as Record<string, unknown>)[field] = generalizer(record[field as keyof T]);
        }
      }

      return generalized;
    });

    // Check k-anonymity and suppress if needed
    return this.enforceKAnonymity(generalizedRecords, quasiIdentifiers);
  }
}

// ============================================================================
// Differential Privacy
// ============================================================================

export class DifferentialPrivacyEngine {
  private epsilon: number;

  constructor(epsilon: number = 1.0) {
    this.epsilon = epsilon;
  }

  /**
   * Add Laplace noise for differential privacy
   */
  addLaplaceNoise(value: number, sensitivity: number): number {
    const scale = sensitivity / this.epsilon;
    const u = Math.random() - 0.5;
    const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
    return value + noise;
  }

  /**
   * Add noise to a count query
   */
  privateCount(count: number): number {
    // For counting queries, sensitivity is 1
    return Math.max(0, Math.round(this.addLaplaceNoise(count, 1)));
  }

  /**
   * Add noise to a sum query
   */
  privateSum(sum: number, maxContribution: number): number {
    return this.addLaplaceNoise(sum, maxContribution);
  }

  /**
   * Add noise to an average query
   */
  privateAverage(sum: number, count: number, maxContribution: number): number {
    // Add noise to both sum and count
    const privateSum = this.addLaplaceNoise(sum, maxContribution);
    const privateCount = Math.max(1, this.privateCount(count));
    return privateSum / privateCount;
  }

  /**
   * Private histogram
   */
  privateHistogram(
    values: number[],
    buckets: number[]
  ): Array<{ bucket: string; count: number }> {
    // Create histogram
    const counts = new Map<number, number>();
    for (const bucket of buckets) {
      counts.set(bucket, 0);
    }

    for (const value of values) {
      const bucket = buckets.find((b) => value < b) || buckets[buckets.length - 1];
      counts.set(bucket, (counts.get(bucket) || 0) + 1);
    }

    // Add noise to each bucket
    return Array.from(counts.entries()).map(([bucket, count]) => ({
      bucket: bucket.toString(),
      count: this.privateCount(count),
    }));
  }
}

// ============================================================================
// Aggregate Data Generator
// ============================================================================

export class AggregateDataGenerator {
  private pseudonymizer: PseudonymizationService;
  private generalizer: DataGeneralizer;
  private kAnonymity: KAnonymityEnforcer;
  private differentialPrivacy: DifferentialPrivacyEngine;

  constructor(options?: {
    salt?: string;
    k?: number;
    epsilon?: number;
  }) {
    this.pseudonymizer = new PseudonymizationService(options?.salt);
    this.generalizer = new DataGeneralizer();
    this.kAnonymity = new KAnonymityEnforcer(options?.k);
    this.differentialPrivacy = new DifferentialPrivacyEngine(options?.epsilon);
  }

  /**
   * Generate anonymized trading flow data
   */
  generateAnonymizedTradingFlow(
    trades: Array<{
      userId: string;
      assetClass: string;
      symbol: string;
      side: string;
      volume: number;
      timestamp: number;
    }>
  ): Array<{
    assetClass: string;
    symbol: string;
    period: number;
    buyVolume: number;
    sellVolume: number;
    uniqueTraders: number;
    netFlow: number;
  }> {
    // Group by asset and day
    const byAssetDay = new Map<
      string,
      {
        assetClass: string;
        symbol: string;
        period: number;
        buyVolume: number;
        sellVolume: number;
        traders: Set<string>;
      }
    >();

    for (const trade of trades) {
      const period = this.generalizer.generalizeTimestamp(trade.timestamp, "day");
      const key = `${trade.assetClass}:${trade.symbol}:${period}`;

      if (!byAssetDay.has(key)) {
        byAssetDay.set(key, {
          assetClass: trade.assetClass,
          symbol: trade.symbol,
          period,
          buyVolume: 0,
          sellVolume: 0,
          traders: new Set(),
        });
      }

      const agg = byAssetDay.get(key)!;
      if (trade.side === "buy") {
        agg.buyVolume += trade.volume;
      } else {
        agg.sellVolume += trade.volume;
      }
      agg.traders.add(this.pseudonymizer.hashIdentifier(trade.userId));
    }

    // Apply differential privacy and return
    return Array.from(byAssetDay.values())
      .filter((agg) => agg.traders.size >= 5) // Minimum threshold
      .map((agg) => ({
        assetClass: agg.assetClass,
        symbol: agg.symbol,
        period: agg.period,
        buyVolume: this.differentialPrivacy.privateSum(agg.buyVolume, 10000),
        sellVolume: this.differentialPrivacy.privateSum(agg.sellVolume, 10000),
        uniqueTraders: this.differentialPrivacy.privateCount(agg.traders.size),
        netFlow: this.differentialPrivacy.privateSum(
          agg.buyVolume - agg.sellVolume,
          10000
        ),
      }));
  }

  /**
   * Generate anonymized sentiment data
   */
  generateAnonymizedSentiment(
    sentimentData: Array<{
      userId: string;
      assetClass: string;
      symbol: string;
      sentiment: number;
      timestamp: number;
    }>
  ): Array<{
    assetClass: string;
    symbol: string;
    period: number;
    avgSentiment: number;
    participantCount: number;
    sentimentDistribution: { bearish: number; neutral: number; bullish: number };
  }> {
    // Group by asset and day
    const byAssetDay = new Map<
      string,
      {
        assetClass: string;
        symbol: string;
        period: number;
        sentiments: number[];
        users: Set<string>;
      }
    >();

    for (const data of sentimentData) {
      const period = this.generalizer.generalizeTimestamp(data.timestamp, "day");
      const key = `${data.assetClass}:${data.symbol}:${period}`;

      if (!byAssetDay.has(key)) {
        byAssetDay.set(key, {
          assetClass: data.assetClass,
          symbol: data.symbol,
          period,
          sentiments: [],
          users: new Set(),
        });
      }

      const agg = byAssetDay.get(key)!;
      agg.sentiments.push(data.sentiment);
      agg.users.add(this.pseudonymizer.hashIdentifier(data.userId));
    }

    return Array.from(byAssetDay.values())
      .filter((agg) => agg.users.size >= 5)
      .map((agg) => {
        const avgSentiment =
          agg.sentiments.reduce((a, b) => a + b, 0) / agg.sentiments.length;

        // Calculate distribution
        const bearish = agg.sentiments.filter((s) => s < -0.2).length;
        const bullish = agg.sentiments.filter((s) => s > 0.2).length;
        const neutral = agg.sentiments.length - bearish - bullish;

        return {
          assetClass: agg.assetClass,
          symbol: agg.symbol,
          period: agg.period,
          avgSentiment: this.differentialPrivacy.privateAverage(
            avgSentiment * agg.sentiments.length,
            agg.sentiments.length,
            1
          ),
          participantCount: this.differentialPrivacy.privateCount(agg.users.size),
          sentimentDistribution: {
            bearish: this.differentialPrivacy.privateCount(bearish),
            neutral: this.differentialPrivacy.privateCount(neutral),
            bullish: this.differentialPrivacy.privateCount(bullish),
          },
        };
      });
  }

  /**
   * Generate anonymized user cohort data
   */
  generateCohortAnalysis(
    users: Array<{
      userId: string;
      signupDate: number;
      country: string;
      age?: number;
      volume: number;
      pnl: number;
    }>
  ): Array<{
    cohort: string;
    volumeTier: string;
    region: string;
    userCount: number;
    avgPnL: number;
    totalVolume: number;
  }> {
    // Generalize data
    const generalizedUsers = users.map((user) => ({
      cohort: new Date(
        this.generalizer.generalizeTimestamp(user.signupDate, "month")
      ).toISOString().slice(0, 7),
      volumeTier: this.generalizer.generalizeVolume(user.volume),
      region: this.generalizer.generalizeLocation(user.country, undefined, undefined, "region")
        .region || "Other",
      volume: user.volume,
      pnl: user.pnl,
    }));

    // Group and aggregate
    const cohorts = new Map<
      string,
      { count: number; totalPnL: number; totalVolume: number }
    >();

    for (const user of generalizedUsers) {
      const key = `${user.cohort}:${user.volumeTier}:${user.region}`;

      if (!cohorts.has(key)) {
        cohorts.set(key, { count: 0, totalPnL: 0, totalVolume: 0 });
      }

      const cohort = cohorts.get(key)!;
      cohort.count++;
      cohort.totalPnL += user.pnl;
      cohort.totalVolume += user.volume;
    }

    // Apply privacy and minimum thresholds
    return Array.from(cohorts.entries())
      .filter(([, stats]) => stats.count >= 10)
      .map(([key, stats]) => {
        const [cohort, volumeTier, region] = key.split(":");
        return {
          cohort,
          volumeTier,
          region,
          userCount: this.differentialPrivacy.privateCount(stats.count),
          avgPnL: this.differentialPrivacy.privateAverage(
            stats.totalPnL,
            stats.count,
            1000
          ),
          totalVolume: this.differentialPrivacy.privateSum(stats.totalVolume, 100000),
        };
      });
  }
}

// ============================================================================
// Data Export Sanitizer
// ============================================================================

export class DataExportSanitizer {
  private pseudonymizer: PseudonymizationService;

  constructor(salt?: string) {
    this.pseudonymizer = new PseudonymizationService(salt);
  }

  /**
   * Sanitize data for export
   */
  sanitizeForExport<T extends Record<string, unknown>>(
    records: T[],
    config: {
      removeFields: string[];
      hashFields: string[];
      generalizeFields: Record<string, (value: unknown) => unknown>;
    }
  ): Array<Omit<T, string>> {
    return records.map((record) => {
      const sanitized: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(record)) {
        // Skip removed fields
        if (config.removeFields.includes(key)) continue;

        // Hash specified fields
        if (config.hashFields.includes(key)) {
          sanitized[key] = this.pseudonymizer.hashIdentifier(String(value));
          continue;
        }

        // Apply generalizer if specified
        if (key in config.generalizeFields) {
          sanitized[key] = config.generalizeFields[key](value);
          continue;
        }

        // Keep as-is
        sanitized[key] = value;
      }

      return sanitized as Omit<T, string>;
    });
  }

  /**
   * Create a data export manifest
   */
  createExportManifest(
    exportId: string,
    recordCount: number,
    fieldsIncluded: string[],
    anonymizationMethods: string[]
  ): {
    exportId: string;
    timestamp: number;
    recordCount: number;
    fieldsIncluded: string[];
    anonymizationMethods: string[];
    privacyLevel: "low" | "medium" | "high";
    complianceNotes: string[];
  } {
    const complianceNotes: string[] = [];

    if (anonymizationMethods.includes("differential_privacy")) {
      complianceNotes.push("Differential privacy applied with epsilon parameter");
    }
    if (anonymizationMethods.includes("k_anonymity")) {
      complianceNotes.push("K-anonymity enforced on quasi-identifiers");
    }
    if (anonymizationMethods.includes("pseudonymization")) {
      complianceNotes.push("User identifiers have been pseudonymized");
    }

    const privacyLevel =
      anonymizationMethods.length >= 3
        ? "high"
        : anonymizationMethods.length >= 1
        ? "medium"
        : "low";

    return {
      exportId,
      timestamp: Date.now(),
      recordCount,
      fieldsIncluded,
      anonymizationMethods,
      privacyLevel,
      complianceNotes,
    };
  }
}

// ============================================================================
// Export instances
// ============================================================================

export const pseudonymizationService = new PseudonymizationService();
export const dataGeneralizer = new DataGeneralizer();
export const kAnonymityEnforcer = new KAnonymityEnforcer();
export const differentialPrivacyEngine = new DifferentialPrivacyEngine();
export const aggregateDataGenerator = new AggregateDataGenerator();
export const dataExportSanitizer = new DataExportSanitizer();
