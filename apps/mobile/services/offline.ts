/**
 * Offline Support - Cache-First Strategy
 * Persistent storage with automatic sync
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";

// ============================================================================
// Types
// ============================================================================

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  expiresAt: number;
  version: number;
}

interface PendingMutation {
  id: string;
  type: "POST" | "PUT" | "DELETE" | "PATCH";
  url: string;
  body?: any;
  createdAt: number;
  retries: number;
  maxRetries: number;
}

interface SyncStatus {
  isOnline: boolean;
  lastSyncAt: number | null;
  pendingMutations: number;
  isSyncing: boolean;
}

type SyncListener = (status: SyncStatus) => void;

// ============================================================================
// Cache Configuration
// ============================================================================

const CACHE_PREFIX = "@fantasy_cache:";
const MUTATION_QUEUE_KEY = "@fantasy_mutations";
const SYNC_STATUS_KEY = "@fantasy_sync_status";

const DEFAULT_TTL: Record<string, number> = {
  "leagues": 300000,         // 5 minutes
  "roster": 60000,           // 1 minute
  "standings": 300000,       // 5 minutes
  "matchup": 30000,          // 30 seconds
  "players": 600000,         // 10 minutes
  "markets": 10000,          // 10 seconds
  "user": 300000,            // 5 minutes
  "transactions": 120000,    // 2 minutes
  "news": 120000,            // 2 minutes
  "default": 300000,         // 5 minutes
};

// ============================================================================
// Offline Cache Manager
// ============================================================================

class OfflineCacheManager {
  private memoryCache: Map<string, CacheEntry> = new Map();
  private listeners: Set<SyncListener> = new Set();
  private mutationQueue: PendingMutation[] = [];
  private isOnline: boolean = true;
  private isSyncing: boolean = false;
  private lastSyncAt: number | null = null;
  private syncInterval: NodeJS.Timer | null = null;
  private unsubscribeNetInfo: (() => void) | null = null;

  // ============================================================================
  // Initialization
  // ============================================================================

  async initialize(): Promise<void> {
    // Load mutation queue from storage
    await this.loadMutationQueue();

    // Subscribe to network changes
    this.unsubscribeNetInfo = NetInfo.addEventListener((state: NetInfoState) => {
      const wasOffline = !this.isOnline;
      this.isOnline = state.isConnected ?? false;

      if (wasOffline && this.isOnline) {
        // Back online - sync pending mutations
        this.syncPendingMutations();
      }

      this.notifyListeners();
    });

    // Periodic sync attempt
    this.syncInterval = setInterval(() => {
      if (this.isOnline && this.mutationQueue.length > 0) {
        this.syncPendingMutations();
      }
    }, 30000); // Every 30 seconds
  }

  destroy(): void {
    this.unsubscribeNetInfo?.();
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }

  // ============================================================================
  // Cache Operations
  // ============================================================================

  async get<T>(key: string): Promise<T | null> {
    const cacheKey = CACHE_PREFIX + key;

    // Check memory cache first
    const memEntry = this.memoryCache.get(cacheKey);
    if (memEntry && Date.now() < memEntry.expiresAt) {
      return memEntry.data as T;
    }

    // Check persistent storage
    try {
      const stored = await AsyncStorage.getItem(cacheKey);
      if (stored) {
        const entry: CacheEntry<T> = JSON.parse(stored);
        if (Date.now() < entry.expiresAt) {
          // Populate memory cache
          this.memoryCache.set(cacheKey, entry);
          return entry.data;
        } else {
          // Expired - remove from storage
          await AsyncStorage.removeItem(cacheKey);
        }
      }
    } catch (error) {
      console.warn("Cache read error:", error);
    }

    return null;
  }

  async set<T>(key: string, data: T, ttlMs?: number): Promise<void> {
    const cacheKey = CACHE_PREFIX + key;
    const category = key.split("/")[0] || "default";
    const ttl = ttlMs || DEFAULT_TTL[category] || DEFAULT_TTL.default;

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl,
      version: 1,
    };

    // Memory cache
    this.memoryCache.set(cacheKey, entry);

    // Persistent storage
    try {
      await AsyncStorage.setItem(cacheKey, JSON.stringify(entry));
    } catch (error) {
      console.warn("Cache write error:", error);
    }
  }

  async invalidate(key: string): Promise<void> {
    const cacheKey = CACHE_PREFIX + key;
    this.memoryCache.delete(cacheKey);
    await AsyncStorage.removeItem(cacheKey);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const prefix = CACHE_PREFIX + pattern;

    // Memory cache
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        this.memoryCache.delete(key);
      }
    }

    // Persistent storage
    try {
      const keys = await AsyncStorage.getAllKeys();
      const matchingKeys = keys.filter((k) => k.startsWith(prefix));
      if (matchingKeys.length > 0) {
        await AsyncStorage.multiRemove(matchingKeys);
      }
    } catch (error) {
      console.warn("Cache invalidation error:", error);
    }
  }

  async clear(): Promise<void> {
    this.memoryCache.clear();
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
      }
    } catch (error) {
      console.warn("Cache clear error:", error);
    }
  }

  // ============================================================================
  // Cache-First Fetch
  // ============================================================================

  async fetchWithCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: {
      ttlMs?: number;
      forceRefresh?: boolean;
      staleWhileRevalidate?: boolean;
    } = {}
  ): Promise<{ data: T; fromCache: boolean; stale: boolean }> {
    const { forceRefresh = false, staleWhileRevalidate = true } = options;

    // Try cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = await this.get<T>(key);
      if (cached !== null) {
        // If online, revalidate in background
        if (this.isOnline && staleWhileRevalidate) {
          this.revalidateInBackground(key, fetcher, options.ttlMs);
        }
        return { data: cached, fromCache: true, stale: false };
      }
    }

    // If offline and no cache, throw
    if (!this.isOnline) {
      const staleData = await this.getStale<T>(key);
      if (staleData) {
        return { data: staleData, fromCache: true, stale: true };
      }
      throw new Error("No network connection and no cached data available");
    }

    // Fetch fresh data
    try {
      const data = await fetcher();
      await this.set(key, data, options.ttlMs);
      return { data, fromCache: false, stale: false };
    } catch (error) {
      // On fetch failure, try stale cache
      const staleData = await this.getStale<T>(key);
      if (staleData) {
        return { data: staleData, fromCache: true, stale: true };
      }
      throw error;
    }
  }

  private async getStale<T>(key: string): Promise<T | null> {
    const cacheKey = CACHE_PREFIX + key;
    try {
      const stored = await AsyncStorage.getItem(cacheKey);
      if (stored) {
        const entry: CacheEntry<T> = JSON.parse(stored);
        return entry.data; // Return even if expired
      }
    } catch {
      // Ignore
    }
    return null;
  }

  private async revalidateInBackground<T>(key: string, fetcher: () => Promise<T>, ttlMs?: number): Promise<void> {
    try {
      const data = await fetcher();
      await this.set(key, data, ttlMs);
    } catch {
      // Silently fail background revalidation
    }
  }

  // ============================================================================
  // Offline Mutations
  // ============================================================================

  async queueMutation(mutation: Omit<PendingMutation, "id" | "createdAt" | "retries" | "maxRetries">): Promise<string> {
    const id = `mutation_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const pending: PendingMutation = {
      ...mutation,
      id,
      createdAt: Date.now(),
      retries: 0,
      maxRetries: 3,
    };

    this.mutationQueue.push(pending);
    await this.saveMutationQueue();
    this.notifyListeners();

    // Try to sync immediately if online
    if (this.isOnline) {
      this.syncPendingMutations();
    }

    return id;
  }

  async cancelMutation(id: string): Promise<void> {
    this.mutationQueue = this.mutationQueue.filter((m) => m.id !== id);
    await this.saveMutationQueue();
    this.notifyListeners();
  }

  getPendingMutations(): PendingMutation[] {
    return [...this.mutationQueue];
  }

  // ============================================================================
  // Sync
  // ============================================================================

  private async syncPendingMutations(): Promise<void> {
    if (this.isSyncing || !this.isOnline || this.mutationQueue.length === 0) return;

    this.isSyncing = true;
    this.notifyListeners();

    const queue = [...this.mutationQueue];
    const completed: string[] = [];

    for (const mutation of queue) {
      try {
        const response = await fetch(mutation.url, {
          method: mutation.type,
          headers: { "Content-Type": "application/json" },
          body: mutation.body ? JSON.stringify(mutation.body) : undefined,
        });

        if (response.ok) {
          completed.push(mutation.id);
        } else if (response.status >= 400 && response.status < 500) {
          // Client error - don't retry
          completed.push(mutation.id);
        } else {
          // Server error - retry later
          mutation.retries++;
          if (mutation.retries >= mutation.maxRetries) {
            completed.push(mutation.id);
          }
        }
      } catch {
        mutation.retries++;
        if (mutation.retries >= mutation.maxRetries) {
          completed.push(mutation.id);
        }
      }
    }

    this.mutationQueue = this.mutationQueue.filter((m) => !completed.includes(m.id));
    await this.saveMutationQueue();

    this.isSyncing = false;
    this.lastSyncAt = Date.now();
    this.notifyListeners();
  }

  // ============================================================================
  // Status & Listeners
  // ============================================================================

  getStatus(): SyncStatus {
    return {
      isOnline: this.isOnline,
      lastSyncAt: this.lastSyncAt,
      pendingMutations: this.mutationQueue.length,
      isSyncing: this.isSyncing,
    };
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const status = this.getStatus();
    this.listeners.forEach((listener) => listener(status));
  }

  // ============================================================================
  // Persistence
  // ============================================================================

  private async loadMutationQueue(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(MUTATION_QUEUE_KEY);
      if (stored) {
        this.mutationQueue = JSON.parse(stored);
      }
    } catch {
      this.mutationQueue = [];
    }
  }

  private async saveMutationQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(MUTATION_QUEUE_KEY, JSON.stringify(this.mutationQueue));
    } catch (error) {
      console.warn("Failed to save mutation queue:", error);
    }
  }
}

// ============================================================================
// Export Singleton
// ============================================================================

export const offlineCache = new OfflineCacheManager();

// ============================================================================
// React Hook
// ============================================================================

import { useState as useStateHook, useEffect } from "react";

export function useOfflineStatus(): SyncStatus {
  const [status, setStatus] = useStateHook<SyncStatus>(offlineCache.getStatus());

  useEffect(() => {
    const unsubscribe = offlineCache.subscribe(setStatus);
    return unsubscribe;
  }, []);

  return status;
}

export function useOfflineQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: { ttlMs?: number; enabled?: boolean } = {}
) {
  const [data, setData] = useStateHook<T | null>(null);
  const [isLoading, setIsLoading] = useStateHook(true);
  const [isStale, setIsStale] = useStateHook(false);
  const [error, setError] = useStateHook<Error | null>(null);

  useEffect(() => {
    if (options.enabled === false) return;

    let cancelled = false;

    async function load() {
      try {
        setIsLoading(true);
        const result = await offlineCache.fetchWithCache(key, fetcher, { ttlMs: options.ttlMs });
        if (!cancelled) {
          setData(result.data);
          setIsStale(result.stale);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => { cancelled = true; };
  }, [key, options.enabled]);

  return { data, isLoading, isStale, error };
}
