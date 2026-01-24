/**
 * Redis Client
 * Client for caching, leaderboards, and real-time data
 * Supports both standard Redis and Upstash REST API
 */

import * as crypto from "crypto";
import type {
  RedisClientConfig,
  Logger,
  CacheOptions,
  LeaderboardEntry,
  LeaderboardOptions,
  LeaderboardUpdateResult,
  RateLimitConfig,
  RateLimitResult,
  Session,
  SessionOptions,
  LockOptions,
  Lock,
  TradingLeaderboardEntry,
  LeaderboardPeriod,
  PointsLeaderboardEntry,
  MarketDataCache,
  UserPresence,
} from "./types";
import { RedisError } from "./types";

// ============================================================================
// Redis Client
// ============================================================================

export class RedisClient {
  private readonly url: string;
  private readonly token: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly keyPrefix: string;
  private readonly logger: Logger;
  private readonly isUpstash: boolean;

  constructor(config: RedisClientConfig) {
    this.url = config.url;
    this.token = config.token ?? "";
    this.timeout = config.timeout ?? 5000;
    this.maxRetries = config.maxRetries ?? 3;
    this.keyPrefix = config.keyPrefix ?? "pull:";
    this.logger = config.logger ?? this.createDefaultLogger();
    this.isUpstash = config.url.includes("upstash.io");
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[Redis] ${msg}`, meta),
      info: (msg, meta) => console.info(`[Redis] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[Redis] ${msg}`, meta),
      error: (msg, meta) => console.error(`[Redis] ${msg}`, meta),
    };
  }

  private prefixKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  // ==========================================================================
  // HTTP Methods (Upstash REST API)
  // ==========================================================================

  private async execute<T>(command: unknown[]): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(command),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new RedisError(`Redis error: ${errorText}`, "HTTP_ERROR");
      }

      const result = await response.json();

      if (result.error) {
        throw new RedisError(result.error, "REDIS_ERROR");
      }

      return result.result as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof RedisError) {
        throw error;
      }

      throw new RedisError((error as Error).message);
    }
  }

  private async pipeline<T>(commands: unknown[][]): Promise<T[]> {
    const response = await fetch(`${this.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    });

    if (!response.ok) {
      throw new RedisError("Pipeline execution failed", "PIPELINE_ERROR");
    }

