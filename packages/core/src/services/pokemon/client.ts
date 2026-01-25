/**
 * Pokemon Price Client
 * Client for Pokemon card pricing and data
 */

import type {
  Card,
  Set,
  Pricing,
  GradedPricing,
  PriceHistory,
  PriceHistoryRange,
  SearchCardsParams,
  SearchResponse,
  ParsedTitle,
  CachedPrice,
  CacheConfig,
} from "./types";
import { PokemonPriceApiError, PRICE_ERRORS } from "./types";

// ============================================================================
// Configuration
// ============================================================================

export interface PokemonPriceClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  cacheConfig?: CacheConfig;
  logger?: Logger;
}

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const DEFAULT_BASE_URL = "https://api.pokemontcg.io/v2";
const DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const DEFAULT_CACHE_SIZE = 1000;

// ============================================================================
// Pokemon Price Client
// ============================================================================

export class PokemonPriceClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly logger: Logger;
  private readonly cache: Map<string, CachedPrice>;
  private readonly cacheConfig: CacheConfig;
  private lastRequestTime: number = 0;
  private readonly minRequestInterval: number = 100; // 100ms between requests

  constructor(config: PokemonPriceClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeout = config.timeout ?? 30000;
    this.maxRetries = config.maxRetries ?? 3;
    this.logger = config.logger ?? this.createDefaultLogger();
    this.cache = new Map();
    this.cacheConfig = config.cacheConfig ?? {
      ttlMs: DEFAULT_CACHE_TTL,
      maxSize: DEFAULT_CACHE_SIZE,
    };
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[Pokemon] ${msg}`, meta),
      info: (msg, meta) => console.info(`[Pokemon] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[Pokemon] ${msg}`, meta),
      error: (msg, meta) => console.error(`[Pokemon] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // HTTP Methods with Rate Limiting
  // ==========================================================================

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isRetryableStatus(status: number): boolean {
    return status === 429 || (status >= 500 && status < 600);
  }

  private async request<T>(path: string, params?: Record<string, string>): Promise<T> {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest)
      );
    }
    this.lastRequestTime = Date.now();

    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    const headers: Record<string, string> = {
      "X-Api-Key": this.apiKey,
      Accept: "application/json",
    };

    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const baseDelay = attempt === 1 ? 1000 : attempt === 2 ? 2000 : 4000;
        const delay = lastError instanceof PokemonPriceApiError && lastError.statusCode === 429
          ? baseDelay * 3
          : baseDelay;
        this.logger.warn(`Retrying request (attempt ${attempt + 1})`, { path });
        await this.sleep(delay);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(url.toString(), {
          method: "GET",
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 429) {
          const rateLimitError = new PokemonPriceApiError(
            "Rate limit exceeded",
            PRICE_ERRORS.RATE_LIMITED,
            429
          );
          if (attempt < this.maxRetries) {
            lastError = rateLimitError;
            continue;
          }
          throw rateLimitError;
        }

        if (!response.ok) {
          const apiError = new PokemonPriceApiError(
            `HTTP ${response.status}`,
            PRICE_ERRORS.API_ERROR,
            response.status
          );
          if (this.isRetryableStatus(response.status) && attempt < this.maxRetries) {
            lastError = apiError;
            continue;
          }
          throw apiError;
        }

        return await response.json();
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof PokemonPriceApiError) {
          if (this.isRetryableStatus(error.statusCode) && attempt < this.maxRetries) {
            lastError = error;
            continue;
          }
          this.logger.error("Pokemon API error", {
            code: error.code,
            message: error.message,
          });
          throw error;
        }

        if (error instanceof Error) {
          if (error.name === "AbortError") {
            const timeoutError = new PokemonPriceApiError(
              "Request timeout",
              PRICE_ERRORS.API_ERROR,
              408
            );
            if (attempt < this.maxRetries) {
              lastError = timeoutError;
              continue;
            }
            throw timeoutError;
          }
          // Network errors are retryable
          if (attempt < this.maxRetries) {
            lastError = error;
            continue;
          }
          throw new PokemonPriceApiError(
            error.message,
            PRICE_ERRORS.API_ERROR,
            500
          );
        }

        throw error;
      }
    }

    throw lastError;
  }

  // ==========================================================================
  // Card Methods
  // ==========================================================================

  /**
   * Get card by ID
   */
  async getCard(cardId: string): Promise<Card> {
    this.logger.debug("Getting card", { cardId });

    const response = await this.request<{ data: Card }>(`/cards/${cardId}`);

    if (!response.data) {
      throw new PokemonPriceApiError(
        `Card ${cardId} not found`,
        PRICE_ERRORS.CARD_NOT_FOUND,
        404
      );
    }

    return response.data;
  }

  /**
   * Search cards with filters
   */
  async searchCards(params?: SearchCardsParams): Promise<SearchResponse<Card>> {
    this.logger.debug("Searching cards", params);

    const queryParams: Record<string, string> = {};

    if (params?.q) {
      queryParams.q = params.q;
    }

    // Build query string from specific filters
    const filters: string[] = [];
    if (params?.name) filters.push(`name:"${params.name}"`);
    if (params?.setId) filters.push(`set.id:${params.setId}`);
    if (params?.setName) filters.push(`set.name:"${params.setName}"`);
    if (params?.types) filters.push(`types:${params.types.join(",")}`);
    if (params?.subtypes) filters.push(`subtypes:${params.subtypes.join(",")}`);
    if (params?.supertype) filters.push(`supertype:${params.supertype}`);
    if (params?.rarity) filters.push(`rarity:"${params.rarity.join("|")}"`);
    if (params?.hp) filters.push(`hp:${params.hp}`);
    if (params?.pokedexNumber) filters.push(`nationalPokedexNumbers:${params.pokedexNumber}`);
    if (params?.artist) filters.push(`artist:"${params.artist}"`);

    if (filters.length > 0) {
      queryParams.q = [...(params?.q ? [params.q] : []), ...filters].join(" ");
    }

    if (params?.page) queryParams.page = params.page.toString();
    if (params?.pageSize) queryParams.pageSize = params.pageSize.toString();
    if (params?.orderBy) queryParams.orderBy = params.orderBy;

    const response = await this.request<{
      data: Card[];
      page: number;
      pageSize: number;
      count: number;
      totalCount: number;
    }>("/cards", queryParams);

    return response;
  }

  /**
   * Get all cards in a set
   */
  async getCardsBySet(setId: string): Promise<Card[]> {
    this.logger.debug("Getting cards by set", { setId });

    const allCards: Card[] = [];
    let page = 1;
    const pageSize = 250;
    const MAX_PAGES = 100; // Safety limit to prevent infinite loops

    while (page <= MAX_PAGES) {
      const response = await this.searchCards({
        setId,
        page,
        pageSize,
      });

      allCards.push(...response.data);

      if (allCards.length >= response.totalCount || response.data.length === 0) {
        break;
      }

      page++;
    }

    if (page > MAX_PAGES) {
      this.logger.warn("Reached maximum page limit for set", { setId, totalCards: allCards.length });
    }

    return allCards;
  }

  // ==========================================================================
  // Set Methods
  // ==========================================================================

  /**
   * List all sets
   */
  async listSets(): Promise<Set[]> {
    this.logger.debug("Listing sets");

    const response = await this.request<{ data: Set[] }>("/sets");
    return response.data;
  }

  /**
   * Get set by ID
   */
  async getSet(setId: string): Promise<Set> {
    this.logger.debug("Getting set", { setId });

    const response = await this.request<{ data: Set }>(`/sets/${setId}`);

    if (!response.data) {
      throw new PokemonPriceApiError(
        `Set ${setId} not found`,
        PRICE_ERRORS.SET_NOT_FOUND,
        404
      );
    }

    return response.data;
  }

  // ==========================================================================
  // Pricing Methods
  // ==========================================================================

  /**
   * Get detailed pricing for a card
   */
  async getPricing(cardId: string, includeGraded: boolean = false): Promise<Pricing> {
    this.logger.debug("Getting pricing", { cardId, includeGraded });

    // Check cache
    const cacheKey = `pricing:${cardId}:${includeGraded}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.logger.debug("Cache hit", { cardId });
      return cached.pricing;
    }

    // Fetch card data
    const card = await this.getCard(cardId);

    // Extract TCGPlayer pricing
    const tcgPrices = card.tcgplayer?.prices;
    const mainPrice = tcgPrices?.holofoil ?? tcgPrices?.normal ?? tcgPrices?.reverseHolofoil;

    // For graded prices, we would integrate with eBay API or similar
    // This is a placeholder that would need real implementation
    let gradedPrices: GradedPricing | undefined;
    if (includeGraded) {
      gradedPrices = await this.fetchGradedPrices(card);
    }

    const pricing: Pricing = {
      cardId: card.id,
      cardName: card.name,
      setName: card.set.name,
      tcgplayerMarket: mainPrice?.market ?? null,
      tcgplayerLow: mainPrice?.low ?? null,
      tcgplayerMid: mainPrice?.mid ?? null,
      tcgplayerHigh: mainPrice?.high ?? null,
      ebayAverage: null, // Would need eBay integration
      ebayLow: null,
      ebayHigh: null,
      ebayRecentSales: 0,
      gradedPrices,
      lastUpdated: card.tcgplayer?.updatedAt ?? new Date().toISOString(),
    };

    // Cache result
    this.setInCache(cacheKey, pricing);

    return pricing;
  }

  /**
   * Fetch graded prices (placeholder - would need real API integration)
   */
  private async fetchGradedPrices(card: Card): Promise<GradedPricing> {
    // This would integrate with eBay sold listings or a graded card price API
    // Returning placeholder structure
    return {
      psa8: null,
      psa9: null,
      psa10: null,
      bgs8: null,
      bgs9: null,
      bgs95: null,
      bgs10: null,
      cgc8: null,
      cgc9: null,
      cgc95: null,
      cgc10: null,
    };
  }

  /**
   * Get price history for a card
   */
  async getPriceHistory(cardId: string, days: number = 30): Promise<PriceHistoryRange> {
    this.logger.debug("Getting price history", { cardId, days });

    const card = await this.getCard(cardId);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Price history would need integration with a historical price database
    // This is a placeholder implementation
    const dataPoints: PriceHistory[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      dataPoints.push({
        cardId,
        date: currentDate.toISOString().split("T")[0],
        tcgplayerMarket: card.tcgplayer?.prices?.holofoil?.market ?? null,
        ebayAverage: null,
        psa10Average: null,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return {
      cardId,
      cardName: card.name,
      setName: card.set.name,
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
      dataPoints,
      priceChange: {
        tcgplayer: null,
        tcgplayerPercent: null,
        ebay: null,
        ebayPercent: null,
        psa10: null,
        psa10Percent: null,
      },
    };
  }

  // ==========================================================================
  // Title Parser (for eBay listings)
  // ==========================================================================

  /**
   * Parse eBay listing title to extract card info
   */
  parseTitle(title: string): ParsedTitle {
    const result: ParsedTitle = {
      cardName: null,
      setName: null,
      cardNumber: null,
      year: null,
      grade: null,
      gradingCompany: null,
      certNumber: null,
      isFirstEdition: false,
      isHolo: false,
      isShadowless: false,
      language: null,
      condition: null,
    };

    const normalizedTitle = title.toUpperCase();

    // Extract grading info
    const psaMatch = normalizedTitle.match(/PSA\s*(\d+(?:\.\d+)?)/);
    const bgsMatch = normalizedTitle.match(/BGS\s*(\d+(?:\.\d+)?)/);
    const cgcMatch = normalizedTitle.match(/CGC\s*(\d+(?:\.\d+)?)/);

    if (psaMatch) {
      result.gradingCompany = "PSA";
      result.grade = parseFloat(psaMatch[1]);
    } else if (bgsMatch) {
      result.gradingCompany = "BGS";
      result.grade = parseFloat(bgsMatch[1]);
    } else if (cgcMatch) {
      result.gradingCompany = "CGC";
      result.grade = parseFloat(cgcMatch[1]);
    }

    // Extract cert number
    const certMatch = normalizedTitle.match(/(?:CERT|#|SERIAL)[\s#]*(\d{7,})/);
    if (certMatch) {
      result.certNumber = certMatch[1];
    }

    // Extract year
    const yearMatch = normalizedTitle.match(/(19\d{2}|20[0-2]\d)/);
    if (yearMatch) {
      result.year = parseInt(yearMatch[1], 10);
    }

    // Check for first edition
    result.isFirstEdition =
      normalizedTitle.includes("1ST EDITION") ||
      normalizedTitle.includes("FIRST EDITION") ||
      normalizedTitle.includes("1ST ED");

    // Check for holo
    result.isHolo =
      normalizedTitle.includes("HOLO") ||
      normalizedTitle.includes("HOLOGRAPHIC") ||
      normalizedTitle.includes("HOLOFOIL");

    // Check for shadowless
    result.isShadowless = normalizedTitle.includes("SHADOWLESS");

    // Extract card number
    const cardNumMatch = normalizedTitle.match(/(?:#|NO\.?)\s*(\d+\/\d+|\d+)/);
    if (cardNumMatch) {
      result.cardNumber = cardNumMatch[1];
    }

    // Common set name patterns
    const setPatterns = [
      { pattern: /BASE SET|BASE\s+SET\s+2?/i, set: "Base Set" },
      { pattern: /JUNGLE/i, set: "Jungle" },
      { pattern: /FOSSIL/i, set: "Fossil" },
      { pattern: /TEAM ROCKET/i, set: "Team Rocket" },
      { pattern: /GYM HEROES/i, set: "Gym Heroes" },
      { pattern: /GYM CHALLENGE/i, set: "Gym Challenge" },
      { pattern: /NEO GENESIS/i, set: "Neo Genesis" },
      { pattern: /NEO DISCOVERY/i, set: "Neo Discovery" },
      { pattern: /NEO REVELATION/i, set: "Neo Revelation" },
      { pattern: /NEO DESTINY/i, set: "Neo Destiny" },
      { pattern: /LEGENDARY COLLECTION/i, set: "Legendary Collection" },
      { pattern: /EXPEDITION/i, set: "Expedition Base Set" },
      { pattern: /AQUAPOLIS/i, set: "Aquapolis" },
      { pattern: /SKYRIDGE/i, set: "Skyridge" },
    ];

    for (const { pattern, set } of setPatterns) {
      if (pattern.test(normalizedTitle)) {
        result.setName = set;
        break;
      }
    }

    // Extract condition for raw cards
    if (!result.gradingCompany) {
      if (normalizedTitle.includes("NEAR MINT") || normalizedTitle.includes("NM")) {
        result.condition = "NM";
      } else if (normalizedTitle.includes("LIGHT PLAY") || normalizedTitle.includes("LP")) {
        result.condition = "LP";
      } else if (normalizedTitle.includes("MODERATE") || normalizedTitle.includes("MP")) {
        result.condition = "MP";
      } else if (normalizedTitle.includes("HEAVY") || normalizedTitle.includes("HP")) {
        result.condition = "HP";
      } else if (normalizedTitle.includes("DAMAGED") || normalizedTitle.includes("DMG")) {
        result.condition = "DMG";
      }
    }

    // Extract language
    if (normalizedTitle.includes("JAPANESE") || normalizedTitle.includes("JPN")) {
      result.language = "Japanese";
    } else if (normalizedTitle.includes("KOREAN")) {
      result.language = "Korean";
    } else if (normalizedTitle.includes("CHINESE")) {
      result.language = "Chinese";
    } else if (normalizedTitle.includes("GERMAN")) {
      result.language = "German";
    } else if (normalizedTitle.includes("FRENCH")) {
      result.language = "French";
    } else if (normalizedTitle.includes("ITALIAN")) {
      result.language = "Italian";
    } else if (normalizedTitle.includes("SPANISH")) {
      result.language = "Spanish";
    } else if (normalizedTitle.includes("PORTUGUESE")) {
      result.language = "Portuguese";
    } else {
      result.language = "English";
    }

    // Try to extract card name (usually at the beginning)
    // This is challenging without a card database lookup
    const words = title.split(/[\s\-\,\|\(\)]+/).filter(Boolean);
    const nameWords: string[] = [];

    for (const word of words) {
      const upperWord = word.toUpperCase();
      // Stop at common delimiters
      if (
        upperWord.match(/^(PSA|BGS|CGC|#|\d+|HOLO|GX|EX|V|VMAX|VSTAR|GEM|MINT|NEAR|LIGHT|HEAVY)$/)
      ) {
        break;
      }
      nameWords.push(word);
      if (nameWords.length >= 4) break;
    }

    if (nameWords.length > 0) {
      result.cardName = nameWords.join(" ");
    }

    return result;
  }

  // ==========================================================================
  // Cache Methods
  // ==========================================================================

  private getFromCache(key: string): CachedPrice | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return cached;
  }

  private setInCache(key: string, pricing: Pricing): void {
    // Enforce max cache size
    if (this.cache.size >= this.cacheConfig.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    const now = Date.now();
    this.cache.set(key, {
      pricing,
      cachedAt: now,
      expiresAt: now + this.cacheConfig.ttlMs,
    });
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.cacheConfig.maxSize,
    };
  }
}

export default PokemonPriceClient;
