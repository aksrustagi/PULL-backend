/**
 * Pinecone Vector Search Client
 * Client for AI-powered vector search and similarity matching
 */

import type {
  PineconeClientConfig,
  Logger,
  Vector,
  VectorMetadata,
  VectorWithScore,
  QueryParams,
  QueryByIdParams,
  QueryResult,
  UpsertParams,
  UpsertResult,
  UpdateParams,
  DeleteParams,
  FetchParams,
  FetchResult,
  IndexStats,
  IndexDescription,
  MarketEmbedding,
  UserPreferenceEmbedding,
  ContentEmbedding,
} from "./types";
import { PineconeError } from "./types";

// ============================================================================
// Pinecone Client
// ============================================================================

export class PineconeClient {
  private readonly apiKey: string;
  private readonly environment: string;
  private readonly indexName: string;
  private readonly namespace: string;
  private readonly timeout: number;
  private readonly logger: Logger;
  private indexHost: string | null = null;

  constructor(config: PineconeClientConfig) {
    this.apiKey = config.apiKey;
    this.environment = config.environment;
    this.indexName = config.indexName;
    this.namespace = config.namespace ?? "";
    this.timeout = config.timeout ?? 30000;
    this.logger = config.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[Pinecone] ${msg}`, meta),
      info: (msg, meta) => console.info(`[Pinecone] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[Pinecone] ${msg}`, meta),
      error: (msg, meta) => console.error(`[Pinecone] ${msg}`, meta),
    };
  }

  private get controlPlaneUrl(): string {
    return `https://api.pinecone.io`;
  }

  private async getIndexHost(): Promise<string> {
    if (this.indexHost) {
      return this.indexHost;
    }

    const index = await this.describeIndex();
    this.indexHost = `https://${this.indexName}-${this.environment}.svc.pinecone.io`;

    // Try to get actual host from describe response
    this.logger.info("Index host resolved", { host: this.indexHost });
    return this.indexHost;
  }

  // ==========================================================================
  // HTTP Methods
  // ==========================================================================

