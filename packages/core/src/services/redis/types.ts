/**
 * Redis Service Types
 * Types for caching, leaderboards, and real-time data
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface RedisClientConfig {
  url: string;
  token?: string;
  timeout?: number;
  maxRetries?: number;
  keyPrefix?: string;
  logger?: Logger;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

// ============================================================================
// Cache Types
// ============================================================================

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[];
}

export interface CacheEntry<T = unknown> {
  value: T;
  expiresAt?: number;
  tags?: string[];
}

// ============================================================================
// Leaderboard Types
// ============================================================================

export interface LeaderboardEntry {
  memberId: string;
  score: number;
  rank: number;
  data?: Record<string, unknown>;
}

export interface LeaderboardOptions {
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  withScores?: boolean;
}

export interface LeaderboardUpdateResult {
  memberId: string;
  previousScore: number | null;
  newScore: number;
  previousRank: number | null;
  newRank: number;
}

// ============================================================================
// Rate Limiting Types
// ============================================================================

export interface RateLimitConfig {
  key: string;
  limit: number;
  window: number; // Window in seconds
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
  retryAfter?: number;
}

// ============================================================================
// Session Types
// ============================================================================

export interface Session {
  sessionId: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  data: Record<string, unknown>;
}

export interface SessionOptions {
  ttl?: number; // Session TTL in seconds
  sliding?: boolean; // Extend TTL on access
}

// ============================================================================
// Pub/Sub Types
// ============================================================================

export interface PubSubMessage<T = unknown> {
  channel: string;
  data: T;
  timestamp: number;
}

export type MessageHandler<T = unknown> = (message: PubSubMessage<T>) => void | Promise<void>;

// ============================================================================
// Lock Types
// ============================================================================

export interface LockOptions {
  ttl?: number; // Lock TTL in milliseconds
  retryCount?: number;
  retryDelay?: number; // Delay between retries in milliseconds
}

export interface Lock {
  key: string;
  token: string;
  expiresAt: number;
}

// ============================================================================
// Domain-Specific Types
// ============================================================================

// Trading leaderboard
export interface TradingLeaderboardEntry {
  userId: string;
  username: string;
  avatarUrl?: string;
  totalVolume: number;
  totalTrades: number;
  winRate: number;
  pnl: number;
  rank: number;
  badge?: LeaderboardBadge;
}

export type LeaderboardBadge = "whale" | "veteran" | "rookie" | "streak" | "top10";

export type LeaderboardPeriod = "daily" | "weekly" | "monthly" | "allTime";

// Points/Rewards leaderboard
export interface PointsLeaderboardEntry {
  userId: string;
  username: string;
  points: number;
  level: number;
  rank: number;
  streak?: number;
}

// Real-time market data cache
export interface MarketDataCache {
  marketId: string;
  price: number;
  volume24h: number;
  priceChange24h: number;
  lastTradeAt: number;
  bidPrice?: number;
  askPrice?: number;
}

// User presence
export interface UserPresence {
  userId: string;
  status: "online" | "away" | "offline";
  lastActiveAt: number;
  currentPage?: string;
}

// ============================================================================
// Error Types
// ============================================================================

export class RedisError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = "RedisError";
  }
}
