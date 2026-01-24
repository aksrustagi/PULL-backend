/**
 * Pinecone Vector Search Types
 * Types for AI-powered vector search and similarity matching
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface PineconeClientConfig {
  apiKey: string;
  environment: string;
  indexName: string;
  namespace?: string;
  timeout?: number;
  logger?: Logger;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

// ============================================================================
// Vector Types
// ============================================================================

export interface Vector {
  id: string;
  values: number[];
  metadata?: VectorMetadata;
  sparseValues?: SparseValues;
}

export interface VectorMetadata {
  [key: string]: string | number | boolean | string[] | null;
}

export interface SparseValues {
  indices: number[];
  values: number[];
}

export interface VectorWithScore extends Vector {
  score: number;
}

// ============================================================================
// Query Types
// ============================================================================

export interface QueryParams {
  vector?: number[];
  sparseVector?: SparseValues;
  topK: number;
  filter?: MetadataFilter;
  includeMetadata?: boolean;
  includeValues?: boolean;
  namespace?: string;
}

export interface QueryByIdParams {
  id: string;
  topK: number;
  filter?: MetadataFilter;
  includeMetadata?: boolean;
  includeValues?: boolean;
  namespace?: string;
}

export type MetadataFilter = {
  [key: string]:
    | string
    | number
    | boolean
    | MetadataFilterOperator
    | MetadataFilter;
};

export interface MetadataFilterOperator {
  $eq?: string | number | boolean;
  $ne?: string | number | boolean;
  $gt?: number;
  $gte?: number;
  $lt?: number;
  $lte?: number;
  $in?: (string | number)[];
  $nin?: (string | number)[];
  $exists?: boolean;
}

export interface QueryResult {
  matches: VectorWithScore[];
  namespace: string;
}

// ============================================================================
// Upsert Types
// ============================================================================

export interface UpsertParams {
  vectors: Vector[];
  namespace?: string;
}

export interface UpsertResult {
  upsertedCount: number;
}

// ============================================================================
// Update Types
// ============================================================================

export interface UpdateParams {
  id: string;
  values?: number[];
  sparseValues?: SparseValues;
  setMetadata?: VectorMetadata;
  namespace?: string;
}

// ============================================================================
// Delete Types
// ============================================================================

export interface DeleteParams {
  ids?: string[];
  deleteAll?: boolean;
  filter?: MetadataFilter;
  namespace?: string;
}

// ============================================================================
// Fetch Types
// ============================================================================

export interface FetchParams {
  ids: string[];
  namespace?: string;
}

export interface FetchResult {
  vectors: Record<string, Vector>;
  namespace: string;
}

// ============================================================================
// Index Types
// ============================================================================

export interface IndexStats {
  namespaces: Record<string, NamespaceStats>;
  dimension: number;
  indexFullness: number;
  totalVectorCount: number;
}

export interface NamespaceStats {
  vectorCount: number;
}

export interface IndexDescription {
  name: string;
  metric: "cosine" | "euclidean" | "dotproduct";
  dimension: number;
  replicas: number;
  pods: number;
  podType: string;
  status: {
    ready: boolean;
    state: string;
  };
}

// ============================================================================
// Domain-Specific Types
// ============================================================================

// Market embeddings for recommendation
export interface MarketEmbedding {
  marketId: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  embedding: number[];
  volume?: number;
  closeDate?: Date;
}

// User preference embeddings
export interface UserPreferenceEmbedding {
  userId: string;
  preferenceType: "traded" | "watched" | "searched";
  embedding: number[];
  weight: number;
  timestamp: Date;
}

// Content embeddings for search
export interface ContentEmbedding {
  contentId: string;
  contentType: "market" | "news" | "analysis" | "tutorial";
  title: string;
  embedding: number[];
  publishedAt: Date;
}

// ============================================================================
// Error Types
// ============================================================================

export class PineconeError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode?: string
  ) {
    super(message);
    this.name = "PineconeError";
  }
}