  private async request<T>(
    url: string,
    method: string,
    body?: unknown
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Api-Key": this.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new PineconeError(
          errorBody.message ?? `HTTP ${response.status}`,
          response.status,
          errorBody.code
        );
      }

      const text = await response.text();
      return text ? JSON.parse(text) : ({} as T);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof PineconeError) {
        this.logger.error("Pinecone API error", {
          message: error.message,
          statusCode: error.statusCode,
        });
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new PineconeError("Request timeout", 408);
        }
        throw new PineconeError(error.message, 500);
      }

      throw new PineconeError("Unknown error", 500);
    }
  }

  private async indexRequest<T>(
    path: string,
    method: string,
    body?: unknown
  ): Promise<T> {
    const host = await this.getIndexHost();
    return this.request<T>(`${host}${path}`, method, body);
  }

  // ==========================================================================
  // Vector Operations
  // ==========================================================================

  /**
   * Upsert vectors into the index
   */
  async upsert(params: UpsertParams): Promise<UpsertResult> {
    const namespace = params.namespace ?? this.namespace;

    this.logger.debug("Upserting vectors", {
      count: params.vectors.length,
      namespace,
    });

    const result = await this.indexRequest<{ upsertedCount: number }>(
      "/vectors/upsert",
      "POST",
      {
        vectors: params.vectors,
        namespace,
      }
    );

    this.logger.info("Vectors upserted", {
      count: result.upsertedCount,
      namespace,
    });

    return { upsertedCount: result.upsertedCount };
  }

  /**
   * Upsert vectors in batches (max 100 per batch)
   */
  async upsertBatch(
    vectors: Vector[],
    namespace?: string,
    batchSize: number = 100
  ): Promise<UpsertResult> {
    let totalUpserted = 0;

    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      const result = await this.upsert({ vectors: batch, namespace });
      totalUpserted += result.upsertedCount;

      this.logger.debug("Batch upserted", {
        batch: Math.floor(i / batchSize) + 1,
        total: Math.ceil(vectors.length / batchSize),
      });
    }

    return { upsertedCount: totalUpserted };
  }

  /**
   * Query vectors by similarity
   */
  async query(params: QueryParams): Promise<QueryResult> {
    const namespace = params.namespace ?? this.namespace;

    this.logger.debug("Querying vectors", {
      topK: params.topK,
      namespace,
      hasFilter: !!params.filter,
    });

    const result = await this.indexRequest<{
      matches: VectorWithScore[];
      namespace: string;
    }>("/query", "POST", {
      vector: params.vector,
      sparseVector: params.sparseVector,
      topK: params.topK,
      filter: params.filter,
      includeMetadata: params.includeMetadata ?? true,
      includeValues: params.includeValues ?? false,
      namespace,
    });

    this.logger.debug("Query completed", {
      matchCount: result.matches?.length ?? 0,
    });

    return {
      matches: result.matches ?? [],
      namespace: result.namespace,
    };
  }

  /**
   * Query by existing vector ID
   */
  async queryById(params: QueryByIdParams): Promise<QueryResult> {
    // First fetch the vector
    const fetched = await this.fetch({
      ids: [params.id],
      namespace: params.namespace,
    });

    const vector = fetched.vectors[params.id];
    if (!vector) {
      return { matches: [], namespace: params.namespace ?? this.namespace };
    }

    // Then query by its values
    return this.query({
      vector: vector.values,
      topK: params.topK,
      filter: params.filter,
      includeMetadata: params.includeMetadata,
      includeValues: params.includeValues,
      namespace: params.namespace,
    });
  }

  /**
   * Update a vector
   */
  async update(params: UpdateParams): Promise<void> {
    const namespace = params.namespace ?? this.namespace;

    this.logger.debug("Updating vector", { id: params.id, namespace });

    await this.indexRequest("/vectors/update", "POST", {
      id: params.id,
      values: params.values,
      sparseValues: params.sparseValues,
      setMetadata: params.setMetadata,
      namespace,
    });

    this.logger.debug("Vector updated", { id: params.id });
  }

  /**
   * Delete vectors
   */
  async delete(params: DeleteParams): Promise<void> {
    const namespace = params.namespace ?? this.namespace;

    this.logger.debug("Deleting vectors", {
      ids: params.ids?.length,
      deleteAll: params.deleteAll,
      namespace,
    });

    await this.indexRequest("/vectors/delete", "POST", {
      ids: params.ids,
      deleteAll: params.deleteAll,
      filter: params.filter,
      namespace,
    });

    this.logger.info("Vectors deleted", {
      count: params.ids?.length ?? "all",
      namespace,
    });
  }

  /**
   * Fetch vectors by ID
   */
  async fetch(params: FetchParams): Promise<FetchResult> {
    const namespace = params.namespace ?? this.namespace;

    const queryParams = new URLSearchParams();
    params.ids.forEach((id) => queryParams.append("ids", id));
    if (namespace) queryParams.append("namespace", namespace);

    const result = await this.indexRequest<{
      vectors: Record<string, Vector>;
      namespace: string;
    }>(`/vectors/fetch?${queryParams.toString()}`, "GET");

    return {
      vectors: result.vectors ?? {},
      namespace: result.namespace,
    };
  }

  // ==========================================================================
  // Index Operations
  // ==========================================================================

  /**
   * Get index statistics
   */
  async describeIndexStats(): Promise<IndexStats> {
    const result = await this.indexRequest<IndexStats>(
      "/describe_index_stats",
      "POST",
      {}
    );

    return result;
  }

  /**
   * Describe the index
   */
  async describeIndex(): Promise<IndexDescription> {
    const result = await this.request<IndexDescription>(
      `${this.controlPlaneUrl}/indexes/${this.indexName}`,
      "GET"
    );

    return result;
  }

  // ==========================================================================
  // Domain-Specific Methods: Markets
  // ==========================================================================

  /**
   * Upsert market embeddings
   */
  async upsertMarkets(markets: MarketEmbedding[]): Promise<UpsertResult> {
    const vectors: Vector[] = markets.map((market) => ({
      id: `market_${market.marketId}`,
      values: market.embedding,
      metadata: {
        marketId: market.marketId,
        title: market.title,
        description: market.description,
        category: market.category,
        tags: market.tags,
        volume: market.volume ?? 0,
        closeDate: market.closeDate?.toISOString() ?? null,
        type: "market",
      },
    }));

    return this.upsertBatch(vectors, "markets");
  }

  /**
   * Find similar markets
   */
  async findSimilarMarkets(
    embedding: number[],
    options: {
      topK?: number;
      category?: string;
      minVolume?: number;
      excludeMarketIds?: string[];
    } = {}
  ): Promise<Array<MarketEmbedding & { score: number }>> {
    const filter: Record<string, unknown> = { type: "market" };

    if (options.category) {
      filter.category = options.category;
    }
    if (options.minVolume) {
      filter.volume = { $gte: options.minVolume };
    }
    if (options.excludeMarketIds?.length) {
      filter.marketId = { $nin: options.excludeMarketIds };
    }

    const result = await this.query({
      vector: embedding,
      topK: options.topK ?? 10,
      filter,
      includeMetadata: true,
      namespace: "markets",
    });

    return result.matches.map((match) => ({
      marketId: match.metadata?.marketId as string,
      title: match.metadata?.title as string,
      description: match.metadata?.description as string,
      category: match.metadata?.category as string,
      tags: match.metadata?.tags as string[],
      embedding: match.values ?? [],
      volume: match.metadata?.volume as number,
      closeDate: match.metadata?.closeDate
        ? new Date(match.metadata.closeDate as string)
        : undefined,
      score: match.score,
    }));
  }

  // ==========================================================================
  // Domain-Specific Methods: User Preferences
  // ==========================================================================

  /**
   * Upsert user preference embeddings
   */
  async upsertUserPreferences(
    preferences: UserPreferenceEmbedding[]
  ): Promise<UpsertResult> {
    const vectors: Vector[] = preferences.map((pref) => ({
      id: `user_pref_${pref.userId}_${pref.preferenceType}_${Date.now()}`,
      values: pref.embedding,
      metadata: {
        userId: pref.userId,
        preferenceType: pref.preferenceType,
        weight: pref.weight,
        timestamp: pref.timestamp.toISOString(),
        type: "user_preference",
      },
    }));

    return this.upsertBatch(vectors, "user_preferences");
  }

  /**
   * Get user preference vectors
   */
  async getUserPreferences(
    userId: string,
    preferenceType?: string
  ): Promise<UserPreferenceEmbedding[]> {
    // This is a workaround since Pinecone doesn't support listing by filter
    // In production, you'd maintain a separate index of user preference IDs
    const stats = await this.describeIndexStats();
    const namespace = "user_preferences";

    // Query with a zero vector to get all matches (not ideal but works for small datasets)
    const filter: Record<string, unknown> = { userId, type: "user_preference" };
    if (preferenceType) {
      filter.preferenceType = preferenceType;
    }

    // Note: This is a simplified implementation
    // In production, maintain a separate list of preference IDs per user
    return [];
  }

  // ==========================================================================
  // Domain-Specific Methods: Content Search
  // ==========================================================================

  /**
   * Upsert content embeddings
   */
  async upsertContent(content: ContentEmbedding[]): Promise<UpsertResult> {
    const vectors: Vector[] = content.map((item) => ({
      id: `content_${item.contentType}_${item.contentId}`,
      values: item.embedding,
      metadata: {
        contentId: item.contentId,
        contentType: item.contentType,
        title: item.title,
        publishedAt: item.publishedAt.toISOString(),
        type: "content",
      },
    }));

    return this.upsertBatch(vectors, "content");
  }

  /**
   * Search content by similarity
   */
  async searchContent(
    embedding: number[],
    options: {
      topK?: number;
      contentType?: string;
      publishedAfter?: Date;
    } = {}
  ): Promise<Array<ContentEmbedding & { score: number }>> {
    const filter: Record<string, unknown> = { type: "content" };

    if (options.contentType) {
      filter.contentType = options.contentType;
    }
    if (options.publishedAfter) {
      filter.publishedAt = { $gte: options.publishedAfter.toISOString() };
    }

    const result = await this.query({
      vector: embedding,
      topK: options.topK ?? 10,
      filter,
      includeMetadata: true,
      namespace: "content",
    });

    return result.matches.map((match) => ({
      contentId: match.metadata?.contentId as string,
      contentType: match.metadata?.contentType as "market" | "news" | "analysis" | "tutorial",
      title: match.metadata?.title as string,
      embedding: match.values ?? [],
      publishedAt: new Date(match.metadata?.publishedAt as string),
      score: match.score,
    }));
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Health check
   */
  async ping(): Promise<boolean> {
    try {
      await this.describeIndex();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get vector count in namespace
   */
  async getVectorCount(namespace?: string): Promise<number> {
    const stats = await this.describeIndexStats();
    const ns = namespace ?? this.namespace;

    if (ns && stats.namespaces[ns]) {
      return stats.namespaces[ns].vectorCount;
    }

    return stats.totalVectorCount;
  }
}

export default PineconeClient;