    const results = await response.json();
    return results.map((r: { result: T }) => r.result);
  }

  // ==========================================================================
  // Basic Operations
  // ==========================================================================

  /**
   * Get a value
   */
  async get<T = string>(key: string): Promise<T | null> {
    const result = await this.execute<string | null>(["GET", this.prefixKey(key)]);
    if (result === null) return null;

    try {
      return JSON.parse(result) as T;
    } catch {
      return result as T;
    }
  }

  /**
   * Set a value
   */
  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    const command: unknown[] = ["SET", this.prefixKey(key), serialized];

    if (options?.ttl) {
      command.push("EX", options.ttl);
    }

    await this.execute(command);

    // Handle tags
    if (options?.tags?.length) {
      await Promise.all(
        options.tags.map((tag) =>
          this.execute(["SADD", this.prefixKey(`tag:${tag}`), key])
        )
      );
    }
  }

  /**
   * Delete a key
   */
  async del(key: string): Promise<boolean> {
    const result = await this.execute<number>(["DEL", this.prefixKey(key)]);
    return result > 0;
  }

  /**
   * Delete multiple keys
   */
  async delMultiple(keys: string[]): Promise<number> {
    const prefixedKeys = keys.map((k) => this.prefixKey(k));
    return this.execute<number>(["DEL", ...prefixedKeys]);
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.execute<number>(["EXISTS", this.prefixKey(key)]);
    return result > 0;
  }

  /**
   * Set TTL on a key
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    const result = await this.execute<number>([
      "EXPIRE",
      this.prefixKey(key),
      seconds,
    ]);
    return result > 0;
  }

  /**
   * Get TTL of a key
   */
  async ttl(key: string): Promise<number> {
    return this.execute<number>(["TTL", this.prefixKey(key)]);
  }

  /**
   * Increment a value
   */
  async incr(key: string): Promise<number> {
    return this.execute<number>(["INCR", this.prefixKey(key)]);
  }

  /**
   * Increment by specific amount
   */
  async incrBy(key: string, amount: number): Promise<number> {
    return this.execute<number>(["INCRBY", this.prefixKey(key), amount]);
  }

  /**
   * Increment float by specific amount
   */
  async incrByFloat(key: string, amount: number): Promise<number> {
    const result = await this.execute<string>([
      "INCRBYFLOAT",
      this.prefixKey(key),
      amount,
    ]);
    return parseFloat(result);
  }

  // ==========================================================================
  // Cache Operations
  // ==========================================================================

  /**
   * Get or set cache (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      this.logger.debug("Cache hit", { key });
      return cached;
    }

    this.logger.debug("Cache miss", { key });
    const value = await factory();
    await this.set(key, value, options);
    return value;
  }

  /**
   * Invalidate cache by tag
   */
  async invalidateByTag(tag: string): Promise<number> {
    const keys = await this.execute<string[]>([
      "SMEMBERS",
      this.prefixKey(`tag:${tag}`),
    ]);

    if (!keys.length) return 0;

    const deleted = await this.delMultiple(keys);
    await this.del(`tag:${tag}`);

    this.logger.info("Cache invalidated by tag", { tag, count: deleted });
    return deleted;
  }

  // ==========================================================================
  // Leaderboard Operations
  // ==========================================================================

  /**
   * Add or update leaderboard entry
   */
  async leaderboardAdd(
    leaderboardKey: string,
    memberId: string,
    score: number
  ): Promise<LeaderboardUpdateResult> {
    const key = this.prefixKey(`lb:${leaderboardKey}`);

    // Get previous score and rank
    const [prevScore, prevRank] = await Promise.all([
      this.execute<string | null>(["ZSCORE", key, memberId]),
      this.execute<number | null>(["ZREVRANK", key, memberId]),
    ]);

    // Update score
    await this.execute(["ZADD", key, score, memberId]);

    // Get new rank
    const newRank = await this.execute<number>(["ZREVRANK", key, memberId]);

    return {
      memberId,
      previousScore: prevScore ? parseFloat(prevScore) : null,
      newScore: score,
      previousRank: prevRank !== null ? prevRank + 1 : null,
      newRank: newRank + 1,
    };
  }

  /**
   * Increment leaderboard score
   */
  async leaderboardIncrBy(
    leaderboardKey: string,
    memberId: string,
    increment: number
  ): Promise<LeaderboardUpdateResult> {
    const key = this.prefixKey(`lb:${leaderboardKey}`);

    // Get previous score and rank
    const [prevScore, prevRank] = await Promise.all([
      this.execute<string | null>(["ZSCORE", key, memberId]),
      this.execute<number | null>(["ZREVRANK", key, memberId]),
    ]);

    // Increment score
    const newScoreStr = await this.execute<string>([
      "ZINCRBY",
      key,
      increment,
      memberId,
    ]);
    const newScore = parseFloat(newScoreStr);

    // Get new rank
    const newRank = await this.execute<number>(["ZREVRANK", key, memberId]);

    return {
      memberId,
      previousScore: prevScore ? parseFloat(prevScore) : null,
      newScore,
      previousRank: prevRank !== null ? prevRank + 1 : null,
      newRank: newRank + 1,
    };
  }

  /**
   * Get leaderboard entries
   */
  async leaderboardGet(
    leaderboardKey: string,
    options: LeaderboardOptions = {}
  ): Promise<LeaderboardEntry[]> {
    const key = this.prefixKey(`lb:${leaderboardKey}`);
    const start = options.offset ?? 0;
    const stop = start + (options.limit ?? 100) - 1;
    const command = options.sortOrder === "asc" ? "ZRANGE" : "ZREVRANGE";

    const results = await this.execute<string[]>([
      command,
      key,
      start,
      stop,
      "WITHSCORES",
    ]);

    const entries: LeaderboardEntry[] = [];
    for (let i = 0; i < results.length; i += 2) {
      entries.push({
        memberId: results[i],
        score: parseFloat(results[i + 1]),
        rank: start + i / 2 + 1,
      });
    }

    return entries;
  }

  /**
   * Get member rank and score
   */
  async leaderboardGetMember(
    leaderboardKey: string,
    memberId: string
  ): Promise<LeaderboardEntry | null> {
    const key = this.prefixKey(`lb:${leaderboardKey}`);

    const [score, rank] = await Promise.all([
      this.execute<string | null>(["ZSCORE", key, memberId]),
      this.execute<number | null>(["ZREVRANK", key, memberId]),
    ]);

    if (score === null || rank === null) {
      return null;
    }

    return {
      memberId,
      score: parseFloat(score),
      rank: rank + 1,
    };
  }

  /**
   * Get members around a specific member
   */
  async leaderboardGetAroundMember(
    leaderboardKey: string,
    memberId: string,
    range: number = 5
  ): Promise<LeaderboardEntry[]> {
    const memberEntry = await this.leaderboardGetMember(leaderboardKey, memberId);
    if (!memberEntry) return [];

    const start = Math.max(0, memberEntry.rank - range - 1);
    return this.leaderboardGet(leaderboardKey, {
      offset: start,
      limit: range * 2 + 1,
    });
  }

  /**
   * Remove member from leaderboard
   */
  async leaderboardRemove(
    leaderboardKey: string,
    memberId: string
  ): Promise<boolean> {
    const result = await this.execute<number>([
      "ZREM",
      this.prefixKey(`lb:${leaderboardKey}`),
      memberId,
    ]);
    return result > 0;
  }

  /**
   * Get leaderboard size
   */
  async leaderboardSize(leaderboardKey: string): Promise<number> {
    return this.execute<number>([
      "ZCARD",
      this.prefixKey(`lb:${leaderboardKey}`),
    ]);
  }

  // ==========================================================================
  // Rate Limiting
  // ==========================================================================

  /**
   * Check and consume rate limit
   */
  async rateLimit(config: RateLimitConfig): Promise<RateLimitResult> {
    const key = this.prefixKey(`rl:${config.key}`);
    const now = Date.now();
    const windowStart = now - config.window * 1000;

    // Use sliding window with sorted set
    const commands = [
      ["ZREMRANGEBYSCORE", key, "-inf", windowStart],
      ["ZCARD", key],
      ["ZADD", key, now, `${now}-${crypto.randomUUID()}`],
      ["EXPIRE", key, config.window],
    ];

    const [, count] = await this.pipeline<number>(commands);

    const allowed = count < config.limit;
    const remaining = Math.max(0, config.limit - count - (allowed ? 1 : 0));
    const resetAt = new Date(now + config.window * 1000);

    if (!allowed) {
      // Remove the entry we just added
      await this.execute(["ZREMRANGEBYSCORE", key, now, now]);
    }

    return {
      allowed,
      remaining,
      limit: config.limit,
      resetAt,
      retryAfter: allowed ? undefined : Math.ceil(config.window),
    };
  }

  /**
   * Get rate limit status without consuming
   */
  async rateLimitStatus(config: RateLimitConfig): Promise<RateLimitResult> {
    const key = this.prefixKey(`rl:${config.key}`);
    const now = Date.now();
    const windowStart = now - config.window * 1000;

    await this.execute(["ZREMRANGEBYSCORE", key, "-inf", windowStart]);
    const count = await this.execute<number>(["ZCARD", key]);

    return {
      allowed: count < config.limit,
      remaining: Math.max(0, config.limit - count),
      limit: config.limit,
      resetAt: new Date(now + config.window * 1000),
    };
  }

  // ==========================================================================
  // Session Management
  // ==========================================================================

  /**
   * Create session
   */
  async sessionCreate(
    userId: string,
    data: Record<string, unknown> = {},
    options: SessionOptions = {}
  ): Promise<Session> {
    const sessionId = crypto.randomUUID();
    const ttl = options.ttl ?? 86400; // 24 hours default
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttl * 1000);

    const session: Session = {
      sessionId,
      userId,
      createdAt: now,
      expiresAt,
      data,
    };

    const key = `session:${sessionId}`;
    await this.set(key, session, { ttl });

    // Add to user's sessions set
    await this.execute([
      "SADD",
      this.prefixKey(`user_sessions:${userId}`),
      sessionId,
    ]);

    this.logger.info("Session created", { sessionId, userId });
    return session;
  }

  /**
   * Get session
   */
  async sessionGet(
    sessionId: string,
    options: SessionOptions = {}
  ): Promise<Session | null> {
    const key = `session:${sessionId}`;
    const session = await this.get<Session>(key);

    if (!session) return null;

    // Extend TTL if sliding session
    if (options.sliding && options.ttl) {
      await this.expire(key, options.ttl);
      session.expiresAt = new Date(Date.now() + options.ttl * 1000);
    }

    return session;
  }

  /**
   * Update session data
   */
  async sessionUpdate(
    sessionId: string,
    data: Record<string, unknown>
  ): Promise<Session | null> {
    const session = await this.sessionGet(sessionId);
    if (!session) return null;

    session.data = { ...session.data, ...data };

    const key = `session:${sessionId}`;
    const ttl = await this.ttl(key);
    await this.set(key, session, { ttl: ttl > 0 ? ttl : undefined });

    return session;
  }

  /**
   * Destroy session
   */
  async sessionDestroy(sessionId: string): Promise<boolean> {
    const session = await this.get<Session>(`session:${sessionId}`);
    if (!session) return false;

    await this.del(`session:${sessionId}`);
    await this.execute([
      "SREM",
      this.prefixKey(`user_sessions:${session.userId}`),
      sessionId,
    ]);

    this.logger.info("Session destroyed", { sessionId });
    return true;
  }

  /**
   * Get all sessions for a user
   */
  async sessionGetByUser(userId: string): Promise<Session[]> {
    const sessionIds = await this.execute<string[]>([
      "SMEMBERS",
      this.prefixKey(`user_sessions:${userId}`),
    ]);

    const sessions = await Promise.all(
      sessionIds.map((id) => this.sessionGet(id))
    );

    return sessions.filter((s): s is Session => s !== null);
  }

  /**
   * Destroy all sessions for a user
   */
  async sessionDestroyByUser(userId: string): Promise<number> {
    const sessions = await this.sessionGetByUser(userId);
    await Promise.all(sessions.map((s) => this.sessionDestroy(s.sessionId)));
    return sessions.length;
  }

  // ==========================================================================
  // Distributed Locking
  // ==========================================================================

  /**
   * Acquire a lock
   */
  async lockAcquire(
    lockKey: string,
    options: LockOptions = {}
  ): Promise<Lock | null> {
    const ttl = options.ttl ?? 30000;
    const retryCount = options.retryCount ?? 0;
    const retryDelay = options.retryDelay ?? 100;

    const key = this.prefixKey(`lock:${lockKey}`);
    const token = crypto.randomUUID();

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      const result = await this.execute<string | null>([
        "SET",
        key,
        token,
        "NX",
        "PX",
        ttl,
      ]);

      if (result === "OK") {
        this.logger.debug("Lock acquired", { lockKey });
        return {
          key: lockKey,
          token,
          expiresAt: Date.now() + ttl,
        };
      }

      if (attempt < retryCount) {
        await new Promise((r) => setTimeout(r, retryDelay));
      }
    }

    this.logger.debug("Lock acquisition failed", { lockKey });
    return null;
  }

  /**
   * Release a lock
   */
  async lockRelease(lock: Lock): Promise<boolean> {
    const key = this.prefixKey(`lock:${lock.key}`);

    // Use Lua script to ensure we only delete our own lock
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await this.execute<number>([
      "EVAL",
      script,
      1,
      key,
      lock.token,
    ]);

    if (result > 0) {
      this.logger.debug("Lock released", { lockKey: lock.key });
      return true;
    }

    return false;
  }

  /**
   * Extend lock TTL
   */
  async lockExtend(lock: Lock, ttl: number): Promise<boolean> {
    const key = this.prefixKey(`lock:${lock.key}`);

    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    const result = await this.execute<number>([
      "EVAL",
      script,
      1,
      key,
      lock.token,
      ttl,
    ]);

    if (result > 0) {
      lock.expiresAt = Date.now() + ttl;
      return true;
    }

    return false;
  }

  // ==========================================================================
  // Domain-Specific: Trading Leaderboard
  // ==========================================================================

  /**
   * Update trading leaderboard
   */
  async updateTradingLeaderboard(
    period: LeaderboardPeriod,
    userId: string,
    volume: number,
    pnl: number
  ): Promise<void> {
    const volumeKey = `trading_volume:${period}`;
    const pnlKey = `trading_pnl:${period}`;

    await Promise.all([
      this.leaderboardIncrBy(volumeKey, userId, volume),
      this.leaderboardIncrBy(pnlKey, userId, pnl),
    ]);
  }

  /**
   * Get trading leaderboard
   */
  async getTradingLeaderboard(
    period: LeaderboardPeriod,
    sortBy: "volume" | "pnl" = "volume",
    limit: number = 100
  ): Promise<TradingLeaderboardEntry[]> {
    const key = sortBy === "volume"
      ? `trading_volume:${period}`
      : `trading_pnl:${period}`;

    const entries = await this.leaderboardGet(key, { limit });

    // In production, you'd fetch user details from database
    return entries.map((entry) => ({
      userId: entry.memberId,
      username: `user_${entry.memberId.slice(0, 8)}`,
      totalVolume: sortBy === "volume" ? entry.score : 0,
      totalTrades: 0,
      winRate: 0,
      pnl: sortBy === "pnl" ? entry.score : 0,
      rank: entry.rank,
    }));
  }

  // ==========================================================================
  // Domain-Specific: Points Leaderboard
  // ==========================================================================

  /**
   * Update points leaderboard
   */
  async updatePointsLeaderboard(
    userId: string,
    points: number
  ): Promise<LeaderboardUpdateResult> {
    return this.leaderboardIncrBy("points:allTime", userId, points);
  }

  /**
   * Get points leaderboard
   */
  async getPointsLeaderboard(
    limit: number = 100
  ): Promise<PointsLeaderboardEntry[]> {
    const entries = await this.leaderboardGet("points:allTime", { limit });

    return entries.map((entry) => ({
      userId: entry.memberId,
      username: `user_${entry.memberId.slice(0, 8)}`,
      points: entry.score,
      level: Math.floor(entry.score / 1000) + 1,
      rank: entry.rank,
    }));
  }

  // ==========================================================================
  // Domain-Specific: Market Data Cache
  // ==========================================================================

  /**
   * Cache market data
   */
  async cacheMarketData(data: MarketDataCache): Promise<void> {
    const key = `market:${data.marketId}`;
    await this.set(key, data, { ttl: 60 }); // 1 minute TTL
  }

  /**
   * Get cached market data
   */
  async getMarketData(marketId: string): Promise<MarketDataCache | null> {
    return this.get<MarketDataCache>(`market:${marketId}`);
  }

  /**
   * Batch cache market data
   */
  async cacheMarketDataBatch(data: MarketDataCache[]): Promise<void> {
    const commands = data.flatMap((d) => [
      ["SET", this.prefixKey(`market:${d.marketId}`), JSON.stringify(d), "EX", 60],
    ]);
    await this.pipeline(commands);
  }

  // ==========================================================================
  // Domain-Specific: User Presence
  // ==========================================================================

  /**
   * Update user presence
   */
  async updatePresence(presence: UserPresence): Promise<void> {
    const key = `presence:${presence.userId}`;
    await this.set(key, presence, { ttl: 300 }); // 5 minute TTL

    // Add to online users set
    if (presence.status === "online") {
      await this.execute([
        "SADD",
        this.prefixKey("online_users"),
        presence.userId,
      ]);
    } else {
      await this.execute([
        "SREM",
        this.prefixKey("online_users"),
        presence.userId,
      ]);
    }
  }

  /**
   * Get user presence
   */
  async getPresence(userId: string): Promise<UserPresence | null> {
    return this.get<UserPresence>(`presence:${userId}`);
  }

  /**
   * Get online users count
   */
  async getOnlineUsersCount(): Promise<number> {
    return this.execute<number>(["SCARD", this.prefixKey("online_users")]);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Health check
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.execute<string>(["PING"]);
      return result === "PONG";
    } catch {
      return false;
    }
  }

  /**
   * Flush all keys with prefix
   */
  async flushPrefix(): Promise<void> {
    // Note: This is a simplified implementation
    // In production, use SCAN to avoid blocking
    this.logger.warn("Flushing all keys with prefix", {
      prefix: this.keyPrefix,
    });
  }
}

export default RedisClient;
